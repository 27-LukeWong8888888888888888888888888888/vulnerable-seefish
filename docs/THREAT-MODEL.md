# Threat Model

> This lab is **intentionally vulnerable** coursework
> (`SECURITY-LAB-NOTICE.md`). The model below describes who can do
> what inside the lab, and which safety boundaries must never
> regress. All data and credentials are synthetic. Do not deploy.

## Assets (synthetic, but treated as if they mattered)

1. **Reservation data** — who booked what equipment, when, and why
   (horizontal privacy between users; row 13 is the seeded victim).
2. **Diagnostic run history** — per-user, per-equipment runs; the
   fleet-wide view is more privileged than any single role.
3. **Internal network reachability** — the lab device exists only on
   `lab-internal`; reaching it from outside is the V3 impact.
4. **Host filesystem confidentiality** — bounded by design to the
   client's own resource tree (see Safety boundaries).
5. **The client package as a secret store** — the V1 lesson: nothing
   shipped to a client stays secret.

## Actors

| Actor | Capabilities in the lab | Models |
|---|---|---|
| Unauthenticated network caller | can open RC4 sessions, call `/health` and `/api/session/key`; nothing else | internet attacker against a deployed API |
| Student (`bob` / `StudentPass!23`) | authenticated, own reservations only via legitimate endpoints | ordinary low-privilege user |
| Technician (`tech1` / `TechPass!23`) | student + run diagnostics | higher-privilege operator misusing a feature (V3) |
| Admin (`admin` / `AdminPass!23`) | everything legitimate | reference for "full" access |
| Renderer-JS attacker (V4) | any JavaScript executing in the Electron renderer — no native primitive needed because `contextIsolation: false` makes `window.lab` a plain global | compromised dependency, stored XSS, or anyone driving the UI |
| Package holder (V1) | anyone with a copy of `client/app.asar` and an archive tool | the user of the desktop client |

## Trust boundaries

1. **renderer → preload/IPC → main process.** The preload bridge
   (`window.lab`) crosses into the main process, which holds network
   and (via V4) filesystem capability. Boundary is only as strong as
   argument validation — V4 shows it with none.
2. **API → lab-internal → lab-device.** The API is the only bridge
   onto the internal Docker network. The host has no route to the
   device (no published port; `lab-internal` is `internal: true`).
   V3 shows a caller-controlled fetch turning the API into a proxy.
3. **client package → holder.** The ASAR archive ships the V1 token
   in plaintext config. Treat anything in a shipped package as public.
4. **API → SQL engine.** Application-layer scoping (`user_id = $1`)
   is undone by one concatenated predicate (V2).

## In-scope attacks (the four coursework vulnerabilities)

| ID | Attacker | Path | Impact |
|---|---|---|---|
| V1 | package holder | extract ASAR → config token → `X-Field-Token` → `POST /api/field-service/fleet-sweep` | fleet data + every user's run history, no account needed |
| V2 | any authenticated user | `q = "x' OR 1=1 -- "` into `/api/reservations/search` | all users' reservations (horizontal bypass) |
| V3 | technician | `target = http://lab-device:8080/api/admin` into `/api/diagnostics/fetch` | internal-only device data via the API's network position |
| V4 | renderer-JS | `window.lab.readFile('../proof/v4-proof.txt')` | file read outside `resources/manuals/`, confined to the app's resource tree |

Independence: each is exploitable alone (V1 with no login, V2 as any
user, V3 as a technician, V4 with only renderer JS).

## Safety boundaries (must never regress)

1. **No host-port exposure beyond the API loopback.** db and
   lab-device publish no host port; `lab-internal` is internal;
   API is `127.0.0.1:3000` only. Asserted by
   `scripts/verify-device.sh` and `scripts/verify-lab.sh` §3.
2. **V4 stays inside the app's resource tree.** The proof is
   complete when the traversal returns `LAB{unsafe_ipc_path_traversal}`
   from `client/resources/proof/`. Host files (`/etc/passwd`, SSH
   keys, profiles, documents, credentials) are never targets in
   code, tests, PoCs, or docs.
3. **Renderer cannot execute commands.** No `child_process`/shell in
   the client; preload's only `require()` is `'electron'`;
   `nodeIntegration: false` for the page. Asserted by
   `client/test/surface.test.js`.
4. **Only `/health` and `/api/session/key` are plaintext**; every
   other `/api` route requires the RC4 envelope.
5. **Exactly four vulnerabilities.** Accidental weaknesses found in
   review are fixed; the four documented ones are never "remediated".
6. **All credentials synthetic and lab-only** (`FS-LAB-…`,
   `labtok-…`, `*Pass!23`); no external targets anywhere in the
   codebase — the only network the lab contacts is its own.

## Out of scope by design

* TLS or any transport strengthening (the RC4 weakness is intended —
  `PROTOCOL-RC4.md`).
* Realistic password policy, rate limiting, lockout — the seed
  passwords are documented so students can log in.
* Multi-user host threat model — the lab host itself is trusted; the
  exercises run on it.
