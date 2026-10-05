# STOP — SPOILERS

```
 ███████╗██████╗  ██████╗ ██╗██╗      ███████╗██████╗ ███████╗
 ██╔════╝██╔══██╗██╔═══██╗██║██║      ██╔════╝██╔══██╗██╔════╝
 ███████╗██████╔╝██║   ██║██║██║      █████╗  ██████╔╝█████╗
 ╚════██║██╔═══╝ ██║   ██║██║██║      ██╔══╝  ██╔══██╗██╔══╝
 ███████║██║     ╚██████╔╝██║███████╗███████╗██║  ██║█████████╗
 ╚══════╝╚═╝      ╚═════╝ ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚═══════╝
        ANSWER KEY — SPOILERS — DO NOT READ BEFORE ATTEMPTING
```

**This directory is the answer key.** It holds the vulnerability
registry, the full per-vulnerability writeups, the lab exercises with
their solutions, the operating notes for running the lab, and working
proof-of-concept scripts. Everything here exists so the intentional
weaknesses can be verified, demonstrated, and reproduced.

**The clean tree is the challenge.** Everything outside `spoilers/` —
the application source, tests, scripts, and docs — is the lab exactly
as a participant should meet it. If you have not yet found the
weaknesses and worked the exercises on your own, close this directory
now and go do that first.

Exactly four vulnerabilities exist. Nothing else in the codebase is
intentionally vulnerable — accidental bugs are treated as defects, not
features.

**Do not "fix" the vulnerabilities.** Every weakness registered here is
required by the coursework assignment and is protected by presence
tests; see `../SECURITY-LAB-NOTICE.md` for the lab rules.

**Never deploy this application.** Run it only on localhost; all data
and credentials are synthetic, but the lab is intentionally
exploitable and must never be reachable from a network you do not
control.

## Index

| File | What it is |
|---|---|
| [`VULNERABILITIES.md`](VULNERABILITIES.md) | The authoritative registry of the four intentional vulnerabilities — affected feature, required role, prerequisites, reproduction, expected proof, reset procedure |
| [`V1-HARDCODED-TOKEN.md`](V1-HARDCODED-TOKEN.md) | Writeup — hard-coded synthetic field-service token (CWE-798) |
| [`V2-SQL-INJECTION.md`](V2-SQL-INJECTION.md) | Writeup — SQL injection in reservation search (CWE-89) |
| [`V3-SSRF.md`](V3-SSRF.md) | Writeup — server-side request forgery in diagnostics fetch (CWE-918) |
| [`V4-UNSAFE-IPC.md`](V4-UNSAFE-IPC.md) | Writeup — unsafe IPC file read in the Electron client (CWE-22) |
| [`THREAT-MODEL.md`](THREAT-MODEL.md) | Actors, assets, trust boundaries, and the safety boundaries that must never regress |
| [`LAB-EXERCISES.md`](LAB-EXERCISES.md) | The four exercises as given to participants, with expected observations and remediation questions |
| [`OPERATING-NOTES.md`](OPERATING-NOTES.md) | How to run, reset, and re-verify the lab; expected results for every proof |
| [`poc/`](poc/) | Working proof-of-concept scripts (see the run table below) |

## Running the proofs

Prerequisites: the stack is up (`docker compose up -d --wait`), and for
the package-recovery proof the client has been packaged at least once
(`cd client && npm run pack`). Run all commands from the repository
root.

| PoC | Command | What it proves |
|---|---|---|
| `poc/fleet-sweep.js` | `docker compose exec -T api node spoilers/poc/fleet-sweep.js` | The hard-coded field-service token alone authorizes `POST /api/field-service/fleet-sweep` — fleet-wide data and every user's run history, no account needed (V1) |
| `poc/reservation-search.js` | `docker compose exec -T api node spoilers/poc/reservation-search.js` | The injected search `q = "x' OR 1=1 -- "` returns every reservation, including victim row 13 owned by another user (V2) |
| `poc/device-fetch.js` | `docker compose exec -T api node spoilers/poc/device-fetch.js` | A caller-controlled `target` makes the API fetch the internal-only device admin console and return its challenge `LAB{device_admin_console_reached}` (V3) |
| `poc/package-recovery.js` | `node spoilers/poc/package-recovery.js` | The synthetic token ships inside the packaged client: stage A extracts it from `client/app.asar`, stage B uses it against the local API (V1, package angle) |

Each PoC prints a PASS/FAIL proof table and exits 0 on success. Exit
code 0 = the vulnerability is present and working as designed; a
failure means the lab (or the PoC) regressed, not that anything got
safer.

Note: the PoC scripts are the original coursework artifacts. Their
bodies — banner comments, section titles, output labels — keep the
original V1–V4 labels and stage names on purpose; only their file names
and locations were neutralized in the repo reorganization. Read the
labels as historical names for the four registered weaknesses.

The full re-verification entry point is `bash scripts/verify-lab.sh`
in the clean tree (28 checks: unit suites, scenario runs, packaging,
protocol, and device checks). It runs every proof above with neutral
labels so a passing run never prints exploit output.
