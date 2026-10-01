#!/usr/bin/env node
'use strict';

/*
 * device-probe.js — connectivity check FROM the api container TO the
 * simulated lab device over the lab-internal network (Phase 4).
 *
 * Demonstrates — independently of any SSRF endpoint (which is Phase 5) —
 * that the api container can reach http://lab-device:8080 by Docker
 * service-name DNS and that the device returns the expected synthetic JSON.
 *
 * Run:  docker compose exec api node scripts/device-probe.js
 */
const BASE = (process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : process.env.LAB_DEVICE_BASE) || 'http://lab-device:8080';

const CHALLENGE = 'LAB{ssrf_internal_device_reached}';

const EXPECTED = {
  '/api/status': ['deviceId', 'type', 'state', 'location', 'uptimeSec'],
  '/api/diagnostics': ['temperatureC', 'firmwareVersion', 'errorCount', 'lastMaintenance'],
  '/api/admin': ['notice', 'challenge', 'access']
};

async function probe(path) {
  const res = await fetch(BASE + path);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  console.log(`probing lab-device at ${BASE} (from the api container, lab-internal network)\n`);
  let ok = true;

  for (const [path, fields] of Object.entries(EXPECTED)) {
    try {
      const { status, body } = await probe(path);
      if (status !== 200 || !body || typeof body !== 'object') {
        console.log(`FAIL  GET ${path}: HTTP ${status}, body: ${JSON.stringify(body)}`);
        ok = false;
        continue;
      }
      const missing = fields.filter((f) => !(f in body));
      if (missing.length > 0) {
        console.log(`FAIL  GET ${path}: missing fields ${missing.join(', ')} — got ${JSON.stringify(body)}`);
        ok = false;
        continue;
      }
      console.log(`PASS  GET ${path} — ${JSON.stringify(body)}`);
    } catch (err) {
      console.log(`FAIL  GET ${path}: ${err.message}`);
      ok = false;
    }
  }

  // Sanity: 404 on anything else, GET-only contract.
  const other = await probe('/api/nope');
  if (other.status !== 404) {
    console.log(`FAIL  GET /api/nope should 404, got ${other.status}`);
    ok = false;
  } else {
    console.log('PASS  GET /api/nope — 404 as expected');
  }

  if (!ok) {
    console.error('\nDEVICE PROBE FAILED');
    process.exit(1);
  }
  console.log('\nDEVICE PROBE OK — api container reaches the lab device over lab-internal.');
  console.log(`challenge value present: ${CHALLENGE} (synthetic — NOT a real credential)`);
}

main().catch((err) => {
  console.error('[device-probe] ' + err.message);
  process.exit(1);
});
