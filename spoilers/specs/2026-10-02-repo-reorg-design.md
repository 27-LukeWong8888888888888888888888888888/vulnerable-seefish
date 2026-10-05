# Repo Reorganization — Design Spec (2026-10-02)

> **Status:** approved in principle on 2026-10-02 (design presented in chat, user
> replied "ok"); this written spec is the formal review artifact. Not yet implemented.
>
> **Placement note:** this file currently lives at `docs/superpowers/specs/`
> *uncommitted*. It is a spoiler document; during implementation it moves to
> `spoilers/specs/` and the (now empty) `docs/superpowers/` directory is removed.
> It is committed only inside `spoilers/`, never in the clean tree.

## 1. Context and goal

The repository is an intentionally vulnerable whitebox security lab (Electron
client + Express API + PostgreSQL + simulated lab device). Participants clone
this exact repo; they read the source to find four intentional vulnerabilities
and exploit them. The repo is not used for marking or grading.

Problem: the working tree is cluttered and loudly labels everything —
vulnerability banners in source comments, phase numbers in filenames and
comments, PoC filenames (`poc-v2-sqli.js`), DOM ids (`v4-out`), and answer-key
docs (`VULNERABILITIES.md`, `docs/vulnerabilities/`, `docs/INSTRUCTOR-NOTES.md`)
scattered across the tree participants browse.

Goal: reorganize so a participant sees a naturally-written (slightly sloppy)
application plus its normal docs; all answer-key material is consolidated in
one clearly-warned zone. Nothing functional changes. Vulnerability names,
technique names, phase language, and old flag strings must not appear anywhere
in the working tree outside the answer-key zone — including scripts the
participant reads or runs.

## 2. Approved model (recap of the approved design)

- **One repo, two zones.** No separate distribution repo, no git-history
  rewrite. Participants clone the same repo (history keeps old names — accepted;
  the answer key is left in the repo like the "tudo" lab).
