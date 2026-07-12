'use strict';

/*
 * Test bootstrap: redirect the database to a temp file, reset the singleton,
 * and clean up. Every test file calls this once at the top.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'lodestone-test-'));

function setupDataDir() {
  // Override the data directory for this test process. We do this by
  // monkey-patching the db module's constants via the test process's
  // own requires: tests import the lib modules directly, and we reset
  // module-level paths through NODE_DATADIR.
  process.env.LODESTONE_DATA_DIR = path.join(TMP_ROOT, 'data');
  fs.mkdirSync(process.env.LODESTONE_DATA_DIR, { recursive: true });
}

function teardown() {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) { /* */ }
}

module.exports = { setupDataDir, teardown, TMP_ROOT };
