'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { setupDataDir, teardown, TMP_ROOT } = require('./_setup.cjs');
setupDataDir();

const { close, dbPath } = require('../lib/db.cjs');
const migrations = require('../lib/migrations.cjs');
const downloads = require('../lib/downloads.cjs');

function fresh() {
  close();
  for (const ext of ['', '-wal', '-shm']) {
    const p = dbPath() + ext;
    if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch (_) { /* */ }
  }
}

fresh();
migrations.runMigrations();

const tests = [];

// Spin up a tiny local HTTPS-ish server. The downloads module insists on
// https://, so we override the URL and the allowlist with a function that
// trusts our local host. We do this by reaching into the module: the
// fetchToFile function takes allowlist(host) => bool. We use http:// in
// tests by monkey-patching the protocol check; this is a test-only escape
// hatch we expose below.
const _orig = downloads.fetchToFile;

// Test-only downloader that uses http://. Mirrors fetchToFile but skips
// the protocol check.
async function fetchHttpToFile(url, destPath, opts = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:') throw new downloads.DownloadError('test: only http', 'test_protocol');
  if (opts.allowlist && !opts.allowlist(parsed.host)) throw new downloads.DownloadError('blocked', 'origin_blocked');
  return _orig(url, destPath, { ...opts });
}

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

tests.push(async function okDownload() {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end('hello world');
  });
  try {
    const dest = path.join(TMP_ROOT, 'dl-ok.bin');
    const r = await downloads.fetchToFile(url + '/file', dest, { allowInsecure: true, allowlist: () => true });
    assert.ok(r.ok, 'download should succeed');
    assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'hello world');
  } finally { server.close(); }
});

tests.push(async function sizeLimit() {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end(Buffer.alloc(1024 * 1024));
  });
  try {
    const dest = path.join(TMP_ROOT, 'dl-big.bin');
    let caught = null;
    try {
      await downloads.fetchToFile(url + '/file', dest, { allowInsecure: true, allowlist: () => true, maxBytes: 1024 });
    } catch (e) { caught = e; }
    assert.ok(caught, 'expected a download error');
    assert.ok(caught.code === 'too_large' || caught.code === 'fetch_failed',
      `unexpected code: ${caught.code}`);
  } finally { server.close(); }
});

tests.push(async function hashMismatch() {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end('hello');
  });
  try {
    const dest = path.join(TMP_ROOT, 'dl-hash.bin');
    let caught = null;
    try {
      await downloads.fetchToFile(url + '/file', dest, {
        allowInsecure: true,
        allowlist: () => true,
        expectedSha256: '0'.repeat(64),
      });
    } catch (e) { caught = e; }
    assert.ok(caught, 'expected a hash mismatch error');
    assert.strictEqual(caught.code, 'hash_mismatch');
    assert.ok(!fs.existsSync(dest), 'part file should be cleaned up');
  } finally { server.close(); }
});

tests.push(async function httpRefused() {
  let caught = null;
  try {
    await downloads.fetchToFile('http://example.com/file', '/tmp/dl-refused.bin', { allowlist: () => true });
  } catch (e) { caught = e; }
  assert.ok(caught, 'expected a protocol refusal');
  assert.strictEqual(caught.code, 'insecure_scheme');
});

tests.push(async function allowlistBlocks() {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200); res.end('x');
  });
  try {
    let caught = null;
    try {
      await downloads.fetchToFile(url + '/file', path.join(TMP_ROOT, 'dl-blocked.bin'),
        { allowInsecure: true, allowlist: (host) => host === 'blocked.example' });
    } catch (e) { caught = e; }
    assert.ok(caught, 'expected an allowlist block');
    assert.strictEqual(caught.code, 'origin_blocked');
  } finally { server.close(); }
});

tests.push(async function cacheFresh() {
  const cache = downloads.newCacheEntry({ key: 'k1', source: 'test', url: 'https://example.invalid' });
  cache.retrievedAt = Date.now();
  cache.path = path.join(TMP_ROOT, 'dl-cache-existing.bin');
  fs.writeFileSync(cache.path, 'cached-body');
  const r = await downloads.fetchWithCache({ cache, destPath: path.join(TMP_ROOT, 'dl-cache.bin'), opts: { allowInsecure: true, allowlist: () => true } });
  assert.ok(r.cached, 'should use cache');
  assert.strictEqual(r.path, cache.path);
  assert.strictEqual(fs.readFileSync(r.path, 'utf8'), 'cached-body');
});

(async function run() {
  let failed = 0;
  for (let i = 0; i < tests.length; i++) {
    try {
      await tests[i]();
      console.log(`ok  downloads test ${i + 1}`);
    } catch (e) {
      failed++;
      console.error(`FAIL  downloads test ${i + 1}: ${e.message}\n${e.stack}`);
    }
  }
  close();
  teardown();
  if (failed) { console.error(`FAIL  ${failed} downloads test(s) failed`); process.exit(1); }
  console.log('PASS  foundation-downloads');
})();
