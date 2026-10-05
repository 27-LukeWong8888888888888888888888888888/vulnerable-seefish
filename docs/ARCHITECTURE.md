# Architecture

An intentionally vulnerable security-lab application for coursework. See
`SECURITY-LAB-NOTICE.md` in the repo root. All data is synthetic. Do not
deploy.

## Components

| Component | Image | Networks | Host-facing? |
|---|---|---|---|
| `api` | custom (Express, built from `services/api/Dockerfile`) | `lab-internal` + `lab-edge` | yes — loopback only, `127.0.0.1:${API_PORT:-3000}` |
| `db` | `postgres:18-alpine` | `lab-internal` only | no published port |
| `lab-device` | custom (`node:22-alpine`, built from `services/device/Dockerfile`) | `lab-internal` only | no published port |
| Electron desktop client (`client/`) | host process (`electron` 44.x via npm; also packaged as `client/app.asar`) | host only → api loopback port | runs on the host; talks only to the api |

```
                 ┌──────────────┐   lab-internal   ┌──────────────────┐
                 │     api      │◄────────────────►│        db        │
 host ──:3000──► │ (Express+RC4)│                  │ (postgres:18-    │
 127.0.0.1       │              │                  │  alpine)         │
                 └──────┬───────┘                  └──────────────────┘
                        │ lab-edge                  ┌──────────────────┐
                        │ (host ingress only;       │    lab-device    │
                        │  no db/device traffic)    │ (node:http, 8080)│
                        └──────────────────────────►└──────────────────┘
```

- **`lab-internal`** (`internal: true`) — no external egress, no host
  ingress. Carries all api → db and api → device traffic. Docker
  service-name DNS resolves `db` and `lab-device` only on this network.
- **`lab-edge`** — not internal; exists only to bridge the host to the
  api's loopback-published port. Attached to the api only. No database
  or device traffic crosses it.

## Trust boundaries

1. **renderer → preload/IPC → main process → API.** The renderer page
   (vanilla JS, `nodeIntegration: false`) can only reach the preload
   bridge `window.lab`; IPC forwards to the main process, which alone
   performs HTTP and RC4.
2. **API → lab-internal → lab-device.** The API is the single
   controlled bridge onto the internal network.
3. **client package → holder.** Everything shipped to the client —
   including `client/app.asar` — is readable by its user.
4. **API → SQL engine.** One concatenated query escapes the
   application-layer per-user scoping.

Host-exposure facts (asserted by `scripts/verify-device.sh` and
`scripts/verify-lab.sh` §3):

* the **db publishes no host port**;
* the **lab-device publishes no host port**;
* **`lab-internal` is a Docker-internal network** (`internal: true`)
  with no external egress;
* the **API is the only controlled bridge** onto it, published on
  `127.0.0.1:3000` loopback only;
* **only `/health` and `/api/session/key` are plaintext** — every
  other `/api` route requires the RC4 envelope
  (`docs/PROTOCOL-RC4.md`).

## Request path

1. The host — curl, the PoC scripts, or the Electron client — talks
   to the api on `http://127.0.0.1:3000`.
2. Plaintext endpoints: `GET /health` and `POST /api/session/key` (the
   RC4 key is returned readable by design — see `docs/PROTOCOL-RC4.md`).
3. Every other `/api` endpoint requires the RC4 envelope
   `{sid, alg:"RC4", data: base64(RC4(key, JSON))}` on POST; decrypted
   JSON becomes `req.body`, and all responses are re-sealed.
4. Application authentication rides inside the envelope as an opaque
   in-memory token (`labtok-…`) issued by `POST /api/auth/login` —
   distinct from the RC4 transport session.
5. Desktop client: the renderer page (vanilla JS,
   `nodeIntegration: false`) calls the narrow `window.lab` bridge exposed
   by the preload; IPC forwards to the main process, which performs the
   HTTP requests and the RC4 seal/open using the shared protocol module
   (`client/api-client.js`). The renderer never sees the RC4 key, never
   holds the `labtok-` token itself (the main process attaches it), and
   has no path to PostgreSQL or the lab device except through the api.
   The synthetic field-service token ships in `client/resources/lab-app-config.json`; these resources are packaged into `client/app.asar` (`npm run pack` in `client/`); extracting it from the archive and using it against the local API is one of the lab scenarios (see `spoilers/`).

## API endpoints

Roles are enforced server-side per route: `student` (read, submit
fault reports, book/cancel own reservations), `technician` (plus
update equipment, manage fault reports and any reservation), `admin`
(plus create equipment).

Plaintext (no envelope required):

| Endpoint | Description |
|---|---|
| `GET /health` | Liveness/readiness probe (checks DB). |
| `POST /api/session/key` | Issue RC4 session: `{sessionId, key, algorithm, expiresIn}`. |

