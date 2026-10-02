'use strict';

/*
 * Phase 3 verification — run inside the api container:
 *   docker compose exec api node --test services/api/test/phase3.test.js
 *
 * Covers the approved Phase 3 checklist:
 *   functionality: list scoping, create (validation), update/cancel
 *   authorization, history
 *   V2:   normal search returns only own results
 *         ordinary search cannot retrieve another user's reservation
 *         intended payload retrieves the seeded cross-user reservation
 *         unrelated endpoint (equipment) remains parameterized
 *         unauthenticated requests rejected
 *         invalid RC4 sessions rejected
 *
 * The suite creates two reservations per run in a window 60 days out and
 * deletes them again in test.before/test.after (see cleanup()), so the
 * shared dev DB stays at its seed baseline. It never touches the seeded
 * V2 victim row (id 13).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app.js');
const { query } = require('../src/db');
const LabEnvelope = require('../../../shared/protocol/envelope.js');

let server;
let base;

// Janitor: suite rows are created at exactly +60 days, while the seed data
// never ends later than 2026-11-05 — so anything ending more than 45 days
// out is a row this suite (or a crashed earlier run of it) created.
async function cleanup() {
  await query("DELETE FROM reservations WHERE ends_at > now() + interval '45 days'");
}

test.before(async () => {
  await cleanup();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await cleanup();
  await new Promise((resolve) => server.close(resolve));
});

async function getKey() {
  const res = await fetch(base + '/api/session/key', { method: 'POST' });
  assert.equal(res.status, 200);
  return res.json();
}

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
  return r.decrypted.token;
}

// Far-future, run-unique booking window so re-runs never collide.
function futureWindow() {
  const start = Date.now() + 60 * 24 * 3600 * 1000;
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 2 * 3600 * 1000).toISOString()
  };
}

test('1. list scoping: students see only their own reservations, staff see all', async () => {
  const s = await getKey();
  const alice = await login(s, 'alice', 'StudentPass!23');
  const tech = await login(s, 'tech1', 'TechPass!23');

  const aliceList = await encRequest(s, '/api/reservations/list', { token: alice });
  assert.equal(aliceList.status, 200);
  assert.ok(aliceList.decrypted.length >= 5, JSON.stringify(aliceList.decrypted));
  assert.ok(aliceList.decrypted.every((r) => r.ownerUsername === 'alice'));
  // alice's seeded rows span active + completed statuses
  const statuses = new Set(aliceList.decrypted.map((r) => r.status));
  assert.ok(statuses.has('active') && statuses.has('completed'));
  // detail fields required for the V2 proof are present on normal rows too
  const row = aliceList.decrypted.find((r) => r.id === 13);
  assert.equal(row.assetTag, 'EQ-1002');
  assert.equal(row.equipmentName, 'DNA Sequencer 4500');
  assert.equal(row.ownerDisplayName, 'Alice Anderson');
  assert.ok(row.startsAt && row.endsAt && row.purpose);

  const techList = await encRequest(s, '/api/reservations/list', { token: tech });
  assert.equal(techList.status, 200);
  assert.ok(techList.decrypted.length >= 32);
  const owners = new Set(techList.decrypted.map((r) => r.ownerUsername));
  assert.ok(owners.has('alice') && owners.has('bob') && owners.has('frank'));

  // filters stay parameterized and effective
  const filtered = await encRequest(s, '/api/reservations/list', { token: alice, status: 'completed' });
  assert.ok(filtered.decrypted.every((r) => r.status === 'completed' && r.ownerUsername === 'alice'));
});

test('2. create: validation, ownership, and appearance in list', async () => {
  const s = await getKey();
  const bob = await login(s, 'bob', 'StudentPass!23');
  const window = futureWindow();
  const purpose = 'P3 verification booking ' + Date.now().toString(36);

  let r = await encRequest(s, '/api/reservations/create', { token: bob, equipmentId: 3 });
  assert.equal(r.status, 400);
  assert.equal(r.decrypted.error, 'validation_failed');

  r = await encRequest(s, '/api/reservations/create', {
    token: bob, equipmentId: 3, startsAt: 'not-a-date', endsAt: window.endsAt
  });
  assert.equal(r.status, 400);

  r = await encRequest(s, '/api/reservations/create', {
    token: bob, equipmentId: 3, startsAt: window.endsAt, endsAt: window.startsAt
  });
  assert.equal(r.status, 400);
  assert.match(r.decrypted.message, /after startsAt/);

  r = await encRequest(s, '/api/reservations/create', {
    token: bob, equipmentId: 99999, startsAt: window.startsAt, endsAt: window.endsAt
  });
  assert.equal(r.status, 400);
  assert.equal(r.decrypted.error, 'invalid_reference');

  const created = await encRequest(s, '/api/reservations/create', {
    token: bob, equipmentId: 3, startsAt: window.startsAt, endsAt: window.endsAt, purpose
  });
  assert.equal(created.status, 201);
  assert.equal(created.decrypted.ownerUsername, 'bob');
  assert.equal(created.decrypted.assetTag, 'EQ-1003');
  assert.equal(created.decrypted.status, 'active');

  const listed = await encRequest(s, '/api/reservations/list', { token: bob });
  assert.ok(listed.decrypted.some((x) => x.id === created.decrypted.id && x.purpose === purpose));
});

test('3. update/cancel: owners edit or cancel their own; other students are rejected; staff manage any', async () => {
  const s = await getKey();
  const alice = await login(s, 'alice', 'StudentPass!23');
  const bob = await login(s, 'bob', 'StudentPass!23');
  const tech = await login(s, 'tech1', 'TechPass!23');
  const window = futureWindow();

  const created = await encRequest(s, '/api/reservations/create', {
    token: alice, equipmentId: 5, startsAt: window.startsAt, endsAt: window.endsAt,
    purpose: 'P3 authorization test ' + Date.now().toString(36)
  });
  assert.equal(created.status, 201);
  const id = created.decrypted.id;

  // bob (student, not owner) cannot touch it — not even to cancel
  let r = await encRequest(s, '/api/reservations/update', { token: bob, id, status: 'cancelled' });
  assert.equal(r.status, 403);
  r = await encRequest(s, '/api/reservations/update', { token: bob, id, purpose: 'hijacked' });
  assert.equal(r.status, 403);

  // alice (owner, student) can edit purpose but cannot set status completed
  r = await encRequest(s, '/api/reservations/update', { token: alice, id, purpose: 'edited by owner' });
  assert.equal(r.status, 200);
  assert.equal(r.decrypted.purpose, 'edited by owner');
  r = await encRequest(s, '/api/reservations/update', { token: alice, id, status: 'completed' });
  assert.equal(r.status, 403);

  // owner can cancel her own reservation
  r = await encRequest(s, '/api/reservations/update', { token: alice, id, status: 'cancelled' });
  assert.equal(r.status, 200);
  assert.equal(r.decrypted.status, 'cancelled');

  // staff can manage any reservation, including restoring status
  r = await encRequest(s, '/api/reservations/update', { token: tech, id, status: 'active' });
  assert.equal(r.status, 200);
  assert.equal(r.decrypted.status, 'active');

  r = await encRequest(s, '/api/reservations/update', { token: alice, id: 99999, status: 'cancelled' });
  assert.equal(r.status, 404);
});

test('4. history returns ended/cancelled/completed reservations only', async () => {
  const s = await getKey();
  const alice = await login(s, 'alice', 'StudentPass!23');

  const history = await encRequest(s, '/api/reservations/history', { token: alice });
  assert.equal(history.status, 200);
  assert.ok(history.decrypted.length >= 1);
  assert.ok(history.decrypted.every((r) =>
    r.status === 'cancelled' || r.status === 'completed' || Date.parse(r.endsAt) < Date.now()
  ));
  // alice's seeded completed reservation is in scope
  assert.ok(history.decrypted.some((r) => r.id === 1));
  // the seeded active V2 victim row (ends in the future) must NOT be history
  assert.ok(!history.decrypted.some((r) => r.id === 13));
});

test('5. V2 normal search returns only the caller\'s own matches', async () => {
  const s = await getKey();
  const alice = await login(s, 'alice', 'StudentPass!23');

  const r = await encRequest(s, '/api/reservations/search', { token: alice, q: 'DNA' });
  assert.equal(r.status, 200);
  assert.ok(r.decrypted.some((x) => x.id === 13));
  assert.ok(r.decrypted.every((x) => x.ownerUsername === 'alice'));

  const missing = await encRequest(s, '/api/reservations/search', { token: alice });
  assert.equal(missing.status, 400);
});

test('6. V2 ordinary search by another user does NOT retrieve alice\'s reservation', async () => {
  const s = await getKey();
  const bob = await login(s, 'bob', 'StudentPass!23');

  const r = await encRequest(s, '/api/reservations/search', { token: bob, q: 'DNA' });
  assert.equal(r.status, 200);
  assert.equal(r.decrypted.length, 0);

  // cross-check: bob legitimately has no visibility of row 13 at all
  const list = await encRequest(s, '/api/reservations/list', { token: bob });
  assert.ok(!list.decrypted.some((x) => x.id === 13));
});

test('7. V2 injection payload retrieves the seeded cross-user reservation', async () => {
  const s = await getKey();
  const bob = await login(s, 'bob', 'StudentPass!23');
  const payload = "x' OR 1=1 -- ";

  const r = await encRequest(s, '/api/reservations/search', { token: bob, q: payload });
  assert.equal(r.status, 200);
  // every seeded reservation is visible now, across owners
  assert.ok(r.decrypted.length >= 32);
  const victim = r.decrypted.find((x) => x.id === 13);
  assert.ok(victim, 'alice\'s seeded reservation must be in the injected result');
  assert.equal(victim.ownerUsername, 'alice');
  assert.equal(victim.ownerDisplayName, 'Alice Anderson');
  assert.equal(victim.assetTag, 'EQ-1002');
  assert.equal(victim.equipmentName, 'DNA Sequencer 4500');
  assert.equal(victim.startsAt, '2026-10-06T09:00:00.000Z');
  assert.equal(victim.endsAt, '2026-10-06T12:00:00.000Z');
  assert.equal(victim.purpose, 'Senior project: DNA sequencer calibration');
  assert.equal(victim.status, 'active');
});

test('8. negative control: equipment search filter remains parameterized', async () => {
  const s = await getKey();
  const bob = await login(s, 'bob', 'StudentPass!23');

  // same class of payload that leaks everything in reservations/search
  const r = await encRequest(s, '/api/equipment/list', { token: bob, q: "' OR '1'='1" });
  assert.equal(r.status, 200);
  assert.equal(r.decrypted.length, 0); // quote is data here, not SQL

  const all = await encRequest(s, '/api/equipment/list', { token: bob });
  assert.ok(all.decrypted.length >= 12);
});

test('9. negative control: unauthenticated and invalid-session requests are rejected', async () => {
  const s = await getKey();

  // valid envelope, no login token
  let r = await encRequest(s, '/api/reservations/search', { q: 'x' });
  assert.equal(r.status, 401);
  assert.equal(r.decrypted ? r.decrypted.error : r.raw.error, 'auth_required');

  // plaintext JSON, no envelope at all
  const res = await fetch(base + '/api/reservations/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'labtok-not-really', q: 'x' })
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'missing_sid');

  // valid envelope, unknown RC4 session
  r = await encRequest(s, '/api/reservations/search', { token: 'labtok-not-really', q: 'x' },
    { sid: 'sess-' + '0'.repeat(32) });
  assert.equal(r.status, 401);
  assert.equal(r.raw.error, 'unknown_session');

  // valid envelope, garbage ciphertext
  r = await encRequest(s, '/api/reservations/search', {}, { data: '!!!not-base64!!!' });
  assert.equal(r.status, 400);
  assert.equal(r.raw.error, 'malformed_ciphertext');
});
