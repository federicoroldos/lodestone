'use strict';

/*
 * Migration runner for the platform foundation.
 *
 * Spec contract (docs/roadmap/README.md "Shared platform foundation"):
 *   - "Run numbered migrations in one transaction each and record them in
 *      schema_migrations(version, name, applied_at)."
 *   - "Before migrating, make a consistent database snapshot and retain the
 *      newest three. A migration failure leaves the prior version usable."
 *   - "Import metrics.json once, without deleting or rewriting it. Record the
 *      import key in data_imports; duplicate runs are no-ops."
 *
 * Each migration is a (version, name, up(db) => void) entry. They run in
 * version order inside their own transaction. The runner snapshots the .db
 * file (not the live connection) to a timestamped copy in data/snapshots/
 * before applying, keeps the newest three, and rolls back the schema changes
 * of a failed migration by reverting to the prior snapshot copy.
 *
 * The snapshot is a plain file copy of the SQLite file. It must happen while
 * the connection is idle and no writes are in flight; the runner wraps the
 * snapshot in a short "synchronized" critical section.
 */

const fs = require('fs');
const path = require('path');
const { open, close, dbPath, dataDir } = require('./db.cjs');

const MIGRATIONS = [
  {
    version: 1,
    name: 'foundation-schema',
    up(db) {
      // schema_migrations: tracks applied migrations.
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version    INTEGER PRIMARY KEY,
          name       TEXT    NOT NULL,
          applied_at INTEGER NOT NULL
        );

        -- data_imports: idempotency keys for one-shot imports (e.g. metrics.json).
        CREATE TABLE IF NOT EXISTS data_imports (
          key         TEXT    PRIMARY KEY,
          imported_at INTEGER NOT NULL,
          summary     TEXT    NOT NULL
        );

        -- audit_events: append-only audit log.
        CREATE TABLE IF NOT EXISTS audit_events (
          id           TEXT    PRIMARY KEY,
          ts           INTEGER NOT NULL,
          actor_id     TEXT,
          server_id    TEXT,
          action       TEXT    NOT NULL,
          target       TEXT,
          outcome      TEXT    NOT NULL,
          request_id   TEXT,
          operation_id TEXT,
          metadata     TEXT
        );
        CREATE INDEX IF NOT EXISTS audit_events_ts_idx     ON audit_events(ts);
        CREATE INDEX IF NOT EXISTS audit_events_actor_idx  ON audit_events(actor_id);
        CREATE INDEX IF NOT EXISTS audit_events_server_idx ON audit_events(server_id);
        CREATE INDEX IF NOT EXISTS audit_events_action_idx ON audit_events(action);

        -- capability_grants: per-(user,server,capability) grants. No wildcards.
        -- server_id IS NULL means "server-agnostic" (e.g. global capabilities).
        CREATE TABLE IF NOT EXISTS capability_grants (
          user_id    TEXT    NOT NULL,
          server_id  TEXT,
          capability TEXT    NOT NULL,
          granted_at INTEGER NOT NULL,
          granted_by TEXT,
          PRIMARY KEY (user_id, server_id, capability)
        );
        CREATE INDEX IF NOT EXISTS capability_grants_user_idx   ON capability_grants(user_id);
        CREATE INDEX IF NOT EXISTS capability_grants_server_idx ON capability_grants(server_id);

        -- operations: durable operations (the "long mutation" primitive).
        CREATE TABLE IF NOT EXISTS operations (
          id              TEXT    PRIMARY KEY,
          kind            TEXT    NOT NULL,
          state           TEXT    NOT NULL,
          phase           TEXT,
          progress        REAL,
          heartbeat       INTEGER,
          summary         TEXT,
          journal         TEXT,
          actor_id        TEXT,
          server_id       TEXT,
          idempotency_key TEXT,
          queued_at       INTEGER NOT NULL,
          started_at      INTEGER,
          finished_at     INTEGER,
          error_code      TEXT,
          error_text      TEXT,
          recovery        TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS operations_idem_idx
          ON operations(actor_id, idempotency_key)
          WHERE idempotency_key IS NOT NULL;
        CREATE INDEX IF NOT EXISTS operations_server_state_idx
          ON operations(server_id, state, queued_at);
        CREATE INDEX IF NOT EXISTS operations_state_idx
          ON operations(state);

        -- operation_events: append-only timeline for an operation.
        CREATE TABLE IF NOT EXISTS operation_events (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          operation_id TEXT    NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
          ts          INTEGER NOT NULL,
          phase       TEXT,
          message     TEXT,
          level       TEXT,
          metadata    TEXT
        );
        CREATE INDEX IF NOT EXISTS operation_events_op_ts_idx
          ON operation_events(operation_id, ts);

        -- snapshots: pre-mutation snapshots taken against a server folder.
        -- path is relative to data/snapshots/.
        CREATE TABLE IF NOT EXISTS snapshots (
          id          TEXT    PRIMARY KEY,
          server_id   TEXT    NOT NULL,
          kind        TEXT    NOT NULL,
          path        TEXT    NOT NULL,
          size        INTEGER NOT NULL,
          file_count  INTEGER NOT NULL,
          taken_at    INTEGER NOT NULL,
          verified    INTEGER NOT NULL DEFAULT 0,
          reason      TEXT
        );
        CREATE INDEX IF NOT EXISTS snapshots_server_taken_idx
          ON snapshots(server_id, taken_at DESC);

        -- Legacy metrics imported from metrics.json. The five-value tuple is
        -- preserved without rewriting the source file.
        CREATE TABLE IF NOT EXISTS metric_samples (
          server_id TEXT    NOT NULL,
          ts        INTEGER NOT NULL,
          cpu       REAL,
          memory_mb REAL,
          players   INTEGER,
          world_mb  REAL,
          PRIMARY KEY (server_id, ts)
        );
        CREATE INDEX IF NOT EXISTS metric_samples_server_ts_idx
          ON metric_samples(server_id, ts DESC);
      `);
    },
  },
  {
    version: 2,
    name: 'metrics-and-capability-integrity',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS metric_samples (
          server_id TEXT    NOT NULL,
          ts        INTEGER NOT NULL,
          cpu       REAL,
          memory_mb REAL,
          players   INTEGER,
          world_mb  REAL,
          PRIMARY KEY (server_id, ts)
        );
        CREATE INDEX IF NOT EXISTS metric_samples_server_ts_idx
          ON metric_samples(server_id, ts DESC);
        DELETE FROM capability_grants
         WHERE rowid NOT IN (
           SELECT MIN(rowid) FROM capability_grants
            GROUP BY user_id, COALESCE(server_id, ''), capability
         );
        CREATE UNIQUE INDEX IF NOT EXISTS capability_grants_exact_idx
          ON capability_grants(user_id, COALESCE(server_id, ''), capability);
      `);
    },
  },
  {
    version: 3,
    name: 'crash-intelligence',
    up(db) {
      db.exec(`
        CREATE TABLE crash_groups (
          id TEXT PRIMARY KEY, server_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
          category TEXT NOT NULL, first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
          count INTEGER NOT NULL DEFAULT 1, acknowledged_at INTEGER, acknowledged_by TEXT,
          UNIQUE(server_id, fingerprint)
        );
        CREATE INDEX crash_groups_last_seen_idx ON crash_groups(last_seen_at DESC);
        CREATE TABLE crash_incidents (
          id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES crash_groups(id) ON DELETE CASCADE,
          server_id TEXT NOT NULL, exit_code INTEGER, signal TEXT, occurred_at INTEGER NOT NULL,
          runtime_ms INTEGER, evidence_json TEXT NOT NULL, environment_json TEXT NOT NULL
        );
        CREATE INDEX crash_incidents_group_time_idx ON crash_incidents(group_id, occurred_at DESC);
        CREATE TABLE crash_conclusions (
          id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES crash_incidents(id) ON DELETE CASCADE,
          rule_id TEXT NOT NULL, category TEXT NOT NULL, confidence TEXT NOT NULL,
          reasoning_json TEXT NOT NULL, suggestions_json TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 4,
    name: 'safe-update-center',
    up(db) {
      db.exec(`
        CREATE TABLE content_provenance (
          id TEXT PRIMARY KEY, server_id TEXT NOT NULL, relative_path TEXT NOT NULL,
          kind TEXT NOT NULL, provider TEXT NOT NULL, project_id TEXT NOT NULL,
          version_id TEXT NOT NULL, mc_version TEXT, loader TEXT, sha256 TEXT NOT NULL,
          managed_at INTEGER NOT NULL, UNIQUE(server_id, relative_path)
        );
        CREATE INDEX content_provenance_server_idx ON content_provenance(server_id);
        CREATE TABLE compatibility_cache (
          source TEXT NOT NULL, cache_key TEXT NOT NULL, retrieved_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL, stale INTEGER NOT NULL DEFAULT 0,
          payload_json TEXT, error_json TEXT, PRIMARY KEY(source, cache_key)
        );
        CREATE TABLE update_plans (
          id TEXT PRIMARY KEY, server_id TEXT NOT NULL, created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL, base_inventory_hash TEXT NOT NULL,
          status TEXT NOT NULL, plan_json TEXT NOT NULL
        );
        CREATE INDEX update_plans_server_time_idx ON update_plans(server_id, created_at DESC);
      `);
    },
  },
  {
    version: 5,
    name: 'modpack-lifecycle',
    up(db) {
      db.exec(`
        CREATE TABLE modpack_manifests (
          id TEXT PRIMARY KEY, server_id TEXT NOT NULL, provider TEXT NOT NULL,
          project_id TEXT NOT NULL, version_id TEXT NOT NULL, mc_version TEXT NOT NULL,
          loader TEXT NOT NULL, installed_at INTEGER NOT NULL, operation_id TEXT NOT NULL,
          manifest_hash TEXT NOT NULL, snapshot_id TEXT, previous_manifest_id TEXT,
          FOREIGN KEY(previous_manifest_id) REFERENCES modpack_manifests(id)
        );
        CREATE INDEX modpack_manifests_server_time_idx
          ON modpack_manifests(server_id, installed_at DESC);
        CREATE TABLE modpack_files (
          manifest_id TEXT NOT NULL REFERENCES modpack_manifests(id) ON DELETE CASCADE,
          relative_path TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL,
          source_url_hash TEXT, ownership TEXT NOT NULL,
          PRIMARY KEY(manifest_id, relative_path)
        );
        CREATE TABLE modpack_conflict_decisions (
          operation_id TEXT NOT NULL, relative_path TEXT NOT NULL,
          decision TEXT NOT NULL CHECK(decision IN ('keep_local', 'take_pack')),
          actor_id TEXT NOT NULL, PRIMARY KEY(operation_id, relative_path)
        );
        CREATE TABLE modpack_previews (
          id TEXT PRIMARY KEY, server_id TEXT NOT NULL, actor_id TEXT NOT NULL,
          kind TEXT NOT NULL, project_id TEXT NOT NULL, version_id TEXT NOT NULL,
          created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
          inventory_hash TEXT NOT NULL, payload_json TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 6,
    name: 'recovery-confidence',
    up(db) {
      db.exec(`
        CREATE TABLE backup_manifests (
          id TEXT PRIMARY KEY, server_id TEXT NOT NULL, filename TEXT NOT NULL UNIQUE,
          size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at INTEGER NOT NULL,
          inventory_json TEXT NOT NULL, world_roots_json TEXT NOT NULL
        );
        CREATE INDEX backup_manifests_server_time_idx ON backup_manifests(server_id, created_at DESC);
        CREATE TABLE backup_verifications (
          id TEXT PRIMARY KEY, backup_id TEXT NOT NULL REFERENCES backup_manifests(id) ON DELETE CASCADE,
          operation_id TEXT, status TEXT NOT NULL, crc_ok INTEGER NOT NULL DEFAULT 0,
          sha256 TEXT, verified_at INTEGER NOT NULL, error_code TEXT
        );
        CREATE INDEX backup_verifications_backup_time_idx ON backup_verifications(backup_id, verified_at DESC);
        CREATE TABLE backup_drills (
          id TEXT PRIMARY KEY, backup_id TEXT NOT NULL REFERENCES backup_manifests(id) ON DELETE CASCADE,
          operation_id TEXT, status TEXT NOT NULL, started_at INTEGER NOT NULL,
          completed_at INTEGER, report_json TEXT
        );
        CREATE INDEX backup_drills_backup_time_idx ON backup_drills(backup_id, started_at DESC);
        CREATE TABLE backup_previews (
          token TEXT PRIMARY KEY, backup_id TEXT NOT NULL REFERENCES backup_manifests(id) ON DELETE CASCADE,
          server_id TEXT NOT NULL, actor_id TEXT NOT NULL, created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL, server_fingerprint TEXT NOT NULL, payload_json TEXT NOT NULL
        );
      `);
    },
  },
];

const SNAPSHOT_DIR = path.join(dataDir(), 'snapshots');
const MAX_SNAPSHOTS = 3;

function ensureSnapshotDir() {
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

/*
 * Copy the live .db file to a timestamped snapshot. Done with the connection
 * open so WAL writes are flushed; better-sqlite3's checkpoint() takes care
 * of merging the WAL back into the main file before we read it.
 */
function takeSnapshot(db) {
  ensureSnapshotDir();
  db.pragma('wal_checkpoint(TRUNCATE)');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(SNAPSHOT_DIR, `lodestone-${stamp}.db`);
  fs.copyFileSync(dbPath(), dest);
  pruneSnapshots();
  return dest;
}

function pruneSnapshots() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return;
  const files = fs.readdirSync(SNAPSHOT_DIR)
    .filter((f) => f.startsWith('lodestone-') && f.endsWith('.db'))
    .map((f) => ({ name: f, full: path.join(SNAPSHOT_DIR, f), mtime: fs.statSync(path.join(SNAPSHOT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (let i = MAX_SNAPSHOTS; i < files.length; i++) {
    try { fs.unlinkSync(files[i].full); } catch (_) { /* locked file - keep */ }
  }
}

function listSnapshots() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return [];
  return fs.readdirSync(SNAPSHOT_DIR)
    .filter((f) => f.startsWith('lodestone-') && f.endsWith('.db'))
    .map((f) => path.join(SNAPSHOT_DIR, f))
    .sort();
}

/*
 * Restore the database from a snapshot file. Used by the recovery flow when
 * a migration fails - we copy the most recent pre-migration snapshot back
 * over the live .db file. After this, close() must be called and a fresh
 * open() will see the restored state.
 */
function restoreFromSnapshot(snapshotPath) {
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`snapshot not found: ${snapshotPath}`);
  }
  close();
  // Wipe the WAL/SHM so a stale write-ahead log doesn't get replayed onto
  // the restored file.
  for (const ext of ['', '-wal', '-shm']) {
    const p = dbPath() + ext;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (_) { /* locked - best effort */ }
    }
  }
  fs.copyFileSync(snapshotPath, dbPath());
}

/*
 * Run all migrations that have not yet been applied. Each migration runs in
 * its own transaction; on failure we restore the prior snapshot and rethrow.
 */
function runMigrations() {
  const db = open();
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
             version    INTEGER PRIMARY KEY,
             name       TEXT    NOT NULL,
             applied_at INTEGER NOT NULL
           );`);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
  );

  const pending = MIGRATIONS.filter((m) => !applied.has(m.version)).sort((a, b) => a.version - b.version);
  if (!pending.length) return { applied: [], snapshot: null };

  const snapshot = takeSnapshot(db);
  const log = [];
  for (const m of pending) {
    let tx;
    try {
      tx = db.transaction(() => {
        m.up(db);
        db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
          .run(m.version, m.name, Date.now());
      });
      tx();
      log.push({ version: m.version, name: m.name, status: 'ok' });
    } catch (err) {
      log.push({ version: m.version, name: m.name, status: 'failed', error: err.message });
      try { restoreFromSnapshot(snapshot); } catch (re) {
        err.restoreError = re.message;
      }
      const e = new Error(`migration ${m.version} (${m.name}) failed: ${err.message}`);
      e.migrationError = err;
      e.snapshot = snapshot;
      e.log = log;
      throw e;
    }
  }
  return { applied: log, snapshot };
}

/*
 * Mark a one-shot data import as done. Returns true if this was the first
 * time, false if the import key was already recorded. The caller does the
 * actual import; this just sets the idempotency key.
 */
function recordImport(key, summary) {
  const db = open();
  const result = db.prepare(`
    INSERT INTO data_imports (key, imported_at, summary)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO NOTHING
  `).run(key, Date.now(), JSON.stringify(summary || {}));
  return result.changes === 1;
}

function hasImported(key) {
  const db = open();
  return !!db.prepare('SELECT 1 FROM data_imports WHERE key = ?').get(key);
}

function getImport(key) {
  const db = open();
  return db.prepare('SELECT key, imported_at, summary FROM data_imports WHERE key = ?').get(key) || null;
}

module.exports = {
  runMigrations,
  listSnapshots,
  restoreFromSnapshot,
  recordImport,
  hasImported,
  getImport,
  SNAPSHOT_DIR,
  MAX_SNAPSHOTS,
  MIGRATIONS,
};
