# Instructor Notes

> This lab is **intentionally vulnerable** coursework
> (`SECURITY-LAB-NOTICE.md`). Do not deploy it, do not expose it to a
> network beyond the lab host, and do not "fix" the four documented
> vulnerabilities. All credentials and data are synthetic.

## 1. Architecture summary

```
┌────────────────────────── lab host ──────────────────────────┐
│                                                              │
│  Electron client (client/)                                   │
│    renderer page ──► preload (window.lab bridge)             │
│      │ contextIsolation:false  sandbox:false  nodeIntegration:false
│      ▼                                                       │
│    main process (ApiClient: HTTP + RC4 only; no child_process)
│      │  plain HTTP, RC4 envelope {sid, alg:"RC4", data}      │
│      ▼                                                       │
│  api container (127.0.0.1:3000, loopback-only publish)       │
│    ├── /health, /api/session/key  (plaintext JSON)           │
│    └── everything else under /api  (RC4 envelope required)   │
│      │                                                       │
│      ├──► db container   (PostgreSQL; NO host port)          │
│      │                                                       │
│      └──► lab-internal  (Docker internal:true network)       │
│             └── lab-device container (synthetic instrument;  │
│                 NO host port)                                │
└──────────────────────────────────────────────────────────────┘
```

Trust boundaries to teach explicitly:

1. **renderer → preload/IPC → main process** — V4 lives here. With
   `contextIsolation: false` the bridge is a plain global, so any
   renderer JS can invoke the file-read handler.
2. **API → lab-internal → lab-device** — V3 lives here. The API is
   the only bridge onto the internal network; the host has no route.
3. **client package → attacker** — V1 lives here. Everything shipped
   to a client (including the ASAR archive) must be treated as
   readable by the user.
4. **API → SQL engine** — V2 lives here. One concatenated query
   bypasses the per-user predicate the application layer relies on.

Transport note: RC4 "encryption" is itself part of the lesson — the
session key is handed out in readable JSON by design
(`PROTOCOL-RC4.md`). Do not let students mistake the envelope for
security; it is the wire format, not a control.

## 2. Synthetic credentials (all lab-only, none real)

| Credential | Value | Used for |
|---|---|---|
| Field-service token (V1) | `FS-LAB-7f3a9c1e-4b2d-8e6f-a5c0-1d9b3e7f2a48` | `X-Field-Token` header; recoverable from ASAR |
| Admin | `admin` / `AdminPass!23` | full API access |
| Technician | `tech1` / `TechPass!23` | V3 exercise (student role is denied 403) |
| Students | `alice`, `bob`, … / `StudentPass!23` | V2 exercise (bob attacks, alice is the victim) |
| Login tokens | `labtok-…` (issued at login) | bearer token inside the RC4 envelope |
| RC4 session keys | random per `POST /api/session/key` | envelope cipher key, delivered in plaintext by design |

## 3. Seed data per vulnerability

| Vuln | Seed facts to know |
|---|---|
| V1 | `service_secrets` table mirrors the token for realism, but the app validates the hard-coded constant. `fleet-sweep` reads all 23 equipment rows + all `diagnostic_runs` regardless of owner. |
| V2 | Victim row: reservation **id 13**, owner `alice`, equipment `EQ-1002` "DNA Sequencer 4500", 2026-10-06 09:00–12:00 UTC, "Senior project: DNA sequencer calibration", `active`. Attacker `bob` sees 0 rows for `q="DNA"` and cannot list/fetch row 13 legitimately. |
| V3 | `EQ-1001` (`equipmentId` 1) stores target `http://lab-device:8080/api/status`; the admin endpoint `/api/admin` on the device returns the challenge. Device is only on `lab-internal`. |
| V4 | `client/resources/manuals/equipment-manual.txt` is the intended read; `client/resources/proof/v4-proof.txt` (containing `LAB{unsafe_ipc_path_traversal}`) is outside `manuals/`, reachable via `../proof/v4-proof.txt`. |

Live counts at handoff: 9 users, 4 locations, 23 equipment, 54
reservations, 17 fault reports (counts drift upward as tests/PoCs add
synthetic rows; only the anchor facts above matter).

## 4. Expected PoC results

