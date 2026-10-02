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

**The vulnerabilities are not listed here on purpose.** Finding them is
the assignment. If you are setting up, teaching, or grading the lab, the
full list, reproductions, and proofs are in
[VULNERABILITIES.md](VULNERABILITIES.md), with per-vulnerability
writeups under [`docs/vulnerabilities/`](docs/vulnerabilities/) and
operating notes in [`docs/INSTRUCTOR-NOTES.md`](docs/INSTRUCTOR-NOTES.md).

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

Per-suite and PoC-level commands: [`docs/LAB-EXERCISES.md`](docs/LAB-EXERCISES.md)
and [`docs/INSTRUCTOR-NOTES.md`](docs/INSTRUCTOR-NOTES.md).

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
| [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) | Assets, trust boundaries, attacker profiles |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Schema and seeded data |
| [`docs/PROTOCOL-RC4.md`](docs/PROTOCOL-RC4.md) | Encrypted-envelope protocol and its weaknesses |
| [`docs/LAB-EXERCISES.md`](docs/LAB-EXERCISES.md) | Student exercises (no spoilers) |
| [`docs/INSTRUCTOR-NOTES.md`](docs/INSTRUCTOR-NOTES.md) | Setup, grading, reset |
| [`VULNERABILITIES.md`](VULNERABILITIES.md) | Full vulnerability list — **spoilers** |

The full index is [`docs/README.md`](docs/README.md).

## Layout

```
compose.yaml               Docker Compose (db + api + lab-device)
client/                    Electron desktop client (main + preload + renderer)
services/api/              Express API: envelope middleware, auth, routes, sql
services/device/           Simulated internal lab device
shared/protocol/           RC4 + envelope module (shared client/server)
scripts/                   PoCs, lab-client CLI, verification
docs/                      Architecture, threat model, protocol, exercises
```

## Status

All seven development phases are complete (final). The lab is stable;
`scripts/verify-lab.sh` is the single re-verification entry point.
