'use strict';

/*
 * Application authentication tokens (synthetic, coursework-grade mechanism).
 *
 * Deliberately separate from the RC4 transport session in sessions.js:
 *   - RC4 session  = envelope key for one HTTP conversation (issued by
 *                    POST /api/session/key, key sent readable).
 *   - app token    = proves WHICH user is talking, minted by
 *                    POST /api/auth/login, random and opaque.
 *
 * Tokens live in process memory: an API restart logs everyone out.
 */
const crypto = require('node:crypto');

const tokens = new Map();

function issueToken(user) {
  const token = 'labtok-' + crypto.randomBytes(24).toString('hex');
  tokens.set(token, {
    token,
    userId: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    createdAt: new Date().toISOString()
  });
  return tokens.get(token);
}

function resolveToken(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  return tokens.get(token) || null;
}

function revokeToken(token) {
  tokens.delete(token);
}

module.exports = { issueToken, resolveToken, revokeToken };
