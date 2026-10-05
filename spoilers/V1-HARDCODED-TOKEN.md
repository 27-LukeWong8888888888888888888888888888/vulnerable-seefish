# V1 — Hard-coded Synthetic Field-Service Token

> **Intentional coursework vulnerability.** This application is a
> deliberately vulnerable security lab (see `SECURITY-LAB-NOTICE.md`). Do
> not "fix" this endpoint; do not deploy. The token is **synthetic — NOT a
> real credential**.

## Summary

| Item | Value |
|---|---|
| Vulnerability | Hard-coded credential (CWE-798) — a static API token compiled into the application |
| Endpoint | `POST /api/field-service/fleet-sweep` |
| Credential location | `services/api/src/fieldServiceToken.js` (constant `FIELD_SERVICE_TOKEN`); the packaged client additionally ships the same value inside the Electron ASAR at `resources/lab-app-config.json` |
| Token transport | `X-Field-Token` request header |
| Attacker model | anyone who recovers the token — no user account, login token, or role required (the RC4 transport session still applies, like all `/api` routes) |
| Impact | fleet-wide equipment diagnostics + **every user's** diagnostic run history, data no ordinary role can see |
| Exact location | `services/api/src/routes/fieldService.js` — route `/fleet-sweep`, gated solely by the token from `src/fieldServiceToken.js` (comment `// Static synthetic field-service token — NOT a real credential.`) |

## Why it is intentionally vulnerable

The endpoint implements the fictional instrument vendor's "field-service"
function. Instead of authenticating a user, it compares a request header
against a **static token embedded in the source code**:

```js
// services/api/src/routes/fieldService.js (route POST /fleet-sweep)
if (req.get('x-field-token') !== FIELD_SERVICE_TOKEN) {
  return res.status(403).json({ error: 'forbidden', ... });
}
```

```js
// services/api/src/fieldServiceToken.js
// Static synthetic field-service token — NOT a real credential.
// Behavior note: possession of this token alone authorizes the vendor field-service endpoint — no user account or role needed.
// Do not change this behavior — the lab exercises depend on it.
const FIELD_SERVICE_TOKEN = 'FS-LAB-7f3a9c1e-4b2d-8e6f-a5c0-1d9b3e7f2a48';
```

A static token cannot be rotated, scoped, or revoked, and — crucially for
the lab — it ships to every client. The packaged client carries the same
value inside the Electron ASAR (`resources/lab-app-config.json`); extracting the
archive with `npx asar extract` (or any archive tool) reveals it. A real
application would use per-deployment secrets with an expiry, or drop the
vendor backdoor entirely.

The token value is also mirrored in the seeded `service_secrets` table
(`field-service-token` row) for realism — the application itself validates
against the hard-coded constant, which is the vulnerable part.

## Independence from V3

V1 requires **no user login at all** — only the token. V3
(`POST /api/diagnostics/fetch`) requires a technician login and never
consults the FS token. The two vulnerabilities are independently
exploitable.

## Reproduction

### Automated PoC (preferred)

```bash
docker compose exec -T api node spoilers/poc/fleet-sweep.js
```

Handshake (no login) → negative controls (no token → 403; a valid
**student** session → 403) → same call with the hard-coded
`X-Field-Token` header and an **empty payload** → 200 with fleet +
run-history data. Exit code 0 = confirmed.

### Manual, with lab-client.js

lab-client.js cannot send custom headers, so use curl for the header
(the envelope body still has to be built — easiest shown via the PoC).
The PoC output is the reference reproduction.

### Token recovery from the packaged client (ASAR)

The token also ships inside the packaged Electron client. The pack step
(`npm run pack` in `client/`, script `client/scripts/pack-asar.js`)
stages the client resources and `shared/protocol/` into
`client/app.asar`. The synthetic token sits in the archive at
`client/resources/lab-app-config.json`, **unobfuscated by design** —
that is the point of the exercise.

Deterministic two-stage proof (run on the lab host, against the local
lab only):

```bash
node spoilers/poc/package-recovery.js
```

The script clearly separates the two stages:

