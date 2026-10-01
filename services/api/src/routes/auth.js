'use strict';

/*
 * Application authentication, inside the encrypted envelope:
 *   POST /api/auth/login   {username, password} -> {token, user}
 *   POST /api/auth/logout  {token} -> {ok: true}
 *   POST /api/auth/me      {token} -> {user}
 *
 * Passwords are verified against the bcrypt hashes seeded with pgcrypto:
 * crypt($2, password_hash) recomputes the hash with the stored salt and
 * matches only when the password is right. Parameterized; no MD5, no
 * plaintext password storage.
 */
const express = require('express');
const { query } = require('../db');
const { issueToken, revokeToken } = require('../appTokens');
const { requireAuth } = require('../requireAuth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ error: 'validation_failed', message: 'username and password are required' });
    }
    const { rows } = await query(
      `SELECT id, username, display_name, role
         FROM users
        WHERE username = $1 AND password_hash = crypt($2, password_hash)`,
      [username, password]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    const record = issueToken(rows[0]);
    res.json({
      token: record.token,
      user: {
        id: record.userId,
        username: record.username,
        displayName: record.displayName,
        role: record.role
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, (req, res) => {
  revokeToken(req.user.token);
  res.json({ ok: true });
});

router.post('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.userId,
      username: req.user.username,
      displayName: req.user.displayName,
      role: req.user.role
    }
  });
});

module.exports = router;
