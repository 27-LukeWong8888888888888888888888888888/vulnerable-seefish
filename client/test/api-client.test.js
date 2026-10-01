'use strict';

/*
 * Main-process API client integration test — runs on the host against the
 * live lab API in Docker (same path the Electron app uses at runtime:
 * session/key handshake -> sealed login -> sealed authenticated calls).
 * Requires the compose stack to be up.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiClient } = require('../api-client.js');

const BASE = process.env.LAB_API_BASE || 'http://127.0.0.1:3000';
const api = new ApiClient(BASE);

test('0. lab API is reachable', async () => {
  const res = await fetch(BASE + '/health');
  assert.equal(res.status, 200, 'API not reachable at ' + BASE + ' — is the compose stack up?');
});

test('1. RC4 session handshake via POST /api/session/key', async () => {
  await api.ensureSession();
  assert.ok(api.session.sessionId, 'sessionId present');
  assert.ok(api.session.key, 'key present');
});

test('2. unauthenticated auth/me is rejected inside the envelope', async () => {
  const res = await api.call('/api/auth/me', {});
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'auth_required');
});

test('3. login issues an application token (distinct from the RC4 session)', async () => {
  const res = await api.login('alice', 'StudentPass!23');
  assert.equal(res.user.username, 'alice');
  assert.match(res.token, /^labtok-/);
  assert.notEqual(res.token, api.session.sessionId, 'app token must differ from RC4 session id');
});

test('4. authenticated call succeeds and lists equipment', async () => {
  const me = await api.call('/api/auth/me', {});
  assert.equal(me.status, 200);
  assert.equal(me.body.user.username, 'alice');
  const eq = await api.call('/api/equipment/list', {});
  assert.equal(eq.status, 200);
  assert.ok(Array.isArray(eq.body) && eq.body.length > 0, 'equipment list non-empty');
});

test('5. logout revokes the application token', async () => {
  await api.logout();
  assert.equal(api.token, null);
  const me = await api.call('/api/auth/me', {});
  assert.equal(me.status, 401);
});
