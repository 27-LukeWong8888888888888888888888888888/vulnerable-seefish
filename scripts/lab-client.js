#!/usr/bin/env node
'use strict';

/*
 * lab-client.js — CLI helper for the RC4 encrypted application protocol.
 *
 * Performs the full cycle: request /api/session/key, cache the session,
 * encrypt an arbitrary JSON payload, send it to any endpoint, decrypt the
 * envelope response, print the JSON. Later phases use this to demonstrate
 * the protocol weaknesses and vulnerabilities.
 *
 * Usage:
 *   node scripts/lab-client.js --endpoint /api/auth/login \
 *       --payload '{"username":"alice","password":"StudentPass!23"}'
 *
 * Options:
 *   --endpoint, -e   API path, e.g. /api/equipment        (required)
 *   --method,  -m    HTTP method                         (default POST)
 *   --payload, -p    JSON string sent as the request body (default {})
 *   --base,    -b    API base URL                        (default http://127.0.0.1:3000)
 *   --fresh,   -f    force a new /api/session/key handshake
 *   --no-auth        do not attach the cached login token to the payload
 *
 * Session cache: a small JSON file (default: .lab-session.json next to this
 * script; override with LAB_SESSION_FILE) holding sid, key and login token.
 */
const fs = require('node:fs');
const path = require('node:path');

const LabRC4 = require('../shared/protocol/rc4.js');
const LabEnvelope = require('../shared/protocol/envelope.js');

function parseArgs(argv) {
  const args = {
    method: 'POST',
    payload: {},
    base: process.env.LAB_BASE || 'http://127.0.0.1:3000',
    fresh: false,
    noAuth: false
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--endpoint': case '-e': args.endpoint = next(); break;
      case '--method': case '-m': args.method = next().toUpperCase(); break;
      case '--payload': case '-p': args.payload = JSON.parse(next()); break;
      case '--base': case '-b': args.base = next().replace(/\/$/, ''); break;
      case '--fresh': case '-f': args.fresh = true; break;
      case '--no-auth': args.noAuth = true; break;
      case '--help': case '-h':
        console.log('Usage: lab-client.js --endpoint /api/... [--method POST] [--payload \'{"k":1}\'] [--base URL] [--fresh] [--no-auth]');
        process.exit(0);
      default:
        console.error(`unknown argument: ${a}`);
        process.exit(2);
    }
  }
  if (!args.endpoint) {
    console.error('missing required --endpoint');
    process.exit(2);
  }
  return args;
}

const SESSION_FILE = process.env.LAB_SESSION_FILE || path.join(__dirname, '.lab-session.json');

function loadSession() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveSession(s) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(s, null, 2));
}

async function requestKey(base) {
  const res = await fetch(base + '/api/session/key', { method: 'POST' });
  const body = await res.json();
  if (!res.ok) throw new Error(`session/key failed: HTTP ${res.status} ${JSON.stringify(body)}`);
  return { sid: body.sessionId, key: body.key, token: null, base };
}

async function main() {
  const args = parseArgs(process.argv);

  let session = args.fresh ? null : loadSession();
  if (!session || session.base !== args.base || !session.sid || !session.key) {
    session = await requestKey(args.base);
    saveSession(session);
    console.error(`[lab-client] new RC4 session: ${session.sid}`);
  }

  const payload = { ...(args.payload || {}) };
  if (!args.noAuth && session.token && payload.token === undefined) {
    payload.token = session.token;
  }

  const envelope = LabEnvelope.seal(session.sid, session.key, payload);
  const res = await fetch(args.base + args.endpoint, {
    method: args.method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(envelope)
  });

  const rawText = await res.text();
  let raw;
  try {
    raw = JSON.parse(rawText);
  } catch (e) {
    console.error(`[lab-client] non-JSON response (HTTP ${res.status}):`);
    console.log(rawText);
    process.exit(1);
  }

  if (raw && typeof raw === 'object' && raw.sid && raw.data) {
    let decrypted;
    try {
      decrypted = LabEnvelope.open(session.key, raw);
    } catch (e) {
      console.error(`[lab-client] failed to decrypt response envelope: ${e.message}`);
      process.exit(1);
    }
    if (decrypted && typeof decrypted === 'object' && decrypted.token) {
      session.token = decrypted.token;
      saveSession(session);
    }
    console.log(JSON.stringify(decrypted, null, 2));
  } else {
    // Plaintext error before a valid session existed (e.g. unknown_session).
    console.error(`[lab-client] plaintext response (HTTP ${res.status}):`);
    console.log(JSON.stringify(raw, null, 2));
  }
  process.exit(res.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`[lab-client] ${err.message}`);
  process.exit(1);
});
