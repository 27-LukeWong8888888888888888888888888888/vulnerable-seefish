'use strict';

/*
 * Phase 5 verification — run inside the api container:
 *   docker compose exec api node --test services/api/test/phase5.test.js
 *
 * Covers:
 *   1  /api/diagnostics/run    — technician-gated, configured target,
 *                                 result recorded
 *   2  /api/diagnostics/fetch  — technician-gated, validation errors
 *   3  V3 SSRF                 — technician fetches internal device admin
 *                                 challenge through the API
 *   4  V1 hard-coded token     — /api/field-service/fleet-sweep rejects
 *                                 user auth, accepts the FS token alone,
 *                                 exposes cross-user history
 *   5  negative controls       — envelope/session enforcement on the new
 *                                 endpoints; unreachable target -> 502
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app.js');
const LabEnvelope = require('../../../shared/protocol/envelope.js');

const FS_TOKEN = 'FS-LAB-7f3a9c1e-4b2d-8e6f-a5c0-1d9b3e7f2a48';
const CHALLENGE = 'LAB{ssrf_internal_device_reached}';
const DEVICE_STATUS_URL = 'http://lab-device:8080/api/status';
const DEVICE_ADMIN_URL = 'http://lab-device:8080/api/admin';

let server;
let base;

test.before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

async function getKey() {
  const res = await fetch(base + '/api/session/key', { method: 'POST' });
  assert.equal(res.status, 200);
  return res.json();
}

async function encRequest(session, endpoint, payload = {}, { sid, data, headers } = {}) {
  const envelope = {
    sid: sid || session.sessionId,
    alg: 'RC4',
    data: data !== undefined ? data : LabEnvelope.seal(session.sessionId, session.key, payload).data
  };
  const res = await fetch(base + endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(envelope)
  });
  const raw = await res.json();
  let decrypted = null;
  if (raw && typeof raw === 'object' && typeof raw.data === 'string' && !raw.error) {
    try {
      decrypted = LabEnvelope.open(session.key, raw);
    } catch (e) {
      decrypted = null;
    }
  }
  return { status: res.status, raw, decrypted };
}

async function login(session, username, password) {
  const r = await encRequest(session, '/api/auth/login', { username, password });
  assert.equal(r.status, 200, JSON.stringify(r.raw));
  assert.ok(r.decrypted.token, JSON.stringify(r.decrypted));
  return r.decrypted.token;
}

test('1. diagnostics/run is technician-gated and uses the configured target', async () => {
  const s = await getKey();
  const alice = await login(s, 'alice', 'StudentPass!23');
  const tech = await login(s, 'tech1', 'TechPass!23');

  // students may not run diagnostics
  let r = await encRequest(s, '/api/diagnostics/run', { token: alice, equipmentId: 1 });
  assert.equal(r.status, 403);

  // technicians run against the configured target (EQ-1001 -> lab-device)
  r = await encRequest(s, '/api/diagnostics/run', { token: tech, equipmentId: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.decrypted));
  assert.equal(r.decrypted.target, DEVICE_STATUS_URL);
  assert.equal(r.decrypted.httpStatus, 200);
  assert.ok(r.decrypted.body.includes('LABDEV-1001'), r.decrypted.body);

  // unknown equipment and bad input rejected
  r = await encRequest(s, '/api/diagnostics/run', { token: tech, equipmentId: 99999 });
  assert.equal(r.status, 404);
  r = await encRequest(s, '/api/diagnostics/run', { token: tech, equipmentId: 'one' });
  assert.equal(r.status, 400);
});

test('2. diagnostics/fetch is technician-gated and validates input', async () => {
  const s = await getKey();
  const alice = await login(s, 'alice', 'StudentPass!23');
  const tech = await login(s, 'tech1', 'TechPass!23');

  let r = await encRequest(s, '/api/diagnostics/fetch', {
    token: alice, equipmentId: 1, target: DEVICE_STATUS_URL
  });
  assert.equal(r.status, 403);

  r = await encRequest(s, '/api/diagnostics/fetch', { token: tech, equipmentId: 99999, target: DEVICE_STATUS_URL });
  assert.equal(r.status, 404);

  r = await encRequest(s, '/api/diagnostics/fetch', { token: tech, equipmentId: 1 });
  assert.equal(r.status, 400);

  r = await encRequest(s, '/api/diagnostics/fetch', { token: tech, equipmentId: 1, target: 42 });
  assert.equal(r.status, 400);

  // unreachable target -> 502 fetch_failed (and a failed run is recorded)
  r = await encRequest(s, '/api/diagnostics/fetch', { token: tech, equipmentId: 1, target: 'http://lab-device:9/nope' });
  assert.equal(r.status, 502);
  assert.equal(r.decrypted.error, 'fetch_failed');
});

test('3. V3 SSRF: technician fetches the internal device admin challenge', async () => {
  const s = await getKey();
  const tech = await login(s, 'tech1', 'TechPass!23');

  const r = await encRequest(s, '/api/diagnostics/fetch', {
    token: tech, equipmentId: 1, target: DEVICE_ADMIN_URL
  });
  assert.equal(r.status, 200, JSON.stringify(r.decrypted));
  assert.equal(r.decrypted.httpStatus, 200);
  assert.equal(r.decrypted.target, DEVICE_ADMIN_URL);
  assert.ok(r.decrypted.body.includes(CHALLENGE), r.decrypted.body);

  // and the plain status endpoint is equally reachable through the API
  const r2 = await encRequest(s, '/api/diagnostics/fetch', {
    token: tech, equipmentId: 1, target: DEVICE_STATUS_URL
  });
  assert.equal(r2.status, 200);
  assert.ok(r2.decrypted.body.includes('LABDEV-1001'), r2.decrypted.body);
});

test('4. V1: fleet-sweep is authorized by the hard-coded FS token alone', async () => {
  const s = await getKey();
  const alice = await login(s, 'alice', 'StudentPass!23');

  // no token at all -> 403
  let r = await encRequest(s, '/api/field-service/fleet-sweep', {});
  assert.equal(r.status, 403);

  // a valid ORDINARY user session does NOT grant field-service access
  r = await encRequest(s, '/api/field-service/fleet-sweep', { token: alice });
  assert.equal(r.status, 403);

  // wrong token -> 403
  r = await encRequest(s, '/api/field-service/fleet-sweep', {}, { headers: { 'X-Field-Token': 'FS-LAB-wrong' } });
  assert.equal(r.status, 403);

  // the hard-coded token works with NO user login token in the payload
  r = await encRequest(s, '/api/field-service/fleet-sweep', {}, { headers: { 'X-Field-Token': FS_TOKEN } });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.decrypted.fleet) && r.decrypted.fleet.length >= 12);
  assert.ok(Array.isArray(r.decrypted.recentRuns));
  // cross-user history: the runs recorded in tests 1-3 (as tech1) are visible here
  assert.ok(r.decrypted.recentRuns.some((d) => d.requestedByUsername === 'tech1'));
  // fleet data an ordinary user cannot see in aggregate
  const eq1001 = r.decrypted.fleet.find((e) => e.assetTag === 'EQ-1001');
  assert.equal(eq1001.diagnosticTarget, DEVICE_STATUS_URL);
});

test('5. negative controls: envelope/session still enforced on the new endpoints', async () => {
  // plaintext bodies rejected before routing
  let res = await fetch(base + '/api/diagnostics/fetch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'x', equipmentId: 1, target: DEVICE_STATUS_URL })
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'missing_sid');

  res = await fetch(base + '/api/field-service/fleet-sweep', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'missing_sid');

  // unknown session rejected even with the FS token header
  const s = await getKey();
  const r = await encRequest(
    s,
    '/api/field-service/fleet-sweep',
    {},
    { sid: 'sess-' + '0'.repeat(32), headers: { 'X-Field-Token': FS_TOKEN } }
  );
  assert.equal(r.status, 401);
  assert.equal(r.raw.error, 'unknown_session');

  // unauthenticated (no login token) diagnostics request rejected
  const r2 = await encRequest(s, '/api/diagnostics/fetch', { equipmentId: 1, target: DEVICE_STATUS_URL });
  assert.equal(r2.status, 401);
  assert.equal(r2.decrypted.error, 'auth_required');
});
