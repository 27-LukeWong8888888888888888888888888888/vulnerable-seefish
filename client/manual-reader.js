'use strict';

/*
 * Manual-reader file sink (main process).
 *
 * Intended design: serve equipment manuals out of resources/manuals/ to the
 * renderer's file viewer. The renderer supplies just a filename.
 */
const fs = require('node:fs/promises');
const path = require('node:path');

const MANUALS_DIR = path.join(__dirname, 'resources', 'manuals');

// NOTE: `requested` is renderer-controlled and is joined onto the manuals
// directory with NO path validation: no basename() restriction, no
// resolve-and-prefix check. A relative path such as '../internal/ops-memo.txt'
// therefore escapes the intended manuals area and reads any file the
// desktop user can read. Do not change this behavior — the lab exercises
// depend on it.
async function readManual(requested) {
  if (typeof requested !== 'string' || requested.length === 0) {
    throw new Error('filename required');
  }
  return fs.readFile(path.join(MANUALS_DIR, requested), 'utf8');
}

module.exports = { readManual, MANUALS_DIR };
