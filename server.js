'use strict';

/*
 * Lodestone - lightweight web panel to manage Minecraft (Spigot/Paper) servers on Windows.
 *
 * A single Node process:
 *   - Express serves the REST API and the static files in public/
 *   - ws exposes a WebSocket for the console stream, status, players and resources
 *   - Each registered server is launched with child_process.spawn (no shell) so paths
 *     with "N" and spaces are handled correctly.
 *
 * Multi-server model:
 *   - config.servers[] holds the registered servers (id, name, dir, jar, javaArgs, ...).
 *   - One ServerManager instance per registered server (managers Map), so several can run.
 *   - config.activeServerId is the server the console/players/plugins/configs/backups
 *     views target by default. Endpoints also accept ?serverId= to override.
 *
 * Global settings (panel port, password, backups dir, discord, ...) live in config.json.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync, execFile } = require('child_process');

const express = require('express');
const { WebSocketServer } = require('ws');
const multer = require('multer');
const pidusage = require('pidusage');
const archiver = require('archiver');

// pidusage on Windows shells out to wmic.exe, which Microsoft removed from
// Windows 11, so every pidusage() call throws `spawn wmic ENOENT` and process
// CPU/memory silently degrade to 0. procUsage() replaces it on win32 with a
// Get-CimInstance probe (KernelModeTime / UserModeTime / WorkingSetSize) and
// falls back to pidusage on other platforms. Results are cached ~1s so the 2s
// live stats stream and the 60s metrics sampler don't spawn PowerShell each
// overlap.
const procUsageHistory = {}; // { [pid]: { ctime, uptime } }
const procUsageCache = {};    // { [pid]: { ts, val } }
function procUsage(pid) {
  return new Promise((resolve) => {
    if (pid == null || pid < 0) return resolve(null);
    const now = Date.now();
    const cached = procUsageCache[pid];
    if (cached && (now - cached.ts) < 900) return resolve(cached.val);

    const finish = (val) => {
      if (val) procUsageCache[pid] = { ts: now, val };
      resolve(val);
    };

    if (process.platform !== 'win32') {
      return pidusage(pid).then(finish, () => resolve(null));
    }

    const psCmd =
      `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | ` +
      `Select-Object -Property KernelModeTime,UserModeTime,WorkingSetSize | ` +
      `ConvertTo-Json -Compress`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psCmd],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        if (err) { delete procUsageCache[pid]; return resolve(null); }
        let data;
        try { data = JSON.parse((stdout || '').trim()); } catch (_) { return resolve(null); }
        if (!data || data.KernelModeTime == null) return resolve(null);
        const kernel = Number(data.KernelModeTime);
        const user = Number(data.UserModeTime);
        const memory = Number(data.WorkingSetSize);
        // Kernel/User time are in 100-ns ticks; convert to ms.
        const totalMs = (kernel + user) / 10000;
        const uptime = Math.floor(os.uptime() || (Date.now() / 1000));
        const hst = procUsageHistory[pid];
        let cpu = 0;
        if (hst) {
          const dCpu = totalMs - hst.ctime;
          const dSec = uptime - hst.uptime;
          if (dSec > 0) cpu = (dCpu / 1000 / dSec) * 100;
        }
        procUsageHistory[pid] = { ctime: totalMs, uptime };
        finish({
          cpu,
          memory,
          pid,
          ctime: totalMs,
          timestamp: now,
        });
      }
    );
  });
}
const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const i18n = require('./i18n.cjs');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

let config = loadConfig();

function saveConfig(next) {
  config = next;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function genId() {
  return crypto.randomUUID();
}

function slugify(s) {
  return String(s || 'server').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'server';
}

// --- user passwords (scrypt, salted; stored as "salt:hash") ---
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  let test;
  try {
    test = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  } catch (_) {
    return false;
  }
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function findUser(id) {
  return (config.users || []).find((u) => u.id === id) || null;
}
function findUserByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return (config.users || []).find((u) => (u.email || '').toLowerCase() === e) || null;
}
function findUserByUsername(username) {
  const u = String(username || '').trim().toLowerCase();
  if (!u) return null;
  return (config.users || []).find((x) => (x.username || '').toLowerCase() === u) || null;
}
// Find a user by the login field, which can be either an email or a username.
function findUserByLogin(identifier) {
  const v = String(identifier || '').trim().toLowerCase();
  if (!v) return null;
  if (v.includes('@')) return findUserByEmail(v);
  return findUserByUsername(v) || findUserByEmail(v);
}
function publicUser(u) {
  return {
    id: u.id,
    email: u.email || '',
    username: u.username || '',
    name: u.name || '',
    language: i18n.normalizeLang(u.language),
  };
}

// Migrate a legacy single-server config (serverDir/jar/...) into config.servers[].
function migrateConfig() {
  let changed = false;
  if (!Array.isArray(config.servers)) {
    config.servers = [];
    if (config.serverDir) {
      config.servers.push({
        id: genId(),
        name: path.basename(config.serverDir) || 'Server',
        dir: config.serverDir,
        jar: config.jar || '',
        javaArgs: config.javaArgs || ['-Xmx2G', '-Xms2G'],
        mcVersion: config.mcVersion || '',
        stopTimeoutSeconds: config.stopTimeoutSeconds || 30,
        worlds: (config.backups && config.backups.worlds) || ['world', 'world_nether', 'world_the_end'],
        watchdog: config.watchdog || { enabled: false, maxRestarts: 3, windowMinutes: 10 },
      });
    }
    changed = true;
  }
  if (!config.activeServerId && config.servers.length) {
    config.activeServerId = config.servers[0].id;
    changed = true;
  }
  if (!config.backups) {
    config.backups = { dir: path.join(os.homedir(), 'mc-backups'), maxCount: 10, maxSizeMB: 0 };
    changed = true;
  } else {
    // Backwards-compat: older configs used `retainCount` for the per-server
    // count cap. Rename to `maxCount` and add the new `maxSizeMB` knob (0 =
    // unlimited, the default).
    if (config.backups.retainCount !== undefined && config.backups.maxCount === undefined) {
      config.backups.maxCount = config.backups.retainCount;
      delete config.backups.retainCount;
      changed = true;
    }
    if (config.backups.maxCount === undefined) { config.backups.maxCount = 10; changed = true; }
    if (config.backups.maxSizeMB === undefined) { config.backups.maxSizeMB = 0; changed = true; }
    if (!config.backups.dir) {
      config.backups.dir = path.join(os.homedir(), 'mc-backups');
      changed = true;
    }
  }
  // Migrate the legacy single global password into a first user account.
  if (!Array.isArray(config.users) || !config.users.length) {
    config.users = [{
      id: genId(),
      username: 'admin',
      email: 'admin@lodestone.io',
      name: 'Admin',
      passwordHash: hashPassword(config.password || 'admin'),
    }];
    delete config.password;
    changed = true;
  }
  if (changed) saveConfig(config);
}

migrateConfig();

function findServer(id) {
  return config.servers.find((s) => s.id === id) || null;
}
function backupsDir() {
  return config.backups.dir || path.join(os.homedir(), 'mc-backups');
}

// ---------------------------------------------------------------------------
// Panel log (not to be confused with a Minecraft server console)
// ---------------------------------------------------------------------------

function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[lodestone ${ts}]`, ...args);
}

// ---------------------------------------------------------------------------
// Discord (notifications)
// ---------------------------------------------------------------------------

async function notifyDiscord(content) {
  const url = config.discord && config.discord.webhookUrl;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: config.appName || 'Lodestone',
        content,
      }),
    });
  } catch (err) {
    log('Discord webhook failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Server manager: handles one Minecraft process (one per registered server)
// ---------------------------------------------------------------------------

const STATUS = {
  OFFLINE: 'offline',
  STARTING: 'starting',
  ONLINE: 'online',
  STOPPING: 'stopping',
};

class ServerManager {
  constructor(id) {
    this.id = id;
    this.proc = null;
    this.status = STATUS.OFFLINE;
    this.startedAt = null;
    this.manualStop = false;
    this.history = []; // { ts, text, level }
    this.players = new Set();
    this.maxPlayers = 0;
    this.stdoutBuf = '';
    this.stderrBuf = '';
    this.restartTimestamps = []; // for the watchdog (crash-loop guard)
    this.killTimer = null;
    this.listInterval = null;
    this.broadcast = () => {};
    this.tpsSupported = null; // null = unknown, true/false once detected
    this.lastTps = null;
  }

  desc() {
    return findServer(this.id) || {};
  }
  name() {
    return this.desc().name || this.id;
  }
  dir() {
    return this.desc().dir;
  }
  pluginsDir() {
    return path.join(this.dir(), 'plugins');
  }
  watchdogCfg() {
    return this.desc().watchdog || { enabled: false, maxRestarts: 3, windowMinutes: 10 };
  }

  isRunning() {
    return this.status === STATUS.STARTING || this.status === STATUS.ONLINE || this.status === STATUS.STOPPING;
  }

  uptimeMs() {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  statusPayload() {
    const wd = this.watchdogCfg();
    return {
      serverId: this.id,
      name: this.name(),
      status: this.status,
      pid: this.proc ? this.proc.pid : null,
      startedAt: this.startedAt,
      uptimeMs: this.uptimeMs(),
      players: [...this.players].sort(),
      playerCount: this.players.size,
      maxPlayers: this.maxPlayers || 0,
      tps: this.lastTps,
      watchdog: {
        enabled: !!wd.enabled,
        recentRestarts: this._recentRestartCount(),
        maxRestarts: wd.maxRestarts,
      },
    };
  }

  pushLine(text, level = 'info') {
    const entry = { ts: Date.now(), text, level };
    this.history.push(entry);
    const max = config.consoleHistoryLines || 500;
    if (this.history.length > max) {
      this.history.splice(0, this.history.length - max);
    }
    this.broadcast({ type: 'line', line: entry });
  }

  setStatus(next) {
    if (this.status === next) return;
    this.status = next;
    this.broadcast({ type: 'status', status: this.statusPayload() });
  }

  classify(line) {
    if (/\/(ERROR|SEVERE|FATAL)\]/.test(line) || /\b(SEVERE|FATAL)\b/.test(line)) return 'error';
    if (/\/WARN\]/.test(line) || /\[WARNING\]/.test(line)) return 'warn';
    return 'info';
  }

  // -- start / stop -------------------------------------------------------

  start() {
    if (this.isRunning()) {
      return { ok: false, error: eKey('errors.alreadyRunning') };
    }
    const d = this.desc();
    if (!d.dir) return { ok: false, error: eKey('errors.noFolderConfigured') };
    if (!d.jar) return { ok: false, error: eKey('errors.noJarConfigured') };
    if (!fs.existsSync(d.dir)) return { ok: false, error: eKey('errors.folderNotFound', { path: d.dir }) };
    const jarPath = path.join(d.dir, d.jar);
    if (!fs.existsSync(jarPath)) {
      return { ok: false, error: eKey('errors.jarMissing', { path: jarPath }) };
    }

    const args = [...(d.javaArgs || []), '-jar', d.jar, 'nogui'];

    // Resolve the Java binary for this server's Minecraft version. The panel
    // manages its own Temurin runtimes per Java major (see runtimes/), so the
    // user never has to install Java by hand. If the right runtime isn't on
    // disk yet we download it first (progress in this console), then launch.
    const major = requiredJavaMajor(d.mcVersion);
    const javaBin = resolveJavaForServer(d, major);
    if (javaBin) return this._launch(javaBin, args);

    if (this._runtimeFetching) return { ok: true };
    this._runtimeFetching = true;
    this.players.clear();
    this.manualStop = false;
    this.tpsSupported = null;
    this.lastTps = null;
    this.setStatus(STATUS.STARTING);
    this.pushLine(`[Lodestone] Minecraft ${d.mcVersion || '?'} needs Java ${major}. Downloading runtime (one-time)...`, 'info');
    let lastPct = -1;
    ensureRuntime(major, (rec, total) => {
      if (!total) return;
      const pct = Math.floor((rec / total) * 100);
      if (pct >= lastPct + 10) { lastPct = pct; this.pushLine(`[Lodestone] Downloading Java ${major}: ${pct}%`, 'info'); }
    }).then((bin) => {
      this._runtimeFetching = false;
      this.pushLine(`[Lodestone] Java ${major} runtime ready.`, 'info');
      const r = this._launch(bin, args);
      if (!r.ok) { this.setStatus(STATUS.OFFLINE); this.pushLine(`[Lodestone] Could not launch java: ${r.error}`, 'error'); }
    }).catch((err) => {
      this._runtimeFetching = false;
      this.setStatus(STATUS.OFFLINE);
      this.pushLine(`[Lodestone] Could not prepare Java ${major}: ${err.message}`, 'error');
    });
    return { ok: true };
  }

  _launch(javaBin, args) {
    const d = this.desc();
    log(`Starting "${this.name()}":`, javaBin, args.join(' '), 'in', d.dir);

    this.players.clear();
    this.manualStop = false;
    this.tpsSupported = null;
    this.lastTps = null;
    this.setStatus(STATUS.STARTING);
    this.pushLine(`[Lodestone] Starting "${this.name()}": ${javaBin} ${args.join(' ')}`, 'info');

    let proc;
    try {
      proc = spawn(javaBin, args, {
        cwd: d.dir,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      this.setStatus(STATUS.OFFLINE);
      this.pushLine(`[Lodestone] Could not launch java: ${err.message}`, 'error');
      return { ok: false, error: err.message };
    }

    this.proc = proc;
    this.startedAt = Date.now();

    proc.stdout.on('data', (b) => this._onData(b, 'stdout'));
    proc.stderr.on('data', (b) => this._onData(b, 'stderr'));

    proc.on('error', (err) => {
      this.pushLine(`[Lodestone] Process error: ${err.message}`, 'error');
    });

    proc.on('exit', (code, signal) => this._onExit(code, signal));

    return { ok: true };
  }

  _onData(buf, stream) {
    const key = stream === 'stdout' ? 'stdoutBuf' : 'stderrBuf';
    this[key] += buf.toString('utf8');
    let idx;
    while ((idx = this[key].indexOf('\n')) !== -1) {
      let line = this[key].slice(0, idx);
      this[key] = this[key].slice(idx + 1);
      line = line.replace(/\r$/, '');
      if (line.length === 0) {
        this.pushLine('', 'info');
        continue;
      }
      const level = stream === 'stderr' ? 'error' : this.classify(line);
      this.pushLine(line, level);
      this._inspectLine(line);
    }
  }

  _inspectLine(line) {
    // Server ready
    if (this.status === STATUS.STARTING && /Done \([\d.]+s\)!/.test(line)) {
      this.setStatus(STATUS.ONLINE);
      this._startPlayerPolling();
      this.sendCommand('list', true);
    }

    // Join / leave
    let m = line.match(/]: ([A-Za-z0-9_]{1,16}) joined the game/);
    if (m) {
      const before = this.players.size;
      this.players.add(m[1]);
      this._afterPlayerChange();
      if (config.discord.notifyOnJoinLeave) notifyDiscord(`+ **${m[1]}** joined "${this.name()}" (${this.players.size}/${this.maxPlayers || '?'})`);
      if (this.maxPlayers && this.players.size >= this.maxPlayers && before < this.maxPlayers && config.discord.notifyOnFull) {
        notifyDiscord(`:warning: "${this.name()}" is **full** (${this.players.size}/${this.maxPlayers}).`);
      }
      return;
    }
    m = line.match(/]: ([A-Za-z0-9_]{1,16}) left the game/);
    if (m) {
      this.players.delete(m[1]);
      this._afterPlayerChange();
      if (config.discord.notifyOnJoinLeave) notifyDiscord(`- **${m[1]}** left "${this.name()}" (${this.players.size}/${this.maxPlayers || '?'})`);
      return;
    }

    // /list response (authoritative list)
    m = line.match(/There are (\d+) of a max of (\d+) players online:?\s*(.*)$/i)
      || line.match(/There are (\d+)\/(\d+) players online:?\s*(.*)$/i);
    if (m) {
      this.maxPlayers = parseInt(m[2], 10);
      const names = (m[3] || '')
        .replace(/§./g, '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        // some plugins add prefixes; keep valid username tokens only
        .map((s) => {
          const mm = s.match(/[A-Za-z0-9_]{1,16}/);
          return mm ? mm[0] : null;
        })
        .filter(Boolean);
      this.players = new Set(names);
      this._afterPlayerChange();
      return;
    }

    // TPS (best-effort, EssentialsX / Paper)
    m = line.match(/TPS from last [^:]*:\s*([0-9.,*]+)/i);
    if (m) {
      this.tpsSupported = true;
      const first = m[1].split(/[ ,]+/)[0].replace(/[*]/g, '');
      const val = parseFloat(first);
      if (!Number.isNaN(val)) {
        this.lastTps = val;
        this.broadcast({ type: 'status', status: this.statusPayload() });
      }
    }
    if (/Unknown command|Unknown or incomplete command/i.test(line) && this.tpsSupported === null) {
      // our "tps" attempt probably failed; disable it
      this.tpsSupported = false;
    }
  }

  _afterPlayerChange() {
    this.broadcast({ type: 'status', status: this.statusPayload() });
  }

  _startPlayerPolling() {
    this._stopPlayerPolling();
    const sec = config.playerListIntervalSeconds || 30;
    this.listInterval = setInterval(() => {
      if (this.status === STATUS.ONLINE) {
        this.sendCommand('list', true);
        if (this.tpsSupported !== false) this.sendCommand('tps', true);
      }
    }, sec * 1000);
  }

  _stopPlayerPolling() {
    if (this.listInterval) {
      clearInterval(this.listInterval);
      this.listInterval = null;
    }
  }

  sendCommand(cmd, silent = false) {
    if (!this.proc || !this.proc.stdin.writable) {
      return { ok: false, error: eKey('errors.notRunning') };
    }
    const trimmed = String(cmd).replace(/[\r\n]+$/, '');
    if (!silent) this.pushLine(`> ${trimmed}`, 'cmd');
    try {
      this.proc.stdin.write(trimmed + '\n');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  stop(force = false) {
    if (!this.isRunning()) {
      return { ok: false, error: eKey('errors.notRunning') };
    }
    this.manualStop = true;
    if (force) {
      this.pushLine('[Lodestone] Force killing the process.', 'warn');
      this._kill();
      return { ok: true };
    }
    this.pushLine('[Lodestone] Stopping (graceful)...', 'info');
    this.setStatus(STATUS.STOPPING);
    this.sendCommand('stop', true);

    const timeoutSec = this.desc().stopTimeoutSeconds || config.stopTimeoutSeconds || 30;
    this.killTimer = setTimeout(() => {
      if (this.isRunning()) {
        this.pushLine(`[Lodestone] Did not close within ${timeoutSec}s, killing process.`, 'warn');
        this._kill();
      }
    }, timeoutSec * 1000);
    return { ok: true };
  }

  _kill() {
    if (this.proc) {
      try {
        this.proc.kill('SIGKILL');
      } catch (_) { /* noop */ }
    }
  }

  async restart() {
    if (this.isRunning()) {
      this.pushLine('[Lodestone] Restart requested: stopping...', 'info');
      const exited = this._waitForExit();
      this.stop(false);
      await exited;
      // small pause so the OS releases ports/handles
      await new Promise((r) => setTimeout(r, 2000));
    }
    this.pushLine('[Lodestone] Restart: starting again...', 'info');
    return this.start();
  }

  _waitForExit() {
    return new Promise((resolve) => {
      if (!this.proc) return resolve();
      this.proc.once('exit', () => resolve());
    });
  }

  _onExit(code, signal) {
    const wasManual = this.manualStop;
    this._stopPlayerPolling();
    if (this.killTimer) {
      clearTimeout(this.killTimer);
      this.killTimer = null;
    }
    this.pushLine(`[Lodestone] "${this.name()}" exited (code=${code}, signal=${signal || 'none'}).`, wasManual ? 'info' : 'warn');
    this.proc = null;
    this.startedAt = null;
    this.players.clear();
    this.lastTps = null;
    this.setStatus(STATUS.OFFLINE);

    if (!wasManual) {
      // Unexpected crash
      notifyDiscord(`:red_circle: "${this.name()}" **crashed** unexpectedly (code=${code}).`);
      this._maybeWatchdogRestart();
    }
  }

  // -- watchdog -----------------------------------------------------------

  _recentRestartCount() {
    const windowMs = (this.watchdogCfg().windowMinutes || 10) * 60000;
    const now = Date.now();
    this.restartTimestamps = this.restartTimestamps.filter((t) => now - t < windowMs);
    return this.restartTimestamps.length;
  }

  _maybeWatchdogRestart() {
    const wd = this.watchdogCfg();
    if (!wd.enabled) return;
    const recent = this._recentRestartCount();
    if (recent >= (wd.maxRestarts || 3)) {
      this.pushLine(`[Lodestone] Watchdog: ${recent} restarts within the window, NOT relaunching (possible crash-loop).`, 'error');
      notifyDiscord(`:no_entry: Watchdog "${this.name()}": restart limit reached (${recent}). Not relaunching to avoid a crash-loop.`);
      return;
    }
    this.restartTimestamps.push(Date.now());
    this.pushLine('[Lodestone] Watchdog: relaunching the server in 5s...', 'warn');
    notifyDiscord(`:yellow_circle: Watchdog "${this.name()}": relaunching automatically...`);
    setTimeout(() => {
      if (!this.isRunning()) this.start();
    }, 5000);
  }
}

