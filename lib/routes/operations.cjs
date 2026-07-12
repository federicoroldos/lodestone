'use strict';

/*
 * /api/operations routes.
 *
 * Spec contract (docs/roadmap/README.md "Durable operations"):
 *   - GET /api/operations?cursor=&serverId=&state=
 *   - GET /api/operations/:id
 *   - POST /api/operations/:id/cancel, /resume, /rollback
 *   - Long mutations return 202 { ok: true, operationId }
 *
 * Read endpoints require a valid JWT. Mutating endpoints also require the
 * right capability. This router doesn't itself dispatch long mutations -
 * features that need one (spec 01/02/03/...) create the operation via
 * operations.create() and hand the work off to their own runner.
 */

const express = require('express');
const operations = require('../operations.cjs');
const audit = require('../audit.cjs');
const { CAPABILITIES, requireCap, has } = require('../capabilities.cjs');

function mayView(user, op) {
  return !!user && (user.role === 'admin' || op.actorId === user.id || has(user, op.serverId, CAPABILITIES.SERVER_CONTROL));
}

function router() {
  const r = express.Router();

  r.get('/', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const { serverId, state, cursor, limit } = req.query;
    if (user.role !== 'admin') {
      if (!serverId) return res.status(400).json({ error: 'serverId_required' });
      if (!has(user, serverId, CAPABILITIES.SERVER_CONTROL)) return res.status(403).json({ error: 'forbidden' });
    }
    const items = operations.list({
      serverId: serverId || null,
      state: state || null,
      cursor: cursor || null,
      limit: limit ? Math.min(200, parseInt(limit, 10) || 50) : 50,
    });
    res.json({ ok: true, ...items });
  });

  r.get('/:id', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const op = operations.get(req.params.id);
    if (!op) return res.status(404).json({ error: 'not_found' });
    if (!mayView(user, op)) return res.status(403).json({ error: 'forbidden' });
    const events = operations.listEvents(req.params.id);
    res.json({ ok: true, operation: op, events });
  });

  r.post('/:id/cancel', requireCap(CAPABILITIES.SERVER_CONTROL, { getServerId: (req) => (operations.get(req.params.id) || {}).serverId }), (req, res) => {
    const user = req.user;
    const op = operations.cancel(req.params.id);
    if (!op) return res.status(404).json({ error: 'not_found' });
    audit.record({
      actorId: user && user.id,
      serverId: op.serverId,
      action: 'operation.cancel',
      target: { operationId: op.id, kind: op.kind },
      outcome: 'success',
      requestId: req.requestId,
      operationId: op.id,
    });
    res.json({ ok: true, operation: op });
  });

  r.post('/:id/resume', requireCap(CAPABILITIES.SERVER_CONTROL, { getServerId: (req) => (operations.get(req.params.id) || {}).serverId }), (req, res) => {
    const user = req.user;
    const op = operations.get(req.params.id);
    if (!op) return res.status(404).json({ error: 'not_found' });
    if (op.state !== operations.STATES.RECOVERY_REQUIRED) {
      return res.status(409).json({ error: 'not_recoverable', state: op.state });
    }
    // Real resume is feature-specific (see spec 01 / 02 / 03); the foundation
    // surfaces the precondition check and an audit event, and leaves the
    // actual replay to the owning feature.
    audit.record({
      actorId: user && user.id,
      serverId: op.serverId,
      action: 'operation.resume',
      target: { operationId: op.id, kind: op.kind },
      outcome: 'requested',
      requestId: req.requestId,
      operationId: op.id,
    });
    res.json({ ok: true, operation: op, message: 'resume is feature-specific' });
  });

  r.post('/:id/rollback', requireCap(CAPABILITIES.SERVER_CONTROL, { getServerId: (req) => (operations.get(req.params.id) || {}).serverId }), (req, res) => {
    const user = req.user;
    const op = operations.get(req.params.id);
    if (!op) return res.status(404).json({ error: 'not_found' });
    if (!op.recovery) {
      return res.status(409).json({ error: 'no_recovery_instructions' });
    }
    audit.record({
      actorId: user && user.id,
      serverId: op.serverId,
      action: 'operation.rollback',
      target: { operationId: op.id, kind: op.kind, snapshotId: op.recovery.snapshotId || null },
      outcome: 'requested',
      requestId: req.requestId,
      operationId: op.id,
    });
    res.json({ ok: true, operation: op, message: 'rollback is feature-specific' });
  });

  return r;
}

module.exports = { router };
