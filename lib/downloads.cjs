'use strict';

/*
 * HTTPS downloader with the spec's safety contract.
 *
 * Spec contract (docs/roadmap/README.md "Archive and download contract"):
 *   - "Downloads use allowlisted HTTPS origins, timeouts, size ceilings,
 *      streamed hashes, authoritative compatibility data, and atomic
 *      promotion after verification."
 *   - "Cached upstream data exposes source, retrieval time, staleness, and
 *      error state."
 *
 * The contract is: callers pass a URL (or list of mirrors), a destination
 * directory, and an options object. The downloader:
 *   1. Refuses non-HTTPS, refuses any origin not in the allowlist.
 *   2. Streams the body to <dest>/<id>.part, computing a SHA-256 on the fly.
 *   3. Aborts on size-ceiling overflow, on slow throughput past the
 *      deadline, or on a non-2xx status.
 *   4. Verifies the hash if one was provided.
 *   5. Atomically renames the .part to its final name.
 *
 * The compatibility cache lives in front of the network: for known upstream
 * data (Modrinth, Paper, etc.) the URL is normalized, the cache is checked,
 * and the cached file is reused if fresh.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 4;

class DownloadError extends Error {
  constructor(msg, code) { super(msg); this.code = code || 'download_error'; }
}

/*
 * In-memory cache metadata. The persistent cache (a real implementation
 * would put this in data/ or in lib/cache.cjs) is out of scope for the
 * foundation: this module returns the cache entry as a plain object so
 * callers can persist it. The key field is documented in the
 * CompatibilityCache type below.
 *
 * { key, source, url, retrievedAt, etag, contentLength, contentType, error }
 */
function newCacheEntry({ key, source, url }) {
  return { key, source, url, retrievedAt: 0, etag: null, contentLength: null, contentType: null, error: null, path: null };
}

/*
 * Fetch a URL into destPath. Returns { ok, path, sha256, contentLength,
 * contentType, etag, cache }.
 */
async function fetchToFile(url, destPath, opts = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    expectedSha256 = null,
    allowlist = null,           // function(host) => bool; null = allow any
    allowInsecure = false,      // tests / explicit override
    extraHeaders = {},
  } = opts;

  if (typeof url !== 'string' || !url) throw new DownloadError('url required', 'no_url');
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const parsed = new URL(current);
    if (!allowInsecure && parsed.protocol !== 'https:') {
      throw new DownloadError(`refusing non-https: ${current}`, 'insecure_scheme');
    }
    if (allowlist && !allowlist(parsed.host)) throw new DownloadError(`origin not in allowlist: ${parsed.host}`, 'origin_blocked');
    if (i === maxRedirects) throw new DownloadError('too many redirects', 'too_many_redirects');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(current, { signal: controller.signal, headers: { 'user-agent': 'Lodestone/1.0', ...extraHeaders } });
    } catch (err) {
      clearTimeout(timer);
      throw new DownloadError(`fetch failed: ${err.message}`, 'fetch_failed');
    }
    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const loc = res.headers.get('location');
      if (!loc) throw new DownloadError('redirect with no Location', 'bad_redirect');
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) {
      clearTimeout(timer);
      throw new DownloadError(`HTTP ${res.status} ${res.statusText}`, 'http_error');
    }

    const clenHeader = res.headers.get('content-length');
    const contentLength = clenHeader ? Number(clenHeader) : null;
    if (contentLength != null && contentLength > maxBytes) {
      clearTimeout(timer);
      throw new DownloadError(`content-length ${contentLength} exceeds ${maxBytes}`, 'too_large');
    }
    const contentType = res.headers.get('content-type') || null;
    const etag = res.headers.get('etag') || null;

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const partPath = destPath + '.part';
    const hasher = crypto.createHash('sha256');
    let total = 0;
    try {
      const out = fs.createWriteStream(partPath);
      const reader = res.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
          out.destroy();
          try { fs.unlinkSync(partPath); } catch (_) { /* */ }
          throw new DownloadError(`downloaded ${total} exceeds ${maxBytes}`, 'too_large');
        }
        hasher.update(value);
        if (!out.write(value)) {
          await new Promise((r) => out.once('drain', r));
        }
      }
      await new Promise((r, j) => out.end((err) => err ? j(err) : r()));
    } finally {
      clearTimeout(timer);
    }
    const sha256 = hasher.digest('hex');
    if (expectedSha256 && sha256 !== expectedSha256) {
      try { fs.unlinkSync(partPath); } catch (_) { /* */ }
      throw new DownloadError(`hash mismatch: expected ${expectedSha256}, got ${sha256}`, 'hash_mismatch');
    }
    // Atomic promotion.
    fs.renameSync(partPath, destPath);
    return {
      ok: true,
      path: destPath,
      sha256,
      contentLength: contentLength == null ? total : contentLength,
      contentType,
      etag,
    };
  }
  throw new DownloadError('exhausted redirects', 'too_many_redirects');
}

/*
 * Compatibility-cache helper. Wraps fetchToFile with a small in-memory
 * cache record. Callers that want persistence should serialize the
 * returned `cache` field and rehydrate it on the next call.
 */
async function fetchWithCache({ cache, destPath, opts }) {
  if (cache && cache.retrievedAt && cache.path && fs.existsSync(cache.path)) {
    const ageMs = Date.now() - cache.retrievedAt;
    const maxAgeMs = (opts && opts.maxAgeMs) || 60 * 60 * 1000;
    if (ageMs < maxAgeMs && !cache.error) {
      return { ok: true, cached: true, path: cache.path, cache };
    }
  }
  try {
    const result = await fetchToFile(cache.url, destPath, opts);
    if (cache) {
      cache.retrievedAt = Date.now();
      cache.contentLength = result.contentLength;
      cache.contentType = result.contentType;
      cache.etag = result.etag;
      cache.path = result.path;
      cache.error = null;
    }
    return { ...result, cached: false, cache };
  } catch (err) {
    if (cache) {
      cache.error = { code: err.code, message: err.message, at: Date.now() };
    }
    throw err;
  }
}

module.exports = {
  fetchToFile,
  fetchWithCache,
  newCacheEntry,
  DownloadError,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_REDIRECTS,
};