// ---------------------------------------------------------------------------
// Manager registry
// ---------------------------------------------------------------------------

const managers = new Map();

function getManager(id) {
  if (!id) return null;
  if (!managers.has(id)) {
    const m = new ServerManager(id);
    m.broadcast = (obj) => globalBroadcast({ ...obj, serverId: id });
    managers.set(id, m);
  }
  return managers.get(id);
}

function activeManager() {
  return getManager(config.activeServerId);
}

function targetManager(req) {
  const id = (req.query && req.query.serverId) || (req.body && req.body.serverId) || config.activeServerId;
  return getManager(id);
}

// Pre-create a manager (offline) for every registered server.
function ensureManagers() {
  for (const s of config.servers) getManager(s.id);
}
ensureManagers();

// ---------------------------------------------------------------------------
// Express + HTTP + WebSocket
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '2mb' }));

// ---------------------------------------------------------------------------
// Language detection (login IP → country → en/es) and translated errors
// ---------------------------------------------------------------------------

// Resolves a tag like "es-AR" or "es" to one of the supported languages.
function langFromAcceptLanguage(header) {
  if (!header || typeof header !== 'string') return null;
  const tags = header.split(',').map((s) => {
    const [tag, ...rest] = s.trim().split(';');
    const q = rest.find((p) => p.trim().startsWith('q='));
    const qv = q ? parseFloat(q.split('=')[1]) : 1;
    return { tag: tag.toLowerCase(), q: Number.isFinite(qv) ? qv : 1 };
  }).sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    const base = tag.split('-')[0];
    if (i18n.SUPPORTED_LANGS.includes(base)) return base;
  }
  return null;
}

// Treat loopback and private/ULA addresses as "no public IP" — geolocation
// would be useless and the user is most likely sitting at the panel itself.
function isPrivateOrLoopback(ip) {
  if (!ip) return true;
  const s = String(ip).trim();
  if (s === '::1' || s === '::ffff:127.0.0.1') return true;
  if (s.startsWith('127.')) return true;
  if (/^10\./.test(s)) return true;
  if (/^192\.168\./.test(s)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(s)) return true;
  if (/^169\.254\./.test(s)) return true;
  if (/^fc[0-9a-f]{2}:/i.test(s)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(s)) return true;
  return false;
}

function pickRequestIp(req, bodyClientIp) {
  // Prefer the IP the browser chose to report (it knows its real public IP,
  // the server only sees 127.0.0.1 when the panel runs on localhost). Fall
  // back to the socket IP, then to the X-Forwarded-For header so the panel
  // works behind a reverse proxy that sets it.
  if (bodyClientIp && !isPrivateOrLoopback(bodyClientIp)) return bodyClientIp;
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (xff && !isPrivateOrLoopback(xff)) return xff;
  const sock = req.socket && (req.socket.remoteAddress || '');
  if (sock) {
    // Node returns IPv6-mapped IPv4 as "::ffff:1.2.3.4" — strip the prefix.
    const cleaned = sock.replace(/^::ffff:/i, '');
    return cleaned;
  }
  return '';
}

// ipwho.is is free, HTTPS, no key. Cache results for 24h so a single panel
// login doesn't pay the round-trip on every refresh. Failure is silent and
// degrades to the user's stored language (or the default).
const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const geoCache = new Map();

async function geolocateIp(ip) {
  if (!ip || isPrivateOrLoopback(ip)) return null;
  const cached = geoCache.get(ip);
  if (cached && cached.expires > Date.now()) return cached.value;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      headers: { 'User-Agent': 'Lodestone-Panel/1.0' },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const d = await r.json();
    const value = (d && d.success !== false && d.country_code) ? { country: String(d.country_code).toUpperCase() } : null;
    geoCache.set(ip, { value, expires: Date.now() + GEO_CACHE_TTL_MS });
    return value;
  } catch (_) {
    return null;
  }
}

// Decide which language to use for a user. Order:
//   1. user.language (already set explicitly or on a previous login)
//   2. body.lang / Accept-Language header (manual override for this request)
//   3. geolocate the client IP and map country → language
//   4. default ('en')
function pickUserLanguage(user, req, body) {
  if (user && user.language && i18n.SUPPORTED_LANGS.includes(user.language)) return user.language;
  if (body && i18n.SUPPORTED_LANGS.includes(body.lang)) return body.lang;
  const al = langFromAcceptLanguage(req.headers['accept-language']);
  if (al) return al;
  return i18n.DEFAULT_LANG;
}

// Convenience: translate a key for the user's language, falling back to en
// automatically. `user` may be null on the login endpoint itself.
function tErr(user, key, vars) {
  const lang = (user && user.language) || i18n.DEFAULT_LANG;
  return i18n.t(lang, key, vars);
}

// Build a structured error object: { __i18n: true, key, vars }. Routes pass
// this through `localizeErr(user, err)` to get a translated message. Plain
// strings pass through unchanged so ad-hoc messages (e.g. "HTTP 500") still
// work.
function eKey(key, vars) {
  return { __i18n: true, key, vars: vars || null };
}

function localizeErr(user, err) {
  if (err && typeof err === 'object' && err.__i18n) return tErr(user, err.key, err.vars || undefined);
  if (err && typeof err === 'object' && err.key) return tErr(user, err.key, err.vars || undefined);
  return String(err == null ? '' : err);
}

// --- auth ---
function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, lang: i18n.normalizeLang(user.language) }, config.jwtSecret, {
    expiresIn: `${config.sessionHours || 168}h`,
  });
}

// Returns the decoded payload, or null when the token is missing/invalid.
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (_) {
    return null;
  }
}

// Resolve the live user behind a token (so deleting a user revokes its sessions).
function userFromToken(token) {
  const payload = token ? verifyToken(token) : null;
  return payload ? findUser(payload.sub) : null;
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || '');
  const user = userFromToken(token);
  if (!user) {
    return res.status(401).json({ error: tErr(user, 'errors.unauthorized') });
  }
  req.user = user;
  next();
}

app.post('/api/login', async (req, res) => {
  const { email, username, password, clientIp, lang } = req.body || {};
  const identifier = (username != null && String(username).trim()) || (email != null && String(email).trim()) || '';
  const user = findUserByLogin(identifier);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: tErr({ language: lang }, 'errors.wrongCredentials') });
  }

  // Decide which language to use for this session:
  //   - An explicit `lang` field on the body (manual switcher before login) wins.
  //   - Otherwise, if the user already has a language set, keep it.
  //   - Otherwise, geolocate the client IP and map country → language, then
  //     persist that first-time detection on the user record so it sticks.
  let chosen = i18n.normalizeLang(lang);
  if (chosen === i18n.DEFAULT_LANG && i18n.SUPPORTED_LANGS.includes(user.language)) {
    chosen = user.language;
  }
  if (chosen === i18n.DEFAULT_LANG) {
    const ip = pickRequestIp(req, clientIp);
    const geo = await geolocateIp(ip);
    if (geo && geo.country) {
      const detected = i18n.countryToLanguage(geo.country);
      if (detected !== user.language) {
        user.language = detected;
        saveConfig(config);
      }
      chosen = detected;
    }
  }
  user.language = chosen;

  res.json({ token: signToken(user), user: publicUser(user) });
});