- **Clean zone** (everything except `spoilers/`): source, tests, scripts, UI,
  README, `docs/`. Must not name V1–V4, phases, techniques (SQL injection,
  SSRF, traversal, unsafe IPC, hard-coded token), old flag values, PoC
  filenames, or instructor/grading framing. The generic premise ("intentionally
  vulnerable", "synthetic, do not deploy", "do not fix") survives in
  `README.md` and `SECURITY-LAB-NOTICE.md` only.
- **Answer-key zone** (`spoilers/`): registry, per-vulnerability writeups,
  exercises, operating notes, PoCs, this spec. Loud warnings; keep V1–V4
  labeling internally (it is the answer key).
- Gating is by labeling + warning, not access control.
- Nothing functional changes: only names, comments, paths, flag strings, and
  doc locations. The four vulnerabilities and the weak RC4 protocol stay
  exactly as vulnerable as they are today.

## 3. Target tree

```
README.md                     slim, spoiler-free landing page (wording updated)
SECURITY-LAB-NOTICE.md        premise + rules (enumeration removed)
compose.yaml                  db + api + lab-device (comments despoiled)
.env.example                  (comment despoiled)
.gitignore                    unchanged
client/
  main.js                     (comments despoiled)
  preload.js                  (comments despoiled)
  api-client.js               (comments despoiled)
  manual-reader.js            ← was client/v4-file-read.js (code untouched)
  package.json                unchanged
  app.asar                    repacked from repacked sources
  scripts/                    pack-asar.js (lists despoiled), smoke-electron.sh (comment)
  test/                       api-client.test.js, surface.test.js,
                              manual-reader.test.js ← was v4-ipc.test.js
  renderer/                   index.html + app.js (DOM ids/selectors renamed), styles.css, smoke.html (path/regex)
  resources/
    lab-app-config.json       token kept; note field despoiled
    manuals/                  unchanged
    internal/ops-memo.txt     ← was resources/proof/v4-proof.txt (content rewritten)
services/
  api/                        src comments despoiled; Dockerfile +COPY spoilers/poc/
  device/                     server.js comments despoiled; challenge value updated
shared/protocol/              rc4.js comment; envelope.js & protocol.test.js unchanged
scripts/                      verification + tooling ONLY:
  verify-lab.sh               labels despoiled; PoC checks now run spoilers/poc/*
  verify-device.sh            comment despoiled
  lab-client.js               unchanged
  device-probe.js             comments despoiled; challenge constant updated
docs/                         clean-tree docs only:
  README.md                   rewritten (audience/instructor framing removed)
  ARCHITECTURE.md             despoiled (comment/link sweep)
  DATA-MODEL.md               despoiled (comment sweep; seed values unchanged)
  PROTOCOL-RC4.md             light despoil (V1–V4 references removed)
spoilers/                     answer key (new):
  README.md                   NEW: stop banner + index (absorbs VULN-MAP stub)
  VULNERABILITIES.md          ← moved from repo root (links updated)
  V1-HARDCODED-TOKEN.md       ← moved from docs/vulnerabilities/ (flat)
  V2-SQL-INJECTION.md         ← moved (flat)
  V3-SSRF.md                  ← moved (flat)
  V4-UNSAFE-IPC.md            ← moved (flat)
  THREAT-MODEL.md             ← moved from docs/
  LAB-EXERCISES.md            ← moved from docs/
  OPERATING-NOTES.md          ← was docs/INSTRUCTOR-NOTES.md (reframed)
  poc/                        fleet-sweep.js, reservation-search.js,
                              device-fetch.js, package-recovery.js
  specs/                      this spec (after implementation)
```

## 4. Moves table

| From | To | Notes |
|---|---|---|
| `VULNERABILITIES.md` | `spoilers/VULNERABILITIES.md` | Link/path/flag updates only; keeps V1–V4 naming |
| `docs/VULN-MAP.md` | deleted | Content absorbed into `spoilers/README.md` |
| `docs/THREAT-MODEL.md` | `spoilers/THREAT-MODEL.md` | It maps the four vulns; spoiler doc |
| `docs/LAB-EXERCISES.md` | `spoilers/LAB-EXERCISES.md` | Names exercise targets; spoiler doc |
| `docs/INSTRUCTOR-NOTES.md` | `spoilers/OPERATING-NOTES.md` | Renamed + reframed: setup/reset/expected results/verification; no grading/instructor framing |
| `docs/vulnerabilities/V1-HARDCODED-TOKEN.md` | `spoilers/V1-HARDCODED-TOKEN.md` | Flat (no `vulnerabilities/` subdir) |
| `docs/vulnerabilities/V2-SQL-INJECTION.md` | `spoilers/V2-SQL-INJECTION.md` | Flat |
| `docs/vulnerabilities/V3-SSRF.md` | `spoilers/V3-SSRF.md` | Flat |
| `docs/vulnerabilities/V4-UNSAFE-IPC.md` | `spoilers/V4-UNSAFE-IPC.md` | Flat |
| `scripts/poc-v1-token.js` | `spoilers/poc/fleet-sweep.js` | Neutral rename (see §5) |
| `scripts/poc-v2-sqli.js` | `spoilers/poc/reservation-search.js` | Neutral rename |
| `scripts/poc-v3-ssrf.js` | `spoilers/poc/device-fetch.js` | Neutral rename |
| `scripts/poc-v1-asar.js` | `spoilers/poc/package-recovery.js` | Neutral rename |
| `client/v4-file-read.js` | `client/manual-reader.js` | Code untouched |
| `client/test/v4-ipc.test.js` | `client/test/manual-reader.test.js` | Assertions untouched |
| `client/resources/proof/v4-proof.txt` | `client/resources/internal/ops-memo.txt` | Content rewritten (see §5); `proof/` dir removed |
| `services/api/test/phase2.test.js` | `services/api/test/core.test.js` | Assertions untouched |
| `services/api/test/phase3.test.js` | `services/api/test/reservations.test.js` | Assertions untouched |
| `services/api/test/phase5.test.js` | `services/api/test/field-ops.test.js` | Assertions untouched |
| `services/api/test/bugfix.test.js` | unchanged | Name already neutral |
| `docs/superpowers/specs/2026-10-02-repo-reorg-design.md` | `spoilers/specs/2026-10-02-repo-reorg-design.md` | End of implementation; remove empty `docs/superpowers/` |

## 5. Renames and rewrites in detail

### 5.1 PoC scripts (delta vs. the chat-approved sketch — flagged for review)

The chat-approved sketch said moved names stay as-is. Grounding showed that is
not viable: **public `scripts/verify-lab.sh` references the PoC files**, so
`poc-v2-sqli` / `poc-v3-ssrf` would remain visible in the clean zone —
directly contradicting "the name of the vulnerabilities should not be in the
script". Resolution: neutral scenario names, referenced from `spoilers/poc/`.

| New name | Was | Run by verify-lab.sh as |
|---|---|---|
| `fleet-sweep.js` | poc-v1-token.js | `docker compose exec -T api node spoilers/poc/fleet-sweep.js` |
| `reservation-search.js` | poc-v2-sqli.js | `docker compose exec -T api node spoilers/poc/reservation-search.js` |
| `device-fetch.js` | poc-v3-ssrf.js | `docker compose exec -T api node spoilers/poc/device-fetch.js` |
| `package-recovery.js` | poc-v1-asar.js | `node spoilers/poc/package-recovery.js` (host) |

Required internal edits (path fixes caused by the move):

- The three api-side scripts: `require('../shared/protocol/…')` →
  `require('../../shared/protocol/…')` (they run from `/app` in the api
  container as `spoilers/poc/<name>.js`).
- `package-recovery.js`: `const REPO = path.join(__dirname, '..')` →
  `path.join(__dirname, '..', '..')` (host-side; repo root is two levels up).
- Error prefixes and usage lines updated to the new filenames
  (`[fleet-sweep]`, `[reservation-search]`, `[device-fetch]`,
  `[package-recovery]`; `node spoilers/poc/<name>.js …`).
- PoC body wording (V1/V2/V3 labels, exploit explanations) stays as-is: these
  files are answer-key material and live in `spoilers/`.

Residual accepted: `verify-lab.sh` (clean zone) maps four neutral scenario
names to four app features (`fleet sweep`, `reservation search`, `device
fetch`, `package recovery`). No technique or vulnerability naming remains;
the premise already tells participants intentional vulnerabilities exist and
where the answer key lives. The alternative (generic "scenario 1/2/3" labels)
was rejected because failure diagnosis in verify output would become
ambiguous.

### 5.2 Client file / DOM renames

- `client/v4-file-read.js` → `client/manual-reader.js`; the sink code
  (`fs.readFile(path.join(MANUALS_DIR, requested), 'utf8')`) is untouched; the
  `VULN-V4` banner is deleted in the sweep (§7).
- `client/renderer/index.html`: `id="v1"` → `id="field-service"`;
  `id="v4"` → `id="manual-reader"`; `id="v4-path"` → `id="manual-file"`;
  `id="btn-v4-read"` → `id="btn-open-manual"`; `id="v4-out"` →
  `id="manual-out"`. Visible labels/text stay as they are (already
  spoiler-free).
- `client/renderer/app.js`: comment line 7 `-> main (V4 sink)` → `-> main
  (read-file handler)`; selectors `$('btn-v4-read')`, `$('v4-path')`,
  `$('v4-out')` → new ids.
- `client/test/surface.test.js` source-file list: `'v4-file-read.js'` →
  `'manual-reader.js'`.
- `client/scripts/pack-asar.js`: `APP_FILES` entry `'v4-file-read.js'` →
  `'manual-reader.js'`; `REQUIRED` entries `'client/v4-file-read.js'` →
  `'client/manual-reader.js'` and `'client/resources/proof/v4-proof.txt'` →
  `'client/resources/internal/ops-memo.txt'`; header comments and the
  token-check messages lose "V1"/"Phase 7" wording (`synthetic V1 token not
  found` → `synthetic field-service token not found`; the success line prints
  `(synthetic field-service token: …)`).
- `client/scripts/smoke-electron.sh`: header comment loses "Phase 6/7" and
  "V4 chain" (`renderer/smoke.html executes the file-read chain + login round
  trip`). Behavior unchanged.

### 5.3 `resources/internal/ops-memo.txt` (was `v4-proof.txt`)

Neutral memo carrying the new marker; the old text explained the exploit chain
and named V4 — rewritten. Proposed content (final wording may be trimmed for
fit in implementation, but must keep the marker line verbatim):

```
Internal operations memo — instrument maintenance
=================================================

This memo is kept with the desktop client's resources for the lab
operations team. It is stored outside the equipment-manual set on
purpose so the manual viewer does not list it.

Marker: LAB{internal_notes_recovered}

Nothing in this memo is credential material: it contains no passwords,
tokens, or personal data. The calibration rig in Bldg C — 214 is serviced
twice per year; the next service window is booked through the standard
reservation queue.
```

### 5.4 `smoke.html`

- Line 19 path: `'../proof/v4-proof.txt'` → `'../internal/ops-memo.txt'`.
- Line 20 regex: `/LAB\{unsafe_ipc_path_traversal\}/` →
  `/LAB\{internal_notes_recovered\}/`.
- Line 21 text: `traversal read ok` → `file read ok`.
- Line 22 error: `proof flag missing` → `expected marker missing`.

### 5.5 API test file renames

`phase2.test.js` → `core.test.js`, `phase3.test.js` →
`reservations.test.js`, `phase5.test.js` → `field-ops.test.js`. Every
assertion, payload, and behavioral check stays; only titles/comments lose
`V1–V4`, `phase N`, and technique words where those appear (e.g.
`3. V3 SSRF: technician fetches the internal device admin challenge` →
`3. technician fetches the internal device admin payload`; the `CHALLENGE`
constant in field-ops.test.js updates to the new flag value).

`bugfix.test.js` keeps every assertion; its header comment is updated
(verified present 2026-10-02): the run snippet's filenames become
`core.test.js / reservations.test.js / field-ops.test.js`; `phase suites` →
`the other suites`; `phase3 janitor` → `reservations-suite janitor`; the
internal process reference `bug-hunt 2026-10-02, findings B3–B7` is reworded
neutrally (e.g. `pre-release bug sweep`) while the B3–B7 behavior list stays.
`client/test/api-client.test.js` is already clean (verified: no spoiler
matches) and is untouched.

## 6. Flag revaluation and propagation

| Old value | New value | Rationale |
|---|---|---|
| `LAB{ssrf_internal_device_reached}` | `LAB{device_admin_console_reached}` | removes `ssrf` from the clean tree |
| `LAB{unsafe_ipc_path_traversal}` | `LAB{internal_notes_recovered}` | removes `unsafe`/`traversal` |
| `FS-LAB-7f3a9c1e-…` field-service token | unchanged | it is the artifact to recover, not a label |

V2 has no flag. Propagation (every literal site):

- `LAB{device_admin_console_reached}`: `services/device/server.js` (challenge
  + notice text), `scripts/device-probe.js` (constant + printed line),
  `spoilers/poc/device-fetch.js`, `spoilers/V3-SSRF.md`,
  `spoilers/VULNERABILITIES.md`, `spoilers/THREAT-MODEL.md`,
  `spoilers/LAB-EXERCISES.md`, `spoilers/OPERATING-NOTES.md`,
  `services/api/test/field-ops.test.js`.
- `LAB{internal_notes_recovered}`: `client/resources/internal/ops-memo.txt`,
  `client/renderer/smoke.html`, `client/test/manual-reader.test.js`,
  `spoilers/V4-UNSAFE-IPC.md`, `spoilers/VULNERABILITIES.md`,
  `spoilers/THREAT-MODEL.md`, `spoilers/LAB-EXERCISES.md`,
  `spoilers/OPERATING-NOTES.md`.
- After the sweep, the spoil-scan (§13) must find **zero** occurrences of the
  old strings anywhere in the working tree (including spoilers — the answer
  key must be accurate).

## 7. Comment / banner / phase sweep (clean zone)

Policy: banners that identify a vulnerability, name a technique, cite a phase,
or link to spoiler docs are deleted or replaced with neutral, naturally
sounding comments. The **code itself is never touched**. Keep safety
constraints that are premise-level ("synthetic — not a real credential", "do
not replace with a real credential").

Grounding inventory (2026-10-02 scans, whole tree before reorg):

| Scan pattern | Hits | Files |
|---|---|---|
| `VULN\|LAB{\|poc-\|unsafe\|sqli\|ssrf\|traversal\|instructor\|graded\|spoiler` | 147 | 35 |
| `[Pp]hase [0-9]` | 56 | 30 |
| `\bV[1-4]\b` | 191 | 35 |
| `\bv[1-4]\b` | 93 | 26 |

Clean-zone files to sweep (each keeps its behavior; representative edits):

- `client/main.js`: drop `(Phase 6)`; replace the `Intentionally insecure lab
  build (V4)` header and the `VULN-V4 sink` comment with neutral wording
  (contextIsolation/sandbox stay `false`; keep the "do not harden" intent as
  a matter-of-fact lab note without V-numbering); drop the
  `docs/vulnerabilities/…` link; V1 comment block → neutral app-config
  comment; `require('./v4-file-read.js')` → `'./manual-reader.js'`.
- `client/preload.js`: `V4: … no path validation` comment → neutral
  forwarding note referencing `manual-reader.js`.
- `client/api-client.js`: `(V1)` token comment → neutral.
- `client/renderer/app.js` / `index.html`: per §5.2.
- `client/resources/lab-app-config.json`: `note` field → neutral synthetic
  placeholder wording (token value stays).
- `client/scripts/pack-asar.js`, `client/scripts/smoke-electron.sh`: per §5.2.
- `services/api/Dockerfile`: drop `(Phase 2)`; add `COPY spoilers/poc/
  spoilers/poc/` (§10).
- `services/api/package.json`: description loses phase reference.
- `services/api/src/app.js` `(V1)`; `src/fieldServiceToken.js` VULN-V1 banner
  → neutral static-config comment (token constant untouched);
  `src/routes/reservations.js` `INTENTIONALLY VULNERABLE` blocks + docs/PoC
  refs → neutral or deleted (query construction code untouched);
  `src/routes/diagnostics.js` VULN-V3 banners + docs refs → neutral (fetch
  code untouched); `src/routes/fieldService.js`, `equipment.js`, `faults.js`
  → phase refs dropped.
- `services/api/sql/001_schema.sql`, `002_seed.sql`: comments despoiled
  (`V2 victim row` → neutral; phase refs dropped). **No DDL/DML value
  changes** — row 13 (alice / EQ-1002 / 'Senior project: DNA sequencer
  calibration' / active) and all counts stay exactly as seeded.
- `services/device/server.js`: `(Phase 4)`; "future SSRF target (Phase 5)" →
  "reachable only from the api container over lab-internal"; admin notice
  text → neutral; challenge → new flag (§6).
- `shared/protocol/rc4.js`: `(Phase 8)` doc reference dropped.
- `scripts/device-probe.js`: `(Phase 4)`; "(which is Phase 5)" aside dropped;
  challenge constant → new flag.
- `scripts/verify-device.sh`: `(Phase 4)` dropped from the header comment.
- `scripts/verify-lab.sh`: per §10.
- `compose.yaml`: `(Phase 2)/(Phase 4)` in the header comment dropped;
  `(the api, in Phase 5 via SSRF)` → `(the api)`. No service/config changes.
- `.env.example`: `added in Phase 2` comment → neutral.
- `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`, `docs/PROTOCOL-RC4.md`:
  V-label/technique references and links to moved spoiler docs removed;
  remaining content unchanged; cross-links audited so no clean-zone doc
  links to a specific per-vulnerability writeup by name.

## 8. Zone rules (what may appear where)

- Clean zone may say: "intentionally vulnerable" (premise), "synthetic / do
  not deploy / do not fix", app feature names, protocol weakness discussion,
  test payloads (guardrail tests inherently exercise the vulns).
- Clean zone must not say: V1–V4 (any case, as labels), `vuln`, phase
  language, `sqli`/`SQL injection`, `ssrf`, `traversal`, `unsafe`, old flag
  values, old paths (`proof/`, `v4-`, `scripts/poc*`), `instructor`,
  `grader`/`grading`, or per-vuln doc titles.
- `spoilers/` may say anything; it must carry a loud warning and stay
  factually accurate (new names/paths/flags).

## 9. Documentation rewrites

- **`README.md`** (clean): replace the current lines 15–20
  (which point at `VULNERABILITIES.md` / `docs/vulnerabilities/` /
  `INSTRUCTOR-NOTES.md`) with a spoiler-free block: vulnerabilities not
  listed on purpose; full answer key kept in `spoilers/` — do not open before
  attempting. Update the Verify pointer (drop `LAB-EXERCISES.md` /
  `INSTRUCTOR-NOTES.md`); Documentation table keeps ARCHITECTURE / DATA-MODEL
  / PROTOCOL-RC4 plus one `spoilers/` row marked **spoilers**; Layout block:
  `scripts/` = verification + tooling (no "PoCs"), add `spoilers/` line;
  Status: drop "seven development phases", keep "complete and stable;
  verify-lab.sh is the single re-verification entry point". AI-use
  disclosure untouched.
- **`SECURITY-LAB-NOTICE.md`** (clean): remove the four-category enumeration
  `(hard-coded token, SQL injection, SSRF, unsafe Electron IPC)` and "later
  phases"; rule 3 points at the `spoilers/` answer key generically. Premise,
  synthetic-data rule, never-deploy rule unchanged.
- **`docs/README.md`**: rewritten — no audiences, no instructor/grader rows,
  no VULN-MAP row; lists ARCHITECTURE / DATA-MODEL / PROTOCOL-RC4; one
  spoilers pointer with a do-not-open warning; inherits SECURITY-LAB-NOTICE.
- **`spoilers/README.md`** (new): stop banner ("answer key — spoilers; do not
  read before attempting"), what's inside (index table incl. V1–V4 writeups,
  exercises, operating notes, PoCs), how to run each PoC and what each
  proves, note that the registry is `VULNERABILITIES.md`, and the
  do-not-fix rule pointer.
- **`spoilers/OPERATING-NOTES.md`** (was INSTRUCTOR-NOTES.md): reframed as
  setup / reset / expected verification results / maintenance; no grading,
  marking, or instructor language. Content otherwise preserved and updated
  to new names/flags.
- **Moved spoiler docs** (V1–V4 writeups, VULNERABILITIES.md, THREAT-MODEL,
  LAB-EXERCISES): internal cross-references updated — new PoC paths/names,
  new flag values, `manual-reader.js`, `internal/ops-memo.txt`,
  `OPERATING-NOTES.md`, writeups now same-directory (no `docs/vulnerabilities/`
  prefix). V1–V4 labeling inside these files stays.

## 10. Wiring changes

- **`services/api/Dockerfile`**: add `COPY spoilers/poc/ spoilers/poc/` after
  the existing `COPY scripts/ scripts/`. Compose build context (repo root) is
  unchanged. The api image then contains the api-side PoCs at
  `spoilers/poc/*.js`; their `../../shared` requires resolve because the repo
  layout is mirrored under `/app`.
- **`scripts/verify-lab.sh`** (labels only; structure, helpers, ordering, and
  the 28-check count unchanged — 3+6+6+3+3+2+3+2):
  - header comment: drop `(Phase 7)`.
  - non-destructive note: "test/PoC runs" → "test/scenario runs".
  - line 120 label: `seed: V2 victim row 13 exists (alice, active)` →
    `seed: reservation row 13 exists (alice, active)` (grep/command
    unchanged).
  - line 148: label → `API test suites core+reservations+field-ops+regression
    (34/34)`; command → `docker compose exec -T api node --test
    services/api/test/core.test.js services/api/test/reservations.test.js
    services/api/test/field-ops.test.js services/api/test/bugfix.test.js`.
  - section 5 heading → `5. Electron client`; smoke label → `Electron smoke
    run (real browser: file-read chain + login)`.
  - section 6 heading → `6. Scenario checks (api-side)`; labels/commands:
    `scenario: fleet sweep (api-side)` / `… node spoilers/poc/fleet-sweep.js`;
    `scenario: reservation search (api-side)` / `… reservation-search.js`;
    `scenario: device fetch (api-side)` / `… device-fetch.js`.
  - section 7 heading → `7. ASAR packaging and package recovery`; label →
    `package-recovery check (config token from package -> local API)`;
    command → `node spoilers/poc/package-recovery.js`; the Node-missing
    `bad` line → `package-recovery check — host Node.js 22 not found`.
  - Note: `run()` captures stdout and shows only a 12-line tail on FAILURE;
    on a passing run the PoCs' exploit stdout never prints, so neutral
    labels are the only thing a participant sees.
- **`scripts/verify-device.sh`**: header comment despoiled; the 9 checks, the
  device-probe invocation, and the printed probe output block are otherwise
  unchanged (probe output now shows the new neutral challenge value).
- **`client/scripts/pack-asar.js`**: list/comment updates per §5.2. Repack
  `client/app.asar` after all client changes; the repacked ASAR is part of
  the commit so `npm run start:packaged` and the smoke run use the new
  renderer.
- **`client/renderer/smoke.html`**, **`client/test/manual-reader.test.js`**:
  per §5.4/§5.5.

## 11. Behavior guarantees (must hold after the reorg)

- V1–V4 remain present and exploitable exactly as today; RC4 stays weak; V4
  remains confined to the application's own resource tree (the ops memo is
  the designated artifact; arbitrary host-file reads stay out of scope).
- Endpoints, ports, networks, auth flow, seed data (users, rows, row 13),
  and DB volume handling unchanged; no destructive operations.
- Check counts unchanged: verify-lab.sh 28; API suites 34/34 (core 14,
  reservations 9, field-ops 5, bugfix 6); client suites 11/11; protocol 7/7;
  device 9/9.
- `verify-lab.sh` remains the single re-verification entry point and stays
  non-destructive (starts/resets/deletes nothing).

## 12. Residual exposure (accepted, by design)

- Guardrail tests and `smoke.html` still exercise the vulnerable behavior
  and show payload literals (e.g. injection string, `../internal/…` path) —
  unavoidable if tests must assert the vulns still exist.
- `verify-lab.sh` on FAILURE prints a tail of PoC output (answer-key
  wording); on success it does not.
- `device-probe.js` output and `smoke.html` contain the new marker values —
  equivalents of today's behavior; values are neutral.
- `verify-lab.sh` maps four neutral scenario names to features (§5.1).
- Git history retains pre-reorg names (no rewrite, by decision).

## 13. Verification plan (after implementation; before commit)

1. **Baseline**: run the full battery before touching anything; record exact
   counts (28 checks; 34/34; 11/11; 7/7; 9/9).
2. **Rebuild**: `docker compose up -d --build --wait` (api image needs the
   new `COPY spoilers/poc/`; device image needs the new challenge); repack
   ASAR (`cd client && npm run pack`).
3. **Battery ×2, independently**: full `scripts/verify-lab.sh` twice in
   separate runs; confirm identical counts. Plus the direct suite counts.
4. **CDP smoke + screenshots**: launch the packaged `app.asar`
   (`--no-sandbox --remote-debugging-port=9222`); login, open the manual
   reader with `equipment-manual.txt` and with `../internal/ops-memo.txt`
   (marker present), screenshot the panel both ways (rendering must be
   unchanged by the id renames); confirm `strings client/app.asar` shows no
   old names (`v4`, `proof/`, `unsafe_ipc`, `ssrf`).
5. **PoCs**: all four spoilers/poc scripts green (covered by battery, plus
   direct runs).
6. **Spoil-scan**: clean tree (all tracked files excluding `spoilers/`)
   returns **0 hits** for the pattern set — V1–V4 labels, `vuln`, phase
   language, `sqli`/`SQL injection`/`ssrf`/`traversal`/`unsafe`, old flag
   strings, `poc-`, `scripts/poc`, `proof/`, `v4-`, `instructor`/`grader`/
   `graded` — with the documented allowlist (generic premise wording in
   README/SECURITY-LAB-NOTICE; test payload literals which are not in the
   pattern set). Cross-link audit: no clean-zone reference to any moved
   file/path remains (grep for old filenames/links).
7. **Diff audit**: review the full `git diff --stat` and diff to confirm
   changes are only names/comments/paths/flag strings/doc moves (plus the
   `app.asar` binary bump and the spec relocation). Nothing in
   services/api/src, services/device, client main/preload/renderer, or
   sql/* may show code-logic changes.
8. **Report** exact counts and evidence to the user; commit only on explicit
   go-ahead (one-shot `git -c user.name='Lab Developer' -c user.email=
   'lab@localhost'`), single commit including the spec at
   `spoilers/specs/`. User pushes.

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Missed spoiler reference breaks the clean-zone rule | Spoil-scan step with defined pattern set + allowlist; diff audit |
| Broken relative paths after moves (docs links, PoC requires, pack-asar lists) | Cross-link grep + full battery + repack + smoke run |
| Stale ASAR or stale Docker images mask regressions | Explicit `--build` rebuild + forced repack before verification |
| Test count drift | Counts recorded at baseline and compared; verify-lab.sh structure untouched |
| Accidentally altering behavior while despoiling comments | Diff audit step; batteries green ×2; assertions untouched policy |
| Old flag strings left somewhere | §6 propagation list + spoil-scan includes old flag values |

## 15. Out of scope

- No git-history rewrite; no separate distribution repo.
- No functional/behavioral changes to the application, tests (beyond
  titles/comments), protocol, seed data, or Docker topology.
- No remediation of V1–V4; no "hardening".
- No instructor/grading material (none is being created or kept in
  instructor framing; existing notes are reframed as operating notes).
- No changes to the V1 token value or format.

## 16. Sequencing

1. Baseline battery (green, counts recorded).
2. Create `spoilers/` + perform all moves (`git mv`-style; content unchanged
   at this point where possible).
3. Comment/banner/phase sweep in the clean zone (§7).
4. Flag revaluation + propagation (§6).
5. Client renames: `manual-reader.js`, ops-memo, DOM ids/selectors,
   pack-asar lists, smoke.html, smoke-electron.sh.
6. Test renames + title sweep (api + client).
7. Wiring: Dockerfile COPY, verify-lab.sh labels/commands, verify-device.sh,
   PoC path fixes.
8. Doc rewrites: README, SECURITY-LAB-NOTICE, docs/README, spoilers/README,
   OPERATING-NOTES reframe, moved-doc link fixes.
9. Rebuild images + repack ASAR.
10. Verification plan (§13) → report → commit on go-ahead.

## 17. Commit proposal

Single commit on `main` (user pushes), message along the lines of:

```
Reorganize repo: clean working tree + spoilers/ answer key

Move all answer-key material (registry, writeups, PoCs, exercises,
operating notes) under spoilers/; despoil the clean tree of vulnerability
and phase naming; rename client modules, DOM ids, tests, and PoCs to
neutral names; revalue challenge markers. No functional changes.
```

Includes: all renames/moves/edits, repacked `client/app.asar`, and the spec
at `spoilers/specs/2026-10-02-repo-reorg-design.md`. No history rewrite.

## 18. Review notes for the user (deltas from the chat-approved sketch)

1. **PoC files get neutral names** (`fleet-sweep.js`, `reservation-search.js`,
   `device-fetch.js`, `package-recovery.js`) — because public
   `verify-lab.sh` must reference them without naming techniques (§5.1).
2. **Writeups land flat** in `spoilers/` (no `spoilers/vulnerabilities/`
   subdir) for a compact answer key.
3. **`LAB-EXERCISES.md` and `THREAT-MODEL.md` move to `spoilers/`** — both
   name the four targets (12 and 17 V-label hits respectively), so they are
   answer-key documents.
4. The spec sits uncommitted at `docs/superpowers/specs/` until
   implementation moves it to `spoilers/specs/`; only then is it committed.
