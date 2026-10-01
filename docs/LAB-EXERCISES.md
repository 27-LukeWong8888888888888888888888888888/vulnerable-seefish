# Lab Exercises

> **Intentional coursework vulnerabilities.** This application is a
> deliberately vulnerable security lab (see `SECURITY-LAB-NOTICE.md`).
> Do not "fix" the vulnerable paths; do not deploy. All data is
> synthetic.

Four independent exercises. Each one is solvable without any of the
others. Start the lab first:

```bash
docker compose up -d --wait
```

For every exercise: capture the **proof to capture** item in your
write-up, then answer the **remediation question** in your own words.

---

## Exercise 1 — Token recovery from the packaged client (V1)

**Objective.** Recover a privileged API credential from the shipped
Electron client package and use it — without any user account.

**Prerequisites.** Lab running (`docker compose up -d --wait`);
client packaged at least once (`cd client && npm run pack`), or run
the proof script and it will tell you to pack first.

**Starting point.** `client/app.asar` and
`scripts/poc-v1-asar.js`. Read the pack script
(`client/scripts/pack-asar.js`) to see what goes into the archive.

**Steps.**

1. Locate the packaged archive `client/app.asar`.
2. Inspect/extract it (the PoC uses `@electron/asar`;
   `npx asar list` / `npx asar extract-file` work manually).
3. Find the application config resource and recover the token.
4. Run `node scripts/poc-v1-asar.js` and watch both stages.

**Expected observation.** Stage A recovers
`FS-LAB-7f3a9c1e-4b2d-8e6f-a5c0-1d9b3e7f2a48` from
`client/resources/lab-app-config.json` inside the archive — in
plaintext, deliberately. Stage B sends **no login token at all**,
only the `X-Field-Token` header, and the API returns fleet-wide
equipment data plus every user's diagnostic run history. Without the
header (negative control) the same call returns 403, even with a
valid student session.

**Proof to capture.** The recovered token value, the archive entry it
came from, the 403 negative control, and the 200 `fleet-sweep`
response showing run history of users other than yourself.

**Remediation question.** Why does any credential shipped inside a
client package have to be considered public? What would you replace
this vendor-token endpoint with in a real product?

---

## Exercise 2 — SQL injection in reservation search (V2)

**Objective.** Use an authenticated ordinary search to read another
user's reservation — a horizontal authorization bypass.

**Prerequisites.** Lab running. Seeded student account `bob` /
`StudentPass!23` (victim data belongs to `alice`).

**Starting point.** `POST /api/reservations/search` (body field `q`,
inside the RC4 envelope — get a session key first via
`POST /api/session/key`, then login via `POST /api/auth/login`).
Helper: `scripts/lab-client.js` inside the api container; reference
PoC `scripts/poc-v2-sqli.js`.

**Steps.**

1. Login as `bob`; run a control search `q = "DNA"` — expect 0 rows.
2. Confirm row 13 (alice's reservation) is absent from
   `/api/reservations/list`.
3. Inject: `q = "x' OR 1=1 -- "`.
4. Decrypt the response envelope and inspect the rows.

**Expected observation.** The injected query returns every seeded
reservation — 32+ rows including id 13, `EQ-1002` "DNA Sequencer
4500", owner `alice`, "Senior project: DNA sequencer calibration",
`active`. The ordinary search and the list endpoint never show bob
this row.

**Proof to capture.** Side-by-side: control search result (0 rows),
and the injected result containing row 13 with `ownerUsername:
"alice"`, obtained as `bob`.

**Remediation question.** Why does a parameterized `ILIKE` bind fix
both the injection and keep the per-user scoping intact? Where does
defense in depth belong if a similar mistake is made again?

---

## Exercise 3 — Server-side request forgery (V3)

**Objective.** Turn the diagnostics endpoint into a network proxy and
reach a device that is not routable from your own machine.

**Prerequisites.** Lab running. Seeded technician account `tech1` /
`TechPass!23`. (A student account gets 403 — try it as a control.)

**Starting point.** `POST /api/diagnostics/fetch` (body fields
`equipmentId`, `target`, inside the RC4 envelope). Reference PoC
`scripts/poc-v3-ssrf.js`. First confirm from the **host** that
`curl http://lab-device:8080/api/status` fails — no route.

**Steps.**

1. As a control, run `POST /api/diagnostics/run` with
   `equipmentId: 1` — the server fetches the stored target only.
2. As a student, call `/fetch` with any target — expect 403.
3. Login as `tech1`; send
   `target = "http://lab-device:8080/api/admin"`.
4. Decrypt the response and read the body.

**Expected observation.** The API container — which sits on the
internal-only `lab-internal` Docker network — fetches the URL for
you and returns the body: `{"challenge":
"LAB{ssrf_internal_device_reached}", "access":
"internal-network-only", ...}`. Your host still has no route to the
device; only the server's network position made it possible.

**Proof to capture.** The failing host-side curl (isolation), and the
decrypted `/fetch` response containing
`LAB{ssrf_internal_device_reached}`.

**Remediation question.** List the layers you would put between a
diagnostics service and arbitrary URLs (allowlists, range blocks,
redirect policy, egress filtering). Why is "we only call it from our
own UI" not a defense?

---

## Exercise 4 — Unsafe IPC file read in the Electron client (V4)

**Objective.** Drive an unsafe IPC handler to read a file outside its
intended directory, from the renderer context.

**Prerequisites.** Lab host with the Electron client installed
(`cd client && npm install` once). Lab running for the login
round-trip check.

**Starting point.** The **File viewer — V4 demo** section of the
client UI, or the deterministic test `cd client && node --test` and
the smoke run `bash client/scripts/smoke-electron.sh`.

**Steps.**

1. Read the chain: `client/preload.js` (`readFile` →
   `ipcRenderer.invoke('lab:read-file', requested)`),
   `client/main.js` (`ipcMain.handle`), and the sink
   `client/v4-file-read.js` (`path.join(MANUALS_DIR, requested)`).
2. Control: read `equipment-manual.txt` — the intended manual.
3. Traversal: read `../proof/v4-proof.txt`.

**Expected observation.** The traversal string is accepted verbatim,
`path.join` resolves it outside `resources/manuals/`, and the proof
file content — including `LAB{unsafe_ipc_path_traversal}` — is
returned to the renderer.

**Proof to capture.** The traversal input, the returned file content
with the flag, and the code path showing where the missing validation
is.

**Scope limit (important).** The demonstration is complete the moment
the traversal escapes `resources/manuals/` and returns the proof
file. Do not read host files (`/etc/passwd`, SSH keys, browser
profiles, documents, credentials) — that is explicitly out of scope
for this lab.

**Remediation question.** Which is the load-bearing fix:
`contextIsolation`, path validation in the main process, or shrinking
the IPC surface — and why all three in practice?

---

## Wrap-up

All four proofs together demonstrate: credentials ship with clients
(V1), string-built SQL breaks authorization (V2), server-side fetch
breaks network isolation (V3), and unvalidated IPC breaks the
process/filesystem boundary (V4). Cross-reference
[`VULNERABILITIES.md`](../VULNERABILITIES.md) (repo root) and
`docs/vulnerabilities/` for the authoritative per-vulnerability details.