Everything else requires the RC4 envelope on **POST** (all protected
endpoints are POST because the envelope and the application token travel
in the request body — GET bodies are unreliable across HTTP clients):

| Endpoint | Roles | Description |
|---|---|---|
| `POST /api/auth/login` | anyone with a valid RC4 session | `{username, password}` → `{token, user}`. |
| `POST /api/auth/logout` | authenticated | Revokes the application token. |
| `POST /api/auth/me` | authenticated | Returns the current user. |
| `POST /api/equipment/list` | authenticated | Optional filters `status`, `locationId`, `q` (all parameterized). |
| `POST /api/equipment/get` | authenticated | `{id}` → one item. |
| `POST /api/equipment/create` | admin | `{assetTag, name, category, locationId, …}`. |
| `POST /api/equipment/update` | technician, admin | `{id, status?, firmwareVersion?}`. |
| `POST /api/fault-reports/list` | authenticated | Students see their own reports; technicians/admins see all. |
| `POST /api/fault-reports/create` | authenticated | `{equipmentId, title, description?, severity?}`. |
| `POST /api/fault-reports/update` | technician, admin | `{id, status?, resolution?}`. |
| `POST /api/reservations/list` | authenticated | Students: own only; staff: all. Filters `status?`, `equipmentId?` (parameterized). |
| `POST /api/reservations/create` | authenticated | `{equipmentId, startsAt, endsAt, purpose?}` — booked for the caller. |
| `POST /api/reservations/update` | owner / technician / admin | `{id, purpose?, status?, startsAt?, endsAt?}` — students may only edit/cancel their own. |
| `POST /api/reservations/history` | authenticated | Ended / cancelled / completed reservations (own-only for students). |
| `POST /api/reservations/search` | authenticated | `{q}` — legacy string-concatenated filter (see the route source). Everything else is parameterized. |
| `POST /api/diagnostics/run` | technician, admin | `{equipmentId}` — fetches the equipment's configured `diagnosticTarget`, records a `diagnostic_runs` row, refreshes `last_seen_at`. |
| `POST /api/diagnostics/fetch` | technician, admin | `{equipmentId, target}` — fetches the **caller-supplied URL** server-side with no allowlist and returns the response (see the route source). |
| `POST /api/field-service/fleet-sweep` | `X-Field-Token` header (no login token needed) | Fleet-wide equipment + all users' diagnostic run history. authorized by the static synthetic field-service token alone (no login token). |

## lab-client.js (protocol CLI helper)

CLI helper for manual protocol work and demonstrations:
requests/caches the RC4 session, encrypts an arbitrary JSON payload,
sends it to any endpoint, decrypts and prints the response. Not
hard-coded to one call.

```bash
# inside the api container (works out of the box):
docker compose exec api node scripts/lab-client.js \
  --endpoint /api/auth/login \
  --payload '{"username":"alice","password":"StudentPass!23"}'

# any later call reuses the cached session and auto-attaches the login token:
docker compose exec api node scripts/lab-client.js --endpoint /api/auth/me

# host equivalent (repo mounted at /app):
docker run --rm --network host \
  -v /home/ubuntu/campus-lab-booking:/app -w /app node:22-alpine \
  node scripts/lab-client.js --endpoint /api/auth/me
```

Options: `--endpoint` (required), `--payload` (JSON string), `--method`
(default POST), `--base` (default `http://127.0.0.1:3000` or `LAB_BASE`),
`--fresh` (force new handshake), `--no-auth` (skip token attachment).
The session cache defaults to `scripts/.lab-session.json` (gitignored);
override with `LAB_SESSION_FILE`.

## Simulated lab device

`lab-device` models an instrument that exists only on the campus-internal
lab network. It runs plain `node:http` with no dependencies and exposes
exactly three GET endpoints (`/api/status`, `/api/diagnostics`,
`/api/admin`), all synthetic JSON. It has no published host port and is
not attached to `lab-edge`, so the host cannot reach it directly; only
`lab-internal` members can (the api, via `http://lab-device:8080`).

**Diagnostics fetch:** `POST /api/diagnostics/fetch` (technician/admin)
fetches a caller-supplied URL from the request body with no allowlist and
no loopback/private-range blocking (`services/api/src/routes/diagnostics.js`).
The device is the designated target: fetching
`http://lab-device:8080/api/admin` through the api returns its synthetic,
explicitly-not-real marker value (`LAB{device_admin_console_reached}`),
demonstrating the server reached the internal-only network on the caller's
behalf — host → api → lab-device. Direct reachability from the api is
independently demonstrated by `scripts/device-probe.js` (run inside the
api container) and `scripts/verify-device.sh` (host side).

## Intentional weaknesses

This application is intentionally vulnerable (see `SECURITY-LAB-NOTICE.md`).
The registry of deliberate weaknesses and their writeups lives in the
answer key: `spoilers/`.

All other SQL in the api is parameterized; no accidental injection bugs.
