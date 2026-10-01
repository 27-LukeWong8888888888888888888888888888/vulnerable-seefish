'use strict';

/*
 * RC4 transport-session store, backed by the rc4_sessions table.
 *
 * This is the session whose key is handed out in readable JSON by
 * POST /api/session/key — deliberately exposed by the assignment spec.
 * It is NOT the application login: see appTokens.js for that.
 */
const crypto = require('node:crypto');
const { query } = require('./db');
const config = require('./config');

async function createSession({ ttlSeconds = config.sessionTtlSeconds } = {}) {
  const sessionId = 'sess-' + crypto.randomBytes(16).toString('hex');
  const keyB64 = crypto.randomBytes(16).toString('base64');
  await query(
    `INSERT INTO rc4_sessions (session_id, key_b64, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [sessionId, keyB64, ttlSeconds]
  );
  return { sessionId, keyB64, expiresIn: ttlSeconds };
}

async function findSession(sessionId) {
  const { rows } = await query(
    `SELECT session_id, key_b64, expires_at, revoked
       FROM rc4_sessions
      WHERE session_id = $1`,
    [sessionId]
  );
  return rows[0] || null;
}

async function revokeSession(sessionId) {
  await query('UPDATE rc4_sessions SET revoked = TRUE WHERE session_id = $1', [sessionId]);
}

module.exports = { createSession, findSession, revokeSession };
