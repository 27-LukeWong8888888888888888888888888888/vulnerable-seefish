# Wire Protocol — RC4 Envelope (intentionally insecure)

> The RC4 envelope is a **deliberately weak** coursework protocol. Do
> not "improve" it: no TLS, no public-key cryptography, no pre-shared
> secret, no certificate validation, no additional key exchange. Its
> weaknesses are part of the lesson. See `SECURITY-LAB-NOTICE.md`.

## What it is

Every protected API request/response travels inside an RC4 envelope:

```
POST /api/<route>
Content-Type: application/json

{ "sid": "<session id>", "alg": "RC4", "data": "<base64 ciphertext>" }
```

* `sid` — identifies a server-side session row holding the RC4 key.
* `alg` — always the literal `"RC4"` (drop-in point if the course
  later contrasts stream ciphers with AEAD).
* `data` — `base64( RC4_drop(keystream, key, plaintext JSON) )`.

On receipt the server looks up the session by `sid`, decrypts `data`,
and the resulting JSON becomes `req.body`. Responses are re-sealed
with the same session key before being sent.

## Handshake

1. `POST /api/session/key` → server creates a random session key,
   stores it in `rc4_sessions` (with expiry + revocation), and returns
   **readable JSON**:

   ```json
   { "sessionId": "…", "key": "<base64>", "expiresAt": "…" }
   ```

2. Client seals `{…}` with that key → envelope above.
3. `POST /api/auth/login` (enveloped) with `{username, password}` →
   server returns a login token `labtok-…` **inside the sealed
   response**; the client includes it as `token` in subsequent
   enveloped bodies.

## Plaintext endpoints (exactly two)

| Endpoint | Why plaintext |
|---|---|
| `GET /health` | container healthcheck; no data |
| `POST /api/session/key` | bootstrap — by design the key is handed out in the clear; that exposure is the documented protocol weakness |

Every other `/api` route requires the envelope. Plaintext JSON on a
protected route → `400 missing_sid`; unknown `sid` → `401`;
unauthenticated envelope → `401 auth_required`. (Asserted by
phase5 test 5.) The middleware also rejects: a missing `data` field,
an expired or revoked session, malformed ciphertext, and malformed
decrypted JSON — every response is sealed with the same session key
unless the failure happened before decryption.

## Deliberate weaknesses (teaching points)

* **Key distribution in the clear.** Anyone on the path (or any process
  on the lab host, since the API is loopback-published) reads the key
  and decrypts all traffic for that session. Real systems use
  authenticated key exchange (TLS).
* **RC4 itself.** Deprecated stream cipher; biased keystream, no
  integrity. There is no MAC — ciphertext is trivially malleable in
  ways a modern AEAD would prevent.
* **No server identity.** Nothing authenticates the API to the client.
* **Session rows persist the key** in Postgres (`rc4_sessions.key_b64`)
  until expiry.

None of these are the four graded vulnerabilities — the envelope is
the lab's transport flavor, and it must stay weak.

## Implementation map

* `shared/protocol/rc4.js` — RC4 core (UMD: CommonJS + browser global).
* `shared/protocol/envelope.js` — seal/open + envelope (de)serialization
  (UMD: CommonJS + browser global). Also used unmodified by the
  Electron main process.
* Server middleware — session lookup, decrypt-to-`req.body`, re-seal
  responses (services/api/src).
* Client — only the **Electron main process** seals/opens
  (`client/api-client.js`, via the shared module); the renderer never
  holds the RC4 key. The server-side scripts (`scripts/lab-client.js`,
  `scripts/poc-*.js`) do the same inside the api container.
* Tests — `shared/protocol/protocol.test.js` (7 unit tests), plus protocol
  negative controls in `services/api/test/phase5.test.js`.

## Boundary rule

Do not add TLS, public-key cryptography, a pre-shared secret,
certificate validation, or another key-exchange mechanism. Keep RC4
intentionally insecure as required by the assignment.
