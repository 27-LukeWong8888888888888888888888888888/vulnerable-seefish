'use strict';


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
    notice: 'SYNTHETIC device-admin challenge value for the security lab. NOT a real credential.',
    challenge: CHALLENGE,
    access: 'internal-network-only'
  };
}

const CHALLENGE = 'LAB{device_admin_console_reached}';

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
