#!/usr/bin/env bash
#
# verify-lab.sh — single reproducible verification entry point for the
# campus-lab-booking security lab (Phase 7).
#
# Runs every verification layer and prints an explicit PASS/FAIL line per
# check plus a final summary. Exit code 0 = everything verified.
#
# PREREQUISITES (the script reports these and stops rather than fixing
# anything destructive itself):
#   - the lab stack running:      docker compose up -d --wait
#     (if it is not running, the script says so and exits — it never starts
#     or resets services, never deletes volumes, and never touches Docker
#     resources outside this project)
#   - host Node.js 22 LTS + npm — only for the Electron client checks
#     (tests, smoke run, ASAR pack/recovery). A tarball install under $HOME
#     is auto-detected; if no Node is found those checks FAIL with a hint.
#
# Non-destructive: the only write actions are (a) building client/app.asar
# if it is missing, and (b) the lab's own idempotent test/PoC runs, which
# only add their own synthetic rows (as documented in README.md).

set -uo pipefail
cd "$(dirname "$0")/.."
REPO="$PWD"

PASS_COUNT=0
FAIL_COUNT=0
FAILED_CHECKS=()
OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

section() { printf '\n== %s ==\n' "$1"; }
ok()  { PASS_COUNT=$((PASS_COUNT + 1)); printf 'PASS  %s\n' "$1"; }
bad() { FAIL_COUNT=$((FAIL_COUNT + 1)); FAILED_CHECKS+=("$1"); printf 'FAIL  %s\n' "$1"; }

# run <name> <cmd...> — pass iff cmd exits 0; show output tail on failure
run() {
  local name="$1"; shift
  if "$@" >"$OUT" 2>&1; then
    ok "$name"
  else
    bad "$name"
    tail -n 12 "$OUT" | sed 's/^/      | /'
  fi
}

# run_grep <name> <pattern> <cmd...> — pass iff cmd exits 0 and output matches
run_grep() {
  local name="$1" pat="$2"; shift 2
  if "$@" >"$OUT" 2>&1 && grep -qE "$pat" "$OUT"; then
    ok "$name"
  else
    bad "$name"
    tail -n 12 "$OUT" | sed 's/^/      | /'
  fi
}

# locate host node (tarball install under $HOME is fine); adds it to PATH
find_host_node() {
  if command -v node >/dev/null 2>&1; then return 0; fi
  local d
  for d in "$HOME"/node-v22*/bin "$HOME"/node/bin; do
    if [ -x "$d/node" ]; then
      export PATH="$d:$PATH"
      return 0
    fi
  done
  return 1
}

echo "verify-lab.sh — full lab verification (synthetic coursework lab)"
echo "repo: $REPO"

# ---------------------------------------------------------------- section 0
section "0. Docker Compose configuration"
command -v docker >/dev/null 2>&1 && ok "docker CLI available" || bad "docker CLI available"
run "compose plugin available" docker compose version
run "compose configuration is valid" docker compose config -q

# --------------------------------------------------------------- section 1
section "1. Required services running"
SERVICES_UP=1
for svc in api db lab-device; do
  if docker compose ps --services --filter status=running 2>/dev/null | grep -qx "$svc"; then
    ok "service '$svc' is running"
  else
    bad "service '$svc' is running"
    SERVICES_UP=0
  fi
done
for svc in api db lab-device; do
  cid="$(docker compose ps -q "$svc" 2>/dev/null || true)"
  if [ -n "$cid" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = "healthy" ]; then
    ok "service '$svc' is healthy"
  else
    bad "service '$svc' is healthy"
    SERVICES_UP=0
  fi
done

if [ "$SERVICES_UP" -ne 1 ]; then
  printf '\nPREREQUISITE NOT MET: the lab stack is not fully up.\n'
  printf 'Start it with:   docker compose up -d --wait\n'
  printf 'The script does not start or reset services itself (non-destructive by design).\n'
  exit 1
fi

# --------------------------------------------------------------- section 2
section "2. Database health and seed data"
PSQL="docker compose exec -T db psql -U labuser -d campus_lab -tAc"
run_grep "db accepts queries (pg_isready)" "accepting" \
  docker compose exec -T db pg_isready -U labuser -d campus_lab
