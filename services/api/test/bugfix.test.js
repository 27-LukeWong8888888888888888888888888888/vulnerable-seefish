'use strict';

/*
 * Bugfix regression suite (bug-hunt 2026-10-02, findings B3–B7) — run inside
 * the api container together with the phase suites:
 *   docker compose exec api node --test services/api/test/phase2.test.js \
 *     services/api/test/phase3.test.js services/api/test/phase5.test.js \
 *     services/api/test/bugfix.test.js
 *
 * Covers the post-fix behavior:
 *   B3  overlapping active reservations rejected (create + update),
 *       touching windows still allowed, cancelled rows no longer block
 *   B4  /update rejects temporally impossible effective windows
 *   B5  cancelled/completed are terminal — no further modification
 *   B6  reservations cannot be created for maintenance/retired equipment
 *   B7  equipment/create returns 400 (not 500) for an invalid status value
 *
 * Cleanup is marker-based: every reservation this suite creates carries a
 * purpose starting 'BUGFIX-' and the one equipment row an asset_tag starting
 * 'EQ-BUGFIX-'. The windows sit 40–43 days out so the phase3 janitor
 * (which deletes rows ending more than 45 days out) never races this suite,
 * and equipment ids 1, 3 and 5 (mutated or booked by the phase suites) are
 * never used.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app.js');
const { query } = require('../src/db');
const LabEnvelope = require('../../../shared/protocol/envelope.js');

let server;
let base;

async function cleanup() {
  await query("DELETE FROM reservations WHERE purpose LIKE 'BUGFIX-%'");
  await query("DELETE FROM equipment WHERE asset_tag LIKE 'EQ-BUGFIX-%'");
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

async function encRequest(session, endpoint, payload = {}) {
  const envelope = {
    sid: session.sessionId,
    alg: 'RC4',
    data: LabEnvelope.seal(session.sessionId, session.key, payload).data
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

// Booking window `dayOffset` days out, `startHour`–`endHour` UTC. The suite
// only uses offsets 40–43 so no row ever ends more than 45 days out.
function win(dayOffset, startHour, endHour) {
  const d = new Date(Date.now() + dayOffset * 24 * 3600 * 1000);
  d.setUTCHours(startHour, 0, 0, 0);
  return {
    startsAt: d.toISOString(),
    endsAt: new Date(d.getTime() + (endHour - startHour) * 3600 * 1000).toISOString()
  };
}

test('B3 create: overlapping active reservations rejected, touching allowed, cancelled no longer blocks', async () => {
  const s = await getKey();
  const bob = await login(s, 'bob', 'StudentPass!23');
  const alice = await login(s, 'alice', 'StudentPass!23');

  let r = await encRequest(s, '/api/reservations/create', {
    token: bob, equipmentId: 2, ...win(40, 10, 12), purpose: 'BUGFIX-B3 overlap base'
  });
  assert.equal(r.status, 201, JSON.stringify(r.decrypted));
  const baseId = r.decrypted.id;

  // identical window, same equipment, different user -> 409
  r = await encRequest(s, '/api/reservations/create', {
    token: alice, equipmentId: 2, ...win(40, 10, 12), purpose: 'BUGFIX-B3 should-not-exist'
  });
  assert.equal(r.status, 409);
  assert.equal(r.decrypted.error, 'conflict');

  // enclosing window -> 409
  r = await encRequest(s, '/api/reservations/create', {
    token: alice, equipmentId: 2, ...win(40, 9, 13), purpose: 'BUGFIX-B3 should-not-exist'
  });
  assert.equal(r.status, 409);

  // back-to-back window (starts exactly when the base row ends) -> 201
  r = await encRequest(s, '/api/reservations/create', {
    token: alice, equipmentId: 2, ...win(40, 12, 14), purpose: 'BUGFIX-B3 touching'
  });
  assert.equal(r.status, 201, JSON.stringify(r.decrypted));

  // once the base row is cancelled it must no longer block the slot
  r = await encRequest(s, '/api/reservations/update', {
    token: bob, id: baseId, status: 'cancelled'
  });
  assert.equal(r.status, 200);

  r = await encRequest(s, '/api/reservations/create', {
    token: alice, equipmentId: 2, ...win(40, 10, 12), purpose: 'BUGFIX-B3 after cancel'
  });
  assert.equal(r.status, 201, JSON.stringify(r.decrypted));
});

test('B3 update: moving a window into an active clash rejected; self and touching windows allowed', async () => {
  const s = await getKey();
  const bob = await login(s, 'bob', 'StudentPass!23');
  const alice = await login(s, 'alice', 'StudentPass!23');

  let r = await encRequest(s, '/api/reservations/create', {
    token: bob, equipmentId: 6, ...win(41, 10, 12), purpose: 'BUGFIX-B3 upd base'
  });
  assert.equal(r.status, 201, JSON.stringify(r.decrypted));
  const baseId = r.decrypted.id;

  r = await encRequest(s, '/api/reservations/create', {
    token: alice, equipmentId: 6, ...win(41, 14, 16), purpose: 'BUGFIX-B3 upd other'
  });
  assert.equal(r.status, 201, JSON.stringify(r.decrypted));
  const otherId = r.decrypted.id;

  // reschedule the later row to start inside the earlier row's window -> 409
  r = await encRequest(s, '/api/reservations/update', {
    token: alice, id: otherId, startsAt: win(41, 11, 12).startsAt
  });
  assert.equal(r.status, 409);
  assert.equal(r.decrypted.error, 'conflict');

  // reschedule to exactly abut the earlier row -> 200
  r = await encRequest(s, '/api/reservations/update', {
    token: alice, id: otherId, startsAt: win(41, 12, 13).startsAt, endsAt: win(41, 13, 14).endsAt
  });
  assert.equal(r.status, 200, JSON.stringify(r.decrypted));

  // moving a row inside its own (now free) old window must not clash with itself
  r = await encRequest(s, '/api/reservations/update', {
    token: bob, id: baseId, startsAt: win(41, 10, 11).startsAt, endsAt: win(41, 11, 12).endsAt
  });
  assert.equal(r.status, 200, JSON.stringify(r.decrypted));
});

test('B4 update: temporally impossible effective windows rejected', async () => {
  const s = await getKey();
  const bob = await login(s, 'bob', 'StudentPass!23');

  let r = await encRequest(s, '/api/reservations/create', {
    token: bob, equipmentId: 8, ...win(42, 10, 12), purpose: 'BUGFIX-B4 inverted'
  });
  assert.equal(r.status, 201, JSON.stringify(r.decrypted));
  const id = r.decrypted.id;

  // endsAt moved before the stored startsAt -> 400
  r = await encRequest(s, '/api/reservations/update', {
    token: bob, id, endsAt: win(42, 8, 9).endsAt
  });
  assert.equal(r.status, 400);
  assert.match(r.decrypted.message, /after startsAt/);

  // startsAt moved after the stored endsAt -> 400
  r = await encRequest(s, '/api/reservations/update', {
    token: bob, id, startsAt: win(42, 13, 14).startsAt
  });
  assert.equal(r.status, 400);
  assert.match(r.decrypted.message, /after startsAt/);

  // a consistent single-side move still succeeds (12:00 -> 11:00)
  r = await encRequest(s, '/api/reservations/update', {
    token: bob, id, endsAt: win(42, 10, 11).endsAt
  });
  assert.equal(r.status, 200, JSON.stringify(r.decrypted));
  assert.match(r.decrypted.endsAt, /T11:00:00/);
});

test('B5: cancelled and completed reservations are terminal', async () => {
  const s = await getKey();
  const bob = await login(s, 'bob', 'StudentPass!23');
  const tech = await login(s, 'tech1', 'TechPass!23');

  let r = await encRequest(s, '/api/reservations/create', {
    token: bob, equipmentId: 10, ...win(43, 10, 12), purpose: 'BUGFIX-B5 terminal'
  });
  assert.equal(r.status, 201, JSON.stringify(r.decrypted));
  const cancelledId = r.decrypted.id;

  r = await encRequest(s, '/api/reservations/update', {
    token: bob, id: cancelledId, status: 'cancelled'
  });
  assert.equal(r.status, 200);

  // any further change on a cancelled row -> 409, for owner and staff alike
  r = await encRequest(s, '/api/reservations/update', {
    token: bob, id: cancelledId, purpose: 'BUGFIX-B5 edited'
  });
  assert.equal(r.status, 409);
  assert.equal(r.decrypted.error, 'conflict');
  r = await encRequest(s, '/api/reservations/update', {
    token: tech, id: cancelledId, status: 'active'
  });
  assert.equal(r.status, 409);

  // completed is equally terminal (staff marks it, then nothing applies)
  r = await encRequest(s, '/api/reservations/create', {
    token: bob, equipmentId: 10, ...win(43, 14, 16), purpose: 'BUGFIX-B5 completed'
  });
  assert.equal(r.status, 201, JSON.stringify(r.decrypted));
  const completedId = r.decrypted.id;

  r = await encRequest(s, '/api/reservations/update', {
    token: tech, id: completedId, status: 'completed'
  });
  assert.equal(r.status, 200);
  r = await encRequest(s, '/api/reservations/update', {
    token: tech, id: completedId, purpose: 'BUGFIX-B5 edited'
  });
  assert.equal(r.status, 409);
});

test('B6: maintenance and retired equipment cannot be reserved; reserved/available can', async () => {
  const s = await getKey();
  const bob = await login(s, 'bob', 'StudentPass!23');

  // seeded statuses: 4 = maintenance, 12 = retired, 7 = reserved, 11 = available
  let r = await encRequest(s, '/api/reservations/create', {
    token: bob, equipmentId: 4, ...win(40, 10, 12), purpose: 'BUGFIX-B6 blocked'
  });
  assert.equal(r.status, 409);
  assert.equal(r.decrypted.error, 'conflict');
  assert.match(r.decrypted.message, /maintenance/);

  r = await encRequest(s, '/api/reservations/create', {
    token: bob, equipmentId: 12, ...win(40, 10, 12), purpose: 'BUGFIX-B6 blocked'
  });
  assert.equal(r.status, 409);
  assert.match(r.decrypted.message, /retired/);

  r = await encRequest(s, '/api/reservations/create', {
    token: bob, equipmentId: 7, ...win(41, 10, 12), purpose: 'BUGFIX-B6 reserved control'
  });
  assert.equal(r.status, 201, JSON.stringify(r.decrypted));

  r = await encRequest(s, '/api/reservations/create', {
    token: bob, equipmentId: 11, ...win(41, 14, 16), purpose: 'BUGFIX-B6 available control'
  });
  assert.equal(r.status, 201, JSON.stringify(r.decrypted));
});

test('B7: equipment/create rejects an invalid status with 400, not 500', async () => {
  const s = await getKey();
  const admin = await login(s, 'admin', 'AdminPass!23');
  const tag = 'EQ-BUGFIX-' + Date.now().toString(36);

  let r = await encRequest(s, '/api/equipment/create', {
    token: admin, assetTag: tag, name: 'Bugfix Unit', category: 'test',
    locationId: 1, status: 'not-a-status'
  });
  assert.equal(r.status, 400);
  assert.equal(r.decrypted.error, 'validation_failed');
  assert.match(r.decrypted.message, /invalid status/);

  // the rejected create persisted nothing: the same tag is still free
  r = await encRequest(s, '/api/equipment/create', {
    token: admin, assetTag: tag, name: 'Bugfix Unit', category: 'test', locationId: 1
  });
  assert.equal(r.status, 201, JSON.stringify(r.decrypted));
});