| Proof | Command | Expected |
|---|---|---|
| V1 (api-side) | `docker compose exec api node scripts/poc-v1-token.js` | 403 without header / 200 with token; exit 0 |
| V1 (package recovery) | `node scripts/poc-v1-asar.js` | token recovered from `client/app.asar`, then 200 `fleet-sweep`; exit 0 |
| V2 | `docker compose exec api node scripts/poc-v2-sqli.js` | injected search returns row 13 (`alice`); exit 0 |
| V3 | `docker compose exec api node scripts/poc-v3-ssrf.js` | response body contains `LAB{ssrf_internal_device_reached}`; exit 0 |
| V4 (deterministic) | `cd client && node --test` | 11/11 pass |
| V4 (real browser) | `bash client/scripts/smoke-electron.sh` | `SMOKE OK — all checks passed`; exit 0 |
| Everything | `bash scripts/verify-lab.sh` | `ALL LAB CHECKS PASSED` (28 checks); exit 0 |

## 5. Reset notes

* V2/V3 and any API-side state: `docker compose down -v && docker
  compose up -d --wait` recreates the DB from schema + seed. Report
  this to students as the clean reset; it is the only destructive
  step in the lab and it only touches this project's volume.
* `diagnostic_runs` and `audit_log` accumulate harmlessly (synthetic
  rows); no reset is needed for V1/V3 unless you want pristine
  counts.
* V4 touches no state — re-running tests and the smoke script is
  always safe.
* Client packaging is reproducible: `cd client && npm run pack`
  rebuilds `client/app.asar` deterministically from source; deleting
  the archive is safe.

## 6. Common student mistakes

* **Attacking the envelope instead of the app.** The RC4 layer is
  not the vulnerability; treat it as a wire format. Every exercise
  starts by getting a session key and logging in (except V1, which
  needs no login at all).
* **Confusing the tokens.** `labtok-…` = login token (user auth).
  `FS-LAB-…` = field-service backdoor (V1). RC4 session key = throwaway
  envelope key from `/api/session/key`. V1 never needs a `labtok`.
* **Expecting V3 from the host.** The host cannot reach
  `lab-device` — that is the point. The exploit goes *through* the
  API container.
* **Trying V3 as a student.** `/fetch` requires the `technician`
  role; 403 for students is the expected control.
* **"Fixing" V4 by enabling `nodeIntegration`.** That is not the
  vulnerability (and the page must keep `nodeIntegration: false`).
  V4 is the unvalidated path join plus the exposed bridge.
* **Reading host files for V4.** Out of scope — see §7.
* **Piping `cmd | grep` and trusting `$?`.** The status is grep's,
  not cmd's. Check exit codes directly.

## 7. Verifying each vulnerability still exists

| Vuln | Quick check |
|---|---|
| V1 | `node scripts/poc-v1-asar.js` exits 0 and prints the recovered token; wrong/missing header → 403 (also asserted in `services/api/test/phase5.test.js` test 4). |
| V2 | `docker compose exec api node scripts/poc-v2-sqli.js` shows row 13 in the injected result (phase3 test 7). |
| V3 | `docker compose exec api node scripts/poc-v3-ssrf.js` returns the challenge (phase5 test 3); host curl to the device still fails (`scripts/verify-device.sh`). |
| V4 | `cd client && node --test` and the smoke run both pass; `client/v4-file-read.js` still has no path validation. |

## 8. Verifying the safety boundaries remain intact

These invariants must hold at all times — a regression here is a
real defect, not a feature:

1. **V4 must NOT provide arbitrary host filesystem access.** The
   intended V4 proof is confined to the application's resource tree
   (`client/resources/`). `/etc/passwd`, SSH keys, browser profiles,
   user documents, credentials, and any other real host files are
   out of scope: never used in demonstrations, tests, or PoCs. The
   handler is unvalidated *by design*, but nothing in the repo or
   docs may point it at the host filesystem.
2. **Renderer capabilities stay narrow.** No `child_process`, no
   shell, no native modules anywhere in `client/` (asserted by
   `client/test/surface.test.js`); the preload's only `require()` is
   `'electron'`; `nodeIntegration: false` keeps Node out of the page.
3. **No host ports beyond the API loopback.** `docker compose config`
   must show the db and lab-device with no published ports, and
   `lab-internal` with `internal: true`; the API publishes
   `127.0.0.1:3000` only. `scripts/verify-device.sh` and
   `scripts/verify-lab.sh` section 3 assert this.
4. **Only `/health` and `/api/session/key` are plaintext.** Every
   other `/api` route requires the RC4 envelope (phase5 test 5).
5. **All credentials remain synthetic.** The FS token is
   `FS-LAB-…`, login tokens `labtok-…`, passwords the documented
   `*Pass!23` set. Nothing real anywhere.
6. **Exactly four vulnerabilities.** The Phase 7 source review greps
   for accidental secrets, external targets, and new dangerous
   capabilities; anything found is a defect to fix — but the four
   documented vulnerabilities are never "remediated".