1. **Recovery (client package, no network):**
   - locate `client/app.asar` (clear FAIL + hint if it is missing —
     run `cd client && npm run pack` first);
   - `asar.listPackage()` / `asar.extractFile()` on
     `client/resources/lab-app-config.json` (via `@electron/asar`, the
     same archive library the pack step uses);
   - assert the recovered value starts with `FS-LAB-` and equals the
     expected synthetic constant — the script **fails clearly** if the
     token is no longer present in the package.
2. **Use (local lab API only):** fresh RC4 session → negative control
   without the header (expect 403) → `POST /api/field-service/fleet-sweep`
   with `X-Field-Token: <recovered token>` and an empty payload
   (expect 200, `fleet` and `recentRuns` arrays).

Manual equivalent of stage 1:

```bash
cd client
npx asar list app.asar | grep lab-app-config.json
npx asar extract-file app.asar client/resources/lab-app-config.json
```

The extracted JSON contains
`"fieldService": { "token": "FS-LAB-7f3a9c1e-4b2d-8e6f-a5c0-1d9b3e7f2a48", ... }`.
No external service is contacted at any point; stage 2 targets
`http://127.0.0.1:3000` only.

## Expected response

Request: envelope of `{}` (literally no user token) plus header
`X-Field-Token: FS-LAB-7f3a9c1e-4b2d-8e6f-a5c0-1d9b3e7f2a48`.

Decrypted response (abridged):

```json
{
  "service": "field-service/fleet-sweep",
  "generatedAt": "2026-09-29T05:20:53.000Z",
  "fleet": [
    { "id": 1, "assetTag": "EQ-1001", "name": "Environmental Chamber XL",
      "status": "maintenance", "firmwareVersion": "3.1.7-lab",
      "diagnosticTarget": "http://lab-device:8080/api/status", "...": "..." }
  ],
  "recentRuns": [
    { "id": 7, "assetTag": "EQ-1001", "requestedByUsername": "tech1",
      "kind": "fetch", "target": "http://lab-device:8080/api/admin",
      "status": "completed", "...": "..." }
  ]
}
```

`recentRuns` is the important part: diagnostic history **across all
users** (`requestedByUsername` of technicians and admins), which no
ordinary user role can enumerate through any other endpoint.

## Exact proof

Asserted by `services/api/test/field-ops.test.js` (test 4) and
`spoilers/poc/fleet-sweep.js`:

1. **Negative:** envelope with no header → 403; envelope with a valid
   **student** login token but no header → 403 (user auth does not grant
   field-service access); wrong header value → 403.
2. **Exploit:** envelope with an **empty payload** (no `token` field at
   all) + correct `X-Field-Token` → 200, `fleet` array with all seeded
   equipment, `recentRuns` containing rows requested by other users.
3. The call is also recorded in `audit_log` with `actor_label =
   'field-service'` — visible via psql, demonstrating the endpoint
   believes it is talking to the vendor function.

## Negative controls

| # | Check | Where |
|---|---|---|
| 1 | No token → 403 | field-ops test 4 |
| 2 | Valid student session, no header → 403 | field-ops test 4 |
| 3 | Wrong header value → 403 | field-ops test 4 |
| 4 | Plaintext body (no envelope) → 400 `missing_sid`; unknown sid → 401 | field-ops test 5 |
| 5 | V3 works without this token (independence) | field-ops test 3 |

## Remediation guidance

In a real application:

* never ship a static credential inside client code or packaged
  resources — anything distributed to clients must be treated as
  public;
* replace the vendor-token backdoor with normal authenticated,
  role-authorized endpoints (a technician/admin role check, as the
  rest of the API does);
* if a machine-to-machine token is unavoidable, use a per-deployment
  secret from a secrets manager with rotation and expiry, validated
  server-side only;
* audit for the token in source, archives, and images (it will appear
  in every shipped build — that is why ASAR extraction recovers it).

Do **not** apply any of this to the lab build: the hard-coded token is
the coursework vulnerability, and the exercises depend on it.

## Reset procedure

```bash
docker compose down -v      # drops the database volume
docker compose up -d --wait
```

`fleet-sweep` only reads data and appends an `audit_log` row; both are
synthetic and safe to accumulate. The token itself is source code —
"resetting" it would mean editing `services/api/src/fieldServiceToken.js`
(and the packaged ASAR config), which you must **not** do — the lab depends
on it.
