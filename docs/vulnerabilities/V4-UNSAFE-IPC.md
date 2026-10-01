# V4 — Unsafe IPC File Read (Electron)

> **Intentional coursework vulnerability.** This application is a deliberately
> vulnerable security lab (see `SECURITY-LAB-NOTICE.md`). Do not "fix" the
> file-read handler or harden the Electron settings. Do not deploy. All data
> is synthetic.

## Summary

| Item | Value |
|---|---|
| Vulnerability | Unsafe IPC file read — renderer-controlled path traversal out of the intended `resources/manuals/` directory |
| Surface | `window.lab.readFile(path)` in the renderer |
| IPC chain | renderer → `ipcRenderer.invoke('lab:read-file', path)` (preload) → `ipcMain.handle('lab:read-file')` (main) → `readManual(path)` |
| Attacker model | any JavaScript executing in the renderer context (e.g. a stored-XSS payload, a compromised dependency, or anyone driving the UI). With `contextIsolation: false`, the bridge is a plain `window` global — no exploit primitive needed beyond running JS in the page |
| Impact | the main process reads any file the desktop user can read and returns its content to the renderer. This coursework demonstration is confined to the designated proof file (see "Scope limitation") |
| Exact location | `client/v4-file-read.js` — `readManual()`, comment `// VULN-V4: INTENTIONAL UNSAFE IPC FILE READ`; wired in `client/main.js` (`ipcMain.handle('lab:read-file', …)`), exposed in `client/preload.js` (`readFile`) |
| Expected proof | `LAB{unsafe_ipc_path_traversal}` (contents of `client/resources/proof/v4-proof.txt`) |

## Intentionally insecure Electron settings

`client/main.js` creates the `BrowserWindow` with:

```js
webPreferences: {
  // INTENTIONALLY INSECURE (coursework lab — V4):
  contextIsolation: false,  // preload shares the renderer context; window.lab is a plain global
  sandbox: false,           // preload runs unsandboxed (Node available to the preload only)
  nodeIntegration: false,   // the PAGE still gets no require() / Node APIs — do NOT enable
  preload: path.join(__dirname, 'preload.js')
}
```

* `contextIsolation: false` — the whole point of the lab build: the exposed
  bridge and the page share one context, so anything that runs in the page
  can call `window.lab.readFile(...)` directly.
* `sandbox: false` — required by the lab spec so the preload has full Node
  capability (of which it deliberately exposes only a narrow bridge).
* `nodeIntegration: false` — the renderer **page** has no Node integration.
  These settings are intentionally insecure **for the preload context**; they
  do not hand `require()` to the page, and no unrestricted Node API (no
  `child_process`, no native modules, no shell) is exposed through the
  bridge.

Do not "harden" these settings; do not enable `nodeIntegration`.

## Why the flow is vulnerable

The preload forwards the renderer's string **verbatim** (`client/preload.js`):

```js
const lab = {
  // ...
  readFile: (requested) => ipcRenderer.invoke('lab:read-file', requested),
  // ...
};
window.lab = lab; // contextIsolation:false — same context as the page
```

The main process registers the sink (`client/main.js`):

```js
// VULN-V4 sink — renderer-controlled filename, no path validation.
ipcMain.handle('lab:read-file', (event, requested) => readManual(requested));
```

And the sink joins the renderer-controlled string onto the manuals
directory **with no validation** (`client/v4-file-read.js`):

```js
// VULN-V4: INTENTIONAL UNSAFE IPC FILE READ — `requested` is
// renderer-controlled and is joined onto the manuals directory with NO path
// validation: no basename() restriction, no resolve-and-prefix check. A
// traversal such as '../proof/v4-proof.txt' therefore escapes the intended
// manuals area…
async function readManual(requested) {
  if (typeof requested !== 'string' || requested.length === 0) {
    throw new Error('filename required');
  }
  return fs.readFile(path.join(MANUALS_DIR, requested), 'utf8');
}
```

`path.join('/…/resources/manuals', '../proof/v4-proof.txt')` resolves to
`/…/resources/proof/v4-proof.txt` — outside the intended directory. A real
application would `path.resolve()` and require the result to stay inside
`MANUALS_DIR` (and would run with `contextIsolation: true` so the bridge is
not a plain global).

## Proof file and resource tree

The readable tree is deliberately confined to the application's own
resources:

```
client/resources/
├── lab-app-config.json        V1 synthetic FS token (see V1-HARDCODED-TOKEN.md)
├── manuals/
│   └── equipment-manual.txt   normal file the viewer is supposed to serve
└── proof/
    └── v4-proof.txt           designated V4 proof artifact
```

## Reproduction

### 1. Automated, deterministic (preferred — no display needed)

```bash
cd client
node --test          # v4-ipc.test.js: checks 1–5
```

Asserts: a normal manuals read succeeds; the traversal string is accepted
verbatim and resolves **outside** `resources/manuals/`; the proof file
content, including `LAB{unsafe_ipc_path_traversal}`, is returned.

