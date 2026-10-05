# Repo Reorganization: Clean Working Tree + spoilers/ Answer Key — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the repository into a clean working tree (no vulnerability names, phase labels, or answer material outside `spoilers/`) plus a single top-level `spoilers/` answer-key zone — with zero functional changes and all test counts preserved.

**Architecture:** One repo, two zones. The clean zone (everything except `spoilers/`) keeps the full runnable app but must not name the four weaknesses (`V1`–`V4`, `sqli`/`ssrf`/`traversal`/`unsafe`, phase language, old flag strings, old PoC paths, `instructor`/`grader`). The `spoilers/` zone consolidates the registry, writeups, PoCs, exercises, and operating notes behind loud warnings. Gating is labeling, not access control. Renames use `git mv`; code bodies stay byte-identical unless a step gives an exact replacement.

**Tech Stack:** Bash, Node 22 (dockerized for API/protocol tests; host for client), Docker Compose, Electron/ASAR, PostgreSQL 16. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-02-repo-reorg-design.md`

## Global Constraints

- The four intentional weaknesses must NEVER be remediated. Every code/SQL/flag behavior stays identical; only names, comments, labels, and locations change.
- V4 stays confined to the application's own resource tree (`/etc/passwd`, SSH keys, browser profiles, user documents, credentials are out of scope).
- No functional changes: API contract, protocol, seed data, Docker behavior, and app behavior are unchanged.
- Final counts must hold: verify-lab.sh **28/28**; API suites **34/34** (core 14, reservations 9, field-ops 5, regression 6); client **11/11**; protocol **7/7**; device **9/9**.
- **NO per-task commits.** All work stays uncommitted until Task 12, which stops for explicit user go-ahead before a single commit. The commit uses one-shot identity flags only: `git -c user.name='Lab Developer' -c user.email='lab@localhost' commit ...`. Never modify git config. Never push — the user pushes.
- No git-history rewrite. No force operations.
- Non-destructive: never `docker compose down -v`, never delete unrelated Docker resources, never reset the database destructively. Rebuilds use `docker compose up -d --build --wait`.
- Synthetic data only. Never deploy.
- Clean-zone banned patterns (case-insensitive substring unless noted): `v1`–`v4` as standalone tokens; `sqli`; `ssrf`; `traversal`; `unsafe`; the substring `vuln` (so also `vulnerability`/`vulnerabilities`); `\bphase` (any phase language); `poc-` / `scripts/poc`; `proof/`; `instructor`; `grader`/`grading`. Allowed ONLY at premise locations: README.md, SECURITY-LAB-NOTICE.md, the ARCHITECTURE.md premise header (lines 3–5), and the `description` fields of client/package.json + services/api/package.json.
- New neutral flag values (`LAB{device_admin_console_reached}`, `LAB{internal_notes_recovered}`) ARE allowed in the clean zone. After Task 5, the old flag strings have ZERO occurrences anywhere in the repo including spoilers/.
- Every new or edited string must pass the banned-pattern scan mentally before writing.
- Seed values are unchanged (including product names, usernames, emails, the synthetic token row).
- The string `degraded` at services/api/src/app.js:35 is live health-check text — do not touch.
- `client/package.json` is byte-unchanged (its description is a premise string). `services/api/package.json` only changes its description to `"Intentionally vulnerable campus lab booking API"`.

---

### Task 1: Baseline test battery

**Files:**
- Create (scratch): `/tmp/lab-baseline.txt`

**Interfaces:**
- Produces: recorded baseline counts that Tasks 10 and 12 compare against; confirmation the stack is up before any rename.

- [ ] **Step 1: Confirm the stack is up**

Run: `docker compose ps --services --filter status=running`
Expected: `api`, `db`, `lab-device` all listed. If not: `docker compose up -d --wait` first.

- [ ] **Step 2: Run the full verification script and record it**

Run: `bash scripts/verify-lab.sh > /tmp/lab-baseline.txt 2>&1; echo "exit=$?"`
Expected: `exit=0`; the file ends with `ALL LAB CHECKS PASSED`, `passed: 28   failed: 0`. (Report `echo "exit=$?"` separately — never read `$?` through a pipeline.)

- [ ] **Step 3: Record direct suite counts**

Run each and append to /tmp/lab-baseline.txt (each followed by `echo "exit=$?"`):
- `docker compose exec -T api node --test services/api/test/phase2.test.js services/api/test/phase3.test.js services/api/test/phase5.test.js services/api/test/bugfix.test.js` → `# fail 0`, 34 tests
- `cd client && node --test` (from repo root: `bash -c 'cd client && node --test'`) → `# fail 0`, 11 tests
- `docker run --rm -v "$PWD/shared:/src" -w /src/protocol node:22-alpine node --test` → `# fail 0`, 7 tests
- `bash scripts/verify-device.sh` → `ALL 9 CHECKS PASSED`

- [ ] **Step 4: Record the current ASAR strings baseline**

Run: `strings client/app.asar | grep -E 'v4|proof|unsafe|ssrf' | sort -u >> /tmp/lab-baseline.txt`
Expected: entries exist now (baseline); Task 10 shows these are gone after repack.

---

### Task 2: Create spoilers/ layout; move PoCs and answer-key docs

**Files:**
- Create: `spoilers/poc/` (dir), `spoilers/specs/` (dir, populated at Task 12)
- Modify: `spoilers/poc/fleet-sweep.js` (moved from `scripts/poc-v1-token.js`)
- Modify: `spoilers/poc/package-recovery.js` (moved from `scripts/poc-v1-asar.js`)
- Modify: `spoilers/poc/reservation-search.js` (moved from `scripts/poc-v2-sqli.js`)
- Modify: `spoilers/poc/device-fetch.js` (moved from `scripts/poc-v3-ssrf.js`)
- Modify: `spoilers/VULNERABILITIES.md` (moved from `docs/VULNERABILITIES.md`)
- Modify: `spoilers/THREAT-MODEL.md` (moved from `docs/THREAT-MODEL.md`)
- Modify: `spoilers/LAB-EXERCISES.md` (moved from `docs/LAB-EXERCISES.md`)
- Modify: `spoilers/OPERATING-NOTES.md` (moved from `docs/INSTRUCTOR-NOTES.md`)
- Modify: `spoilers/V1-HARDCODED-TOKEN.md`, `spoilers/V2-SQL-INJECTION.md`, `spoilers/V3-SSRF.md`, `spoilers/V4-UNSAFE-IPC.md` (moved from `docs/vulnerabilities/`)
- Delete: `docs/vulnerabilities/` (dir), `scripts/poc-v1-token.js`, `scripts/poc-v1-asar.js`, `scripts/poc-v2-sqli.js`, `scripts/poc-v3-ssrf.js` (all via `git mv`)

