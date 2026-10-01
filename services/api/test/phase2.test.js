'use strict';

/*
 * Phase 2 verification — run inside the api container:
 *   docker compose exec api node --test test/
 *
 * Covers the approved Phase 2 checklist:
 *   1  /health plaintext                       8  valid login via envelope
 *   2  /api/session/key plaintext              9  invalid credentials rejected
 *   3  valid encrypted request succeeds       10  role restrictions
 *   4  missing sid rejected                   11  equipment retrieval
 *   5  unknown sid rejected                   12  fault-report operations
 *   6  expired/revoked sid rejected           13  lab-client.js end-to-end
 *   7  invalid ciphertext rejected            +   plaintext requests rejected
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const execFileAsync = promisify(execFile);

const { createApp } = require('../src/app.js');
const { createSession, revokeSession } = require('../src/sessions.js');
const LabRC4 = require('../../../shared/protocol/rc4.js');
const LabEnvelope = require('../../../shared/protocol/envelope.js');

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
  const body = await res.json();
  return body;
}

// Full encrypted round-trip. Returns { status, raw, decrypted } where
// `decrypted` is non-null when the response came back as an envelope.
async function encRequest(session, endpoint, payload = {}, { sid, data } = {}) {
  const envelope = {
    sid: sid || session.sessionId,
    alg: 'RC4',
    data: data !== undefined ? data : LabEnvelope.seal(session.sessionId, session.key, payload).data
  };
  const res = await fetch(base + endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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

test('1. GET /health works without encryption', async () => {
  const res = await fetch(base + '/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.db, 'up');
});

test('2. POST /api/session/key returns readable JSON with a fresh RC4 key', async () => {
  const a = await getKey();
  const b = await getKey();
  assert.ok(a.sessionId && b.sessionId && a.sessionId !== b.sessionId);
  assert.match(a.key, /^[A-Za-z0-9+/]{22}==$/); // base64 of 16 random bytes
  assert.equal(a.algorithm, 'RC4');
  assert.equal(a.expiresIn, 3600);
});

test('3. valid encrypted request succeeds; response is an encrypted envelope', async () => {
  const s = await getKey();
  const token = await login(s, 'alice', 'StudentPass!23');
  const r = await encRequest(s, '/api/auth/me', { token });
  assert.equal(r.status, 200);
  assert.equal(r.raw.sid, s.sessionId);
  assert.equal(r.raw.alg, 'RC4');
  assert.ok(typeof r.raw.data === 'string' && r.raw.data.length > 0);
  assert.equal(r.decrypted.user.username, 'alice');
  assert.equal(r.decrypted.user.role, 'student');
});

test('4. missing sid is rejected', async () => {
  const res = await fetch(base + '/api/auth/me', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ alg: 'RC4', data: 'AAAA' })
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'missing_sid');
});

test('5. unknown sid is rejected', async () => {
  const s = await getKey();
  const r = await encRequest(s, '/api/auth/me', { token: 'x' }, { sid: 'sess-' + '0'.repeat(32) });
  assert.equal(r.status, 401);
  assert.equal(r.raw.error, 'unknown_session');
});

test('6. expired and revoked sessions are rejected', async () => {
  const expired = await createSession({ ttlSeconds: -10 });
  let r = await encRequest(
    { sessionId: expired.sessionId, key: expired.keyB64 },
    '/api/auth/me',
    { token: 'x' }
  );
  assert.equal(r.status, 401);
  assert.equal(r.raw.error, 'session_expired');

  const revoked = await createSession();
  await revokeSession(revoked.sessionId);
  r = await encRequest({ sessionId: revoked.sessionId, key: revoked.keyB64 }, '/api/auth/me', { token: 'x' });
  assert.equal(r.status, 401);
  assert.equal(r.raw.error, 'session_revoked');
});

test('7. malformed ciphertext and malformed decrypted JSON are rejected', async () => {
  const s = await getKey();

  let r = await encRequest(s, '/api/auth/me', {}, { data: '!!!not-base64!!!' });
  assert.equal(r.status, 400);
  assert.equal(r.raw.error, 'malformed_ciphertext');

  // Well-formed base64, but the decrypted bytes are not valid UTF-8.
  const notUtf8 = LabRC4.b64encode(LabRC4.encryptBytes(s.key, new Uint8Array([0xff, 0xfe, 0xfd, 0xfc])));
  r = await encRequest(s, '/api/auth/me', {}, { data: notUtf8 });
  assert.equal(r.status, 400);
  assert.equal(r.raw.error, 'malformed_ciphertext');

  // Valid UTF-8, but not JSON.
  const notJson = LabRC4.encryptText(s.key, 'this is not json');
  r = await encRequest(s, '/api/auth/me', {}, { data: notJson });
  assert.equal(r.status, 400);
  assert.equal(r.raw.error, 'malformed_decrypted_json');
});

test('8. valid login works through the encrypted protocol (all seeded roles)', async () => {
  const s = await getKey();
  for (const [username, password, role] of [
    ['admin', 'AdminPass!23', 'admin'],
    ['tech1', 'TechPass!23', 'technician'],
    ['alice', 'StudentPass!23', 'student']
  ]) {
    const token = await login(s, username, password);
    const me = await encRequest(s, '/api/auth/me', { token });
    assert.equal(me.decrypted.user.username, username);
    assert.equal(me.decrypted.user.role, role);
  }
});

test('9. invalid credentials are rejected', async () => {
  const s = await getKey();
  for (const payload of [
    { username: 'alice', password: 'wrong-password' },
    { username: 'nobody', password: 'StudentPass!23' },
    { username: 'alice' } // missing password
  ]) {
    const r = await encRequest(s, '/api/auth/login', payload);
    assert.equal(r.status, payload.username === 'alice' && !payload.password ? 400 : 401);
    assert.ok(['invalid_credentials', 'validation_failed'].includes(r.decrypted ? r.decrypted.error : r.raw.error));
  }
});

test('10. role restrictions work', async () => {
  const s = await getKey();
  const alice = await login(s, 'alice', 'StudentPass!23');
  const tech = await login(s, 'tech1', 'TechPass!23');
  const admin = await login(s, 'admin', 'AdminPass!23');

  // Unique tag per run: the suite mutates the shared seeded DB, so a fixed
  // tag would 409 (conflict) on re-runs and look like a role-check failure.
  const tag = 'EQ-TEST-' + Date.now().toString(36);

  // students cannot create or update equipment
  let r = await encRequest(s, '/api/equipment/create', {
    token: alice,
    assetTag: tag,
    name: 'Test Unit',
    category: 'test',
    locationId: 1
  });
  assert.equal(r.status, 403);

  r = await encRequest(s, '/api/equipment/update', { token: alice, id: 1, status: 'maintenance' });
  assert.equal(r.status, 403);

  // admins can create equipment
  r = await encRequest(s, '/api/equipment/create', {
    token: admin,
    assetTag: tag,
    name: 'Test Unit',
    category: 'test',
    locationId: 1
  });
  assert.equal(r.status, 201);

  // technicians cannot create but can update
  r = await encRequest(s, '/api/equipment/create', {
    token: tech,
    assetTag: 'EQ-TEST-2',
    name: 'Test Unit 2',
    category: 'test',
    locationId: 1
  });
  assert.equal(r.status, 403);
  r = await encRequest(s, '/api/equipment/update', { token: tech, id: 1, status: 'maintenance' });
  assert.equal(r.status, 200);
  assert.equal(r.decrypted.status, 'maintenance');

  // students cannot manage fault reports; techs/admins can
  r = await encRequest(s, '/api/fault-reports/update', { token: alice, id: 1, status: 'resolved' });
  assert.equal(r.status, 403);
  r = await encRequest(s, '/api/fault-reports/update', { token: tech, id: 1, status: 'in_progress' });
  assert.equal(r.status, 200);
  assert.equal(r.decrypted.status, 'in_progress');
});

test('11. equipment retrieval works (parameterized queries)', async () => {
  const s = await getKey();
  const token = await login(s, 'bob', 'StudentPass!23');

  const all = await encRequest(s, '/api/equipment/list', { token });
  assert.equal(all.status, 200);
  assert.ok(all.decrypted.length >= 12);
  const eq1001 = all.decrypted.find((e) => e.assetTag === 'EQ-1001');
  assert.ok(eq1001);
  assert.equal(eq1001.diagnosticTarget, 'http://lab-device:8080/api/status');

  const one = await encRequest(s, '/api/equipment/get', { token, id: eq1001.id });
  assert.equal(one.status, 200);
  assert.equal(one.decrypted.assetTag, 'EQ-1001');

  // filters are parameterized and actually filter
  const available = await encRequest(s, '/api/equipment/list', { token, status: 'available' });
  assert.ok(available.decrypted.every((e) => e.status === 'available'));

  // filter values are data, not SQL: a quote in the filter must not error
  const quoted = await encRequest(s, '/api/equipment/list', { token, q: "' OR '1'='1" });
  assert.equal(quoted.status, 200);
  assert.equal(quoted.decrypted.length, 0);

  const missing = await encRequest(s, '/api/equipment/get', { token, id: 99999 });
  assert.equal(missing.status, 404);
});

test('12. fault-report operations work with role visibility', async () => {
  const s = await getKey();
  const alice = await login(s, 'alice', 'StudentPass!23');
  const bob = await login(s, 'bob', 'StudentPass!23');
  const tech = await login(s, 'tech1', 'TechPass!23');

  // student submits a report
  const created = await encRequest(s, '/api/fault-reports/create', {
    token: alice,
    equipmentId: 2,
    title: 'Phase 2 verification report',
    description: 'synthetic test entry',
    severity: 'high'
  });
  assert.equal(created.status, 201);
  assert.equal(created.decrypted.status, 'open');
  assert.equal(created.decrypted.reportedByUsername, undefined); // create returns bare row
  const reportId = created.decrypted.id;

  // alice sees it in her own list; bob does not
  const aliceList = await encRequest(s, '/api/fault-reports/list', { token: alice });
  assert.ok(aliceList.decrypted.some((f) => f.id === reportId));
  assert.ok(aliceList.decrypted.every((f) => f.reportedByUsername === 'alice'));
  const bobList = await encRequest(s, '/api/fault-reports/list', { token: bob });
  assert.ok(!bobList.decrypted.some((f) => f.id === reportId));

  // technician sees everything including the new report
  const techList = await encRequest(s, '/api/fault-reports/list', { token: tech });
  assert.ok(techList.decrypted.length >= 6);
  assert.ok(techList.decrypted.some((f) => f.id === reportId));

  // technician resolves it
  const resolved = await encRequest(s, '/api/fault-reports/update', {
    token: tech,
    id: reportId,
    status: 'resolved',
    resolution: 'verified in Phase 2 tests'
  });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.decrypted.status, 'resolved');
});

test('13. lab-client.js performs handshake → encrypted request → encrypted response', async () => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lab-client-')), 'session.json');
  const script = path.join(__dirname, '..', '..', '..', 'scripts', 'lab-client.js');

  // Async spawn: spawnSync would block the parent's event loop and deadlock
  // (the child requests the in-process test server, which can't respond).
  // No --fresh: the second run must reuse the cached session AND token.
  const run = async (extraArgs) => {
    try {
      return await execFileAsync('node', [script, '--base', base, ...extraArgs], {
        env: { ...process.env, LAB_SESSION_FILE: tmp }
      });
    } catch (e) {
      assert.fail(`lab-client exited ${e.code}: ${e.stderr || e.message}`);
    }
  };

  const r1 = await run([
    '--endpoint', '/api/auth/login',
    '--payload', JSON.stringify({ username: 'alice', password: 'StudentPass!23' })
  ]);
  const out1 = JSON.parse(r1.stdout);
  assert.equal(out1.user.username, 'alice');
  assert.ok(out1.token);

  // Second run reuses the cached RC4 session and auto-attaches the token.
  const r2 = await run(['--endpoint', '/api/auth/me']);
  const out2 = JSON.parse(r2.stdout);
  assert.equal(out2.user.username, 'alice');
});

test('negative control: protected endpoints reject plaintext JSON requests', async () => {
  // ordinary JSON object without envelope fields -> rejected before routing
  let res = await fetch(base + '/api/auth/me', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'labtok-not-really' })
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'missing_sid');

  // non-object JSON body -> not an envelope at all
  res = await fetch(base + '/api/auth/me', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(['definitely', 'not', 'an', 'envelope'])
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'missing_envelope');

  // valid-looking equipment call, still no envelope
  res = await fetch(base + '/api/equipment/list', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'labtok-not-really' })
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'missing_sid');

  // session/key itself must NOT require (or accept) an envelope
  res = await fetch(base + '/api/session/key', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sid: 'x', alg: 'RC4', data: 'AAAA' })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.sessionId && body.key);
});
