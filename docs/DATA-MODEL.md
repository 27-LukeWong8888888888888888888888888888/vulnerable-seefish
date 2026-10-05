# Data Model

> Synthetic coursework data (`SECURITY-LAB-NOTICE.md`). Nothing in
> the database is real. Schema: `services/api/sql/001_schema.sql`;
> seed: `services/api/sql/002_seed.sql` (applied automatically on
> first container start).

## Tables

### users
Lab accounts. `role` ∈ `student | technician | admin`; passwords are
bcrypt hashes (`pgcrypto` extension).

*Seed:* 9 users — `admin` (admin), `tech1`, `tech2` (technicians),
and 6 students including `alice` and `bob` (the cross-user pair).
Passwords: `AdminPass!23`, `TechPass!23`, `StudentPass!23`.

### rc4_sessions
Server-side store for the RC4 envelope keys issued by
`POST /api/session/key`. `key_b64` is persisted **in plaintext by
design** — the protocol weakness is documented in
`docs/PROTOCOL-RC4.md`. Rows carry `expires_at` and `revoked`.

*Mutation:* one row per handshake; rows accumulate harmlessly.

### service_secrets
Synthetic dummy secrets for realism. The `field-service-token` row
mirrors the static constant the application itself validates
(`services/api/src/fieldServiceToken.js`); this table is scenery.

### locations
Buildings/rooms for equipment. *Seed:* 4 rows.

### equipment
The bookable instruments. `status` ∈
`available | reserved | maintenance | retired`; `diagnostic_target`
is the **server-stored** URL the legitimate `/api/diagnostics/run`
uses (contrast with the caller-controlled `/fetch` endpoint).

*Seed:* 23 rows. Anchors: `EQ-1001` "Environmental Chamber XL"
(maintenance; target `http://lab-device:8080/api/status`) and
`EQ-1002` "DNA Sequencer 4500" — the latter anchors the cross-user
reservation.

### reservations
Bookings. `status` ∈ `active | cancelled | completed`. Application
layer scopes reads by `user_id`; the reservation search route
(`/api/reservations/search`) is the one deliberate exception — see its
source.

*Seed:* 32 rows, deliberately cross-user (seed comment,
`002_seed.sql`). Anchor: **row 13** — `alice`,
`EQ-1002`, 2026-10-06 09:00–12:00 UTC, "Senior project: DNA
sequencer calibration", `active`. `bob` cannot see it via list or
ordinary search; a crafted search filter returns it.

### fault_reports
Maintenance tickets with `severity` and `status` workflow. Not
security-relevant; present for realism. *Seed:* 17 rows.

### diagnostic_runs
Audit trail for diagnostics. `kind` (`run`/`fetch`), `target`,
capped request/response bodies, `status`, `duration_ms`. Every
diagnostics `/fetch` is recorded here; the field-service `fleet-sweep`
response includes this table across all users. Rows accumulate from
tests and PoCs.

### audit_log
Security-relevant actions with `actor_user_id` or an `actor_label`
(e.g. `field-service` for vendor fleet-sweep calls). Demonstrates who the endpoint
believes it is talking to.

## Key relationships

```
users 1─n reservations n─1 equipment n─1 locations
users 1─n fault_reports n─1 equipment
users 1─n diagnostic_runs n─1 equipment
equipment.diagnostic_target ──► lab-device (server-stored; the /fetch endpoint takes the URL from the caller instead)
```

## Counts at handoff (informational)

users 9 · locations 4 · equipment 23 · reservations 54 ·
fault_reports 17. Mutable tables grow as tests/PoCs append synthetic
rows; only the anchor facts (row 13, EQ-1001/EQ-1002) are relied
upon. `scripts/verify-lab.sh` §2 checks anchors, not exact counts
for mutable tables.

## Reset

```bash
docker compose down -v      # drops the database volume
docker compose up -d --wait # re-applies schema + seed
```

This is the only destructive operation in the lab and it touches only
this project's volume. See `spoilers/OPERATING-NOTES.md` §5.