**Interfaces:**
- Produces: `spoilers/poc/{fleet-sweep,package-recovery,reservation-search,device-fetch}.js` runnable at their new paths; the four writeups as top-level `spoilers/*.md`; PoC error prefixes `[fleet-sweep]`/`[package-recovery]`/`[reservation-search]`/`[device-fetch]`.
- Consumes: Task 1 baseline.

- [ ] **Step 1: Create the layout and move everything with git mv**

```bash
mkdir -p spoilers/poc spoilers/specs
git mv scripts/poc-v1-token.js     spoilers/poc/fleet-sweep.js
git mv scripts/poc-v1-asar.js      spoilers/poc/package-recovery.js
git mv scripts/poc-v2-sqli.js      spoilers/poc/reservation-search.js
git mv scripts/poc-v3-ssrf.js      spoilers/poc/device-fetch.js
git mv docs/VULNERABILITIES.md     spoilers/VULNERABILITIES.md
git mv docs/THREAT-MODEL.md        spoilers/THREAT-MODEL.md
git mv docs/LAB-EXERCISES.md       spoilers/LAB-EXERCISES.md
git mv docs/INSTRUCTOR-NOTES.md    spoilers/OPERATING-NOTES.md
git mv docs/vulnerabilities/V1-HARDCODED-TOKEN.md spoilers/V1-HARDCODED-TOKEN.md
git mv docs/vulnerabilities/V2-SQL-INJECTION.md   spoilers/V2-SQL-INJECTION.md
git mv docs/vulnerabilities/V3-SSRF.md            spoilers/V3-SSRF.md
git mv docs/vulnerabilities/V4-UNSAFE-IPC.md      spoilers/V4-UNSAFE-IPC.md
rmdir docs/vulnerabilities
```

- [ ] **Step 2: Fix api-side PoC require depth**