### 2. Full Electron smoke run (real browser process)

```bash
bash client/scripts/smoke-electron.sh
```

Boots the real app with a hidden window and a smoke page that performs the
whole chain in an actual renderer: `window.lab.readFile('equipment-manual.txt')`
(normal read) and `window.lab.readFile('../proof/v4-proof.txt')` (traversal,
flag asserted), plus a login round-trip through the main-process RC4 client.
Prints `SMOKE OK — all checks passed` and exits 0.

### 3. Manual, with the UI

```bash
cd client && npm start        # Linux lab host: ./node_modules/.bin/electron --no-sandbox .
```

1. Scroll to **File viewer — V4 demo**.
2. Leave the prefilled `../proof/v4-proof.txt` and click **Read via IPC** —
   the proof file content appears, including `LAB{unsafe_ipc_path_traversal}`.
3. For the control, enter `equipment-manual.txt` and read again — the manual
   appears (normal, intended behaviour).

## Exact proof

1. **Normal read (control):** `readFile('equipment-manual.txt')` returns the
   manual — the viewer works as designed for files inside `resources/manuals/`.
2. **Renderer-controlled passthrough:** the string `'../proof/v4-proof.txt'`
   is forwarded by the preload unchanged and accepted by the sink — asserted
   by `client/test/v4-ipc.test.js` test 2 (the resolved path is provably
   outside `MANUALS_DIR`) and by the Electron smoke run.
3. **Traversal + flag:** `readFile('../proof/v4-proof.txt')` returns the file
   content with `LAB{unsafe_ipc_path_traversal}` — asserted by
   `client/test/v4-ipc.test.js` tests 2–3 and the smoke run.
4. **No command execution:** `client/test/surface.test.js` asserts none of
   `main.js` / `preload.js` / `v4-file-read.js` / `api-client.js` uses
   `child_process`, `exec*`, `spawn`, or `fork`, and that the preload's only
   `require()` is `'electron'`.

## Negative controls

| # | Check | Where |
|---|---|---|
| 1 | Normal manuals read succeeds | v4-ipc test 1, smoke `[2]` |
| 2 | Traversal string passes through unvalidated and resolves outside manuals | v4-ipc test 2, smoke `[3]` |
| 3 | Proof file returned, flag present | v4-ipc test 3, smoke `[3]` |
| 4 | No shell/command execution (`child_process`, `exec*`, `spawn`, `fork` absent) | surface test 6 |
| 5 | Preload requires only `'electron'`; fixed narrow surface | surface test 7 |
| 6 | `nodeIntegration: false` — page has no `require()` (page boot + bridge-only access verified in the smoke run) | smoke `[1]`, main.js settings |
| 7 | V1/V2/V3 endpoints and PoCs unchanged and still passing | phase5 suite + `poc-v1-token.js` / `poc-v2-sqli.js` / `poc-v3-ssrf.js` |

## Scope limitation (important)

The intended demonstration **does not require arbitrary host-filesystem
access**, and this lab must not be turned into an unrestricted host-file
reader:

* the demonstration uses only the designated files inside
  `client/resources/` (one manual + the proof file);
* `/etc/passwd`, SSH keys, browser profiles, user documents, credentials,
  and any other real host files are **explicitly out of scope** and must not
  be used in the demonstration or the tests;
* the handler is unvalidated *by design* (that is the vulnerability), but
  the coursework proof is complete the moment the traversal escapes
  `resources/manuals/` and returns `LAB{unsafe_ipc_path_traversal}`.

## Test layering note

Full browser automation (Playwright/Spectron-style driving of the Electron
window) is intentionally not part of this phase: the environment has no such
runner and adding one would pull in a large dependency tree for no
coursework value. Instead, V4 is covered by two honest layers:

1. `client/test/v4-ipc.test.js` — deterministic `node:test` suite over the
   exact handler `ipcMain.handle('lab:read-file')` delegates to (no display).
2. `client/scripts/smoke-electron.sh` — a **real** Electron launch (main +
   preload + renderer page in a hidden window) that executes the full
   renderer → preload → IPC → main chain and the flag assertion inside the
   browser context.

No pretend browser-automation test is claimed anywhere.

## Remediation guidance

In a real application:

* enable `contextIsolation: true` (and `sandbox: true` where possible)
  so the preload bridge is not a plain page global;
* validate every IPC argument in the main process: `path.resolve()`
  the requested name and require the result to stay inside the
  intended directory (or restrict to a `basename()` from an
  allowlist);
* expose the narrowest possible API surface over IPC — one explicit
  method per operation, no arbitrary file paths;
* run the renderer with the least filesystem privileges the OS grants.

Do **not** apply any of this to the lab build: the unvalidated
handler and the insecure `webPreferences` are the coursework
vulnerability, and the exercises depend on them.

## Reset procedure

None needed: the V4 demonstration touches no database state and only reads
the static files under `client/resources/`. Re-running the tests and the
smoke script is always safe.
