'use strict';

/*
 * Audit log writer.
 *
 * Spec contract (docs/roadmap/README.md "Authorization and audit"):
 *   - "Every sensitive or mutating action emits a centralized, redacted audit
 *      event with actor, server, action, target, outcome, request/operation
 *      IDs, timestamp, and safe metadata."
 *   - "Logs, responses, exports, operation summaries, and audit records use
 *      the same secret redactor."
 *
 * record() is the only entry point. The redactor runs over `target` and
 * `metadata` before insert so a careless caller can't leak a password into
 * the audit table. The records are append-only: there is no update() or
 * delete() on purpose.
 */

const crypto = require('crypto');
const { open } = require('./db.cjs');
const { redactObject } = require('./redact.cjs');

function genId() {
  return crypto.randomUUID();
}

function record(event) {
  if (!event || typeof event !== 'object') throw new Error('audit.record: event required');
  if (!event.action) throw new Error('audit.record: action required');
  if (!event.outcome) throw new Error('audit.record: outcome required');

  const db = open();
  const id = event.id || genId();
  const ts = event.ts || Date.now();
  const safeTarget = event.target == null ? null : redactObject(event.target);
  const safeMetadata = event.metadata == null ? null : redactObject(event.metadata);

  db.prepare(`
    INSERT INTO audit_events
      (id, ts, actor_id, server_id, action, target, outcome, request_id, operation_id, metadata)
    VALUES
      (?,  ?,  ?,        ?,         ?,      ?,      ?,       ?,          ?,           ?)
  `).run(
    id,
    ts,
    event.actorId || null,
    event.serverId || null,
    String(event.action),
    safeTarget == null ? null : JSON.stringify(safeTarget),
    String(event.outcome),
    event.requestId || null,
    event.operationId || null,
    safeMetadata == null ? null : JSON.stringify(safeMetadata),
  );
  return { id, ts };
}

function list({ actorId, serverId, action, since, until, limit = 200, cursor } = {}) {
  const db = open();
  const where = [];
  const args = [];
  if (actorId)   { where.push('actor_id = ?');  args.push(actorId); }
  if (serverId)  { where.push('server_id = ?'); args.push(serverId); }
  if (action)    { where.push('action = ?');    args.push(action); }
  if (since)     { where.push('ts >= ?');       args.push(since); }
  if (until)     { where.push('ts <= ?');       args.push(until); }
  if (cursor)    { where.push('ts < ?');        args.push(cursor); }

  const sql = `
    SELECT id, ts, actor_id, server_id, action, target, outcome, request_id, operation_id, metadata
      FROM audit_events
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ts DESC, id DESC
      LIMIT ?
  `;
  const rows = db.prepare(sql).all(...args, limit + 1);
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
    id: r.id,
    ts: r.ts,
    actorId: r.actor_id,
    serverId: r.server_id,
    action: r.action,
    target: r.target ? safeJson(r.target) : null,
    outcome: r.outcome,
    requestId: r.request_id,
    operationId: r.operation_id,
    metadata: r.metadata ? safeJson(r.metadata) : null,
  }));
  return { items, nextCursor: hasMore ? items[items.length - 1].ts : null };
}

function safeJson(s) {
  try { return JSON.parse(s); } catch (_) { return s; }
}

module.exports = { record, list, genId };
