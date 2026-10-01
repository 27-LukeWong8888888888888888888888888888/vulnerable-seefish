/*
 * Protocol verification tests — no framework, plain node:test.
 * Run inside a throwaway Node container (no host Node required):
 *
 *   docker run --rm -v "$PWD/shared:/src" -w /src/protocol \
 *     node:22-alpine node --test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const LabRC4 = require('./rc4.js');
const LabEnvelope = require('./envelope.js');

function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

test('RC4 known-answer vector: key "Key", "Plaintext"', () => {
  const ct = LabRC4.encryptBytes('Key', new TextEncoder().encode('Plaintext'));
  assert.equal(hex(ct), 'bbf316e8d940af0ad3');
});

test('RC4 known-answer vector: key "Wiki", "pedia"', () => {
  const ct = LabRC4.encryptBytes('Wiki', new TextEncoder().encode('pedia'));
  assert.equal(hex(ct), '1021bf0420');
});

test('RC4 known-answer vector: key "Secret", "Attack at dawn"', () => {
  const ct = LabRC4.encryptBytes('Secret', new TextEncoder().encode('Attack at dawn'));
  assert.equal(hex(ct), '45a01f645fc35b383552544b9bf5');
});

test('encrypt/decrypt round-trip with a Base64 session key', () => {
  const key = LabRC4.b64encode(new TextEncoder().encode('0123456789abcdef'));
  const b64 = LabRC4.encryptText(key, '{"hello":"world"}');
  assert.equal(LabRC4.decryptText(key, b64), '{"hello":"world"}');
});

test('envelope seal/open round-trip', () => {
  const key = LabRC4.b64encode(new TextEncoder().encode('0123456789abcdef'));
  const env = LabEnvelope.seal('sess-1', key, { user: 'alice', n: 7 });
  assert.equal(env.sid, 'sess-1');
  assert.equal(env.alg, 'RC4');
  assert.deepEqual(LabEnvelope.open(key, env), { user: 'alice', n: 7 });
});

test('envelope open rejects garbage ciphertext', () => {
  const key = LabRC4.b64encode(new TextEncoder().encode('0123456789abcdef'));
  assert.throws(() => LabEnvelope.open(key, { sid: 'sess-1', data: '!!!not-base64!!!' }));
});

test('documented weakness: keystream reuse across messages under one key', () => {
  // No nonce/IV means every message under a session key uses the same
  // keystream: C1 XOR C2 == P1 XOR P2, so a known plaintext reveals the
  // keystream and decrypts every other message in the session.
  const key = LabRC4.b64encode(new TextEncoder().encode('0123456789abcdef'));
  // The known plaintext must be at least as long as the target: the XOR
  // trick only exposes the keystream for bytes we already know.
  const c1 = LabRC4.encryptText(key, '{"status":"known-plaintext"}');
  const c2 = LabRC4.encryptText(key, '{"role":"student"}');
  const b1 = LabRC4.b64decode(c1);
  const b2 = LabRC4.b64decode(c2);
  const p1 = new TextEncoder().encode('{"status":"known-plaintext"}');
  const recovered = new Uint8Array(b2.length);
  for (let i = 0; i < b2.length; i++) recovered[i] = b1[i] ^ b2[i] ^ p1[i];
  assert.equal(new TextDecoder().decode(recovered), '{"role":"student"}');
});
