# Vulnerabilities

> **Spoilers.** This file lists every intentional vulnerability in the
> lab, how to trigger it, and the exact proof that it fired. It is meant
> for instructors, graders, and maintainers. Students working the
> exercises should start from `docs/LAB-EXERCISES.md` instead.
>
> These vulnerabilities are required by the coursework assignment and
> must not be "fixed" (see `SECURITY-LAB-NOTICE.md`). All data is
> synthetic; do not deploy.

Exactly four vulnerabilities exist. Nothing else in the codebase is
intentionally vulnerable — accidental bugs are treated as defects, not
features. Each is documented in full under `docs/vulnerabilities/`; the
per-vuln docs are the authoritative reference for payloads, expected
responses, negative controls, and source analysis.

### Three distinct secrets (do not conflate)

| Secret | What it is | Lifetime / scope |
|---|---|---|
| RC4 session (`sessionId` + `key`) | transport encryption for the encrypted protocol | issued by `POST /api/session/key`, ~1 h expiry, identifies no user |
| Application token (`labtok-…`) | login identity + role, travels inside the envelope | issued by `POST /api/auth/login`, revoked by logout |
| Field-service token (`FS-LAB-…`) | static synthetic config secret for `/api/field-service/fleet-sweep` only | never expires, never rotates (that is V1); sent as the `X-Field-Token` header |

## V1 — Hard-coded synthetic field-service token

Full writeup: [`docs/vulnerabilities/V1-HARDCODED-TOKEN.md`](docs/vulnerabilities/V1-HARDCODED-TOKEN.md)

- **Affected feature:** field-service fleet sweep
  (`POST /api/field-service/fleet-sweep`).
- **Required user role:** none — the endpoint ignores the login token
  entirely and is gated solely by the static `X-Field-Token` header
  (CWE-798).
- **Prerequisites:** an RC4 session (free; no login needed) and the
  token `FS-LAB-7f3a9c1e-4b2d-8e6f-a5c0-1d9b3e7f2a48` — hard-coded in
  `services/api/src/fieldServiceToken.js` and shipped inside the client
  package (`client/resources/lab-app-config.json`, recoverable from
  `client/app.asar`).
- **Reproduction:**
  - API-side: `docker compose exec api node scripts/poc-v1-token.js`
    (403 without the header, 200 with it).
  - Package recovery: `node scripts/poc-v1-asar.js` (extracts the token
    from the packaged ASAR and uses it against the local API).
- **Expected proof:** HTTP 200 with `fleet` (all equipment) plus
  `recentRuns` — every user's diagnostic history, which no ordinary
  role can enumerate. Negative controls: no header → 403, wrong value
  → 403, valid student session without the header → 403.
- **Reset procedure:** none needed beyond
  `docker compose down -v && docker compose up -d --wait` — the call
  only reads and appends a synthetic `audit_log` row. The token is
  source code; "resetting" it would mean editing the constant, which
  must not be done.

## V2 — SQL injection in reservation search

Full writeup: [`docs/vulnerabilities/V2-SQL-INJECTION.md`](docs/vulnerabilities/V2-SQL-INJECTION.md)

- **Affected feature:** reservation search
  (`POST /api/reservations/search`, body field `q`) — the one query in
  the API that is not parameterized (CWE-89).
- **Required user role:** any authenticated user (seeded student
  `bob` suffices).
- **Prerequisites:** an RC4 session and a login token; the payload
  travels inside the envelope as `q = "x' OR 1=1 -- "`.
- **Reproduction:** `docker compose exec api node scripts/poc-v2-sqli.js`
  (logs in as bob, runs a control search, then the injection), or
  `scripts/lab-client.js` manually — see the writeup.
