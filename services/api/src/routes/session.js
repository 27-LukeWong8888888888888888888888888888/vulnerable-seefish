'use strict';


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
