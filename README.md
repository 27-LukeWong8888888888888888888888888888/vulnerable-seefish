# Campus Laboratory Equipment Booking and Diagnostic Client

An intentionally vulnerable security-lab application for coursework: an
Electron thick client + Express REST API + PostgreSQL for booking lab
equipment, reporting faults, and running device diagnostics, plus a
simulated instrument on an internal lab network.

> **AI use disclosure:** This project was developed with the assistance of an
> AI coding agent. All code, documentation, and tests were produced with AI
> assistance under human direction and review.

> **This is a deliberately vulnerable lab.** See `SECURITY-LAB-NOTICE.md`.
> All data is synthetic. Do not deploy.

**The weaknesses are not listed here on purpose.** Finding them is the
assignment. The full answer key — registry, writeups, and working
proofs — lives in [`spoilers/`](spoilers/) under its own warnings. Do
not open it until you have your own answers.

## Architecture

The Electron desktop client (`client/`) talks to an Express API over a
custom encrypted-envelope protocol; the API (and nothing else) reaches a
PostgreSQL database and a simulated lab device on an isolated internal
Docker network. All encryption and HTTP happen in the client's main
process — the renderer has no Node integration and no direct database
or device access.

```
                 ┌──────────────┐   lab-internal   ┌──────────────────┐
                 │     api      │◄────────────────►│        db        │
 host ──:3000──► │ (Express +   │                  │ (postgres, no    │
 127.0.0.1       │  encrypted   │                  │  published port) │
                 │  envelope)   │                  └──────────────────┘
                 └──────┬───────┘                  ┌──────────────────┐
                        │ lab-edge                  │    lab-device    │
                        │ (host ingress only)       │  (no published   │
                        └──────────────────────────►│   port)          │
                                                    └──────────────────┘
```

- **`lab-internal`** — `internal: true`: no external egress, no host
  reachability. All api → db and api → device traffic crosses only this
  network.
- **`lab-edge`** — exists only so the host can reach the api on
  `127.0.0.1:${API_PORT:-3000}:3000`. No database or device traffic
  ever crosses it.

## Requirements

- Docker Engine with the Compose plugin — runs db + api + lab-device.
- Node.js 22 LTS + npm — host-side only, for the Electron client.

## Quickstart

```bash
# server stack (schema + seed are applied automatically on first start)
docker compose up -d --wait

# desktop client
cd client
npm install
npm start            # Linux lab host runs electron with --no-sandbox
```

The renderer expects the API at `http://127.0.0.1:3000` (override with
`LAB_API_BASE`). A prebuilt package can be produced and run with
`npm run pack` / `npm run start:packaged` (writes `client/app.asar`).

## Verify

```bash
# one non-destructive entry point; re-verifies the whole lab (28 checks)
bash scripts/verify-lab.sh
```

Per-suite commands and the documentation index: [`docs/README.md`](docs/README.md).
The full answer key lives in [`spoilers/`](spoilers/) — spoilers; do not
open before attempting.

## Seed accounts (synthetic)

| Username | Password | Role |
|---|---|---|
| `admin` | `AdminPass!23` | admin |
| `tech1`, `tech2` | `TechPass!23` | technician |
| `alice` … `frank` | `StudentPass!23` | student |

## Documentation

| Document | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Components, endpoints, data flow |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Schema and seeded data |
| [`docs/PROTOCOL-RC4.md`](docs/PROTOCOL-RC4.md) | Encrypted-envelope protocol and its weaknesses |
| [`spoilers/`](spoilers/) | Full answer key — **spoilers; do not open before attempting** |

The full index is [`docs/README.md`](docs/README.md).

## Layout

```
compose.yaml               Docker Compose (db + api + lab-device)
client/                    Electron desktop client (main + preload + renderer)
services/api/              Express API: envelope middleware, auth, routes, sql
services/device/           Simulated internal lab device
shared/protocol/           RC4 + envelope module (shared client/server)
scripts/                   verification and tooling
spoilers/                  answer key — spoilers; do not open before attempting
docs/                      Architecture, data model, protocol (see docs/README.md)
```

## Status

The lab is complete and stable;
`scripts/verify-lab.sh` is the single re-verification entry point.
