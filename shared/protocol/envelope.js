/*
 * Encrypted application envelope shared by client and server.
 *
 *   { "sid": "<sessionId>", "alg": "RC4", "data": "<base64(RC4(key, JSON))>" }
 *
 * - `sid` lets the server look up the session key it issued via
 *   POST /api/session/key and reject requests without a valid active session.
 * - The envelope carries no MAC, so ciphertext is malleable (documented
 *   weakness; see shared/protocol/protocol.test.js).
 *
 * Dual export: Node (module.exports) and browser (globalThis.LabEnvelope).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rc4.js'));
  } else {
    root.LabEnvelope = factory(root.LabRC4);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (LabRC4) {
  'use strict';

  const ALG = 'RC4';

  function seal(sessionId, keyB64, payload) {
    return {
      sid: sessionId,
      alg: ALG,
      data: LabRC4.encryptText(keyB64, JSON.stringify(payload))
    };
  }

  function open(keyB64, envelope) {
    if (!envelope || typeof envelope.data !== 'string') {
      throw new Error('envelope missing "data"');
    }
    const text = LabRC4.decryptText(keyB64, envelope.data);
    return JSON.parse(text);
  }

  return { ALG, seal, open };
});
