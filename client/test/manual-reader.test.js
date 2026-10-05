'use strict';

/*
 * Manual-reader tests — exercise the exact handler the ipcMain.handle
 * ('lab:read-file') delegate calls, without needing a display. The full
 * renderer -> preload -> IPC -> main chain is covered separately by the
 * Electron smoke run (client/scripts/smoke-electron.sh).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readManual, MANUALS_DIR } = require('../manual-reader.js');

test('1. normal file under resources/manuals can be read', async () => {
  const text = await readManual('equipment-manual.txt');
  assert.match(text, /EQ-1001 Environmental Chamber XL/);
});

test('2. renderer-controlled path is passed through the sink unvalidated', async () => {
  const requested = '../internal/ops-memo.txt';
  const resolved = path.join(MANUALS_DIR, requested);
  assert.ok(
    !resolved.startsWith(MANUALS_DIR + path.sep),
    'proof: the joined path must land OUTSIDE the manuals directory'
  );
  // The sink accepts the relative-path string verbatim — it must not throw.
  const text = await readManual(requested);
  assert.ok(text.length > 0);
});

test('3+4+5. relative path escapes manuals dir and returns the ops memo with the marker', async () => {
  const text = await readManual('../internal/ops-memo.txt');
  assert.match(text, /internal operations memo/i);
  assert.match(text, /LAB\{internal_notes_recovered\}/);
});
