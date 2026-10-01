'use strict';

/*
 * Simulated internal laboratory device (Phase 4) — synthetic JSON service.
 *
 * Plain node:http, no framework, no dependencies. This container models an
 * instrument that lives on the campus-internal lab network only. It is the
 * future SSRF target (Phase 5): reachable FROM the api container by Docker
 * service-name DNS (http://lab-device:8080), unreachable from the host.
 *
 * Endpoints (exactly these three, GET only, JSON only):
 *   GET /api/status       deviceId, type, state, location, uptimeSec
 *   GET /api/diagnostics  temperatureC, firmwareVersion, errorCount, lastMaintenance
 *   GET /api/admin        SYNTHETIC challenge value for the Phase 5 SSRF
 *                         exercise — NOT a real credential.
 *
 * All values are synthetic.
 */
const http = require('node:http');

const PORT = Number(process.env.DEVICE_PORT || 8080);
const STARTED = Date.now();

const META = {
  deviceId: 'LABDEV-1001',
  type: 'environmental-chamber',
  location: 'Bldg C — 214 (Environmental Lab)'
};

function uptimeSec() {
  return Math.floor((Date.now() - STARTED) / 1000);
}

// Small deterministic wobble so repeated reads look like a live sensor
// without needing any state or randomness.
function temperatureC() {
  return 21.5 + 1.5 * Math.sin(uptimeSec() / 180);
}

function statusPayload() {
  return {
    deviceId: META.deviceId,
    type: META.type,
    state: 'idle',
    location: META.location,
    uptimeSec: uptimeSec()
  };
}

function diagnosticsPayload() {
  return {
    temperatureC: Number(temperatureC().toFixed(1)),
    firmwareVersion: '3.1.7-lab',
    errorCount: 0,
    lastMaintenance: '2026-08-14T09:30:00.000Z'
  };
}

function adminPayload() {
  return {
    notice: 'SYNTHETIC challenge value for the security-lab SSRF exercise (Phase 5). NOT a real credential.',
    challenge: 'LAB{ssrf_internal_device_reached}',
    access: 'internal-network-only'
  };
}

const ROUTES = {
  '/api/status': statusPayload,
  '/api/diagnostics': diagnosticsPayload,
  '/api/admin': adminPayload
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://lab-device');
  if (req.method !== 'GET' || !ROUTES[url.pathname]) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(ROUTES[url.pathname]()));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`lab-device (${META.deviceId}) listening on 0.0.0.0:${PORT}`);
  console.log('endpoints: GET /api/status, GET /api/diagnostics, GET /api/admin');
});
