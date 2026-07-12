'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { open } = require('./db.cjs');

const MAX_CONSOLE_LINES = 200;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_EVIDENCE_CHARS = 256 * 1024;
const RULESET_VERSION = 1;

function redact(text) {
  return String(text || '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, '<address>')
    .replace(/\b(?:token|password|secret|api[_-]?key)\s*[=:]\s*\S+/gi, '$1=<redacted>')
    .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, '$1<redacted>');
}

function normalize(text) {
  return redact(text).replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\[?\d{2}:\d{2}:\d{2}\]?/g, '<time>')
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][\d:.+-]+Z?\b/g, '<timestamp>')
    .replace(/(?:[A-Za-z]:\\|\/)[^\s:]+/g, '<path>')
    .replace(/\.java:\d+/g, '.java:<line>')
    .replace(/(?:Thread|pool)-\d+(?:-thread-\d+)?/gi, '<thread>')
    .replace(/\s+/g, ' ').trim();
}

function fingerprint(evidence) {
  const all = [evidence.crashReport?.text, evidence.latestLog?.text, ...(evidence.console || []).map((l) => l.text)].filter(Boolean).join('\n');
  const stable = all.split(/\r?\n/).filter((line) => /(?:Exception|Error|Caused by:|\bat\s+[\w.$]+\()/i.test(line)).slice(-80).map(normalize).join('\n') || normalize(all).slice(-8192) || 'empty-crash';
  return crypto.createHash('sha256').update(`v1\n${stable}`).digest('hex');
}

function safeTail(root, candidate) {
  try {
    const realRoot = fs.realpathSync(root);
    const real = fs.realpathSync(candidate);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) return { status: 'rejected', reason: 'outside-root' };
    const st = fs.lstatSync(candidate);
    if (!st.isFile() || st.isSymbolicLink()) return { status: 'rejected', reason: 'not-regular-file' };
    const fd = fs.openSync(real, 'r');
    try {
      const length = Math.min(st.size, MAX_FILE_BYTES);
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, Math.max(0, st.size - length));
      return { status: 'captured', path: path.relative(realRoot, real), truncated: st.size > length, text: redact(buf.toString('utf8').replace(/\u0000/g, '\ufffd')) };
    } finally { fs.closeSync(fd); }
  } catch (err) { return { status: 'absent', reason: err.code || 'read-failed' }; }
}

function newestCrashReport(root, occurredAt) {
  const dir = path.join(root, 'crash-reports');
  try {
    const candidates = fs.readdirSync(dir).map((name) => path.join(dir, name)).filter((file) => {
      try { const st = fs.lstatSync(file); return st.isFile() && !st.isSymbolicLink() && Math.abs(occurredAt - st.mtimeMs) <= 24 * 3600000; } catch (_) { return false; }
    }).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return candidates[0] ? safeTail(root, candidates[0]) : { status: 'absent', reason: 'no-relevant-report' };
  } catch (err) { return { status: 'absent', reason: err.code || 'read-failed' }; }
}

function classify(evidence, environment) {
  const text = [evidence.crashReport?.text, evidence.latestLog?.text, ...(evidence.console || []).map((l) => l.text)].filter(Boolean).join('\n');
  const rules = [
    ['memory.oom', 'memory', /OutOfMemoryError|Java heap space|unable to create native thread|native memory allocation/i, 'high', 'Memory exhaustion markers were found.', ['Review the server memory limit and recent memory use.', 'Check for plugins or mods retaining excessive memory.']],
    ['java.incompatible', 'java', /UnsupportedClassVersionError|class file version|requires Java \d+/i, 'high', 'Java class-version incompatibility markers were found.', ['Use the Java major required by this Minecraft or loader version.', 'Check recently changed plugins or mods for Java requirements.']],
    ['watchdog.loop', 'watchdog', /watchdog|single server tick took|server has not responded/i, 'high', 'Watchdog or stalled-tick markers were found.', ['Inspect the named thread stack and the work running on the server tick.', 'Check recent CPU and memory pressure.']],
    ['loader.component', 'plugin_or_mod', /(?:Could not load|Error loading|ModLoadingException|Failed to load).*?(?:\.jar|plugin|mod)/i, 'medium', 'A plugin or mod loading failure was found.', ['Review the named component and its dependencies.', 'Confirm it supports this server loader and Minecraft version.']],
  ];
  const conclusions = rules.filter((r) => r[2].test(text)).map((r) => ({ ruleId: r[0], category: r[1], confidence: r[3], reasoning: [r[4]], suggestions: r[5] }));
  if (environment.recentMetrics && (environment.recentMetrics.cpu >= 95 || environment.recentMetrics.memoryMb >= environment.heapLimitMb * 0.95)) conclusions.push({ ruleId: 'resource.pressure', category: 'resources', confidence: 'medium', reasoning: ['Recent local metrics show resource pressure near the crash.'], suggestions: ['Compare the incident time with the Health resource charts.', 'Check host capacity and the configured heap limit.'] });
  return conclusions;
}

