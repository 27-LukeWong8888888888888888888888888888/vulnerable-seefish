#!/usr/bin/env node
'use strict';

/*
 * pack-asar.js — package the Electron client into client/app.asar (Phase 7).
 *
 * Stages a minimal app tree (.asar-build/) that mirrors the repo's two-level
 * layout — client/ sources + the shared protocol module at shared/ — because
 * client/api-client.js requires '../../shared/protocol' style relative paths
 * ('../shared/protocol/envelope.js'). Packing the staged tree keeps those
 * relative requires intact inside the archive, so the app runs unmodified
 * from the ASAR:  electron --no-sandbox app.asar
 *
 * node_modules is deliberately NOT packed (it contains the Electron binary,
 * which must stay on the real filesystem).
 *
 * The archive intentionally contains resources/lab-app-config.json with the
 * synthetic V1 token in cleartext — recoverability is the lab requirement
 * (see docs/vulnerabilities/V1-HARDCODED-TOKEN.md). Do not obfuscate it.
 *
 * Usage:  node scripts/pack-asar.js   (or: npm run pack)
 */
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const CLIENT = path.join(__dirname, '..');
const REPO = path.join(CLIENT, '..');
const STAGE = path.join(CLIENT, '.asar-build');
const OUT = path.join(CLIENT, 'app.asar');

const APP_FILES = ['main.js', 'preload.js', 'api-client.js', 'v4-file-read.js', 'package.json'];
const COPY_DIRS = ['renderer', 'resources'];

// every file that must be present for the packaged app to work (and the V1
// lab artifact to be recoverable)
const REQUIRED = [
  'package.json',
  'client/main.js',
  'client/preload.js',
  'client/api-client.js',
  'client/v4-file-read.js',
  'client/package.json',
  'client/renderer/index.html',
  'client/renderer/app.js',
  'client/renderer/smoke.html',
  'client/resources/lab-app-config.json',
  'client/resources/manuals/equipment-manual.txt',
  'client/resources/proof/v4-proof.txt',
  'shared/protocol/rc4.js',
  'shared/protocol/envelope.js'
];

function rm(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.asar')) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

async function main() {
  rm(STAGE);
  rm(OUT);
  fs.mkdirSync(path.join(STAGE, 'client'), { recursive: true });

  for (const f of APP_FILES) {
    fs.copyFileSync(path.join(CLIENT, f), path.join(STAGE, 'client', f));
  }
  // root package.json steers Electron's app entry to the nested client dir
  const pkg = JSON.parse(fs.readFileSync(path.join(STAGE, 'client', 'package.json'), 'utf8'));
  pkg.main = 'client/main.js';
  fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

  for (const d of COPY_DIRS) copyDir(path.join(CLIENT, d), path.join(STAGE, 'client', d));
  copyDir(path.join(REPO, 'shared'), path.join(STAGE, 'shared'));

  await asar.createPackage(STAGE, OUT);
  rm(STAGE);

  const files = asar.listPackage(OUT).map((p) => p.replace(/^[/\\]/, ''));
  const missing = REQUIRED.filter((r) => !files.includes(r));
  if (missing.length > 0) {
    console.error('FAIL — archive is missing expected entries: ' + missing.join(', '));
    process.exit(1);
  }

  const cfg = JSON.parse(asar.extractFile(OUT, 'client/resources/lab-app-config.json').toString('utf8'));
  if (!/^FS-LAB-/.test(cfg.fieldService && cfg.fieldService.token)) {
    console.error('FAIL — synthetic V1 token not found in packaged lab-app-config.json');
    process.exit(1);
  }

  const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
  console.log(`packed ${files.length} files -> ${path.relative(REPO, OUT)} (${mb} MiB)`);
  console.log(`contents include: client/resources/lab-app-config.json (synthetic V1 token: ${cfg.fieldService.token})`);
  console.log('run packaged app:  (cd client && ./node_modules/.bin/electron --no-sandbox app.asar)');
}

main().catch((err) => {
  rm(STAGE);
  console.error('[pack-asar] ' + (err && err.message));
  process.exit(1);
});