// Everything else under /api requires a token
app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  return authMiddleware(req, res, next);
});

// --- users CRUD (any logged-in user can manage users) ---
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}
// Username rules: 1-32 chars, no leading/trailing whitespace, no '@' (so
// usernames can't be confused with emails on login). Letters, digits,
// dot, dash, underscore are fine.
const USERNAME_RE = /^[A-Za-z0-9._-]{1,32}$/;

function validateIdentifier({ email, username }) {
  const e = email === undefined ? undefined : normalizeEmail(email);
  const u = username === undefined ? undefined : normalizeUsername(username);
  if (e === undefined || e === '') {
    // only fail if the caller tried to set email and it's malformed
  } else if (!e.includes('@')) {
    return { error: 'emailInvalid' };
  }
  if (u !== undefined && u !== '' && !USERNAME_RE.test(u)) {
    return { error: 'usernameInvalid' };
  }
  return { email: e, username: u };
}

app.get('/api/me', (req, res) => res.json(publicUser(req.user)));

// Manual language switch — the user can change it any time from the header.
app.put('/api/me/language', (req, res) => {
  const next = i18n.normalizeLang((req.body || {}).language);
  if (!i18n.SUPPORTED_LANGS.includes(next)) {
    return res.status(400).json({ error: tErr(req.user, 'errors.langInvalid') });
  }
  if (req.user.language !== next) {
    req.user.language = next;
    saveConfig(config);
  }
  res.json({ user: publicUser(req.user) });
});

app.get('/api/users', (req, res) => {
  res.json({ users: (config.users || []).map(publicUser) });
});

app.post('/api/users', (req, res) => {
  const { email, username, name, password } = req.body || {};
  const v = validateIdentifier({ email, username });
  if (v.error === 'emailInvalid') return res.status(400).json({ error: tErr(req.user, 'errors.emailInvalid') });
  if (v.error === 'usernameInvalid') return res.status(400).json({ error: tErr(req.user, 'errors.usernameInvalid') });
  if (!v.email && !v.username) return res.status(400).json({ error: tErr(req.user, 'errors.identifierRequired') });
  if (typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: tErr(req.user, 'errors.passwordTooShort') });
  }
  if (v.email && findUserByEmail(v.email)) return res.status(400).json({ error: tErr(req.user, 'errors.emailTaken') });
  if (v.username && findUserByUsername(v.username)) return res.status(400).json({ error: tErr(req.user, 'errors.usernameTaken') });
  const user = {
    id: genId(),
    email: v.email || '',
    username: v.username || '',
    name: String(name || '').trim(),
    passwordHash: hashPassword(password),
  };
  config.users.push(user);
  saveConfig(config);
  res.json({ user: publicUser(user) });
});

app.put('/api/users/:id', (req, res) => {
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ error: tErr(req.user, 'errors.userNotFound') });
  const { email, username, name, password } = req.body || {};
  if (email !== undefined) {
    const e = normalizeEmail(email);
    if (e && !e.includes('@')) return res.status(400).json({ error: tErr(req.user, 'errors.emailInvalid') });
    if (e) {
      const clash = findUserByEmail(e);
      if (clash && clash.id !== user.id) return res.status(400).json({ error: tErr(req.user, 'errors.emailTaken') });
    }
    user.email = e;
  }
  if (username !== undefined) {
    const u = normalizeUsername(username);
    if (u && !USERNAME_RE.test(u)) return res.status(400).json({ error: tErr(req.user, 'errors.usernameInvalid') });
    if (u) {
      const clash = findUserByUsername(u);
      if (clash && clash.id !== user.id) return res.status(400).json({ error: tErr(req.user, 'errors.usernameTaken') });
    }
    user.username = u;
  }
  // Make sure the user still has at least one way to log in.
  if (!user.email && !user.username) {
    return res.status(400).json({ error: tErr(req.user, 'errors.identifierRequired') });
  }
  if (name !== undefined) user.name = String(name || '').trim();
  if (password !== undefined && password !== '') {
    if (typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: tErr(req.user, 'errors.passwordTooShort') });
    }
    user.passwordHash = hashPassword(password);
  }
  saveConfig(config);
  res.json({ user: publicUser(user) });
});

app.delete('/api/users/:id', (req, res) => {
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ error: tErr(req.user, 'errors.userNotFound') });
  if (config.users.length <= 1) return res.status(400).json({ error: tErr(req.user, 'errors.cannotDeleteLastUser') });
  if (user.id === req.user.id) return res.status(400).json({ error: tErr(req.user, 'errors.cannotDeleteSelf') });
  config.users = config.users.filter((u) => u.id !== user.id);
  saveConfig(config);
  res.json({ ok: true });
});

// --- config (without secrets) ---
function publicConfig() {
  const c = JSON.parse(JSON.stringify(config));
  delete c.password;
  delete c.jwtSecret;
  delete c.users;
  return c;
}

app.get('/api/config', (req, res) => res.json(publicConfig()));

// Update only the backup-retention settings. After saving, prune every
// server's existing backups so a newly-lowered limit takes effect right
// away (not just on the next backup).
app.put('/api/config/backups', (req, res) => {
  const b = req.body || {};
  const toNonNegInt = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  };
  const maxCount = toNonNegInt(b.maxCount);
  const maxSizeMB = toNonNegInt(b.maxSizeMB);
  if (maxCount === null || maxSizeMB === null) {
    return res.status(400).json({ error: tErr(req.user, 'errors.invalidBackupsConfig') });
  }
  if (!config.backups) config.backups = {};
  config.backups.maxCount = maxCount;
  config.backups.maxSizeMB = maxSizeMB;
  saveConfig(config);
  for (const s of config.servers) {
    try { pruneBackups(slugify(s.name)); } catch (_) { /* noop */ }
  }
  res.json({ ok: true, backups: config.backups });
});

// ---------------------------------------------------------------------------
// Filesystem browser (for registering a server)
// ---------------------------------------------------------------------------

// The "roots" shown when the folder browser is at the top level. On Windows
// these are the drive letters (C:\, D:\, ...). On POSIX there are no drive
// letters, so we offer the user's home folder and the filesystem root as
// jumping-off points; navigation from there walks the tree normally.
function listDrives() {
  if (process.platform === 'win32') {
    const drives = [];
    for (const c of 'CDEFGHIJKLMNOPQRSTUVWXYZAB') {
      const root = `${c}:\\`;
      try {
        fs.accessSync(root);
        drives.push(root);
      } catch (_) { /* not present */ }
    }
    return drives;
  }
  const roots = [];
  const home = os.homedir();
  if (home && home !== '/') roots.push(home);
  roots.push('/');
  return roots;
}

