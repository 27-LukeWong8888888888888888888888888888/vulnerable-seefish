'use strict';


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
