'use strict';


const LabRC4 = require('../../../shared/protocol/rc4.js');
const LabEnvelope = require('../../../shared/protocol/envelope.js');
const { findSession } = require('./sessions');

const B64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isStrictBase64(s) {
  return typeof s === 'string' && s.length > 0 && s.length % 4 === 0 && B64_RE.test(s);
}

function envelopeMiddleware(req, res, next) {
  const env = req.body;

  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    return res.status(400).json({ error: 'missing_envelope', message: 'expected {sid, alg, data} envelope' });
  }
  if (typeof env.sid !== 'string' || env.sid.length === 0) {
    return res.status(400).json({ error: 'missing_sid' });
  }
  if (env.alg !== LabEnvelope.ALG) {
    return res.status(400).json({ error: 'unsupported_algorithm', expected: LabEnvelope.ALG });
  }
  if (typeof env.data !== 'string' || env.data.length === 0) {
    return res.status(400).json({ error: 'missing_data' });
  }
  if (!isStrictBase64(env.data)) {
    return res.status(400).json({ error: 'malformed_ciphertext', message: 'data is not valid base64' });
  }

  findSession(env.sid)
    .then((session) => {
      if (!session) {
        return res.status(401).json({ error: 'unknown_session' });
      }
      if (session.revoked) {
        return res.status(401).json({ error: 'session_revoked' });
      }
      if (new Date(session.expires_at).getTime() <= Date.now()) {
        return res.status(401).json({ error: 'session_expired' });
      }

      let text;
      try {
        const bytes = LabRC4.decryptBytes(session.key_b64, LabRC4.b64decode(env.data));
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch (e) {
        return res.status(400).json({ error: 'malformed_ciphertext', message: 'ciphertext did not decode to valid UTF-8 text' });
      }

      let payload;
      try {
        payload = JSON.parse(text);
      } catch (e) {
        return res.status(400).json({ error: 'malformed_decrypted_json' });
      }

      req.body = payload;
      req.labSession = session;

      
      const origJson = res.json.bind(res);
      res.json = (body) => {
        res.set('X-Lab-Encrypted', LabEnvelope.ALG);
        return origJson(LabEnvelope.seal(session.session_id, session.key_b64, body === undefined ? null : body));
      };
      next();
    })
    .catch(next);
}

module.exports = { envelopeMiddleware, isStrictBase64 };