app.get('/api/fs', (req, res) => {
  const p = (req.query.path || '').trim();
  try {
    if (!p) {
      return res.json({ path: '', parent: null, drives: listDrives(), dirs: [], jars: [], sep: path.sep });
    }
    const abs = path.resolve(p);
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    const dirs = [];
    const jars = [];
    for (const e of entries) {
      try {
        if (e.isDirectory()) dirs.push(e.name);
        else if (e.isFile() && e.name.toLowerCase().endsWith('.jar')) jars.push(e.name);
      } catch (_) { /* skip unreadable entry */ }
    }
    dirs.sort((a, b) => a.localeCompare(b));
    jars.sort((a, b) => a.localeCompare(b));
    const parentCandidate = path.dirname(abs);
    const parent = parentCandidate === abs ? '' : parentCandidate; // '' => back to drive list
    res.json({ path: abs, parent, drives: [], dirs, jars, sep: path.sep });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Native folder picker — pops the real OS folder dialog (Windows Explorer /
// Linux zenity / macOS Finder) and returns the chosen absolute path. The
// in-browser custom folder browser is still used for "Register server" but
// the "Create a new server" flow uses this so the user gets the familiar
// native dialog. We shell out to a tiny per-platform helper; the server is
// blocked (synchronous) for the duration of the dialog, which is fine for a
// single-user local panel.
// ---------------------------------------------------------------------------

function pickFolderWindows(defaultPath) {
  // PowerShell + the modern Win10/11 "Choose a folder" dialog. The legacy
  // FolderBrowserDialog shows an outdated tree view; the dialog used here is
  // the same one Explorer's "Select Folder" picks (IFileOpenDialog with the
  // FOS_PICKFOLDERS option). The C# class below calls it through COM and
  // returns the selected filesystem path. The whole script is sent as a
  // Base64-encoded UTF-16LE -EncodedCommand so paths with spaces, "N" or
  // quotes never need escaping.
  const csharp = `
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class ModernFolderDialog
{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath, IntPtr pbc, ref Guid riid, out IntPtr ppv);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
    private class FileOpenDialogRcw { }

    // Vtable order MUST match the COM definition of IFileOpenDialog:
    // IModalWindow (1) + IFileDialog (17) + IFileOpenDialog (8) = 26 entries.
    [ComImport, Guid("D57C7288-D4AD-4768-BE02-9D969532D960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOpenDialog
    {
        [PreserveSig] int Show(IntPtr parent);
        [PreserveSig] int SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        [PreserveSig] int SetFileTypeIndex(uint iFileType);
        [PreserveSig] int GetFileTypeIndex(out uint piFileType);
        [PreserveSig] int Advise(IntPtr pfde, out uint pdwCookie);
        [PreserveSig] int Unadvise(uint dwCookie);
        [PreserveSig] int SetOptions(uint fos);
        [PreserveSig] int GetOptions(out uint pfos);
        [PreserveSig] int SetDefaultFolder(IntPtr psi);
        [PreserveSig] int SetFolder(IntPtr psi);
        [PreserveSig] int GetFolder(out IntPtr ppsi);
        [PreserveSig] int GetCurrentSelection(out IntPtr ppsi);
        [PreserveSig] int SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        [PreserveSig] int GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        [PreserveSig] int SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        [PreserveSig] int SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        [PreserveSig] int SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        [PreserveSig] int GetResult(out IntPtr ppsi);
        [PreserveSig] int AddPlace(IntPtr psi, int fdap);
        [PreserveSig] int SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        [PreserveSig] int Close(int hr);
        [PreserveSig] int SetClientGuid(ref Guid guid);
        [PreserveSig] int ClearClientData();
        [PreserveSig] int SetFilter(IntPtr pFilter);
        [PreserveSig] int GetResults(out IntPtr ppenum);
        [PreserveSig] int GetSelectedItems(out IntPtr ppsai);
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        [PreserveSig] int BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int GetParent(out IntPtr ppsi);
        [PreserveSig] int GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        [PreserveSig] int GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        [PreserveSig] int Compare(IntPtr psi, uint hint, out int piOrder);
    }

    public static string Pick(string title, string initialPath)
    {
        const uint FOS_PICKFOLDERS = 0x20;
        const uint FOS_FORCEFILESYSTEM = 0x40;
        // 0x800704C7 (ERROR_CANCELLED) overflows int; the old C# compiler
        // used by Windows PowerShell 5.1's Add-Type rejects the bare hex
        // literal in an int comparison, so cast it via unchecked().
        const int HRESULT_CANCELLED = unchecked((int)0x800704C7);

        IFileOpenDialog dlg = (IFileOpenDialog)new FileOpenDialogRcw();
        dlg.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM);
        dlg.SetTitle(title);

        if (!string.IsNullOrEmpty(initialPath) && Directory.Exists(initialPath))
        {
            Guid iid = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
            IntPtr item;
            if (SHCreateItemFromParsingName(initialPath, IntPtr.Zero, ref iid, out item) == 0 && item != IntPtr.Zero)
            {
                dlg.SetFolder(item);
                Marshal.Release(item);
            }
        }

        // Anchor the dialog to the user's current foreground window (the
        // browser) so it pops on top of it instead of being orphaned. The
        // spawned PowerShell has no visible parent of its own.
        IntPtr parent = GetForegroundWindow();
        if (parent != IntPtr.Zero) SetForegroundWindow(parent);

        int hr = dlg.Show(parent);
        // hr == 0: user pressed OK
        // hr == 0x800704C7 (ERROR_CANCELLED): user pressed Cancel
        if (hr == 0) {
            IntPtr resultPtr;
            if (dlg.GetResult(out resultPtr) != 0 || resultPtr == IntPtr.Zero) return "__ERROR__:GetResult failed (0x" + Marshal.GetLastWin32Error().ToString("X") + ")";
            IShellItem item2 = (IShellItem)Marshal.GetTypedObjectForIUnknown(resultPtr, typeof(IShellItem));
            string path;
            item2.GetDisplayName(0x80058000, out path);
            Marshal.ReleaseComObject(item2);
            Marshal.Release(resultPtr);
            return path;
        }
        if (hr == HRESULT_CANCELLED) return "__CANCELLED__";
        return "__ERROR__:Show returned 0x" + hr.ToString("X");
    }
}
`;
  const ps = [
    `$ErrorActionPreference = 'Stop'`,
    `try {`,
    `  $src = @'\n${csharp}\n'@`,
    `  Add-Type -TypeDefinition $src -Language CSharp`,
    `  $p = [ModernFolderDialog]::Pick(${JSON.stringify('Select the parent folder for the new server')}, ${JSON.stringify(defaultPath || '')})`,
    `  if ($p -and -not $p.StartsWith('__ERROR__')) {`,
    `    [Console]::Out.WriteLine($p); exit 0`,
    `  } elseif ($p -eq '__CANCELLED__') {`,
    `    exit 2`,
    `  } else {`,
    `    [Console]::Error.WriteLine('FOLDERPICKER_ERR:' + $p); exit 1`,
    `  }`,
    `} catch {`,
    `  [Console]::Error.WriteLine('FOLDERPICKER_ERR:' + $_.Exception.Message)`,
    `  exit 1`,
    `}`,
  ].join('\n');
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  const modern = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    windowsHide: true,
  });
  // If the modern IFileOpenDialog path errored (exit 1) fall back to the
  // legacy Windows.Forms FolderBrowserDialog so the Browse button at least
  // works. Cancellation (exit 2) is passed through as-is.
  if (modern.status === 1) {
    return pickFolderWindowsLegacy(defaultPath);
  }
  return modern;
}

function pickFolderWindowsLegacy(defaultPath) {
  // Fallback: the older Windows.Forms FolderBrowserDialog. It shows a
  // tree-style picker instead of the modern Explorer one, but it ships in
  // every .NET Framework since 1.1 and never fails to display. We only set
  // properties that exist on every supported framework version (Description
  // and ShowNewFolderButton) — UseDescriptionForTitle and the description-
  // as-title trick are .NET 4.0+ only and aren't on every PowerShell host.
  const ps = [
    `try {`,
    `  Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop | Out-Null`,
    `  $f = New-Object System.Windows.Forms.FolderBrowserDialog`,
    `  $f.Description = 'Select the parent folder for the new server'`,
    `  $f.ShowNewFolderButton = $true`,
    defaultPath
      ? `try { $f.SelectedPath = (Resolve-Path -LiteralPath ${JSON.stringify(defaultPath)} -ErrorAction Stop).ProviderPath } catch {}`
      : '',
    `  if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.WriteLine($f.SelectedPath); exit 0 } else { exit 2 }`,
    `} catch {`,
    `  [Console]::Error.WriteLine('FOLDERPICKER_ERR:' + $_.Exception.Message); exit 1`,
    `}`,
  ].filter(Boolean).join('\n');
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

function pickFolderLinux(defaultPath) {
  // Use the desktop's own native file chooser: zenity on GTK (what Nautilus,
  // gedit, GNOME Settings, Firefox etc. shell out to — gives the actual GTK
  // file dialog), kdialog on Qt (what KDE apps use). If neither is installed
  // the caller surfaces a "Folder picker not available" error and the user
  // can type the path by hand.
  const start = defaultPath ? defaultPath.replace(/'/g, "'\\''") + '/' : '';
  const zenityArgs = ['--file-selection', '--directory', '--title=Select the parent folder for the new server', `--filename=${start}`];
  let r = spawnSync('zenity', zenityArgs, { encoding: 'utf8' });
  if (r.error && r.error.code === 'ENOENT') {
    r = spawnSync('kdialog', ['--getexistingdirectory', defaultPath || os.homedir()], { encoding: 'utf8' });
  }
  return r;
}

function pickFolderMacos(defaultPath) {
  const def = defaultPath ? `default location POSIX file ${JSON.stringify(defaultPath)}` : '';
  const script = `set _f to choose folder with prompt "Select the parent folder for the new server" ${def}\nPOSIX path of _f`;
  return spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
}

app.get('/api/pick-folder', (req, res) => {
  const def = String(req.query.defaultPath || '').trim();
  try {
    let r;
    if (process.platform === 'win32') r = pickFolderWindows(def);
    else if (process.platform === 'darwin') r = pickFolderMacos(def);
    else r = pickFolderLinux(def);

    if (r.error) {
      return res.status(500).json({ error: tErr(req.user, 'errors.pickFolderUnavailable', { error: r.error.message }) });
    }
    if (r.status === 0) {
      const out = (r.stdout || '').toString().replace(/\r?\n$/, '');
      if (!out) return res.json({ path: null, cancelled: true });
      if (!fs.existsSync(out) || !fs.statSync(out).isDirectory()) {
        return res.status(400).json({ error: `Picked path is not a folder: ${out}` });
      }
      return res.json({ path: out });
    }
    // Exit 2 = explicit "user cancelled" (modern IFileOpenDialog or legacy
    // FolderBrowserDialog). Anything else is a real error: pull the
    // FOLDERPICKER_ERR: prefix the helper writes so the toast is clean
    // instead of the raw PowerShell CLIXML noise.
    if (r.status === 2) return res.json({ path: null, cancelled: true });
    const allOut = ((r.stdout || '') + '\n' + (r.stderr || '')).toString();
    const m = allOut.match(/FOLDERPICKER_ERR:\s*([^\r\n]+)/);
    const errMsg = m ? m[1].trim() : `Folder picker exited with code ${r.status}`;
    log('pick-folder error:', errMsg);
    return res.status(500).json({ error: errMsg });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Servers registry (register / edit / delete / control)
// ---------------------------------------------------------------------------

// True if the server has been started at least once. The Minecraft server
// always writes `server.properties` on its first run (along with the world
// folder, plugin/mod folders for paper/spigot, etc.), so its presence is the
// canonical "vanilla structure has been generated" signal we use to warn the
// user away from modding before a first start.
function hasGeneratedContent(s) {
  if (!s || !s.dir) return false;
  try {
    return fs.existsSync(path.join(s.dir, 'server.properties'));
  } catch (_) {
    return false;
  }
}

function serverWithStatus(s) {
  const m = getManager(s.id);
  return {
    id: s.id,
    name: s.name,
    dir: s.dir,
    jar: s.jar,
    javaArgs: s.javaArgs,
    mcVersion: s.mcVersion,
    worlds: s.worlds,
    watchdog: s.watchdog,
    active: s.id === config.activeServerId,
    hasGenerated: hasGeneratedContent(s),
    status: m.statusPayload(),
  };
}

app.get('/api/servers', (req, res) => {
  res.json({
    activeServerId: config.activeServerId,
    servers: config.servers.map(serverWithStatus),
  });
});

function validateServerInput(body, user) {
  const name = String(body.name || '').trim();
  const dir = String(body.dir || '').trim();
  let jar = String(body.jar || '').trim();
  if (!name) return { error: eKey('errors.nameRequired') };
  if (!dir) return { error: eKey('errors.folderRequired') };
  if (!fs.existsSync(dir)) return { error: eKey('errors.folderDoesNotExist', { path: dir }) };
  if (!fs.statSync(dir).isDirectory()) return { error: eKey('errors.notAFolder') };
  // Auto-detect the jar if not supplied and exactly one exists.
  if (!jar) {
    const jars = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.jar'));
    if (jars.length === 1) jar = jars[0];
    else if (jars.length === 0) return { error: eKey('errors.noJar') };
    else return { error: eKey('errors.multipleJars') };
  } else if (!fs.existsSync(path.join(dir, jar))) {
    return { error: eKey('errors.jarNotFound', { name: jar }) };
  }
  let javaArgs = body.javaArgs;
  if (typeof javaArgs === 'string') {
    javaArgs = javaArgs.trim().split(/\s+/).filter(Boolean);
  }
  if (!Array.isArray(javaArgs) || !javaArgs.length) javaArgs = ['-Xmx2G', '-Xms2G'];
  let worlds = body.worlds;
  if (typeof worlds === 'string') worlds = worlds.split(',').map((w) => w.trim()).filter(Boolean);
  if (!Array.isArray(worlds) || !worlds.length) worlds = ['world', 'world_nether', 'world_the_end'];
  return {
    value: {
      name,
      dir,
      jar,
      javaArgs,
      worlds,
      mcVersion: String(body.mcVersion || '').trim(),
      stopTimeoutSeconds: Number(body.stopTimeoutSeconds) || 30,
    },
  };
}

app.post('/api/servers', (req, res) => {
  const v = validateServerInput(req.body || {}, req.user);
  if (v.error) return res.status(400).json({ error: localizeErr(req.user, v.error) });
  const entry = {
    id: genId(),
    watchdog: { enabled: false, maxRestarts: 3, windowMinutes: 10 },
    ...v.value,
  };
  config.servers.push(entry);
  if (!config.activeServerId) config.activeServerId = entry.id;
  saveConfig(config);
  getManager(entry.id);
  res.json({ ok: true, server: serverWithStatus(entry) });
});

app.put('/api/servers/:id', (req, res) => {
  const s = findServer(req.params.id);
  if (!s) return res.status(404).json({ error: tErr(req.user, 'errors.serverNotFound') });
  const m = getManager(s.id);
  if (m.isRunning()) return res.status(409).json({ error: tErr(req.user, 'errors.stopBeforeEdit') });
  const v = validateServerInput(req.body || {}, req.user);
  if (v.error) return res.status(400).json({ error: localizeErr(req.user, v.error) });
  Object.assign(s, v.value);
  if (req.body.watchdog && typeof req.body.watchdog === 'object') {
    s.watchdog = {
      enabled: !!req.body.watchdog.enabled,
      maxRestarts: Number(req.body.watchdog.maxRestarts) || 3,
      windowMinutes: Number(req.body.watchdog.windowMinutes) || 10,
    };
  }
  saveConfig(config);
  res.json({ ok: true, server: serverWithStatus(s) });
});

app.delete('/api/servers/:id', (req, res) => {
  const s = findServer(req.params.id);
  if (!s) return res.status(404).json({ error: tErr(req.user, 'errors.serverNotFound') });
  const m = getManager(s.id);
  if (m.isRunning()) return res.status(409).json({ error: tErr(req.user, 'errors.stopBeforeRemove') });
  config.servers = config.servers.filter((x) => x.id !== s.id);
  managers.delete(s.id);
  if (config.activeServerId === s.id) {
    config.activeServerId = config.servers.length ? config.servers[0].id : null;
  }
  saveConfig(config);
  res.json({ ok: true, activeServerId: config.activeServerId });
});

app.post('/api/active', (req, res) => {
  const id = req.body && req.body.serverId;
  if (!findServer(id)) return res.status(404).json({ error: tErr(req.user, 'errors.serverNotFound') });
  config.activeServerId = id;
  saveConfig(config);
  res.json({ ok: true, activeServerId: id });
});

app.post('/api/servers/:id/start', (req, res) => res.json(localizeManagerResult(req, getManagerOr404(req, res, (m) => m.start()))));
app.post('/api/servers/:id/stop', (req, res) => res.json(localizeManagerResult(req, getManagerOr404(req, res, (m) => m.stop(req.body && req.body.force)))));
app.post('/api/servers/:id/restart', async (req, res) => {
  const s = findServer(req.params.id);
  if (!s) return res.status(404).json({ error: tErr(req.user, 'errors.serverNotFound') });
  const r = await getManager(s.id).restart();
  res.json(localizeManagerResult(req, r));
});

function getManagerOr404(req, res, fn) {
  const s = findServer(req.params.id);
  if (!s) { res.status(404); return { error: eKey('errors.serverNotFound') }; }
  return fn(getManager(s.id));
}

// Translate the manager-shaped result ({ ok, error }) and 4xx the failure.
function localizeManagerResult(req, r) {
  if (!r || r.ok) return r;
  return { ok: false, error: localizeErr(req.user, r.error) };
}

// --- server status / actions (active server, legacy-compatible) ---
app.get('/api/status', (req, res) => {
  const m = activeManager();
  res.json(m ? m.statusPayload() : { status: 'offline', serverId: null });
});

app.post('/api/server/start', (req, res) => {
  const m = targetManager(req);
  res.json(localizeManagerResult(req, m ? m.start() : { ok: false, error: eKey('errors.noActiveServer') }));
});
app.post('/api/server/stop', (req, res) => {
  const m = targetManager(req);
  res.json(localizeManagerResult(req, m ? m.stop(req.body && req.body.force) : { ok: false, error: eKey('errors.noActiveServer') }));
});
app.post('/api/server/restart', async (req, res) => {
  const m = targetManager(req);
  res.json(localizeManagerResult(req, m ? await m.restart() : { ok: false, error: eKey('errors.noActiveServer') }));
});

app.post('/api/command', (req, res) => {
  const cmd = req.body && req.body.cmd;
  if (!cmd || typeof cmd !== 'string') return res.status(400).json({ error: tErr(req.user, 'errors.missingCmd') });
  const m = targetManager(req);
  res.json(localizeManagerResult(req, m ? m.sendCommand(cmd) : { ok: false, error: eKey('errors.noActiveServer') }));
});

// --- players ---
app.get('/api/players', (req, res) => {
  const m = targetManager(req);
  if (!m) return res.json({ players: [], max: 0 });
  res.json({ players: [...m.players].sort(), max: m.maxPlayers });
});

app.post('/api/players/:action', (req, res) => {
  const name = (req.body && req.body.name || '').trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) return res.status(400).json({ error: tErr(req.user, 'errors.invalidName') });
  const map = {
    kick: `kick ${name}`,
    ban: `ban ${name}`,
    pardon: `pardon ${name}`,
    op: `op ${name}`,
    deop: `deop ${name}`,
    'whitelist-add': `whitelist add ${name}`,
    'whitelist-remove': `whitelist remove ${name}`,
  };
  const cmd = map[req.params.action];
  if (!cmd) return res.status(400).json({ error: tErr(req.user, 'errors.unknownAction') });
  const m = targetManager(req);
  res.json(localizeManagerResult(req, m ? m.sendCommand(cmd) : { ok: false, error: eKey('errors.noActiveServer') }));
});

// ---------------------------------------------------------------------------
// Player management (Crafty-style): whitelist / operators / banned players.
// Reads the server's JSON lists so they can be viewed even while offline; for
// add/remove it sends the in-game command when the server is running, and edits
// the files directly when it is offline.
// ---------------------------------------------------------------------------

function readJsonArray(file) {
  try {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}
function writeJsonArray(file, arr) {
  fs.writeFileSync(file, JSON.stringify(arr, null, 2), 'utf8');
}
function whitelistEnabled(dir) {
  try {
    const props = fs.readFileSync(path.join(dir, 'server.properties'), 'utf8');
    return /^white-list\s*=\s*true/m.test(props);
  } catch (_) { return false; }
}
// Look up a player's Mojang UUID (needed to add to files while offline, online-mode servers).
async function mojangUuid(name) {
  try {
    const d = await fetchJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
    if (d && d.id && d.id.length === 32) {
      return d.id.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    }
  } catch (_) {}
  return null;
}

app.get('/api/playerlists', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.json({ online: [], whitelist: [], ops: [], banned: [], whitelistEnabled: false, running: false });
  const d = m.dir();
  const wl = readJsonArray(path.join(d, 'whitelist.json')).map((x) => x.name).filter(Boolean);
  const ops = readJsonArray(path.join(d, 'ops.json')).map((x) => x.name).filter(Boolean);
  const banned = readJsonArray(path.join(d, 'banned-players.json')).map((x) => ({ name: x.name, reason: x.reason || '' })).filter((x) => x.name);
  res.json({
    online: [...m.players].sort((a, b) => a.localeCompare(b)),
    whitelist: wl.sort((a, b) => a.localeCompare(b)),
    ops: ops.sort((a, b) => a.localeCompare(b)),
    banned,
    whitelistEnabled: whitelistEnabled(d),
    running: m.isRunning(),
  });
});

// Toggle the whitelist on/off (sends command when running, edits server.properties when offline).
app.post('/api/whitelist/toggle', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const on = !!(req.body && req.body.enabled);
  if (m.isRunning()) return res.json(localizeManagerResult(req, m.sendCommand(`whitelist ${on ? 'on' : 'off'}`)));
  try {
    const file = path.join(m.dir(), 'server.properties');
    let props = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (/^white-list\s*=.*/m.test(props)) props = props.replace(/^white-list\s*=.*/m, `white-list=${on}`);
    else props += `${props.endsWith('\n') || !props ? '' : '\n'}white-list=${on}\n`;
    fs.writeFileSync(file, props, 'utf8');
    res.json({ ok: true, note: 'Saved. Takes effect on next start.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add/remove a player to/from a list, working both online and offline.
// kind: whitelist | op | ban ; op: add | remove
app.post('/api/playerlists/:kind/:op', async (req, res) => {
  const name = (req.body && req.body.name || '').trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) return res.status(400).json({ error: tErr(req.user, 'errors.invalidPlayerName') });
  const { kind, op } = req.params;
  if (!['whitelist', 'op', 'ban'].includes(kind) || !['add', 'remove'].includes(op)) {
    return res.status(400).json({ error: tErr(req.user, 'errors.unknownAction') });
  }
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });

  // Online: let Minecraft do it (resolves UUIDs, applies immediately).
  if (m.isRunning()) {
    const cmds = {
      'whitelist:add': `whitelist add ${name}`, 'whitelist:remove': `whitelist remove ${name}`,
      'op:add': `op ${name}`, 'op:remove': `deop ${name}`,
      'ban:add': `ban ${name}`, 'ban:remove': `pardon ${name}`,
    };
    return res.json(localizeManagerResult(req, m.sendCommand(cmds[`${kind}:${op}`])));
  }

  // Offline: edit the JSON files directly.
  const d = m.dir();
  const files = { whitelist: 'whitelist.json', op: 'ops.json', ban: 'banned-players.json' };
  const file = path.join(d, files[kind]);
  try {
    if (op === 'remove') {
      const arr = readJsonArray(file);
      const next = arr.filter((x) => (x.name || '').toLowerCase() !== name.toLowerCase());
      writeJsonArray(file, next);
      return res.json({ ok: true, note: 'Updated (server offline).' });
    }
    // add → needs a UUID
    const uuid = await mojangUuid(name);
    if (!uuid) return res.status(400).json({ error: tErr(req.user, 'errors.couldNotResolvePlayer') });
    const arr = readJsonArray(file);
    if (arr.some((x) => (x.name || '').toLowerCase() === name.toLowerCase())) return res.json({ ok: true, note: 'Already listed.' });
    if (kind === 'whitelist') arr.push({ uuid, name });
    else if (kind === 'op') arr.push({ uuid, name, level: 4, bypassesPlayerLimit: false });
    else if (kind === 'ban') arr.push({ uuid, name, created: new Date().toISOString(), source: 'Lodestone', expires: 'forever', reason: 'Banned by an operator' });
    writeJsonArray(file, arr);
    return res.json({ ok: true, note: 'Updated (server offline).' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// Metrics history (Crafty-style): per-server time series persisted to disk.
// Sampled once a minute: CPU %, memory (MB), players online, world size (MB).
// ---------------------------------------------------------------------------

const METRICS_PATH = path.join(__dirname, 'metrics.json');
const METRICS_INTERVAL_MS = 60 * 1000;          // sample every minute
const METRICS_RETAIN_MS = 7 * 24 * 3600 * 1000; // keep 7 days
const WORLD_SIZE_EVERY = 5;                      // recompute world size every ~5 samples

let metrics = {};            // { [serverId]: [ [t, cpu, memMB, players, worldMB], ... ] }
let metricsDirty = false;
let metricsTick = 0;
const worldSizeCache = {};   // { [serverId]: mb }

(function loadMetrics() {
  try { metrics = JSON.parse(fs.readFileSync(METRICS_PATH, 'utf8')) || {}; }
  catch (_) { metrics = {}; }
})();

function saveMetrics() {
  if (!metricsDirty) return;
  try { fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics)); metricsDirty = false; }
  catch (e) { log('metrics save failed:', e.message); }
}

// Recursive directory size (iterative, with a safety guard against huge trees).
function dirSize(dir) {
  let total = 0, guard = 0;
  const stack = [dir];
  while (stack.length) {
    if (++guard > 400000) break;
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else { try { total += fs.statSync(p).size; } catch (_) { /* noop */ } }
    }
  }
  return total;
}
function worldSizeMB(m) {
  const desc = m.desc();
  if (!desc.dir || !fs.existsSync(desc.dir)) return 0;
  const worlds = (desc.worlds && desc.worlds.length) ? desc.worlds : ['world'];
  let bytes = 0;
  for (const w of worlds) {
    const wp = path.join(desc.dir, w);
    if (fs.existsSync(wp)) bytes += dirSize(wp);
  }
  return Math.round(bytes / 1048576);
}

async function sampleMetrics() {
  metricsTick++;
  const recomputeWorld = (metricsTick % WORLD_SIZE_EVERY) === 1;
  const now = Date.now();
  for (const s of config.servers) {
    const m = getManager(s.id);
    let cpu = 0, memMB = 0, players = 0;
    if (m && m.isRunning() && m.proc && m.proc.pid) {
      try {
        const u = await procUsage(m.proc.pid);
        const cores = os.cpus().length || 1;
        cpu = Math.round(Math.min(100, (u ? u.cpu : 0) / cores));
        memMB = Math.round((u ? u.memory : 0) / 1048576);
      } catch (_) { /* process may have died */ }
      players = m.players.size;
    }
    let worldMB = worldSizeCache[s.id] || 0;
    if (recomputeWorld) {
      try { worldMB = worldSizeMB(m); worldSizeCache[s.id] = worldMB; } catch (_) { /* noop */ }
    }
    const arr = metrics[s.id] || (metrics[s.id] = []);
    arr.push([now, cpu, memMB, players, worldMB]);
    const cutoff = now - METRICS_RETAIN_MS;
    let drop = 0;
    while (drop < arr.length && arr[drop][0] < cutoff) drop++;
    if (drop) arr.splice(0, drop);
  }
  for (const id of Object.keys(metrics)) {
    if (!config.servers.some((s) => s.id === id)) delete metrics[id];
  }
  metricsDirty = true;
}

setInterval(sampleMetrics, METRICS_INTERVAL_MS);
setTimeout(sampleMetrics, 4000); // first sample shortly after boot
setInterval(saveMetrics, 5 * 60 * 1000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { saveMetrics(); process.exit(0); });

const METRICS_RANGES = { hour: 3600e3, '6h': 6 * 3600e3, day: 24 * 3600e3, week: 7 * 24 * 3600e3 };
app.get('/api/metrics', (req, res) => {
  const id = (req.query.serverId) || config.activeServerId;
  const rangeKey = METRICS_RANGES[req.query.range] ? req.query.range : '6h';
  const cutoff = Date.now() - METRICS_RANGES[rangeKey];
  const points = (metrics[id] || [])
    .filter((p) => p[0] >= cutoff)
    .map((p) => ({ t: p[0], cpu: p[1], mem: p[2], players: p[3], world: p[4] }));
  res.json({ serverId: id, range: rangeKey, points });
});

// --- plugins ---
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const m = targetManager(req);
      if (!m) return cb(new Error('No active server.'));
      const dir = m.pluginsDir();
      try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* noop */ }
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, path.basename(file.originalname)),
  }),
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.jar')) {
      return cb(new Error('Only .jar files are allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 200 * 1024 * 1024 },
});

app.get('/api/plugins', (req, res) => {
  const m = targetManager(req);
  if (!m) return res.json({ plugins: [] });
  try {
    const dir = m.pluginsDir();
    if (!fs.existsSync(dir)) return res.json({ plugins: [] });
    const files = fs.readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.jar'))
      .map((f) => {
        const st = fs.statSync(path.join(dir, f));
        return { name: f, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ plugins: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plugins/upload', upload.single('plugin'), (req, res) => {
  res.json({ ok: true, name: req.file && req.file.filename, note: 'Restart the server to apply.' });
}, (err, req, res, next) => {
  res.status(400).json({ error: tErr(req.user, err.message && err.message.includes('Only') ? 'errors.onlyJar' : 'errors.unknownAction') });
});

app.delete('/api/plugins/:name', (req, res) => {
  const m = targetManager(req);
  if (!m) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const name = path.basename(req.params.name);
  if (!name.toLowerCase().endsWith('.jar')) return res.status(400).json({ error: tErr(req.user, 'errors.notAJar') });
  const full = path.join(m.pluginsDir(), name);
  if (!fs.existsSync(full)) return res.status(404).json({ error: tErr(req.user, 'errors.fileDoesNotExist') });
  try {
    fs.unlinkSync(full);
    res.json({ ok: true, note: 'Restart the server to apply.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- config editor ---
function editableFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const allowed = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const lower = e.name.toLowerCase();
    if (lower === 'server.properties' || lower.endsWith('.yml') || lower.endsWith('.yaml')) {
      allowed.push(e.name);
    }
  }
  return allowed.sort();
}

function resolveEditable(dir, name) {
  const base = path.basename(name);
  const allowed = editableFiles(dir);
  if (!allowed.includes(base)) return null;
  return path.join(dir, base);
}

app.get('/api/configs', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.json({ files: [] });
  try {
    res.json({ files: editableFiles(m.dir()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/configs/:name', (req, res) => {
  const m = targetManager(req);
  if (!m) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const full = resolveEditable(m.dir(), req.params.name);
  if (!full) return res.status(404).json({ error: tErr(req.user, 'errors.fileNotAllowed') });
  try {
    res.json({ name: path.basename(full), content: fs.readFileSync(full, 'utf8') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/configs/:name', (req, res) => {
  const m = targetManager(req);
  if (!m) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const full = resolveEditable(m.dir(), req.params.name);
  if (!full) return res.status(404).json({ error: tErr(req.user, 'errors.fileNotAllowed') });
  const content = req.body && req.body.content;
  if (typeof content !== 'string') return res.status(400).json({ error: tErr(req.user, 'errors.missingContent') });
  try {
    if (fs.existsSync(full)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(full, `${full}.${stamp}.bak`);
    }
    fs.writeFileSync(full, content, 'utf8');
    res.json({ ok: true, note: 'Saved. Restart the server to apply.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- config .bak history (list + restore) ---------------------------------
// The PUT /api/configs/:name route above writes a timestamped .bak on every
// save. These two routes let the UI surface that history as a "History"
// dropdown and let the user roll back to any of those snapshots. Both are
// JWT-protected (via the /api middleware) and reuse resolveEditable so only
// allowlisted files can be snapshotted/restored. The restore endpoint writes
// a fresh .bak of the state it's about to overwrite, so the user can undo
// the restore itself.

const BAK_SUFFIX_RE = /\.[0-9TZ-]+\.bak$/i;

function bakStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

app.get('/api/configs/:name/backups', (req, res) => {
  const m = targetManager(req);
  if (!m) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const full = resolveEditable(m.dir(), req.params.name);
  if (!full) return res.status(404).json({ error: tErr(req.user, 'errors.fileNotAllowed') });
  try {
    const base = path.basename(full);
    const parentDir = path.dirname(full);
    const entries = fs.readdirSync(parentDir, { withFileTypes: true });
    const prefix = `${base}.`;
    const backups = entries
      .filter((e) => e.isFile() && e.name.startsWith(prefix) && e.name.endsWith('.bak'))
      .map((e) => {
        const stamp = e.name.slice(prefix.length, -'.bak'.length);
        if (!BAK_SUFFIX_RE.test('.' + stamp)) return null;
        const fullPath = path.join(parentDir, e.name);
        let st;
        try { st = fs.statSync(fullPath); } catch (_) { return null; }
        return { name: e.name, size: st.size, mtime: new Date(st.mtimeMs).toISOString() };
      })
      .filter(Boolean)
      .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
    res.json({ ok: true, backups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/configs/:name/restore', (req, res) => {
  const m = targetManager(req);
  if (!m) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const full = resolveEditable(m.dir(), req.params.name);
  if (!full) return res.status(404).json({ error: tErr(req.user, 'errors.fileNotAllowed') });
  const backupName = path.basename(String((req.body && req.body.backup) || ''));
  const base = path.basename(full);
  // Only allow backups of THIS file, with the matching "<base>.<stamp>.bak"
  // shape that PUT writes. Reject anything else (path traversal, foreign
  // files, oddly named snapshots). `path.basename` already strips any
  // directory part, so a request like ".." or "foo/../bar" can never reach
  // the disk.
  if (!backupName || !backupName.startsWith(`${base}.`) || !backupName.endsWith('.bak')
      || !BAK_SUFFIX_RE.test(backupName.slice(base.length))) {
    return res.status(400).json({ error: 'invalidBackup' });
  }
  const bakPath = path.join(path.dirname(full), backupName);
  if (!fs.existsSync(bakPath)) return res.status(404).json({ error: 'backupNotFound' });
  try {
    let content;
    if (fs.existsSync(full)) {
      // Snapshot the state we are about to overwrite so the user can undo
      // the restore itself (same .bak naming as the PUT route).
      const stamp = bakStamp();
      fs.copyFileSync(full, `${full}.${stamp}.bak`);
      content = fs.readFileSync(full, 'utf8');
    } else {
      content = '';
    }
    fs.copyFileSync(bakPath, full);
    res.json({ ok: true, content, note: 'Restored. Restart the server to apply.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- backups ---
function ensureBackupsDir() {
  if (!fs.existsSync(backupsDir())) fs.mkdirSync(backupsDir(), { recursive: true });
}

function parseBackupName(f) {
  // <serverSlug>__<stamp>.zip ; older backups without "__" => server unknown
  const i = f.indexOf('__');
  return i === -1 ? { slug: '', label: f } : { slug: f.slice(0, i), label: f };
}

function listBackups() {
  ensureBackupsDir();
  return fs.readdirSync(backupsDir())
    .filter((f) => f.toLowerCase().endsWith('.zip'))
    .map((f) => {
      const st = fs.statSync(path.join(backupsDir(), f));
      const meta = parseBackupName(f);
      return { name: f, size: st.size, mtime: st.mtimeMs, slug: meta.slug };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

let backupInProgress = false;

async function createBackup(m) {
  if (!m || !m.dir()) throw new Error('No server selected.');
  if (backupInProgress) throw new Error('A backup is already in progress.');
  backupInProgress = true;
  ensureBackupsDir();
  const slug = slugify(m.name());
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const outName = `${slug}__${stamp}.zip`;
  const outPath = path.join(backupsDir(), outName);
  const wasOnline = m.status === STATUS.ONLINE;
  const worlds = m.desc().worlds || ['world', 'world_nether', 'world_the_end'];

  try {
    if (wasOnline) {
      // Avoid writes during the zip
      m.sendCommand('save-off');
      m.sendCommand('save-all flush');
      await new Promise((r) => setTimeout(r, 5000));
    }

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outPath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      for (const world of worlds) {
        const wdir = path.join(m.dir(), world);
        if (fs.existsSync(wdir)) archive.directory(wdir, world);
      }
      archive.finalize();
    });
  } finally {
    if (wasOnline) m.sendCommand('save-on');
    backupInProgress = false;
  }

  pruneBackups(slug);
  const st = fs.statSync(outPath);
  m.pushLine(`[Lodestone] Backup created: ${outName} (${(st.size / 1048576).toFixed(1)} MB)`, 'info');
  return { name: outName, size: st.size };
}

// Enforce retention for one server's backups. Always keeps the newest
// (all[0]); deletes from the oldest end until both the count cap and the
// total-size cap are satisfied. A limit of 0 means "unlimited" (disabled).
function pruneBackups(slug) {
  const maxCount = Number(config.backups.maxCount) || 0;
  const maxSizeMB = Number(config.backups.maxSizeMB) || 0;
  if (maxCount <= 0 && maxSizeMB <= 0) return;
  const all = listBackups().filter((b) => b.slug === slug); // sorted by mtime desc
  if (all.length === 0) return;
  const toDelete = new Set();

  // 1) Count cap: keep the newest maxCount; flag the rest.
  if (maxCount > 0 && all.length > maxCount) {
    for (let i = maxCount; i < all.length; i++) toDelete.add(all[i].name);
  }

  // 2) Size cap: walk oldest-first (end of the list), deleting until the
  //    surviving backups' total size fits under the cap. Never delete the
  //    newest (index 0) — the just-created backup is always retained, even
  //    if on its own it's bigger than the cap (we'd rather keep one fresh
  //    backup than none).
  if (maxSizeMB > 0) {
    const maxBytes = maxSizeMB * 1024 * 1024;
    let total = all.reduce((s, b) => s + (toDelete.has(b.name) ? 0 : b.size), 0);
    for (let i = all.length - 1; i > 0 && total > maxBytes; i--) {
      const b = all[i];
      if (toDelete.has(b.name)) continue;
      toDelete.add(b.name);
      total -= b.size;
    }
  }

  for (const name of toDelete) {
    try {
      fs.unlinkSync(path.join(backupsDir(), name));
      log(`Old backup deleted by retention: ${name}`);
    } catch (_) { /* noop */ }
  }
}

app.get('/api/backups', (req, res) => {
  try {
    res.json({ backups: listBackups() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups', async (req, res) => {
  try {
    const r = await createBackup(targetManager(req));
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/backups/:name', (req, res) => {
  const name = path.basename(req.params.name);
  if (!name.toLowerCase().endsWith('.zip')) return res.status(400).json({ error: 'Not a .zip' });
  const full = path.join(backupsDir(), name);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Does not exist' });
  try {
    fs.unlinkSync(full);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backups/:name/download', (req, res) => {
  const name = path.basename(req.params.name);
  const full = path.join(backupsDir(), name);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Does not exist' });
  res.download(full, name);
});

// --- Modrinth ---
const MODRINTH = 'https://api.modrinth.com/v2';
const UA = `${(config.appName || 'Lodestone')}-Panel/1.0 (local use)`;

const MODRINTH_SORTS = ['relevance', 'downloads', 'follows', 'newest', 'updated'];
// Categories that exist for both plugins and mods on Modrinth.
const MODRINTH_CATEGORIES = [
  'adventure', 'cursed', 'decoration', 'economy', 'equipment', 'food', 'game-mechanics',
  'library', 'magic', 'management', 'minigame', 'mobs', 'optimization', 'social',
  'storage', 'technology', 'transportation', 'utility', 'worldgen',
];

// Work out what content the selected server can actually run, from its jar name.
// loaders[] is used both to filter Modrinth and to decide plugins/ vs mods/.
function detectCompat(m) {
  const jar = ((m && m.desc().jar) || '').toLowerCase();
  const mcVersion = (m && m.desc().mcVersion) || '';
  let projectType = 'plugin';
  let loaders = ['paper', 'spigot', 'bukkit'];
  let folder = 'plugins';
  let label = 'Paper/Spigot';
  if (jar.includes('fabric')) { projectType = 'mod'; loaders = ['fabric']; folder = 'mods'; label = 'Fabric'; }
  else if (jar.includes('quilt')) { projectType = 'mod'; loaders = ['quilt', 'fabric']; folder = 'mods'; label = 'Quilt'; }
  else if (jar.includes('neoforge')) { projectType = 'mod'; loaders = ['neoforge']; folder = 'mods'; label = 'NeoForge'; }
  else if (jar.includes('forge')) { projectType = 'mod'; loaders = ['forge']; folder = 'mods'; label = 'Forge'; }
  else if (jar.includes('paper')) { loaders = ['paper', 'spigot', 'bukkit']; label = 'Paper'; }
  else if (jar.includes('spigot')) { loaders = ['spigot', 'bukkit']; label = 'Spigot'; }
  else if (jar.includes('bukkit')) { loaders = ['bukkit']; label = 'Bukkit'; }
  else if (jar.includes('vanilla') || jar.includes('minecraft_server')) { projectType = null; label = 'Vanilla'; }
  return { projectType, loaders, folder, label, mcVersion };
}

app.get('/api/modrinth/search', async (req, res) => {
  const m = targetManager(req);
  const compat = detectCompat(m);
  if (!compat.projectType) {
    return res.json({ hits: [], compat, note: tErr(req.user, 'errors.vanillaNoPlugins') });
  }
  const q = req.query.q || '';
  const sort = MODRINTH_SORTS.includes(req.query.sort) ? req.query.sort : 'downloads';
  const facets = [
    [`project_type:${compat.projectType}`],
    compat.loaders.map((l) => `categories:${l}`),
  ];
  if (compat.mcVersion) facets.push([`versions:${compat.mcVersion}`]);
  if (req.query.category && MODRINTH_CATEGORIES.includes(req.query.category)) {
    facets.push([`categories:${req.query.category}`]);
  }
  const url = `${MODRINTH}/search?query=${encodeURIComponent(q)}&facets=${encodeURIComponent(JSON.stringify(facets))}&index=${sort}&limit=30`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const data = await r.json();
    res.json({ ...data, compat, categories: MODRINTH_CATEGORIES });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/modrinth/versions/:projectId', async (req, res) => {
  const m = targetManager(req);
  const compat = detectCompat(m);
  const loaders = JSON.stringify(compat.loaders);
  const gv = JSON.stringify(compat.mcVersion ? [compat.mcVersion] : []);
  const url = `${MODRINTH}/project/${encodeURIComponent(req.params.projectId)}/version?loaders=${encodeURIComponent(loaders)}&game_versions=${encodeURIComponent(gv)}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const matched = await r.json();
    res.json({ matched: Array.isArray(matched) ? matched : [], compat });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/modrinth/install', async (req, res) => {
  const { versionId } = req.body || {};
  if (!versionId) return res.status(400).json({ error: tErr(req.user, 'errors.missingVersionId') });
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const compat = detectCompat(m);
  try {
    const r = await fetch(`${MODRINTH}/version/${encodeURIComponent(versionId)}`, { headers: { 'User-Agent': UA } });
    const version = await r.json();
    // Compatibility guard: refuse anything that doesn't match this server's
    // loader and Minecraft version, so an incompatible jar can't be installed.
    const loaderOk = (version.loaders || []).some((l) => compat.loaders.includes(l));
    const versionOk = !compat.mcVersion || (version.game_versions || []).includes(compat.mcVersion);
    if (!loaderOk || !versionOk) {
      return res.status(409).json({ error: tErr(req.user, 'errors.incompatible', { label: compat.label, version: compat.mcVersion || '' }) });
    }
    const file = (version.files || []).find((f) => f.primary) || (version.files || [])[0];
    if (!file) return res.status(404).json({ error: tErr(req.user, 'errors.noVersionFiles') });
    const dl = await fetch(file.url, { headers: { 'User-Agent': UA } });
    if (!dl.ok) return res.status(502).json({ error: `Download failed: HTTP ${dl.status}` });
    const buf = Buffer.from(await dl.arrayBuffer());
    const pdir = path.join(m.dir(), compat.folder);
    fs.mkdirSync(pdir, { recursive: true });
    const dest = path.join(pdir, path.basename(file.filename));
    fs.writeFileSync(dest, buf);
    m.pushLine(`[Lodestone] Installed from Modrinth into ${compat.folder}/: ${file.filename}`, 'info');
    res.json({ ok: true, name: file.filename, note: 'Restart the server to apply.' });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- system (point-in-time snapshot; the stream goes over WS) ---
app.get('/api/system', async (req, res) => {
  res.json(await systemStats(targetManager(req)));
});

// ---------------------------------------------------------------------------
// File manager (browse/edit/upload/download — sandboxed to the server folder)
// ---------------------------------------------------------------------------

// Resolve a user-supplied relative path against the server root, refusing any
// path that would escape the root (path traversal guard).
function safeResolve(root, rel) {
  const base = path.resolve(root);
  const target = path.resolve(base, '.' + path.sep + (rel || '').replace(/^[\\/]+/, ''));
  const rootWithSep = base.endsWith(path.sep) ? base : base + path.sep;
  if (target !== base && !target.startsWith(rootWithSep)) return null;
  return target;
}

const TEXT_EXTS = new Set([
  '.txt', '.properties', '.yml', '.yaml', '.json', '.json5', '.toml', '.conf', '.cfg',
  '.ini', '.log', '.md', '.sh', '.bat', '.csv', '.xml', '.mcmeta', '.lang', '.sk',
]);
const MAX_EDIT_BYTES = 2 * 1024 * 1024;

function isTextFile(name) {
  const ext = path.extname(name).toLowerCase();
  return TEXT_EXTS.has(ext) || name.toLowerCase() === 'eula.txt' || !ext;
}

app.get('/api/files', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const abs = safeResolve(m.dir(), req.query.path || '');
  if (!abs) return res.status(400).json({ error: tErr(req.user, 'errors.invalidPath') });
  try {
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    const out = entries.map((e) => {
      let size = 0, mtime = 0;
      try { const st = fs.statSync(path.join(abs, e.name)); size = st.size; mtime = st.mtimeMs; } catch (_) {}
      return { name: e.name, dir: e.isDirectory(), size, mtime, editable: e.isFile() && isTextFile(e.name) };
    }).sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
    res.json({ path: path.relative(m.dir(), abs).replace(/\\/g, '/'), entries: out });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/files/read', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const abs = safeResolve(m.dir(), req.query.path || '');
  if (!abs) return res.status(400).json({ error: tErr(req.user, 'errors.invalidPath') });
  try {
    const st = fs.statSync(abs);
    if (st.isDirectory()) return res.status(400).json({ error: tErr(req.user, 'errors.isAFolder') });
    if (st.size > MAX_EDIT_BYTES) return res.status(413).json({ error: tErr(req.user, 'errors.fileTooLarge') });
    if (!isTextFile(path.basename(abs))) return res.status(415).json({ error: tErr(req.user, 'errors.notATextFile') });
    res.json({ content: fs.readFileSync(abs, 'utf8') });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/files/write', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const abs = safeResolve(m.dir(), req.body && req.body.path);
  if (!abs) return res.status(400).json({ error: tErr(req.user, 'errors.invalidPath') });
  const content = req.body && req.body.content;
  if (typeof content !== 'string') return res.status(400).json({ error: tErr(req.user, 'errors.missingContent') });
  try {
    fs.writeFileSync(abs, content, 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/mkdir', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const name = path.basename(String((req.body && req.body.name) || '').trim());
  if (!name) return res.status(400).json({ error: tErr(req.user, 'errors.nameRequiredShort') });
  const abs = safeResolve(m.dir(), path.join(req.body.path || '', name));
  if (!abs) return res.status(400).json({ error: tErr(req.user, 'errors.invalidPath') });
  try {
    fs.mkdirSync(abs, { recursive: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/rename', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const from = safeResolve(m.dir(), req.body && req.body.path);
  const newName = path.basename(String((req.body && req.body.name) || '').trim());
  if (!from || !newName) return res.status(400).json({ error: tErr(req.user, 'errors.invalidPath') });
  const to = path.join(path.dirname(from), newName);
  try {
    fs.renameSync(from, to);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/files', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const abs = safeResolve(m.dir(), req.query.path || '');
  if (!abs || abs === path.resolve(m.dir())) return res.status(400).json({ error: tErr(req.user, 'errors.invalidPath') });
  try {
    fs.rmSync(abs, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/files/download', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: tErr(req.user, 'errors.noActiveServer') });
  const abs = safeResolve(m.dir(), req.query.path || '');
  if (!abs) return res.status(400).json({ error: tErr(req.user, 'errors.invalidPath') });
  try {
    if (fs.statSync(abs).isDirectory()) return res.status(400).json({ error: tErr(req.user, 'errors.cannotDownloadFolder') });
    res.download(abs, path.basename(abs));
  } catch (err) {
    res.status(404).json({ error: tErr(req.user, 'errors.fileDoesNotExist') });
  }
});

const fileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const m = targetManager(req);
      if (!m || !m.dir()) return cb(new Error('No active server.'));
      const dest = safeResolve(m.dir(), req.query.path || '');
      if (!dest) return cb(new Error('Invalid path'));
      try { fs.mkdirSync(dest, { recursive: true }); } catch (_) {}
      cb(null, dest);
    },
    filename: (req, file, cb) => cb(null, path.basename(file.originalname)),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

app.post('/api/files/upload', fileUpload.array('files'), (req, res) => {
  res.json({ ok: true, count: (req.files || []).length });
}, (err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

// ---------------------------------------------------------------------------
// Server creator (download Vanilla / Spigot / Paper / Fabric / Forge jars)
// ---------------------------------------------------------------------------

const SERVER_TYPES = ['vanilla', 'spigot', 'paper', 'fabric', 'forge'];

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.json();
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.text();
}

// Spigot has no version API, so we scrape its download page. This keeps the
// list in sync with the actual Spigot releases (so we never offer a version
// GetBukkit has no jar for) and tracks new releases automatically. Versions
// are listed newest-first on the page; we preserve that order.
async function listSpigotVersions() {
  const html = await fetchText('https://getbukkit.org/download/spigot');
  const versions = [];
  const seen = new Set();
  const re = /<h[1-6][^>]*>\s*(\d+(?:\.\d+)+)\s*<\/h[1-6]>/gi;
  let m;
  while ((m = re.exec(html))) {
    const v = m[1];
    if (!seen.has(v)) { seen.add(v); versions.push(v); }
  }
  if (!versions.length) throw new Error('Could not read the Spigot version list from getbukkit.org');
  return versions;
}

// Vanilla releases come from a community-maintained gist that maps every
// Minecraft version to its official Mojang server.jar URL. We keep full
// releases only (no snapshots / pre-releases / release candidates) and
// preserve the gist's newest-first order. Returns [{ version, url }].
async function fetchVanillaReleases() {
  const md = await fetchText('https://gist.githubusercontent.com/cliffano/77a982a7503669c3e1acb0a0cf6127e9/raw');
  const out = [];
  const seen = new Set();
  const re = /^\|\s*([^|]+?)\s*\|\s*(https?:\/\/\S+?server\.jar)\s*\|/gm;
  let m;
  while ((m = re.exec(md))) {
    const version = m[1].trim();
    // Full releases are digits-and-dots only; anything with letters or a
    // hyphen (26w14a, 26.2-rc-2, 1.16-pre1, beta/alpha) is filtered out.
    if (!/^[0-9]+(\.[0-9]+)+$/.test(version)) continue;
    if (seen.has(version)) continue;
    seen.add(version);
    out.push({ version, url: m[2].trim() });
  }
  if (!out.length) throw new Error('Could not read the vanilla version list');
  return out;
}

// Paper versions come from the PaperMC "Fill" v3 API. `versions` is keyed by
// version family (e.g. "1.21") with arrays of releases newest-first; we flatten
// them keeping full releases only (no rc/pre) and the API's newest-first order.
async function listPaperVersions() {
  const d = await fetchJson('https://fill.papermc.io/v3/projects/paper');
  const versions = [];
  const seen = new Set();
  for (const family of Object.values(d.versions || {})) {
    for (const v of (family || [])) {
      if (!/^[0-9]+(\.[0-9]+)+$/.test(v)) continue; // full releases only
      if (!seen.has(v)) { seen.add(v); versions.push(v); }
    }
  }
  if (!versions.length) throw new Error('Could not read the Paper version list');
  return versions;
}

// Fetches the Forge Maven version list and returns the latest forge build for
// each MC version, mapped to the full "<mc>-<forge>" coordinate (newest MC
// first).
async function listForgeVersions() {
  const xml = await fetchText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
  const matches = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
  // Coordinates look like "1.20.1-47.2.0" or "1.20.1-47.2.0-1.18" (rare).
  // The MC version is the longest leading "x.y.z" prefix that Mojang would
  // recognise. Group by that and keep the first hit per group (Maven is
  // sorted newest-first by version-string order, which roughly matches
  // release order for forge, so the first match is the newest build).
  const out = [];
  const seen = new Set();
  for (const v of matches) {
    const m = v.match(/^(\d+\.\d+(?:\.\d+)?)(?=-)/);
    if (!m) continue;
    const mc = m[1];
    if (seen.has(mc)) continue;
    seen.add(mc);
    out.push(mc);
  }
  // Sort newest-first by Mojang-style semver.
  out.sort((a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pb[i] || 0) - (pa[i] || 0);
      if (d) return d;
    }
    return 0;
  });
  return out;
}

async function findLatestForgeCoordinate(mcVersion) {
  const xml = await fetchText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
  const matches = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
  // Newest matching coordinate that starts with the MC version followed by '-'.
  for (const v of matches) {
    if (v === mcVersion || v.startsWith(mcVersion + '-')) return v;
  }
  return null;
}

// Returns [latest..oldest] of MC versions installable for a type.
async function listServerVersions(type) {
  if (type === 'paper') {
    return await listPaperVersions();
  }
  if (type === 'vanilla') {
    return (await fetchVanillaReleases()).map((r) => r.version);
  }
  if (type === 'spigot') {
    return await listSpigotVersions();
  }
  if (type === 'fabric') {
    const d = await fetchJson('https://meta.fabricmc.net/v2/versions/game');
    return (d || []).filter((v) => v.stable).map((v) => v.version);
  }
  if (type === 'forge') {
    return await listForgeVersions();
  }
  throw new Error('Unknown server type');
}

// Returns { url, filename } for the jar to download.
async function resolveServerJar(type, mcVersion) {
  if (type === 'paper') {
    const build = await fetchJson(`https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(mcVersion)}/builds/latest`);
    const dl = build.downloads && build.downloads['server:default'];
    if (!dl || !dl.url) throw new Error('No Paper build for that version');
    return { url: dl.url, filename: dl.name };
  }
  if (type === 'vanilla') {
    const rel = (await fetchVanillaReleases()).find((r) => r.version === mcVersion);
    if (!rel) throw new Error('Unknown vanilla version');
    return { url: rel.url, filename: `minecraft_server-${mcVersion}.jar` };
  }
  if (type === 'spigot') {
    // GetBukkit's CDN serves the Spigot jar for any version that has a build.
    return {
      url: `https://cdn.getbukkit.org/spigot/spigot-${encodeURIComponent(mcVersion)}.jar`,
      filename: `spigot-${mcVersion}.jar`,
    };
  }
  if (type === 'fabric') {
    const loaders = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`);
    const loader = loaders[0] && loaders[0].loader && loaders[0].loader.version;
    if (!loader) throw new Error('No Fabric loader for that version');
    const installers = await fetchJson('https://meta.fabricmc.net/v2/versions/installer');
    const installer = installers[0] && installers[0].version;
    return {
      url: `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${loader}/${installer}/server/jar`,
      filename: `fabric-server-${mcVersion}.jar`,
    };
  }
  if (type === 'forge') {
    const coord = await findLatestForgeCoordinate(mcVersion);
    if (!coord) throw new Error(`No Forge build for MC ${mcVersion}`);
    return {
      url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${encodeURIComponent(coord)}/forge-${encodeURIComponent(coord)}-installer.jar`,
      filename: `forge-${coord}-installer.jar`,
    };
  }
  throw new Error('Unknown server type');
}

// Runs the Forge installer non-interactively to extract libraries + the
// runnable server jar into `dir`. Removes the installer jar afterwards.
function runForgeInstaller(dir, installerFilename) {
  return new Promise((resolve, reject) => {
    const installerPath = path.join(dir, installerFilename);
    log(`Running Forge installer: java -jar ${installerFilename} --installServer in ${dir}`);
    const proc = execFile('java', ['-jar', installerFilename, '--installServer'], {
      cwd: dir,
      windowsHide: true,
    }, (err, _stdout, stderr) => {
      try { fs.unlinkSync(installerPath); } catch (_) { /* ignore */ }
      if (err) return reject(new Error(`Forge installer failed: ${(stderr || '').toString().trim() || err.message}`));
      resolve();
    });
    proc.stdout && proc.stdout.on('data', () => {});
    proc.stderr && proc.stderr.on('data', () => {});
  });
}

// Picks the runnable server jar the Forge installer produced. Modern Forge
// writes "<mc>-<forge>.jar" alongside the installer; older releases used
// "minecraftforge-universal-<coord>.jar".
function findForgeServerJar(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jar'));
  const modern = files.find((f) => /^\d+\.\d+(?:\.\d+)?-\d+\.\d+\.\d+(\.\d+)?\.jar$/.test(f));
  if (modern) return modern;
  const universal = files.find((f) => f.includes('minecraftforge-universal'));
  if (universal) return universal;
  if (files.length === 1) return files[0];
  return null;
}

app.get('/api/create/versions', async (req, res) => {
  const type = String(req.query.type || '').toLowerCase();
  if (!SERVER_TYPES.includes(type)) return res.status(400).json({ error: tErr(req.user, 'errors.unknownServerType') });
  try {
    res.json({ versions: await listServerVersions(type) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Downloads `url` to `destPath`, streaming chunks to disk and reporting
// progress through `onProgress(received, total)`. Resolves with the number of
// bytes written. Throws on HTTP failure, on read errors, or when `signal`
// aborts (the partial file is removed before re-throwing).
async function downloadToFile(url, destPath, onProgress, signal) {
  const dl = await fetch(url, { headers: { 'User-Agent': UA }, signal });
  if (!dl.ok) throw new Error(`Jar download failed: HTTP ${dl.status}`);
  const total = Number(dl.headers.get('content-length') || 0);
  const out = fs.createWriteStream(destPath);
  const reader = dl.body.getReader();
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal && signal.aborted) {
        reader.cancel().catch(() => {});
        throw new Error('aborted');
      }
      received += value.length;
      if (!out.write(Buffer.from(value))) {
        await new Promise((r) => out.once('drain', r));
      }
      onProgress(received, total);
    }
  } catch (err) {
    out.destroy();
    try { fs.unlinkSync(destPath); } catch (_) { /* ignore */ }
    throw err;
  }
  await new Promise((resolve, reject) => {
    out.on('error', reject);
    out.end(resolve);
  });
  return received;
}

// ---------------------------------------------------------------------------
// Managed Java runtimes — the panel downloads and keeps a Temurin (Adoptium)
// JRE per Java major so the user never has to install Java themselves. Each
// Minecraft version maps to the Java major it needs; the right runtime is
// fetched on the first start of a server that needs it. Runtimes live under
// runtimes/temurin-<major>/ and are git-ignored.
// ---------------------------------------------------------------------------

const RUNTIMES_DIR = path.join(__dirname, 'runtimes');
const JAVA_EXE = process.platform === 'win32' ? 'java.exe' : 'java';

// Minecraft version -> required Java major.
function requiredJavaMajor(mcVersion) {
  const m = /^1\.(\d+)(?:\.(\d+))?/.exec(String(mcVersion || '').trim());
  if (!m) return 21; // unknown / snapshot -> newest managed LTS
  const minor = Number(m[1]);
  const patch = Number(m[2] || 0);
  if (minor <= 16) return 8;                       // 1.16.5 and older
  if (minor < 20) return 17;                       // 1.17 - 1.19
  if (minor === 20) return patch >= 5 ? 21 : 17;   // 1.20.5+ needs Java 21
  return 21;                                       // 1.21+
}

// Path to the java binary of a managed runtime, or null if not installed.
function resolveManagedJava(major) {
  const base = path.join(RUNTIMES_DIR, `temurin-${major}`);
  if (!fs.existsSync(base)) return null;
  let entries;
  try { entries = fs.readdirSync(base); } catch (_) { return null; }
  // Temurin archives extract to a top-level folder like "jdk-21.0.3+9-jre".
  for (const name of entries) {
    const candidate = path.join(base, name, 'bin', JAVA_EXE);
    if (fs.existsSync(candidate)) return candidate;
  }
  const flat = path.join(base, 'bin', JAVA_EXE);
  return fs.existsSync(flat) ? flat : null;
}

// Major version of the `java` on PATH, or null if none / unparseable. Cached.
let _systemJavaMajor; // undefined = not probed yet
function systemJavaMajor() {
  if (_systemJavaMajor !== undefined) return _systemJavaMajor;
  _systemJavaMajor = null;
  try {
    const r = spawnSync('java', ['-version'], { encoding: 'utf8' });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const m = /version "(\d+)(?:\.(\d+))?/.exec(out);
    if (m) {
      const a = Number(m[1]);
      _systemJavaMajor = a === 1 ? Number(m[2] || 0) : a; // "1.8.0" -> 8
    }
  } catch (_) { /* no java on PATH */ }
  return _systemJavaMajor;
}

// Pick the java to launch a server with: explicit per-server override, then a
// managed runtime, then the system java if its major matches. null => the
// managed runtime must be downloaded first.
function resolveJavaForServer(d, major) {
  if (d.javaPath && fs.existsSync(d.javaPath)) return d.javaPath;
  const managed = resolveManagedJava(major);
  if (managed) return managed;
  if (systemJavaMajor() === major) return 'java';
  return null;
}

function adoptiumOs() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}
function adoptiumArch() {
  switch (process.arch) {
    case 'x64': return 'x64';
    case 'arm64': return 'aarch64';
    case 'ppc64': return 'ppc64le';
    case 's390x': return 's390x';
    default: return 'x64';
  }
}

// Download + extract the Temurin JRE for a Java major. Concurrent calls for the
// same major share one download. Resolves to the java binary path.
const _runtimePromises = {};
function ensureRuntime(major, onProgress) {
  const existing = resolveManagedJava(major);
  if (existing) return Promise.resolve(existing);
  if (_runtimePromises[major]) return _runtimePromises[major];

  const p = (async () => {
    fs.mkdirSync(RUNTIMES_DIR, { recursive: true });
    const osName = adoptiumOs();
    const arch = adoptiumArch();
    const ext = osName === 'windows' ? 'zip' : 'tar.gz';
    const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${osName}/${arch}/jre/hotspot/normal/eclipse`;
    const dest = path.join(RUNTIMES_DIR, `temurin-${major}`);
    const archive = path.join(RUNTIMES_DIR, `temurin-${major}.${ext}`);

    log(`Downloading Temurin JRE ${major} for ${osName}/${arch}...`);
    await downloadToFile(url, archive, (rec, total) => { if (onProgress) onProgress(rec, total); });

    // Extract with the system tar: present on Linux/macOS and Windows 10+,
    // where bsdtar also opens .zip archives. Extract into a clean target.
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    fs.mkdirSync(dest, { recursive: true });
    const tarArgs = ext === 'zip' ? ['-xf', archive, '-C', dest] : ['-xzf', archive, '-C', dest];
    const ex = spawnSync('tar', tarArgs, { encoding: 'utf8' });
    if (ex.error || ex.status !== 0) {
      throw new Error(`Could not extract Java runtime (tar): ${ex.error ? ex.error.message : (ex.stderr || ('exit ' + ex.status))}`);
    }
    try { fs.unlinkSync(archive); } catch (_) { /* ignore */ }

    const bin = resolveManagedJava(major);
    if (!bin) throw new Error('Java runtime extracted but no java binary was found');
    log(`Temurin JRE ${major} ready at ${bin}`);
    return bin;
  })();

  _runtimePromises[major] = p;
  p.finally(() => { delete _runtimePromises[major]; });
  return p;
}

app.post('/api/create', async (req, res) => {
  const body = req.body || {};
  const type = String(body.type || '').toLowerCase();
  const name = String(body.name || '').trim();
  const parentDir = String(body.parentDir || '').trim();
  const mcVersion = String(body.mcVersion || '').trim();
  if (!SERVER_TYPES.includes(type)) return res.status(400).json({ error: tErr(req.user, 'errors.pickServerType') });
  if (!name) return res.status(400).json({ error: tErr(req.user, 'errors.nameRequired') });
  if (!parentDir || !fs.existsSync(parentDir)) return res.status(400).json({ error: tErr(req.user, 'errors.pickParentFolder') });
  if (!mcVersion) return res.status(400).json({ error: tErr(req.user, 'errors.pickMcVersion') });
  if (!body.eula) return res.status(400).json({ error: tErr(req.user, 'errors.eulaRequired') });

  const dir = path.join(parentDir, slugify(name));
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
    return res.status(400).json({ error: tErr(req.user, 'errors.folderNotEmpty', { path: dir }) });
  }

  // NDJSON stream: each line is a JSON event. Phases:
  //   {type:"start", phase:"resolving"}
  //   {type:"phase", phase:"downloading"}
  //   {type:"download-start", total, filename}
  //   {type:"progress", received, total}    (repeated while downloading)
  //   {type:"phase", phase:"installing-forge"}    (forge only)
  //   {type:"phase", phase:"finalizing"}
  //   {type:"done", server}                  (terminal)
  //   {type:"error", error}                  (terminal)
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (obj) => {
    if (res.writableEnded) return;
    try { res.write(JSON.stringify(obj) + '\n'); } catch (_) { /* noop */ }
  };

  const ac = new AbortController();
  let clientGone = false;
  req.on('close', () => {
    if (res.writableEnded) return;
    clientGone = true;
    ac.abort();
  });

  const cleanup = (jarName) => {
    try { if (jarName) fs.unlinkSync(path.join(dir, jarName)); } catch (_) { /* ignore */ }
    try { if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch (_) { /* ignore */ }
  };

  try {
    send({ type: 'phase', phase: 'resolving' });
    const { url, filename } = await resolveServerJar(type, mcVersion);
    if (clientGone) return;

    fs.mkdirSync(dir, { recursive: true });
    const jarPath = path.join(dir, filename);

    send({ type: 'phase', phase: 'downloading' });
    send({ type: 'download-start', total: 0, filename });
    const received = await downloadToFile(url, jarPath, (rec, total) => {
      send({ type: 'progress', received: rec, total });
    }, ac.signal);
    if (clientGone) { cleanup(filename); return; }
    log(`Downloaded ${type} jar "${filename}" (${(received / 1048576).toFixed(1)} MB) to ${dir}`);

    let jarFilename = filename;
    if (type === 'forge') {
      send({ type: 'phase', phase: 'installing-forge' });
      await runForgeInstaller(dir, filename);
      if (clientGone) { cleanup(filename); return; }
      const produced = findForgeServerJar(dir);
      if (!produced) throw new Error('Forge installer finished but no server jar was found in the folder');
      jarFilename = produced;
    }

    send({ type: 'phase', phase: 'finalizing' });
    fs.writeFileSync(path.join(dir, 'eula.txt'), `# Accepted via Lodestone on ${new Date().toISOString()}\neula=true\n`, 'utf8');

    let javaArgs = body.javaArgs;
    if (typeof javaArgs === 'string') javaArgs = javaArgs.trim().split(/\s+/).filter(Boolean);
    if (!Array.isArray(javaArgs) || !javaArgs.length) javaArgs = ['-Xmx4G', '-Xms4G'];

    const entry = {
      id: genId(),
      name,
      dir,
      jar: jarFilename,
      javaArgs,
      mcVersion,
      stopTimeoutSeconds: 30,
      worlds: ['world', 'world_nether', 'world_the_end'],
      watchdog: { enabled: false, maxRestarts: 3, windowMinutes: 10 },
    };
    config.servers.push(entry);
    if (!config.activeServerId) config.activeServerId = entry.id;
    saveConfig(config);
    getManager(entry.id);
    log(`Created ${type} server "${name}" (${mcVersion}) at ${dir}`);

    send({ type: 'done', server: serverWithStatus(entry) });
    res.end();
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.message === 'aborted' || clientGone)) {
      // Client disconnected — keep what we have on disk for inspection but
      // don't register the server.
      try { log(`Create aborted by client before completion: ${dir}`); } catch (_) { /* noop */ }
      return;
    }
    send({ type: 'error', error: err.message });
    res.end();
  }
});

// ---------------------------------------------------------------------------
// Scheduled tasks (per-server cron: command / restart / backup)
// ---------------------------------------------------------------------------

const TASK_TYPES = ['command', 'restart', 'backup'];

function publicTask(t) {
  const s = findServer(t.serverId);
  return { ...t, serverName: s ? s.name : '(deleted server)' };
}

function validateTask(body, user) {
  const type = String(body.type || '').toLowerCase();
  if (!TASK_TYPES.includes(type)) return { error: eKey('errors.unknownTaskType') };
  const serverId = String(body.serverId || '').trim();
  if (!findServer(serverId)) return { error: eKey('errors.unknownServer') };
  const cronExpr = String(body.cron || '').trim();
  if (!cron.validate(cronExpr)) return { error: eKey('errors.invalidCron') };
  const command = type === 'command' ? String(body.command || '').trim() : '';
  if (type === 'command' && !command) return { error: eKey('errors.commandRequired') };
  return {
    value: {
      serverId,
      name: String(body.name || '').trim() || `${type} task`,
      type,
      cron: cronExpr,
      command,
      enabled: body.enabled !== false,
    },
  };
}

function runTask(t) {
  const m = getManager(t.serverId);
  if (!m) return;
  if (t.type === 'command') m.sendCommand(t.command);
  else if (t.type === 'restart') doScheduledRestart(m);
  else if (t.type === 'backup') createBackup(m).catch((e) => log(`Scheduled backup failed: ${e.message}`));
}

app.get('/api/tasks', (req, res) => {
  res.json({ tasks: (config.tasks || []).map(publicTask) });
});

app.post('/api/tasks', (req, res) => {
  const v = validateTask(req.body || {}, req.user);
  if (v.error) return res.status(400).json({ error: localizeErr(req.user, v.error) });
  if (!Array.isArray(config.tasks)) config.tasks = [];
  const task = { id: genId(), ...v.value };
  config.tasks.push(task);
  saveConfig(config);
  setupSchedulers();
  res.json({ ok: true, task: publicTask(task) });
});

app.put('/api/tasks/:id', (req, res) => {
  const t = (config.tasks || []).find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: tErr(req.user, 'errors.taskNotFound') });
  const v = validateTask({ ...t, ...req.body }, req.user);
  if (v.error) return res.status(400).json({ error: localizeErr(req.user, v.error) });
  Object.assign(t, v.value);
  saveConfig(config);
  setupSchedulers();
  res.json({ ok: true, task: publicTask(t) });
});

app.delete('/api/tasks/:id', (req, res) => {
  if (!Array.isArray(config.tasks)) config.tasks = [];
  const before = config.tasks.length;
  config.tasks = config.tasks.filter((x) => x.id !== req.params.id);
  if (config.tasks.length === before) return res.status(404).json({ error: tErr(req.user, 'errors.taskNotFound') });
  saveConfig(config);
  setupSchedulers();
  res.json({ ok: true });
});

app.post('/api/tasks/:id/run', (req, res) => {
  const t = (config.tasks || []).find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: tErr(req.user, 'errors.taskNotFound') });
  try { runTask(t); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Static files (last, so they don't shadow /api)
// ---------------------------------------------------------------------------

app.use('/resources', express.static(path.join(__dirname, 'resources')));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// System resources (monitor)
// ---------------------------------------------------------------------------

let lastCpu = null;
function cpuPercent() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const c of cpus) {
    for (const t of Object.values(c.times)) total += t;
    idle += c.times.idle;
  }
  if (!lastCpu) {
    lastCpu = { idle, total };
    return 0;
  }
  const idleDiff = idle - lastCpu.idle;
  const totalDiff = total - lastCpu.total;
  lastCpu = { idle, total };
  if (totalDiff <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - idleDiff / totalDiff) * 100));
}

function diskFree(p) {
  return new Promise((resolve) => {
    try {
      fs.statfs(p, (err, st) => {
        if (err) return resolve(null);
        resolve({ free: st.bavail * st.bsize, total: st.blocks * st.bsize });
      });
    } catch (_) {
      resolve(null);
    }
  });
}

async function systemStats(m) {
  const sysTotal = os.totalmem();
  const sysFree = os.freemem();
  let proc = { cpu: 0, memory: 0 };
  if (m && m.proc && m.proc.pid) {
    try {
      const u = await procUsage(m.proc.pid);
      // procUsage sums CPU across all cores (can exceed 100%); normalize to 0-100
      const cores = os.cpus().length || 1;
      proc = { cpu: Math.min(100, (u ? u.cpu : 0) / cores), memory: u ? u.memory : 0 };
    } catch (_) { /* the process may have died */ }
  }
  const disk = await diskFree(backupsDir() && backupsDir().length ? path.parse(backupsDir()).root : os.homedir());
  return {
    ts: Date.now(),
    serverId: m ? m.id : null,
    cpuSystem: cpuPercent(),
    memSystemUsed: sysTotal - sysFree,
    memSystemTotal: sysTotal,
    procCpu: proc.cpu,
    procMem: proc.memory,
    disk,
    tps: m ? m.lastTps : null,
    status: m ? m.status : 'offline',
  };
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const token = url.searchParams.get('token') || '';
  if (!userFromToken(token)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

const clients = new Set();

function sendServerSnapshot(ws, id) {
  const m = getManager(id);
  if (!m) return;
  ws.send(JSON.stringify({ type: 'history', serverId: id, lines: m.history }));
  ws.send(JSON.stringify({ type: 'status', status: m.statusPayload() }));
}

wss.on('connection', (ws) => {
  clients.add(ws);
  // Meta + a status for each server + history of the active one.
  ws.send(JSON.stringify({
    type: 'meta',
    activeServerId: config.activeServerId,
    servers: config.servers.map((s) => ({ id: s.id, name: s.name })),
  }));
  for (const s of config.servers) {
    const m = getManager(s.id);
    ws.send(JSON.stringify({ type: 'status', status: m.statusPayload() }));
  }
  if (config.activeServerId) sendServerSnapshot(ws, config.activeServerId);

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (_) {
      return;
    }
    if (msg.type === 'command' && typeof msg.cmd === 'string') {
      const m = getManager(msg.serverId || config.activeServerId);
      if (m) m.sendCommand(msg.cmd);
    } else if (msg.type === 'getHistory' && msg.serverId) {
      sendServerSnapshot(ws, msg.serverId);
    }
  });

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function globalBroadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(data); } catch (_) { /* noop */ }
    }
  }
}

// Resource stream every 2s (for the active server)
setInterval(async () => {
  if (clients.size === 0) return;
  const m = activeManager();
  if (!m) return;
  const stats = await systemStats(m);
  globalBroadcast({ type: 'stats', stats });
}, 2000);

// ---------------------------------------------------------------------------
// Schedulers (cron): backups and scheduled restarts (act on the active server)
// ---------------------------------------------------------------------------

const cronJobs = [];

function setupSchedulers() {
  for (const j of cronJobs) j.stop();
  cronJobs.length = 0;

  if (config.backups.scheduledEnabled && cron.validate(config.backups.scheduledCron)) {
    cronJobs.push(cron.schedule(config.backups.scheduledCron, () => {
      log('Cron: scheduled backup (active server)');
      createBackup(activeManager()).catch((e) => log(`Scheduled backup failed: ${e.message}`));
    }));
    log('Scheduled backup active:', config.backups.scheduledCron);
  }

  if (config.scheduledRestart && config.scheduledRestart.enabled && cron.validate(config.scheduledRestart.cron)) {
    cronJobs.push(cron.schedule(config.scheduledRestart.cron, () => {
      log('Cron: scheduled restart (active server)');
      doScheduledRestart(activeManager());
    }));
    log('Scheduled restart active:', config.scheduledRestart.cron);
  }

  // Per-server user-defined tasks
  for (const t of (config.tasks || [])) {
    if (t.enabled === false || !cron.validate(t.cron)) continue;
    if (!findServer(t.serverId)) continue;
    cronJobs.push(cron.schedule(t.cron, () => {
      log(`Cron: task "${t.name}" (${t.type})`);
      runTask(t);
    }));
    log(`Scheduled task active: ${t.name} [${t.cron}]`);
  }
}

function doScheduledRestart(m) {
  if (!m) return;
  if (!m.isRunning()) {
    m.restart();
    return;
  }
  const warns = [...(config.scheduledRestart.warnMinutes || [5, 1])].sort((a, b) => b - a);
  const maxWarn = warns[0] || 0;
  for (const mm of warns) {
    setTimeout(() => {
      m.sendCommand(`say §eServer restarting in ${mm} minute${mm > 1 ? 's' : ''}...`);
    }, (maxWarn - mm) * 60000);
  }
  setTimeout(() => {
    m.sendCommand('say §cRestarting now...');
    m.restart();
  }, maxWarn * 60000);
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

setupSchedulers();

server.listen(config.panelPort, config.panelHost, () => {
  log(`${config.appName} listening on http://${config.panelHost}:${config.panelPort}`);
  log(`Registered servers: ${config.servers.length}`);
});

// Clean shutdown
function shutdown() {
  log('Shutting down panel...');
  const running = [...managers.values()].filter((m) => m.isRunning());
  if (running.length) {
    log(`${running.length} Minecraft server(s) still running; leaving them alive. Stop them from the panel if you meant to.`);
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
