/*
 * RC4 stream cipher (KSA + PRGA). Shared, dependency-free, no build step.
 *
 * Loaded by the Express API under Node (module.exports) and by the Electron
 * renderer in the browser (globalThis.LabRC4). Same keystream for encrypt and
 * decrypt, as RC4 is a stream cipher.
 *
 * SECURITY NOTE (documented lab weakness): a fresh keystream is started from
 * the session key for EVERY message, with no nonce and no IV. The same
 * keystream is therefore reused across all messages under one session key.
 * See docs/PROTOCOL-RC4.md (Phase 8) and shared/protocol/protocol.test.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LabRC4 = factory();
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  function normalizeKey(key) {
    if (key instanceof Uint8Array) return key;
    if (typeof key === 'string') return new TextEncoder().encode(key);
    throw new TypeError('key must be a string or Uint8Array');
  }

  // Returns a stateful keystream function: given bytes, returns XORed bytes.
  function keystream(key) {
    const K = normalizeKey(key);
    const S = new Uint8Array(256);
    for (let i = 0; i < 256; i++) S[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + S[i] + K[i % K.length]) & 0xff;
      const t = S[i]; S[i] = S[j]; S[j] = t;
    }
    let i = 0;
    j = 0;
    return function (data) {
      const out = new Uint8Array(data.length);
      for (let n = 0; n < data.length; n++) {
        i = (i + 1) & 0xff;
        j = (j + S[i]) & 0xff;
        const t = S[i]; S[i] = S[j]; S[j] = t;
        out[n] = data[n] ^ S[(S[i] + S[j]) & 0xff];
      }
      return out;
    };
  }

  function b64encode(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  function b64decode(str) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'));
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  return {
    keystream,
    b64encode,
    b64decode,
    encryptBytes(key, data) { return keystream(key)(data); },
    decryptBytes(key, data) { return keystream(key)(data); },
    encryptText(key, text) { return b64encode(keystream(key)(new TextEncoder().encode(text))); },
    decryptText(key, b64) { return new TextDecoder().decode(keystream(key)(b64decode(b64))); }
  };
});