- **Expected proof:** bob's injected search returns every reservation,
  including the seeded victim row (id 13 — alice, EQ-1002, "Senior
  project: DNA sequencer calibration"), which no legitimate endpoint
  lets him see. Controls: alice searching normally sees only her own
  rows; bob searching `q = "DNA"` gets 0 rows.
- **Reset procedure:** `docker compose down -v && docker compose up -d
  --wait` restores schema + seed (row 13 included). The test suites
  only mutate synthetic rows they create themselves and are safe to
  re-run.

## V3 — Server-side request forgery (SSRF)

Full writeup: [`docs/vulnerabilities/V3-SSRF.md`](docs/vulnerabilities/V3-SSRF.md)

- **Affected feature:** equipment diagnostics fetch
  (`POST /api/diagnostics/fetch`, body field `target`) — the API
  fetches a caller-supplied URL server-side with no allowlist and no
  loopback/private-range blocking (CWE-918).
- **Required user role:** authenticated technician (`tech1` /
  `TechPass!23`).
- **Prerequisites:** an RC4 session and a technician login; a target the
  host cannot reach directly — the internal-only lab device
  (`http://lab-device:8080/api/admin`), which has no published port on
  an `internal: true` Docker network.
- **Reproduction:** `docker compose exec api node scripts/poc-v3-ssrf.js`
  (technician fetch of the device admin endpoint through the API).
- **Expected proof:** HTTP 200 whose body contains the device's
  synthetic challenge `LAB{ssrf_internal_device_reached}` — data only
  reachable on the internal network, retrieved by the server on the
  caller's behalf. Controls: students get 403; an unreachable target
  returns 502 `fetch_failed`; host-side curls to the device fail
  (`scripts/verify-device.sh` 7a/7b).
- **Reset procedure:** `docker compose down -v && docker compose up -d
  --wait` drops the accumulated `diagnostic_runs` rows; every run is
  synthetic and safe to accumulate otherwise.

## V4 — Unsafe IPC file read (Electron)

Full writeup: [`docs/vulnerabilities/V4-UNSAFE-IPC.md`](docs/vulnerabilities/V4-UNSAFE-IPC.md)

- **Affected feature:** the desktop client's file viewer —
  `window.lab.readFile(path)` in the renderer → preload →
  `ipcMain.handle('lab:read-file')`, which joins the renderer-controlled
  path onto `resources/manuals/` with no validation (CWE-22). The
  window runs with `contextIsolation: false`, `sandbox: false`.
- **Required user role:** any JavaScript executing in the renderer —
  no extra primitive is needed with the insecure settings above.
- **Prerequisites:** the Electron client running; the traversal string
  `../proof/v4-proof.txt`.
- **Reproduction:**
  - Deterministic: `cd client && node --test`
    (`client/test/v4-ipc.test.js` drives the exact handler) and
    `bash client/scripts/smoke-electron.sh` (full chain in a real
    Electron window).
  - Manual: open the client, sign in, use the "File viewer" panel with
    `../proof/v4-proof.txt`.
- **Expected proof:** the proof file content is returned, including
  `LAB{unsafe_ipc_path_traversal}`, and the resolved path is provably
  outside `resources/manuals/`. Control: reading
  `equipment-manual.txt` returns the manual normally.
- **Reset procedure:** none needed — the demonstration touches no
  database state and only reads static files under `client/resources/`.
  **Scope limitation:** the proof is confined to the application's own
  resource tree; `/etc/passwd`, SSH keys, browser profiles, user
  documents, and credentials are explicitly out of scope.

## Notes

* **No ranking.** V1–V4 are reference labels only; no severity ordering
  is implied or intended.
* **Independence.** Each vulnerability is exploitable on its own: V1
  needs no login, V2 needs any user, V3 needs a technician, V4 needs
  only renderer JavaScript.
* **Preservation.** Every vulnerability is covered by test suites and
  PoCs that assert it still exists — `scripts/verify-lab.sh` runs them
  all (28 checks). If a check ever fails because a vulnerability was
  removed, that is a lab defect, not an improvement.