function capture({ serverId, root, history, exitCode, signal, occurredAt = Date.now(), runtimeMs, recentMetrics, heapLimitMb }) {
  const evidence = {
    version: 1,
    console: (history || []).slice(-MAX_CONSOLE_LINES).map((l) => ({ ts: l.ts, level: l.level, text: redact(l.text) })),
    latestLog: safeTail(root, path.join(root, 'logs', 'latest.log')),
    crashReport: newestCrashReport(root, occurredAt),
  };
  const encoded = JSON.stringify(evidence);
  if (encoded.length > MAX_EVIDENCE_CHARS) {
    evidence.console = evidence.console.slice(-50);
    for (const source of [evidence.latestLog, evidence.crashReport]) {
      if (source?.text) source.text = source.text.slice(-80 * 1024);
    }
    evidence.storageTruncated = true;
  }
  const environment = { platform: process.platform, arch: process.arch, node: process.version, hostname: '<redacted>', recentMetrics: recentMetrics || null, heapLimitMb: heapLimitMb || null, rulesetVersion: RULESET_VERSION };
  const fp = fingerprint(evidence);
  const conclusions = classify(evidence, environment);
  const category = conclusions[0]?.category || 'unknown';
  const db = open();
  const incidentId = crypto.randomUUID();
  const tx = db.transaction(() => {
    let group = db.prepare('SELECT id FROM crash_groups WHERE server_id = ? AND fingerprint = ?').get(serverId, fp);
    if (group) db.prepare('UPDATE crash_groups SET last_seen_at = ?, count = count + 1, category = ? WHERE id = ?').run(occurredAt, category, group.id);
    else { group = { id: crypto.randomUUID() }; db.prepare('INSERT INTO crash_groups (id,server_id,fingerprint,category,first_seen_at,last_seen_at,count) VALUES (?,?,?,?,?,?,1)').run(group.id, serverId, fp, category, occurredAt, occurredAt); }
    db.prepare('INSERT INTO crash_incidents (id,group_id,server_id,exit_code,signal,occurred_at,runtime_ms,evidence_json,environment_json) VALUES (?,?,?,?,?,?,?,?,?)').run(incidentId, group.id, serverId, Number.isInteger(exitCode) ? exitCode : null, signal || null, occurredAt, runtimeMs == null ? null : Math.max(0, runtimeMs), JSON.stringify(evidence), JSON.stringify(environment));
    const insert = db.prepare('INSERT INTO crash_conclusions (id,incident_id,rule_id,category,confidence,reasoning_json,suggestions_json) VALUES (?,?,?,?,?,?,?)');
    for (const c of conclusions) insert.run(crypto.randomUUID(), incidentId, c.ruleId, c.category, c.confidence, JSON.stringify(c.reasoning), JSON.stringify(c.suggestions));
    return group.id;
  });
  return { incidentId, groupId: tx(), category, fingerprint: fp };
}

function list({ cursor, serverId, acknowledged, from, to, limit = 50 } = {}) {
  const where = [], args = [];
  if (serverId) { where.push('server_id = ?'); args.push(serverId); }
  if (acknowledged === true) where.push('acknowledged_at IS NOT NULL');
  if (acknowledged === false) where.push('acknowledged_at IS NULL');
  if (from) { where.push('last_seen_at >= ?'); args.push(from); }
  if (to) { where.push('last_seen_at <= ?'); args.push(to); }
  if (cursor) { where.push('last_seen_at < ?'); args.push(cursor); }
  const rows = open().prepare(`SELECT * FROM crash_groups ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY last_seen_at DESC,id DESC LIMIT ?`).all(...args, limit + 1);
  const more = rows.length > limit; const items = more ? rows.slice(0, limit) : rows;
  return { items: items.map(groupRow), nextCursor: more ? items[items.length - 1].last_seen_at : null };
}
function groupRow(r) { return { id: r.id, serverId: r.server_id, fingerprint: r.fingerprint, category: r.category, firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at, count: r.count, acknowledgedAt: r.acknowledged_at, acknowledgedBy: r.acknowledged_by }; }
function detail(id) {
  const db = open(); const group = db.prepare('SELECT * FROM crash_groups WHERE id=?').get(id); if (!group) return null;
  const incident = db.prepare('SELECT * FROM crash_incidents WHERE group_id=? ORDER BY occurred_at DESC LIMIT 1').get(id);
  const conclusions = db.prepare('SELECT * FROM crash_conclusions WHERE incident_id=?').all(incident.id).map((r) => ({ id: r.id, ruleId: r.rule_id, category: r.category, confidence: r.confidence, reasoning: JSON.parse(r.reasoning_json), suggestions: JSON.parse(r.suggestions_json) }));
  return { group: groupRow(group), incident: { id: incident.id, serverId: incident.server_id, exitCode: incident.exit_code, signal: incident.signal, occurredAt: incident.occurred_at, runtimeMs: incident.runtime_ms, evidence: JSON.parse(incident.evidence_json), environment: JSON.parse(incident.environment_json) }, conclusions };
}
function acknowledge(id, userId, value) { const at = value ? Date.now() : null; const result = open().prepare('UPDATE crash_groups SET acknowledged_at=?, acknowledged_by=? WHERE id=?').run(at, value ? userId : null, id); return result.changes ? { acknowledgedAt: at, acknowledgedBy: value ? userId : null } : null; }

module.exports = { capture, list, detail, acknowledge, normalize, fingerprint, classify, safeTail, redact, constants: { MAX_CONSOLE_LINES, MAX_FILE_BYTES, MAX_EVIDENCE_CHARS } };