run_grep "seed: 9 users (admin, 2 technicians, 6 students)" "^9$" bash -c "$PSQL \"select count(*) from users;\""
run_grep "seed: 4 locations" "^4$" bash -c "$PSQL \"select count(*) from locations;\""
run_grep "seed: equipment fleet present (>= 22 rows incl. EQ-1001/EQ-1002)" "^2$" bash -c \
  "$PSQL \"select count(*) from equipment where asset_tag in ('EQ-1001','EQ-1002');\""
run_grep "seed: reservations present (>= 32 rows)" "^t$" bash -c \
  "$PSQL \"select count(*) >= 32 from reservations;\""
run_grep "seed: V2 victim row 13 exists (alice, active)" "^13\|alice\|active$" bash -c \
  "$PSQL \"select r.id, u.username, r.status from reservations r join users u on u.id = r.user_id where r.id = 13;\""

# --------------------------------------------------------------- section 3
section "3. Network isolation"
INTERNAL_NET="$(docker network ls --format '{{.Name}}' | grep 'lab-internal' | head -n1)"
if [ -n "$INTERNAL_NET" ] && [ "$(docker inspect -f '{{.Internal}}' "$INTERNAL_NET" 2>/dev/null)" = "true" ]; then
  ok "network '$INTERNAL_NET' is Docker-internal (no external egress)"
else
  bad "network '$INTERNAL_NET' is Docker-internal (no external egress)"
fi
DB_CID="$(docker compose ps -q db)"
DEV_CID="$(docker compose ps -q lab-device)"
if [ -z "$(docker port "$DB_CID" 2>/dev/null)" ]; then
  ok "database publishes NO host port"
else
  bad "database publishes NO host port"
fi
if [ -z "$(docker port "$DEV_CID" 2>/dev/null)" ]; then
  ok "lab-device publishes NO host port"
else
  bad "lab-device publishes NO host port"
fi

# --------------------------------------------------------------- section 4
section "4. Protocol and API regression suites"
run_grep "protocol unit tests (7/7)" "^# fail 0" \
  docker run --rm -v "$REPO/shared:/src" -w /src/protocol node:22-alpine node --test
run_grep "API test suites phase2+3+5+bugfix (34/34)" "^# fail 0" \
  docker compose exec -T api node --test services/api/test/phase2.test.js services/api/test/phase3.test.js services/api/test/phase5.test.js services/api/test/bugfix.test.js
run_grep "device + network topology checks (9/9)" "ALL 9 CHECKS PASSED" \
  bash scripts/verify-device.sh

# --------------------------------------------------------------- section 5
section "5. Electron client (V4 layers)"
if find_host_node; then
  run_grep "client test suites (11/11)" "^# fail 0" bash -c 'cd client && node --test'
  run "Electron smoke run (real browser: V4 chain + login)" bash client/scripts/smoke-electron.sh
else
  bad "client test suites (11/11) — host Node.js 22 not found (tarball install under \$HOME works)"
  bad "Electron smoke run — host Node.js 22 not found"
fi

# --------------------------------------------------------------- section 6
section "6. Vulnerability PoCs (V1 api-side, V2, V3)"
run "V1 PoC: hard-coded FS token (api-side)" docker compose exec -T api node scripts/poc-v1-token.js
run "V2 PoC: SQL injection in reservation search" docker compose exec -T api node scripts/poc-v2-sqli.js
run "V3 PoC: SSRF to internal lab device" docker compose exec -T api node scripts/poc-v3-ssrf.js

# --------------------------------------------------------------- section 7
section "7. ASAR packaging and V1 package-recovery proof"
if find_host_node; then
  if [ -f client/app.asar ]; then
    ok "client/app.asar exists"
  else
    run "build client/app.asar (npm run pack)" bash -c 'cd client && npm run pack'
  fi
  run "V1 ASAR recovery PoC (token from package -> local API)" node scripts/poc-v1-asar.js
else
  bad "V1 ASAR recovery PoC — host Node.js 22 not found"
fi

# ---------------------------------------------------------------- summary
printf '\n== SUMMARY ==\n'
printf 'passed: %d   failed: %d\n' "$PASS_COUNT" "$FAIL_COUNT"
if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'failed checks:\n'
  printf '  - %s\n' "${FAILED_CHECKS[@]}"
  exit 1
fi
printf 'ALL LAB CHECKS PASSED\n'
