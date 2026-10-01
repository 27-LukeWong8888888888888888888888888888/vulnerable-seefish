'use strict';

/*
 * POST /api/session/key — plaintext endpoint.
 * Issues a fresh RC4 session key in READABLE JSON over plain HTTP
 * (deliberate protocol weakness; the assignment forbids TLS/PSK/PKI here).
 */
const express = require('express');
const { createSession } = require('../sessions');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const session = await createSession();
    res.json({
      sessionId: session.sessionId,
      key: session.keyB64,
      algorithm: 'RC4',
      expiresIn: session.expiresIn
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
