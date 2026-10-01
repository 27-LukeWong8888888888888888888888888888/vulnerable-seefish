#!/usr/bin/env bash
# verify-device.sh — Phase 4 network-topology and isolation checks (host side).
#
# Verifies:
#   1  lab-device container is running
#   2  lab-device is attached to lab-internal
#   3  api is attached to lab-internal AND lab-edge
#   4  db is attached ONLY to lab-internal
#   5  lab-device is attached ONLY to lab-internal
#   6  `docker compose port lab-device 8080` produces no host mapping
#   7  the host cannot directly reach the device (127.0.0.1:8080 and the
#      lab-device hostname both fail)
#   8-11  the api container can reach all three device endpoints and the
#         JSON shapes are correct (via scripts/device-probe.js)
#
# Run from the repo root:  bash scripts/verify-device.sh
set -euo pipefail

cd "$(dirname "$0")/.."

pass=0
fail=0

check() { # <label> <command...>
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "PASS  $label"
    pass=$((pass + 1))
  else
    echo "FAIL  $label"
    fail=$((fail + 1))
  fi
}

nets_of() { # <service> — space-separated network names
  docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
    "$(docker compose ps -q "$1")" 2>/dev/null
}

echo "== containers =="
check "1. lab-device is running" \
  docker compose exec -T lab-device true

echo "== network memberships =="
api_nets="$(nets_of api)"
db_nets="$(nets_of db)"
dev_nets="$(nets_of lab-device)"
echo "      api networks:        $api_nets"
echo "      db networks:         $db_nets"
echo "      lab-device networks: $dev_nets"

# Docker prefixes network names with the compose project (campus-lab-booking_).
check "2. lab-device is attached to lab-internal" \
  bash -c "[[ ' $dev_nets ' == *'_lab-internal '* ]]"
check "3. api is attached to lab-internal and lab-edge" \
  bash -c "[[ ' $api_nets ' == *'_lab-internal '* && ' $api_nets ' == *'_lab-edge '* ]]"
check "4. db is attached only to lab-internal" \
  bash -c "[[ ' $db_nets ' == *'_lab-internal '* && $(echo $db_nets | wc -w) -eq 1 ]]"
check "5. lab-device is attached only to lab-internal" \
  bash -c "[[ ' $dev_nets ' == *'_lab-internal '* && $(echo $dev_nets | wc -w) -eq 1 ]]"

echo "== published-port isolation =="
mapping="$(docker compose port lab-device 8080 2>/dev/null || true)"
bindings="$(docker inspect -f '{{json .NetworkSettings.Ports}}' "$(docker compose ps -q lab-device)" 2>/dev/null)"
echo "      docker compose port lab-device 8080 -> '${mapping}'"
echo "      NetworkSettings.Ports -> ${bindings}"
check "6. lab-device 8080 has no host port mapping" \
  bash -c "[[ '$bindings' == *'\"8080/tcp\":null'* ]]"

echo "== host cannot reach the device =="
if curl -sf --max-time 3 http://127.0.0.1:8080/api/status >/dev/null 2>&1; then
  host_reachable=0
else
  host_reachable=1
fi
check "7a. host cannot reach http://127.0.0.1:8080/api/status" \
  bash -c "[[ $host_reachable -eq 1 ]]"

if curl -sf --max-time 3 http://lab-device:8080/api/status >/dev/null 2>&1; then
  dns_reachable=0
else
  dns_reachable=1
fi
check "7b. host cannot reach http://lab-device:8080 (no host DNS route)" \
  bash -c "[[ $dns_reachable -eq 1 ]]"

echo "== api -> device connectivity (from inside lab-internal) =="
check "8-11. api reaches /api/status, /api/diagnostics, /api/admin with expected JSON" \
  docker compose exec -T api node scripts/device-probe.js

echo
echo "device probe output:"
docker compose exec -T api node scripts/device-probe.js || true

echo
if [[ $fail -eq 0 ]]; then
  echo "ALL $pass CHECKS PASSED"
else
  echo "$fail CHECK(S) FAILED ($pass passed)"
  exit 1
fi