In `spoilers/poc/fleet-sweep.js`, `spoilers/poc/reservation-search.js`, `spoilers/poc/device-fetch.js`: replace the require of the shared envelope from a one-level to a two-level relative path, e.g. `require('../shared/protocol/envelope.js')` → `require('../../shared/protocol/envelope.js')` (check each file's actual require line; only the depth changes).

- [ ] **Step 3: Fix package-recovery path depth**

In `spoilers/poc/package-recovery.js`: `path.join(__dirname, '..')` → `path.join(__dirname, '..', '..')` (it must reach the repo root from `spoilers/poc/`).

- [ ] **Step 4: Rename error prefixes and usage lines**

Only the prefix strings and usage text change; exploit bodies keep their V1/V2/V3 wording (they are answer-key material):
- `spoilers/poc/fleet-sweep.js`: error/usage prefix → `[fleet-sweep]`; usage line references the new filename.
- `spoilers/poc/package-recovery.js`: → `[package-recovery]`.
- `spoilers/poc/reservation-search.js`: → `[reservation-search]`.
- `spoilers/poc/device-fetch.js`: → `[device-fetch]`.

- [ ] **Step 5: Sanity-check the moved PoCs compile**

Run: `for f in spoilers/poc/*.js; do node --check "$f" || echo "FAIL $f"; done`
Expected: no FAIL lines.

---

### Task 3: Client renames and despoil

**Files:**
- Modify: `client/manual-reader.js` (git mv from `client/v4-file-read.js`)
- Modify: `client/test/manual-reader.test.js` (git mv from `client/test/v4-ipc.test.js`)
- Modify: `client/resources/internal/ops-memo.txt` (git mv from `client/resources/proof/v4-proof.txt`)
- Modify: `client/main.js`, `client/preload.js`, `client/renderer/smoke.html`, `client/test/surface.test.js`, `client/renderer/index.html`, `client/renderer/app.js`, `client/scripts/pack-asar.js`, `client/scripts/smoke-electron.sh`, `client/resources/lab-app-config.json`, `client/api-client.js`
- Delete: `client/resources/proof/` (rmdir after move)

**Interfaces:**
- Produces: `client/manual-reader.js` exporting `{ readManual, MANUALS_DIR }` (names unchanged); handler registered under the existing IPC channel `lab:read-file`; `client/resources/internal/ops-memo.txt` containing `internal operations memo` (case-insensitive) and `LAB{internal_notes_recovered}`; DOM ids `manual-file`, `btn-open-manual`, `manual-out`, section ids `field-service`, `manual-reader`.
- Consumes: Task 2 layout.

- [ ] **Step 1: Rename the module, its test, and the proof artifact**

```bash
mkdir -p client/resources/internal
git mv client/v4-file-read.js client/manual-reader.js
git mv client/test/v4-ipc.test.js client/test/manual-reader.test.js
git mv client/resources/proof/v4-proof.txt client/resources/internal/ops-memo.txt
rmdir client/resources/proof
```

- [ ] **Step 2: Rewrite ops-memo.txt to exactly**

```
Internal operations memo — instrument maintenance
=================================================

This memo is kept with the desktop client's resources for the lab
operations team. It is stored outside the equipment-manual set on
purpose so the manual viewer does not list it.

Marker: LAB{internal_notes_recovered}

Nothing in this memo is credential material: it contains no passwords,
tokens, or personal data. The calibration rig in Bldg C — 214 is serviced
twice per year; the next service window is booked through the standard
reservation queue.
```

- [ ] **Step 3: Rewrite the manual-reader.js banner**

Keep lines 1–8 of the old header, changing line 4 to ` * Manual-reader file sink (main process).` Replace the old block (lines 14–21, the `VULN-V4: INTENTIONAL UNSAFE IPC FILE READ ...` comment) with exactly:

```js
// NOTE: `requested` is renderer-controlled and is joined onto the manuals
// directory with NO path validation: no basename() restriction, no
// resolve-and-prefix check. A relative path such as '../internal/ops-memo.txt'
// therefore escapes the intended manuals area and reads any file the
// desktop user can read. Do not change this behavior — the lab exercises
// depend on it.
```

Leave the function body untouched (`return fs.readFile(path.join(MANUALS_DIR, requested), 'utf8');`).

- [ ] **Step 4: Update the manual-reader test**

In `client/test/manual-reader.test.js`:
- Header lines 3–9 become: ` * Manual-reader tests — exercise the exact handler the ipcMain.handle` / ` * ('lab:read-file') delegate calls, without needing a display. The full` / ` * renderer -> preload -> IPC -> main chain is covered separately by the` / ` * Electron smoke run (client/scripts/smoke-electron.sh).`
- L13: `require('../v4-file-read.js')` → `require('../manual-reader.js')`
- L21: `const requested = '../proof/v4-proof.txt';` → `const requested = '../internal/ops-memo.txt';`
- L25: assert message `'proof: the joined path must land OUTSIDE the manuals directory'` — KEEP UNCHANGED.
- L27 comment → `  // The sink accepts the relative-path string verbatim — it must not throw.`
- L32 title → `test('3+4+5. relative path escapes manuals dir and returns the ops memo with the marker', async () => {`
- L33: `await readManual('../proof/v4-proof.txt')` → `await readManual('../internal/ops-memo.txt')`
- L34: `assert.match(text, /unsafe IPC path traversal/);` → `assert.match(text, /internal operations memo/i);`
- L35: `assert.match(text, /LAB\{unsafe_ipc_path_traversal\}/);` → `assert.match(text, /LAB\{internal_notes_recovered\}/);`

- [ ] **Step 5: Update main.js**

In `client/main.js`:
- L4 → ` * Electron main process — campus lab booking desktop client.`
- Header lines 6–10 → ` * Intentionally insecure lab build: webPreferences use` / ` * contextIsolation:false + sandbox:false so the preload shares the renderer` / ` * context and the read-file bridge is reachable as a plain window global.` / ` * nodeIntegration stays OFF — the page itself still has no Node require().` / ` * Do not "harden" these settings.`
- L15: `const { readManual } = require('./v4-file-read.js');` → `const { readManual } = require('./manual-reader.js');`
- L35 → `      // INTENTIONALLY INSECURE (coursework lab — do not harden):`
- L55–57 → `  // Coursework artifact: synthetic field-service token shipped in local` / `  // app resources. These resources are packaged into the ASAR; the` / `  // recovery-from-package proof completes there.`
- L60 → `  // read-file handler — renderer-controlled filename, no path validation.`

- [ ] **Step 6: Update preload.js**

In `client/preload.js` L11–12 → ` * readFile(name) forwards \`name\` verbatim to the main-process handler,` / ` * which performs no path validation (see manual-reader.js).`

- [ ] **Step 7: Update smoke.html**

In `client/renderer/smoke.html`:
- L19: `const proof = await window.lab.readFile('../proof/v4-proof.txt');` → `const memo = await window.lab.readFile('../internal/ops-memo.txt');`
- L20: `const flagOk = /LAB\{unsafe_ipc_path_traversal\}/.test(proof);` → `const flagOk = /LAB\{internal_notes_recovered\}/.test(memo);`
- L21: `log('[3] traversal read ok (' + proof.length + ' chars), flag present: ' + flagOk);` → `log('[3] file read ok (' + memo.length + ' chars), flag present: ' + flagOk);`
- L22: `if (!flagOk) throw new Error('proof flag missing');` → `if (!flagOk) throw new Error('expected marker missing');`

- [ ] **Step 8: Update renderer ids and app.js**

In `client/renderer/index.html`:
- L105: `<section id="v1">` → `<section id="field-service">`
- L114: `<section id="v4">` → `<section id="manual-reader">`
- L117: `<input id="v4-path" class="wide" placeholder="manual file name, e.g. equipment-manual.txt">` → `<input id="manual-file" class="wide" placeholder="manual file name, e.g. equipment-manual.txt">`
- L118: `<button id="btn-v4-read">Open file</button>` → `<button id="btn-open-manual">Open file</button>`
- L121: `<pre class="out mono" id="v4-out"></pre>` → `<pre class="out mono" id="manual-out"></pre>`

In `client/renderer/app.js`:
- L7: ` *   window.lab.readFile() -> ipcRenderer.invoke('lab:read-file') -> main (V4 sink)` → `-> main (read-file handler)`
- L245: `$('btn-v4-read').addEventListener('click', ...)` → `$('btn-open-manual')`
- L246: `const requested = $('v4-path').value.trim();` → `$('manual-file')`
- L249: `renderJson($('v4-out'), text);` → `$('manual-out')`

- [ ] **Step 9: Update surface.test.js and the config note**

In `client/test/surface.test.js` L19: `for (const f of ['main.js', 'preload.js', 'v4-file-read.js', 'api-client.js']) {` → `'manual-reader.js'`.

In `client/resources/lab-app-config.json` L8 → `"SYNTHETIC coursework credential — NOT a real secret. This resources/ tree is packaged into the Electron ASAR; recovering the token from the package is part of the lab. Do not replace with a real credential."` (token value untouched).

- [ ] **Step 10: Update pack-asar.js**

In `client/scripts/pack-asar.js`:
- L5 → ` * pack-asar.js — package the Electron client into client/app.asar.`
- L17–19 → `// The archive intentionally contains resources/lab-app-config.json with the` / `// synthetic field-service token in cleartext — recoverability from the` / `// package is part of the lab. Do not obfuscate it.`
- L32: `'v4-file-read.js'` → `'manual-reader.js'`
- L35–36 → `// every file that must be present for the packaged app to work (and the` / `// field-service artifact to be recoverable)`
- L42: `'client/v4-file-read.js',` → `'client/manual-reader.js',`
- L49: `'client/resources/proof/v4-proof.txt',` → `'client/resources/internal/ops-memo.txt',`
- L97: `'FAIL — synthetic V1 token not found in packaged lab-app-config.json'` → `'FAIL — synthetic field-service token not found in packaged lab-app-config.json'`
- L103: `(synthetic V1 token: ${cfg.fieldService.token})` → `(synthetic field-service token: ${cfg.fieldService.token})`

- [ ] **Step 11: Update smoke-electron.sh and api-client.js**

In `client/scripts/smoke-electron.sh`: L2 drop `(Phase 6/7)`; L3 `executes the V4 chain + login round trip` → `executes the file-read chain + login round trip`.

In `client/api-client.js` L14: ` *   field-service token (FS-) : separate static synthetic config secret (V1),` → ` *   field-service token (FS-) : separate static synthetic config secret,`

- [ ] **Step 12: Run the client suites**

Run: `bash -c 'cd client && node --test'` then `echo "exit=$?"` separately.
Expected: `# fail 0`, 11 tests. If surface.test.js fails, recheck Step 9's filename list.

---

### Task 4: API test renames and API-source despoil

**Files:**
- Modify: `services/api/test/core.test.js` (git mv from `phase2.test.js`)
- Modify: `services/api/test/reservations.test.js` (git mv from `phase3.test.js`)
- Modify: `services/api/test/field-ops.test.js` (git mv from `phase5.test.js`)
- Modify: `services/api/src/db/migrations/001_schema.sql`, `services/api/src/db/migrations/002_seed.sql`
- Modify: `services/api/src/fieldServiceToken.js`, `services/api/src/fieldService.js`, `services/api/src/routes/reservations.js`, `services/api/src/routes/diagnostics.js`, `services/api/src/routes/equipment.js`, `services/api/src/routes/faults.js`, `services/api/src/app.js`, `services/api/package.json`

**Interfaces:**
- Produces: test suite display names `Core verification report`, `Reservations verification report`, `Field-ops verification report`; route behaviors unchanged (same SQL, same status codes, same payloads).
- Consumes: Task 3 (client tests already renamed — API tests referenced by verify-lab.sh are renamed here before Task 6 rewires the runner).

- [ ] **Step 1: Rename the three suites**

```bash
git mv services/api/test/phase2.test.js services/api/test/core.test.js
git mv services/api/test/phase3.test.js services/api/test/reservations.test.js
git mv services/api/test/phase5.test.js services/api/test/field-ops.test.js
```

- [ ] **Step 2: core.test.js label sweep**

In `services/api/test/core.test.js`: header comment lines 4–7 despoiled of phase language (same checklist, no `Phase 2` references); L42 and L308 report title `'Phase 2 verification report'` → `'Core verification report'`; L334 `'verified in Phase 2 tests'` → `'verified in core tests'`. Test names and assertions untouched.

- [ ] **Step 3: reservations.test.js label sweep**

In `services/api/test/reservations.test.js`: header checklist despoiled; L20 `V2 victim row` → `cross-user anchor row`; L109 `V2 proof` → `cross-user proof`; L131 booking prefix `'P3 verification booking '` → `'RSV verification booking '`; L175 `'P3 authorization test '` → `'RSV authorization test '`. Test titles per spec §5.5, e.g. the cross-user search test becomes `crafted search filter retrieves the seeded cross-user reservation`; the injected payload `"x' OR 1=1 -- "` is untouched; test 7's seeded-row assertions unchanged.

- [ ] **Step 4: field-ops.test.js label sweep**

In `services/api/test/field-ops.test.js`: header checklist L11–13 → ` *   3  caller-supplied target  — technician fetches internal device admin` / ` *   4  field-service token    — vendor sweep works with the config token`; L27 `CHALLENGE` → `'LAB{device_admin_console_reached}'`; L137 test-3 title → `technician fetches the internal device admin payload`; L157 drop the `V1: ` prefix (behavior identical).

- [ ] **Step 5: bugfix.test.js header**

In `services/api/test/bugfix.test.js`: the header run-block lists the new suite paths (`core.test.js`, `reservations.test.js`, `field-ops.test.js`); `phase suites` → `the other suites`; `phase3 janitor` → `reservations-suite janitor`; `bug-hunt 2026-10-02, findings B3–B7` → `pre-release bug sweep` (the B3–B7 list itself stays).

- [ ] **Step 6: Migration SQL comments**

In `services/api/src/db/migrations/001_schema.sql`: L1 drop `(Phase 1)`; reword L17–19 (the intentional-design note keeps its meaning, loses phase/vulnerability naming); L28–29 → `-- Synthetic dummy secrets. The field-service row mirrors the token that is` / `-- packaged inside the Electron app (see services/api/src/fieldServiceToken.js).`

In `services/api/src/db/migrations/002_seed.sql`: L1 phase label dropped; L25–27, L42–44, L87–89, L93 reworded per spec (product names at L52/L63 UNTOUCHED; all seed values unchanged).

- [ ] **Step 7: API source banners**

- `services/api/src/fieldServiceToken.js`: banner → `// Static synthetic field-service token — NOT a real credential.` + a one-line behavior note + `// Do not change this behavior — the lab exercises depend on it.` The constant (L16) untouched.
- `services/api/src/fieldService.js`: L4–5 and L12–13 reworded (drop V1 naming; behavior untouched).
- `services/api/src/routes/reservations.js`: header L15–19 despoiled; replace L243–251 with the neutral block: `Reservation search — legacy filter construction.` + `Do not change this behavior — the lab exercises depend on it.`; L259 comment → `// legacy string-concatenated filter (see note above the route).` SQL untouched.
- `services/api/src/routes/diagnostics.js`: L4 and L13–18 and L44–46 despoiled (route behavior untouched — caller-supplied URL, no allowlist).
- `services/api/src/routes/equipment.js` L4–6 → ` * Equipment endpoints — all queries parameterized. The reservation search` / ` * route is the one deliberate exception — see its source.`
- `services/api/src/routes/faults.js` L15 → ` * All queries parameterized.`
- `services/api/src/app.js` L49–50: drop `(V1)`.
- `services/api/package.json` L5 → `"description": "Intentionally vulnerable campus lab booking API",`

- [ ] **Step 8: Syntax-check every edited JS file**

Run: `for f in services/api/test/*.test.js services/api/src/fieldServiceToken.js services/api/src/fieldService.js services/api/src/routes/*.js services/api/src/app.js; do node --check "$f" || echo "FAIL $f"; done` from repo root (host node is fine for `--check`).
Expected: no FAIL lines.

---

### Task 5: Flag revaluation (old markers → zero occurrences)

**Files:**
- Modify: `services/device/server.js`

**Interfaces:**
- Produces: `services/device/server.js` serving `LAB{device_admin_console_reached}` at `/api/admin`; zero occurrences of `LAB{ssrf_internal_device_reached}` and `LAB{unsafe_ipc_path_traversal}` anywhere in the repo (after Tasks 3–4 edits land).

- [ ] **Step 1: Update the device challenge value**

In `services/device/server.js`: L14–15 comment → `SYNTHETIC device-admin challenge value for the security lab`; L18 `const CHALLENGE = 'LAB{ssrf_internal_device_reached}';` → `'LAB{device_admin_console_reached}'`; L61 notice string despoiled per spec (same meaning); L62 uses the new value. Server behavior unchanged.

- [ ] **Step 2: Grep for zero old-flag occurrences**

Run: `grep -rn --include='*' -E 'ssrf_internal_device_reached|unsafe_ipc_path_traversal' . --exclude-dir=node_modules --exclude-dir=.git; echo "exit=$?"`
Expected: no matches (exit 1 from grep = zero hits is the PASS). Fix any hit before continuing.

---

### Task 6: Wiring — runner, Dockerfile, compose, env, protocol docs-in-code

**Files:**
- Modify: `scripts/verify-lab.sh`, `scripts/verify-device.sh`, `services/api/Dockerfile`, `compose.yaml`, `.env.example`, `shared/protocol/rc4.js`, `scripts/lab-client.js`

**Interfaces:**
- Produces: verify-lab.sh with 28 checks whose labels name no weakness; suite paths pointing at the renamed test files; scenario checks pointing at `spoilers/poc/`; api image containing `spoilers/poc/` (PoCs must run inside the api container).
- Consumes: Tasks 2–5 (paths and flags they reference must already exist).

- [ ] **Step 1: verify-lab.sh labels and paths**

In `scripts/verify-lab.sh` (28 checks, count preserved):
- L4: drop `(Phase 7)`.
- L20: `the lab's own idempotent test/PoC runs, which` → `test/scenario runs, which`.
- L120 label → `seed: reservation row 13 exists (alice, active)` (SQL unchanged).
- L148 label → `API test suites core+reservations+field-ops+regression (34/34)`.
- L149 paths → `services/api/test/core.test.js services/api/test/reservations.test.js services/api/test/field-ops.test.js services/api/test/bugfix.test.js`.
- L154 section → `section "5. Electron client"`.
- L157 label → `Electron smoke run (real browser: file-read chain + login)`.
- L164 section → `section "6. Scenario checks (api-side)"`.
- L165 → `run "scenario: fleet sweep (api-side)" docker compose exec -T api node spoilers/poc/fleet-sweep.js`.
- L166 → `run "scenario: reservation search (api-side)" docker compose exec -T api node spoilers/poc/reservation-search.js`.
- L167 → `run "scenario: device fetch (api-side)" docker compose exec -T api node spoilers/poc/device-fetch.js`.
- L170 section → `section "7. ASAR packaging and package recovery"`.
- L177 → `run "package-recovery check (config token from package -> local API)" node spoilers/poc/package-recovery.js`.
- L179 → `bad "package-recovery check — host Node.js 22 not found"`.

- [ ] **Step 2: verify-device.sh**

L2: drop `(Phase 4)` → `# verify-device.sh — network-topology and isolation checks (host side).`

- [ ] **Step 3: device-probe.js**

L6: drop `(Phase 4)`; L8–9 → ` * Demonstrates — independently of any diagnostics endpoint — that the api` / ` * container can reach http://lab-device:8080 by Docker service-name DNS ...` (the new flag value already landed in Task 5).

- [ ] **Step 4: api Dockerfile**

` services/api/Dockerfile`: L1 drop `(Phase 2)`; insert `COPY spoilers/poc/ spoilers/poc/` immediately after `COPY scripts/ scripts/`.

- [ ] **Step 5: compose.yaml**

L57–58: `(the api, in Phase 5 via SSRF)` → `(the api)`. Everything else unchanged.

- [ ] **Step 6: .env.example, rc4.js, lab-client.js**

- `.env.example` L7 → `# Used by the Express API; documented here for completeness.`
- `shared/protocol/rc4.js` L11 → ` * See docs/PROTOCOL-RC4.md and shared/protocol/protocol.test.js.`
- `scripts/lab-client.js` L9–10 → ` * envelope response, print the JSON. It is the shared helper for working` / ` * with the protocol and its documented weaknesses.`; L30 doc-path references dropped per spec.

- [ ] **Step 7: Syntax checks**

Run: `bash -n scripts/verify-lab.sh && bash -n scripts/verify-device.sh && bash -n client/scripts/smoke-electron.sh && node --check scripts/device-probe.js && node --check scripts/lab-client.js && node --check shared/protocol/rc4.js; echo "exit=$?"`
Expected: `exit=0`.

---

### Task 7: Clean-zone documentation

**Files:**
- Modify: `README.md`, `SECURITY-LAB-NOTICE.md`, `docs/README.md`, `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`, `docs/PROTOCOL-RC4.md`

**Interfaces:**
- Produces: landing docs that point at `spoilers/` generically without naming weaknesses; docs/README.md as a small index (ARCHITECTURE / DATA-MODEL / PROTOCOL-RC4 + spoilers pointer).
- Consumes: Task 2 (spoilers/ paths exist).

- [ ] **Step 1: README.md**

- L15–20 → `**The weaknesses are not listed here on purpose.** Finding them is the` / `assignment. The full answer key — registry, writeups, and working` / `proofs — lives in [\`spoilers/\`](spoilers/) under its own warnings. Do` / `not open it until you have your own answers.` (README is a premise location; "weaknesses"/"intentionally vulnerable" allowed.)
- L79–80 Verify pointer: drop LAB-EXERCISES/INSTRUCTOR-NOTES references; point at docs/README.md + `spoilers/` generically.
- Documentation table L92–102: drop THREAT-MODEL/LAB-EXERCISES/INSTRUCTOR-NOTES/VULNERABILITIES rows; keep ARCHITECTURE/DATA-MODEL/PROTOCOL-RC4; add `| [\`spoilers/\`](spoilers/) | Full answer key — **spoilers; do not open before attempting** |`.
- Layout L112 `scripts/                   PoCs, lab-client CLI, verification` → `scripts/                   verification and tooling`; add line `spoilers/                  answer key — spoilers; do not open before attempting`.
- L118 `All seven development phases are complete (final). The lab is stable;` → `The lab is complete and stable;`.
- AI-use disclosure section untouched.

- [ ] **Step 2: SECURITY-LAB-NOTICE.md**

L3–6 → `This repository is an **intentionally vulnerable** application built for` / `coursework. It contains deliberate, documented weaknesses so they can be` / `studied in a controlled environment.` Rule 3 (L14–17) → `3. **Do not "fix" vulnerabilities** unless an exercise explicitly says to.` / `   Each one is registered in the answer key under \`spoilers/\` with full` / `   writeups, and covered by presence tests.` (NOTICE is a premise location.)

- [ ] **Step 3: docs/README.md — full rewrite**

Replace the whole file with:

```markdown
# Documentation index

Everything here describes the system as built. For the deliberate
weaknesses and the exercises, see the answer key in [`../spoilers/`](../spoilers/)
— **spoilers; do not open before attempting the lab.**

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, network layout, data flow, intentional weaknesses overview |
| [DATA-MODEL.md](DATA-MODEL.md) | Schema, seed data, cross-user data pairs |
| [PROTOCOL-RC4.md](PROTOCOL-RC4.md) | Wire envelope, handshake, known limitations |

This repo is an intentionally vulnerable coursework lab — see
[SECURITY-LAB-NOTICE.md](../SECURITY-LAB-NOTICE.md). Never deploy it.
```

(ARCHITECTURE.md's own row may say `intentional weaknesses overview` because its premise header allows it; keep the word "vulnerability" out of this file otherwise — "the registry", not "vulnerability registry".)

- [ ] **Step 4: docs/ARCHITECTURE.md**

- L7 `## Components (as of Phase 7)` → `## Components`.
- L40: delete the trailing ` V4 exists on this boundary.` sentence.
- L42: delete ` V3 exists here.`
- L44: delete ` V1 exists here.`
- L46–47: `One concatenated query (V2) escapes the application-layer per-user scoping.` → drop `(V2)`.
- L74: `5. Phase 6 desktop client:` → `5. Desktop client:`.
- L81–85 → `The synthetic field-service token ships in \`client/resources/lab-app-config.json\`; these resources are packaged into \`client/app.asar\` (\`npm run pack\` in \`client/\`); extracting it from the archive and using it against the local API is one of the lab scenarios (see \`spoilers/\`).`
- Endpoint table: L121 `**intentionally vulnerable to SQL injection (V2).**` → `legacy string-concatenated filter (see the route source).`; L123 `**Intentionally vulnerable to SSRF (V3).**` → `fetches the **caller-supplied URL** server-side with no allowlist (see the route source).`; L124 `**Intentionally gated by a hard-coded synthetic token (V1).**` → `authorized by the static synthetic field-service token alone (no login token).`
- L128: `CLI helper for manual protocol work and vulnerability demonstrations:` → `CLI helper for manual protocol work and demonstrations:`.
- L163–174 device section → `**Diagnostics fetch:** \`POST /api/diagnostics/fetch\` (technician/admin) fetches a caller-supplied URL from the request body with no allowlist and no loopback/private-range blocking (\`services/api/src/routes/diagnostics.js\`). The device is the designated target: fetching \`http://lab-device:8080/api/admin\` through the api returns its synthetic, explicitly-not-real marker value (\`LAB{device_admin_console_reached}\`), demonstrating the server reached the internal-only network on the caller's behalf — host → api → lab-device. Direct reachability from the api is independently demonstrated by \`scripts/device-probe.js\` (run inside the api container) and \`scripts/verify-device.sh\` (host side).`
- L176–188 `## Vulnerability placement (coursework design)` table → replace with `## Intentional weaknesses` + `This application is intentionally vulnerable (see \`SECURITY-LAB-NOTICE.md\`).` / `The registry of deliberate weaknesses and their writeups lives in the` / `answer key: \`spoilers/\`.`
- L188 `All other SQL in the api is parameterized; no accidental injection bugs.` KEEP.
- Premise header L3–5 unchanged.

- [ ] **Step 5: docs/DATA-MODEL.md**

- L16: `and 6 students including \`alice\` (victim of V2) and \`bob\` (the V2 attacker).` → `and 6 students including \`alice\` and \`bob\` (the cross-user pair).`
- L27–31 → `The \`field-service-token\` row mirrors the static constant the application itself validates (\`services/api/src/fieldServiceToken.js\`); this table is scenery.`
- L45: `\`EQ-1002\` "DNA Sequencer 4500" — the latter is the V2 victim reservation's equipment.` → `... — the latter anchors the cross-user reservation.`
- L49–50 → `Application layer scopes reads by \`user_id\`; the reservation search route (\`/api/reservations/search\`) is the one deliberate exception — see its source.`
- L56: `the V2 payload returns it.` → `a crafted search filter returns it.`
- L65–66 → `Every diagnostics \`/fetch\` is recorded here; the field-service \`fleet-sweep\` response includes this table across all users.`
- L71: `(e.g. \`field-service\` for V1 calls)` → `(e.g. \`field-service\` for vendor fleet-sweep calls)`
- L79: `(server-stored; V3 bypasses this)` → `(server-stored; the /fetch endpoint takes the URL from the caller instead)`
- L98: `See \`docs/INSTRUCTOR-NOTES.md\` §5.` → `See \`spoilers/OPERATING-NOTES.md\` §5.`

- [ ] **Step 6: docs/PROTOCOL-RC4.md**

- L54: `(Asserted by phase5 test 5.)` → `(Asserted by field-ops test 5.)`
- L72–73 → `These are not the weaknesses the exercises target — the envelope is` / `the lab's transport flavor, and it must stay weak.`
- L86 → `The server-side scripts (\`scripts/lab-client.js\`, and the scenario scripts under \`spoilers/poc/\`) do the same inside the api container.`
- L88: `services/api/test/phase5.test.js` → `services/api/test/field-ops.test.js`.

---

### Task 8: Spoiler-zone docs — new README, OPERATING-NOTES reframe, link refresh

**Files:**
- Create: `spoilers/README.md`
- Modify: `spoilers/OPERATING-NOTES.md`, `spoilers/VULNERABILITIES.md`, `spoilers/THREAT-MODEL.md`, `spoilers/LAB-EXERCISES.md`, `spoilers/V1-HARDCODED-TOKEN.md`, `spoilers/V2-SQL-INJECTION.md`, `spoilers/V3-SSRF.md`, `spoilers/V4-UNSAFE-IPC.md`

**Interfaces:**
- Produces: `spoilers/README.md` as the zone landing page (stop banner, index, PoC run table); all in-zone links valid after the moves.
- Consumes: Task 2 paths; spec §9 wording.

- [ ] **Step 1: Write spoilers/README.md**

Content (per spec §9): a loud `STOP — SPOILERS` banner; one paragraph on what the zone contains (registry, writeups, exercises, operating notes, PoCs) and that the clean tree is the challenge; the index table linking `VULNERABILITIES.md`, `V1-HARDCODED-TOKEN.md`, `V2-SQL-INJECTION.md`, `V3-SSRF.md`, `V4-UNSAFE-IPC.md`, `THREAT-MODEL.md`, `LAB-EXERCISES.md`, `OPERATING-NOTES.md`, `poc/`; a "Running the proofs" table mapping each PoC to its command (`docker compose exec -T api node spoilers/poc/fleet-sweep.js`, `node spoilers/poc/package-recovery.js` from repo root with the stack up, etc.); the note that PoCs keep the original V-labels in their bodies; the do-not-fix pointer to SECURITY-LAB-NOTICE.md; the never-deploy line.

- [ ] **Step 2: Reframe OPERATING-NOTES.md**

Read the moved file fully first. Update: title/intro (it is the lab operating note, not instructor material); the §"V1–V4 fixes in Phase 7" demo-app section reframed as the demo app closing its four planted weaknesses using generic names (hard-coded credential, injection, server-side fetch, unsafe file read) without V-labels; PoC command table paths → `spoilers/poc/*.js`; expected-results table suite refs → `core/reservations/field-ops` naming; reset instructions unchanged (`docker compose down -v` documented here is allowed as documentation — do not EXECUTE it). Remove `INSTRUCTOR-NOTES` self-references.

- [ ] **Step 3: Refresh links in the moved docs**

Apply the stale-reference map (from the spec §5.6 grep audit):
- `spoilers/VULNERABILITIES.md`: L14 directory refs → `spoilers/`; L28/L57/L81/L107 writeup links → same-dir filenames; L41/L43/L66/L93 PoC paths → `spoilers/poc/fleet-sweep.js` / `package-recovery.js` / `reservation-search.js` / `device-fetch.js`; L96/L126 old flags → new values.
- `spoilers/THREAT-MODEL.md` L54/L66–67: `../proof/v4-proof.txt` → `client/resources/internal/ops-memo.txt`; old flag → new; `client/resources/proof/` → `client/resources/internal/`.
- `spoilers/LAB-EXERCISES.md`: L30/L39 `poc-v1-asar` → `spoilers/poc/package-recovery.js`; L72/L108 path updates; L123/L129/L162 old flags → new; L156 `client/v4-file-read.js` → `client/manual-reader.js`; L158 `../proof/v4-proof.txt` → `client/resources/internal/ops-memo.txt`; L188 `docs/vulnerabilities/` → `spoilers/`.
- `spoilers/V1-HARDCODED-TOKEN.md`: L14/L41/L63/L77/L90/L152–153/L204 — phase refs → neutral, PoC paths → new, `phase5.test.js` → `field-ops.test.js`.
- `spoilers/V2-SQL-INJECTION.md` L49/L79/L131–132: `phase3.test.js` → `reservations.test.js`; PoC path → `spoilers/poc/reservation-search.js`.
- `spoilers/V3-SSRF.md` L16/L79/L109/L114/L121–122/L131: new flag, PoC path → `spoilers/poc/device-fetch.js`, `phase5.test.js` → `field-ops.test.js`, device notice string neutralized.
- `spoilers/V4-UNSAFE-IPC.md`: L17–18 location table → `client/manual-reader.js`, new flag, `client/resources/internal/ops-memo.txt`; `v4-ipc.test.js` → `manual-reader.test.js` throughout; path/flag updates at L68/L74/L84–85/L101/L110/L115/L125/L136–137/L145/L147/L149–151/L153/L161–163/L167/L182/L191; the `main.js`/`preload.js`/`v4-file-read.js` file list → `manual-reader.js`; UI label **Read via IPC** → **Open file**.

---

### Task 9: Rebuild images and repack ASAR

**Files:**
- Modify: `client/app.asar` (repacked, tracked)

**Interfaces:**
- Consumes: Tasks 2–6 (Dockerfile COPY, renamed client files, new memo path).
- Produces: api + device images with the renamed sources; ASAR containing `client/manual-reader.js` and `client/resources/internal/ops-memo.txt`.

- [ ] **Step 1: Rebuild the compose stack**

Run: `docker compose up -d --build --wait` then `echo "exit=$?"` separately.
Expected: `exit=0`; `docker compose ps` shows api/db/lab-device healthy.

- [ ] **Step 2: Repack the ASAR**

Run: `bash -c 'cd client && npm run pack'` then `echo "exit=$?"` separately.
Expected: pack script prints the packed-file count and confirms the synthetic field-service token line; exits 0.

- [ ] **Step 3: Confirm the ASAR contents moved**

Run: `strings client/app.asar | grep -E 'v4|proof|unsafe|ssrf' | sort -u; echo "exit=$?"`
Expected: no output (grep exit 1). Also: `strings client/app.asar | grep -c 'internal_notes_recovered'` ≥ 1.

---

### Task 10: Verification battery (two independent runs)

**Files:**
- Create (scratch): `/tmp/lab-final-1.txt`, `/tmp/lab-final-2.txt`

**Interfaces:**
- Consumes: Tasks 1–9 complete.
- Produces: evidence the counts hold post-reorg.

- [ ] **Step 1: Full run #1**

Run: `bash scripts/verify-lab.sh > /tmp/lab-final-1.txt 2>&1; echo "exit=$?"` → expect `exit=0`, `passed: 28   failed: 0`.

- [ ] **Step 2: Full run #2 (independent)**

Run: `bash scripts/verify-lab.sh > /tmp/lab-final-2.txt 2>&1; echo "exit=$?"` → expect `exit=0` again. Diff the summaries: `tail -5 /tmp/lab-final-1.txt; tail -5 /tmp/lab-final-2.txt`.

- [ ] **Step 3: Direct suite counts**

- `docker compose exec -T api node --test services/api/test/core.test.js services/api/test/reservations.test.js services/api/test/field-ops.test.js services/api/test/bugfix.test.js` → `# fail 0`, 34 tests.
- `bash -c 'cd client && node --test'` → `# fail 0`, 11 tests.
- `docker run --rm -v "$PWD/shared:/src" -w /src/protocol node:22-alpine node --test` → `# fail 0`, 7 tests.
- `bash scripts/verify-device.sh` → `ALL 9 CHECKS PASSED`.

- [ ] **Step 4: Direct scenario runs**

- `docker compose exec -T api node spoilers/poc/fleet-sweep.js` → exit 0.
- `docker compose exec -T api node spoilers/poc/reservation-search.js` → exit 0.
- `docker compose exec -T api node spoilers/poc/device-fetch.js` → exit 0.
- `node spoilers/poc/package-recovery.js` → exit 0 (host, stack up).

- [ ] **Step 5: CDP UI check with screenshots**

Start the API on the host port, launch Electron with `--remote-debugging-port=9222` + smoke env, drive the CDP flow used in previous phases; screenshot both the normal UI (login + sections render, no weakness names visible) and the smoke run result. Save screenshots under `/tmp/lab-reorg-shots/`.

- [ ] **Step 6: ASAR strings re-check**

Repeat Task 9 Step 3 to confirm no `v4`/`proof`/`unsafe`/`ssrf` strings.

---

### Task 11: Spoil-scan, cross-link audit, staging audit

**Files:**
- Modify: none (read-only checks + `git add`)

**Interfaces:**
- Produces: zero banned-pattern hits in the clean zone; zero broken relative links; staged change list audited.

- [ ] **Step 1: Clean-zone banned-pattern scan**

Run (from repo root) a grep over the clean zone — everything except `spoilers/`, `.git/`, `node_modules/`, `docs/superpowers/` (the spec/plan move in Task 12; note this exclusion in the report) — for each pattern, requiring zero hits: `v1|v2|v3|v4` (word-bounded), `sqli`, `ssrf`, `traversal`, `unsafe`, `vuln`, `\bphase` (case-insensitive), `poc-`, `scripts/poc`, `proof/`, `instructor`, `grader|grading`. Premise locations (README.md, SECURITY-LAB-NOTICE.md, ARCHITECTURE.md lines 3–5, the two package.json description fields) are the only allowed hits — verify each hit is inside a premise location, otherwise fix the file.

- [ ] **Step 2: Old-path residue check**

Confirm zero hits for: `VULN-MAP`, `docs/vulnerabilities/`, `docs/INSTRUCTOR-NOTES`, `poc-v1-token|poc-v1-asar|poc-v2-sqli|poc-v3-ssrf`, `v4-file-read`, `v4-ipc.test`, `resources/proof` (outside spoilers), `phase2.test|phase3.test|phase5.test` (outside spoilers).

- [ ] **Step 3: Cross-link audit**

Bash loop: for every markdown file in the clean zone, extract `](...)` link targets, skip http(s)/mailto/anchors, resolve each relative to its file, `test -e`; collect missing targets; exit 1 if any. Repeat for `spoilers/*.md`. Fix or report every broken target.

- [ ] **Step 4: Stage and audit**

Run: `git add -A` then `git diff --cached -M --stat | tail -40`.
Expected: renames detected (manual-reader.js, ops-memo.txt, core/reservations/field-ops.test.js, spoilers/*); `docs/superpowers/` untracked-to-staged including the plan; NO unexpected deletions; `client/app.asar` modified; `services/api/package.json` modified; `client/package.json` NOT in the diff. Report the stat summary to the user. Do NOT commit.

---

### Task 12: Relocate spec+plan into spoilers/, final scan, stop for go-ahead

**Files:**
- Modify: `spoilers/specs/2026-10-02-repo-reorg-design.md` (plain mv from `docs/superpowers/specs/`), `spoilers/specs/2026-10-02-repo-reorg-plan.md` (plain mv from `docs/superpowers/plans/`)
- Delete: `docs/superpowers/` (rmdir tree after moves)

**Interfaces:**
- Produces: answer-key material fully inside `spoilers/`; repo otherwise staged.

- [ ] **Step 1: Move the spec and plan**

```bash
mv docs/superpowers/specs/2026-10-02-repo-reorg-design.md spoilers/specs/2026-10-02-repo-reorg-design.md
mv docs/superpowers/plans/2026-10-02-repo-reorg.md spoilers/specs/2026-10-02-repo-reorg-plan.md
rm -rf docs/superpowers   # contains only the two moved files' now-empty dirs
```

(Plain `mv`/`rm -rf` on this fresh untracked docs/superpowers tree is safe — it has no git history. Do not touch any other path.)

- [ ] **Step 2: Re-run the clean-zone scan**

Repeat Task 11 Step 1 WITHOUT the docs/superpowers exclusion. Expected: zero hits (or premise-only). `docs/superpowers` no longer exists.

- [ ] **Step 3: Final quick battery**

Run: `bash scripts/verify-lab.sh 2>&1 | tail -3; echo "exit=$?"` — but capture honestly: run the script to a file first, then tail, then report the script's own exit code separately. Expected: `ALL LAB CHECKS PASSED`.

- [ ] **Step 4: Re-stage**

Run: `git add -A && git status --short | head -60`. Expected: `docs/superpowers/` gone from the list; `spoilers/specs/` files present as untracked-now-staged.

- [ ] **Step 5: STOP — report and wait for explicit go-ahead**

Present the staged diff summary and the exact commit message to the user. Do NOT commit until the user explicitly says so. When they do, commit with one-shot identity flags and the exact message:

```
Reorganize repo: clean working tree + spoilers/ answer key

Move all answer-key material (registry, writeups, PoCs, exercises,
operating notes) under spoilers/; despoil the clean tree of weakness
and phase naming; rename client modules, DOM ids, tests, and PoCs to
neutral names; revalue challenge markers. No functional changes.
```

Command: `git -c user.name='Lab Developer' -c user.email='lab@localhost' commit -m "$(cat <<'EOF' ... EOF)"`. Do NOT push.

---

## Self-Review

**Spec coverage:** §5.1 PoC moves + path/prefix fixes → T2. §5.2 client renames/rewrites → T3. §5.3 ops-memo content → T3 Step 2 (verbatim). §5.4 smoke.html strings → T3 Step 7. §5.5 test renames/titles → T4 Steps 2–5. §6 flag revaluation → T5. §7 wiring (verify-lab.sh, Dockerfile, compose) → T6. §8 clean docs → T7. §9 spoilers/README.md → T8 Step 1. §10 verify labels/counts → T6 Step 1 + T10. §11 counts → T1/T10. §12 scans → T11. §13 link audit → T11 Step 3. §14 single commit → T12 Step 5. §15 pre-completion checklist → T9–T11. §16 sequencing → task order T1–T12. §17 commit message → T12 Step 5 verbatim. §18 execution modes → handoff below.

**Placeholder scan:** no TBD/TODO steps; every edit step carries its literal old→new content or references the spec section that contains it verbatim (spec §5.3 memo text is inlined above).

**Name consistency:** `client/manual-reader.js` exports `readManual`/`MANUALS_DIR` (matches main.js import and test usage); DOM ids `manual-file`/`btn-open-manual`/`manual-out` consistent across index.html/app.js; `client/test/manual-reader.test.js` requires `../manual-reader.js`; verify-lab.sh scenario paths match `spoilers/poc/` filenames; suite paths match renamed test files; flag values consistent (`device_admin_console_reached`, `internal_notes_recovered`) across device/server.js, ops-memo.txt, field-ops.test.js, device-probe.js, smoke.html, ARCHITECTURE.md.
