'use strict';

/*
 * V4 file-read sink (main process).
 *
 * Intended design: serve equipment manuals out of resources/manuals/ to the
 * renderer's file viewer. The renderer supplies just a filename.
 */
const fs = require('node:fs/promises');
const path = require('node:path');

const MANUALS_DIR = path.join(__dirname, 'resources', 'manuals');

// VULN-V4: INTENTIONAL UNSAFE IPC FILE READ — `requested` is
// renderer-controlled and is joined onto the manuals directory with NO path
// validation: no basename() restriction, no resolve-and-prefix check. A
// traversal such as '../proof/v4-proof.txt' therefore escapes the intended
// manuals area and reads any file the desktop user can read.
// Do not fix — intentional coursework vulnerability.
// See docs/vulnerabilities/V4-UNSAFE-IPC.md; the demonstration is confined
// to the designated proof file under resources/proof/.
async function readManual(requested) {
  if (typeof requested !== 'string' || requested.length === 0) {
    throw new Error('filename required');
  }
  return fs.readFile(path.join(MANUALS_DIR, requested), 'utf8');
}

module.exports = { readManual, MANUALS_DIR };
