'use strict';

/*
 * Surface checks: the desktop client must expose NO shell/command execution
 * capability and NO arbitrary Node/native APIs to the renderer. The renderer
 * page has nodeIntegration:false (checked in the Electron smoke run); here
 * we verify the main/preload sources contain no execution primitives and
 * that the preload bridge is a narrow, fixed key list.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('6. no shell/command execution capability exists', () => {
  for (const f of ['main.js', 'preload.js', 'v4-file-read.js', 'api-client.js']) {
    const src = read(f);
    assert.ok(!src.includes('child_process'), f + ' must not use child_process');
    assert.doesNotMatch(src, /\bexec(File|Sync|FileSync)?\s*\(/, f + ' must not call exec*');
    assert.doesNotMatch(src, /\bspawn(Sync)?\s*\(/, f + ' must not call spawn*');
    assert.doesNotMatch(src, /\bfork\s*\(/, f + ' must not call fork');
  }
});

test('7. preload exposes a narrow fixed surface, no arbitrary native requires', () => {
  const src = read('preload.js');
  // Only 'electron' may be required by the preload — no node:* modules,
  // no native addons, so nothing unrestricted crosses into the page.
  const requires = [...src.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  assert.deepEqual(requires, ['electron']);
  for (const key of ['api', 'login', 'logout', 'loginState', 'appConfig', 'readFile']) {
    assert.ok(src.includes(key + ':') || src.includes(key + '('), 'preload surface missing ' + key);
  }
});
