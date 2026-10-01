'use strict';

/*
 * Main-process API client for the lab API.
 *
 * Owns the RC4 transport session AND the application login token, so the
 * renderer (which has no Node integration) never handles keys or ciphertext.
 * Reuses the shared protocol module from the repo root — no second RC4
 * implementation.
 *
 *   RC4 session (sid + key)   : transport encryption, from POST /api/session/key
 *   application token (labtok): identity/role, from POST /api/auth/login,
 *                               attached to every subsequent payload
 *   field-service token (FS-) : separate static synthetic config secret (V1),
 *                               sent as the X-Field-Token header, never used here
 */
const LabEnvelope = require('../shared/protocol/envelope.js');

const SESSION_RETRY_ERRORS = new Set(['unknown_session', 'session_revoked', 'session_expired']);

class ApiClient {
  constructor(base) {
    this.base = base;
    this.session = null;
    this.token = null;
    this.user = null;
  }

  async ensureSession() {
    if (this.session && this.session.expiresAt > Date.now() + 5000) return;
    const res = await fetch(this.base + '/api/session/key', { method: 'POST' });
    if (!res.ok) {
      throw new Error('session/key failed: HTTP ' + res.status + ' ' + (await res.text()));
    }
    const body = await res.json();
    if (!body.sessionId || !body.key) {
      throw new Error('session/key returned no sessionId/key: ' + JSON.stringify(body));
    }
    this.session = {
      sessionId: body.sessionId,
      key: body.key,
      expiresAt: Date.now() + (body.expiresIn || 3600) * 1000
    };
  }

  async call(endpoint, payload = {}, headers = {}) {
    await this.ensureSession();
    const body = { ...payload };
    if (this.token) body.token = this.token;
    return this.#send(endpoint, body, headers);
  }

  async #send(endpoint, body, headers) {
    const res = await fetch(this.base + endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(LabEnvelope.seal(this.session.sessionId, this.session.key, body))
    });
    const raw = await res.json();
    // Plaintext protocol errors (pre-decryption) carry no `data`; sealed
    // responses (including downstream handler errors) are opened here.
    const opened = raw && typeof raw.data === 'string' ? LabEnvelope.open(this.session.key, raw) : raw;
    if (SESSION_RETRY_ERRORS.has(opened && opened.error)) {
      this.session = null;
      await this.ensureSession();
      const res2 = await fetch(this.base + endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(LabEnvelope.seal(this.session.sessionId, this.session.key, body))
      });
      const raw2 = await res2.json();
      const opened2 = raw2 && typeof raw2.data === 'string' ? LabEnvelope.open(this.session.key, raw2) : raw2;
      return { status: res2.status, body: opened2 };
    }
    return { status: res.status, body: opened };
  }

  async login(username, password) {
    const r = await this.call('/api/auth/login', { username, password });
    if (r.status !== 200 || !r.body.token) {
      throw new Error('login failed: HTTP ' + r.status + ' ' + JSON.stringify(r.body));
    }
    this.token = r.body.token;
    this.user = r.body.user;
    return r.body;
  }

  async logout() {
    if (!this.token) return;
    try {
      await this.call('/api/auth/logout', {});
    } finally {
      this.token = null;
      this.user = null;
    }
  }
}

module.exports = { ApiClient };
