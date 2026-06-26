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
const { spawn } = require('child_process');

const express = require('express');
const { WebSocketServer } = require('ws');
const multer = require('multer');
const pidusage = require('pidusage');
const archiver = require('archiver');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');

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
  return (config.users || []).find((u) => u.email.toLowerCase() === e) || null;
}
function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name || '' };
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
  if (!config.backups) config.backups = { dir: path.join(os.homedir(), 'mc-backups'), retainCount: 10 };
  // Migrate the legacy single global password into a first user account.
  if (!Array.isArray(config.users) || !config.users.length) {
    config.users = [{
      id: genId(),
      email: 'fede212yt@gmail.com',
      name: 'Admin',
      passwordHash: hashPassword(config.password || 'changeme123'),
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
  return config.backups.dir;
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
      return { ok: false, error: 'The server is already running.' };
    }
    const d = this.desc();
    if (!d.dir) return { ok: false, error: 'This server has no folder configured.' };
    if (!d.jar) return { ok: false, error: 'This server has no jar configured.' };
    if (!fs.existsSync(d.dir)) return { ok: false, error: `Server folder not found: ${d.dir}` };
    const jarPath = path.join(d.dir, d.jar);
    if (!fs.existsSync(jarPath)) {
      return { ok: false, error: `Jar not found: ${jarPath}` };
    }

    const args = [...(d.javaArgs || []), '-jar', d.jar, 'nogui'];
    log(`Starting "${this.name()}":`, 'java', args.join(' '), 'in', d.dir);

    this.players.clear();
    this.manualStop = false;
    this.tpsSupported = null;
    this.lastTps = null;
    this.setStatus(STATUS.STARTING);
    this.pushLine(`[Lodestone] Starting "${this.name()}": java ${args.join(' ')}`, 'info');

    let proc;
    try {
      proc = spawn('java', args, {
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
      return { ok: false, error: 'The server is not running.' };
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
      return { ok: false, error: 'The server is not running.' };
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

// --- auth ---
function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
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
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = user;
  next();
}

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
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

app.get('/api/me', (req, res) => res.json(publicUser(req.user)));

app.get('/api/users', (req, res) => {
  res.json({ users: (config.users || []).map(publicUser) });
});

app.post('/api/users', (req, res) => {
  const { email, name, password } = req.body || {};
  const e = normalizeEmail(email);
  if (!e || !e.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
  if (typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  if (findUserByEmail(e)) return res.status(400).json({ error: 'That email is already registered' });
  const user = { id: genId(), email: e, name: String(name || '').trim(), passwordHash: hashPassword(password) };
  config.users.push(user);
  saveConfig(config);
  res.json({ user: publicUser(user) });
});

app.put('/api/users/:id', (req, res) => {
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { email, name, password } = req.body || {};
  if (email !== undefined) {
    const e = normalizeEmail(email);
    if (!e || !e.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
    const clash = findUserByEmail(e);
    if (clash && clash.id !== user.id) return res.status(400).json({ error: 'That email is already registered' });
    user.email = e;
  }
  if (name !== undefined) user.name = String(name || '').trim();
  if (password !== undefined && password !== '') {
    if (typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    user.passwordHash = hashPassword(password);
  }
  saveConfig(config);
  res.json({ user: publicUser(user) });
});

app.delete('/api/users/:id', (req, res) => {
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (config.users.length <= 1) return res.status(400).json({ error: 'Cannot delete the last user' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
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

// ---------------------------------------------------------------------------
// Filesystem browser (for registering a server)
// ---------------------------------------------------------------------------

function listDrives() {
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

app.get('/api/fs', (req, res) => {
  const p = (req.query.path || '').trim();
  try {
    if (!p) {
      return res.json({ path: '', parent: null, drives: listDrives(), dirs: [], jars: [] });
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
    res.json({ path: abs, parent, drives: [], dirs, jars });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Servers registry (register / edit / delete / control)
// ---------------------------------------------------------------------------

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
    status: m.statusPayload(),
  };
}

app.get('/api/servers', (req, res) => {
  res.json({
    activeServerId: config.activeServerId,
    servers: config.servers.map(serverWithStatus),
  });
});

function validateServerInput(body) {
  const name = String(body.name || '').trim();
  const dir = String(body.dir || '').trim();
  let jar = String(body.jar || '').trim();
  if (!name) return { error: 'A name is required.' };
  if (!dir) return { error: 'A server folder is required.' };
  if (!fs.existsSync(dir)) return { error: `Folder does not exist: ${dir}` };
  if (!fs.statSync(dir).isDirectory()) return { error: 'That path is not a folder.' };
  // Auto-detect the jar if not supplied and exactly one exists.
  if (!jar) {
    const jars = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.jar'));
    if (jars.length === 1) jar = jars[0];
    else if (jars.length === 0) return { error: 'No .jar found in that folder; pick the server jar.' };
    else return { error: 'Multiple .jar files found; pick the server jar.' };
  } else if (!fs.existsSync(path.join(dir, jar))) {
    return { error: `Jar not found in folder: ${jar}` };
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
  const v = validateServerInput(req.body || {});
  if (v.error) return res.status(400).json({ error: v.error });
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
  if (!s) return res.status(404).json({ error: 'Server not found' });
  const m = getManager(s.id);
  if (m.isRunning()) return res.status(409).json({ error: 'Stop the server before editing it.' });
  const v = validateServerInput(req.body || {});
  if (v.error) return res.status(400).json({ error: v.error });
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
  if (!s) return res.status(404).json({ error: 'Server not found' });
  const m = getManager(s.id);
  if (m.isRunning()) return res.status(409).json({ error: 'Stop the server before removing it.' });
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
  if (!findServer(id)) return res.status(404).json({ error: 'Server not found' });
  config.activeServerId = id;
  saveConfig(config);
  res.json({ ok: true, activeServerId: id });
});

app.post('/api/servers/:id/start', (req, res) => res.json(getManagerOr404(req, res, (m) => m.start())));
app.post('/api/servers/:id/stop', (req, res) => res.json(getManagerOr404(req, res, (m) => m.stop(req.body && req.body.force))));
app.post('/api/servers/:id/restart', async (req, res) => {
  const s = findServer(req.params.id);
  if (!s) return res.status(404).json({ error: 'Server not found' });
  res.json(await getManager(s.id).restart());
});

function getManagerOr404(req, res, fn) {
  const s = findServer(req.params.id);
  if (!s) { res.status(404); return { error: 'Server not found' }; }
  return fn(getManager(s.id));
}

// --- server status / actions (active server, legacy-compatible) ---
app.get('/api/status', (req, res) => {
  const m = activeManager();
  res.json(m ? m.statusPayload() : { status: 'offline', serverId: null });
});

app.post('/api/server/start', (req, res) => {
  const m = targetManager(req);
  res.json(m ? m.start() : { ok: false, error: 'No active server.' });
});
app.post('/api/server/stop', (req, res) => {
  const m = targetManager(req);
  res.json(m ? m.stop(req.body && req.body.force) : { ok: false, error: 'No active server.' });
});
app.post('/api/server/restart', async (req, res) => {
  const m = targetManager(req);
  res.json(m ? await m.restart() : { ok: false, error: 'No active server.' });
});

app.post('/api/command', (req, res) => {
  const cmd = req.body && req.body.cmd;
  if (!cmd || typeof cmd !== 'string') return res.status(400).json({ error: 'Missing cmd' });
  const m = targetManager(req);
  res.json(m ? m.sendCommand(cmd) : { ok: false, error: 'No active server.' });
});

// --- players ---
app.get('/api/players', (req, res) => {
  const m = targetManager(req);
  if (!m) return res.json({ players: [], max: 0 });
  res.json({ players: [...m.players].sort(), max: m.maxPlayers });
});

app.post('/api/players/:action', (req, res) => {
  const name = (req.body && req.body.name || '').trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) return res.status(400).json({ error: 'Invalid name' });
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
  if (!cmd) return res.status(400).json({ error: 'Unknown action' });
  const m = targetManager(req);
  res.json(m ? m.sendCommand(cmd) : { ok: false, error: 'No active server.' });
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
  if (!m || !m.dir()) return res.status(400).json({ error: 'No active server.' });
  const on = !!(req.body && req.body.enabled);
  if (m.isRunning()) return res.json(m.sendCommand(`whitelist ${on ? 'on' : 'off'}`));
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
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) return res.status(400).json({ error: 'Invalid player name' });
  const { kind, op } = req.params;
  if (!['whitelist', 'op', 'ban'].includes(kind) || !['add', 'remove'].includes(op)) {
    return res.status(400).json({ error: 'Unknown action' });
  }
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: 'No active server.' });

  // Online: let Minecraft do it (resolves UUIDs, applies immediately).
  if (m.isRunning()) {
    const cmds = {
      'whitelist:add': `whitelist add ${name}`, 'whitelist:remove': `whitelist remove ${name}`,
      'op:add': `op ${name}`, 'op:remove': `deop ${name}`,
      'ban:add': `ban ${name}`, 'ban:remove': `pardon ${name}`,
    };
    return res.json(m.sendCommand(cmds[`${kind}:${op}`]));
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
    if (!uuid) return res.status(400).json({ error: 'Could not resolve that player (start the server to add, or check the name).' });
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
        const u = await pidusage(m.proc.pid);
        const cores = os.cpus().length || 1;
        cpu = Math.round(Math.min(100, u.cpu / cores));
        memMB = Math.round(u.memory / 1048576);
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
  res.status(400).json({ error: err.message });
});

app.delete('/api/plugins/:name', (req, res) => {
  const m = targetManager(req);
  if (!m) return res.status(400).json({ error: 'No active server.' });
  const name = path.basename(req.params.name);
  if (!name.toLowerCase().endsWith('.jar')) return res.status(400).json({ error: 'Not a .jar' });
  const full = path.join(m.pluginsDir(), name);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Does not exist' });
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
  if (!m) return res.status(400).json({ error: 'No active server.' });
  const full = resolveEditable(m.dir(), req.params.name);
  if (!full) return res.status(404).json({ error: 'File not allowed' });
  try {
    res.json({ name: path.basename(full), content: fs.readFileSync(full, 'utf8') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/configs/:name', (req, res) => {
  const m = targetManager(req);
  if (!m) return res.status(400).json({ error: 'No active server.' });
  const full = resolveEditable(m.dir(), req.params.name);
  if (!full) return res.status(404).json({ error: 'File not allowed' });
  const content = req.body && req.body.content;
  if (typeof content !== 'string') return res.status(400).json({ error: 'Missing content' });
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

function pruneBackups(slug) {
  const retain = config.backups.retainCount || 0;
  if (retain <= 0) return;
  const all = listBackups().filter((b) => b.slug === slug); // sorted by mtime desc
  const toDelete = all.slice(retain);
  for (const b of toDelete) {
    try {
      fs.unlinkSync(path.join(backupsDir(), b.name));
      log(`Old backup deleted by retention: ${b.name}`);
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
  else if (jar.includes('purpur')) { loaders = ['purpur', 'paper', 'spigot', 'bukkit']; label = 'Purpur'; }
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
    return res.json({ hits: [], compat, note: 'Vanilla servers cannot install plugins or mods.' });
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
  if (!versionId) return res.status(400).json({ error: 'Missing versionId' });
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: 'No active server.' });
  const compat = detectCompat(m);
  try {
    const r = await fetch(`${MODRINTH}/version/${encodeURIComponent(versionId)}`, { headers: { 'User-Agent': UA } });
    const version = await r.json();
    // Compatibility guard: refuse anything that doesn't match this server's
    // loader and Minecraft version, so an incompatible jar can't be installed.
    const loaderOk = (version.loaders || []).some((l) => compat.loaders.includes(l));
    const versionOk = !compat.mcVersion || (version.game_versions || []).includes(compat.mcVersion);
    if (!loaderOk || !versionOk) {
      return res.status(409).json({ error: `Not compatible with ${compat.label} ${compat.mcVersion || ''}`.trim() });
    }
    const file = (version.files || []).find((f) => f.primary) || (version.files || [])[0];
    if (!file) return res.status(404).json({ error: 'This version has no files.' });
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
  if (!m || !m.dir()) return res.status(400).json({ error: 'No active server.' });
  const abs = safeResolve(m.dir(), req.query.path || '');
  if (!abs) return res.status(400).json({ error: 'Invalid path' });
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
  if (!m || !m.dir()) return res.status(400).json({ error: 'No active server.' });
  const abs = safeResolve(m.dir(), req.query.path || '');
  if (!abs) return res.status(400).json({ error: 'Invalid path' });
  try {
    const st = fs.statSync(abs);
    if (st.isDirectory()) return res.status(400).json({ error: 'That is a folder' });
    if (st.size > MAX_EDIT_BYTES) return res.status(413).json({ error: 'File too large to edit (max 2 MB)' });
    if (!isTextFile(path.basename(abs))) return res.status(415).json({ error: 'Not a text file' });
    res.json({ content: fs.readFileSync(abs, 'utf8') });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/files/write', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: 'No active server.' });
  const abs = safeResolve(m.dir(), req.body && req.body.path);
  if (!abs) return res.status(400).json({ error: 'Invalid path' });
  const content = req.body && req.body.content;
  if (typeof content !== 'string') return res.status(400).json({ error: 'Missing content' });
  try {
    fs.writeFileSync(abs, content, 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/mkdir', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: 'No active server.' });
  const name = path.basename(String((req.body && req.body.name) || '').trim());
  if (!name) return res.status(400).json({ error: 'Name required' });
  const abs = safeResolve(m.dir(), path.join(req.body.path || '', name));
  if (!abs) return res.status(400).json({ error: 'Invalid path' });
  try {
    fs.mkdirSync(abs, { recursive: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/rename', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: 'No active server.' });
  const from = safeResolve(m.dir(), req.body && req.body.path);
  const newName = path.basename(String((req.body && req.body.name) || '').trim());
  if (!from || !newName) return res.status(400).json({ error: 'Invalid path or name' });
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
  if (!m || !m.dir()) return res.status(400).json({ error: 'No active server.' });
  const abs = safeResolve(m.dir(), req.query.path || '');
  if (!abs || abs === path.resolve(m.dir())) return res.status(400).json({ error: 'Invalid path' });
  try {
    fs.rmSync(abs, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/files/download', (req, res) => {
  const m = targetManager(req);
  if (!m || !m.dir()) return res.status(400).json({ error: 'No active server.' });
  const abs = safeResolve(m.dir(), req.query.path || '');
  if (!abs) return res.status(400).json({ error: 'Invalid path' });
  try {
    if (fs.statSync(abs).isDirectory()) return res.status(400).json({ error: 'Cannot download a folder' });
    res.download(abs, path.basename(abs));
  } catch (err) {
    res.status(404).json({ error: 'Does not exist' });
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
// Server creator (download Paper / Purpur / Vanilla / Fabric jars)
// ---------------------------------------------------------------------------

const SERVER_TYPES = ['paper', 'purpur', 'vanilla', 'fabric'];

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.json();
}

// Returns { versions: [latest..oldest] } of MC versions installable for a type.
async function listServerVersions(type) {
  if (type === 'paper') {
    const d = await fetchJson('https://api.papermc.io/v2/projects/paper');
    return (d.versions || []).slice().reverse();
  }
  if (type === 'purpur') {
    const d = await fetchJson('https://api.purpurmc.org/v2/purpur');
    return (d.versions || []).slice().reverse();
  }
  if (type === 'vanilla') {
    const d = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    return (d.versions || []).filter((v) => v.type === 'release').map((v) => v.id);
  }
  if (type === 'fabric') {
    const d = await fetchJson('https://meta.fabricmc.net/v2/versions/game');
    return (d || []).filter((v) => v.stable).map((v) => v.version);
  }
  throw new Error('Unknown server type');
}

// Returns { url, filename } for the jar to download.
async function resolveServerJar(type, mcVersion) {
  if (type === 'paper') {
    const builds = await fetchJson(`https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(mcVersion)}/builds`);
    const list = builds.builds || [];
    const b = list[list.length - 1];
    if (!b) throw new Error('No Paper build for that version');
    const jar = b.downloads.application.name;
    return { url: `https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(mcVersion)}/builds/${b.build}/downloads/${jar}`, filename: jar };
  }
  if (type === 'purpur') {
    return { url: `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(mcVersion)}/latest/download`, filename: `purpur-${mcVersion}.jar` };
  }
  if (type === 'vanilla') {
    const manifest = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    const entry = (manifest.versions || []).find((v) => v.id === mcVersion);
    if (!entry) throw new Error('Unknown vanilla version');
    const meta = await fetchJson(entry.url);
    if (!meta.downloads || !meta.downloads.server) throw new Error('That version has no server jar');
    return { url: meta.downloads.server.url, filename: `minecraft_server-${mcVersion}.jar` };
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
  throw new Error('Unknown server type');
}

app.get('/api/create/versions', async (req, res) => {
  const type = String(req.query.type || '').toLowerCase();
  if (!SERVER_TYPES.includes(type)) return res.status(400).json({ error: 'Unknown server type' });
  try {
    res.json({ versions: await listServerVersions(type) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/create', async (req, res) => {
  const body = req.body || {};
  const type = String(body.type || '').toLowerCase();
  const name = String(body.name || '').trim();
  const parentDir = String(body.parentDir || '').trim();
  const mcVersion = String(body.mcVersion || '').trim();
  if (!SERVER_TYPES.includes(type)) return res.status(400).json({ error: 'Pick a server type' });
  if (!name) return res.status(400).json({ error: 'A name is required' });
  if (!parentDir || !fs.existsSync(parentDir)) return res.status(400).json({ error: 'Pick an existing parent folder' });
  if (!mcVersion) return res.status(400).json({ error: 'Pick a Minecraft version' });
  if (!body.eula) return res.status(400).json({ error: 'You must accept the Minecraft EULA' });

  const dir = path.join(parentDir, slugify(name));
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
    return res.status(400).json({ error: `Folder already exists and is not empty: ${dir}` });
  }
  try {
    const { url, filename } = await resolveServerJar(type, mcVersion);
    const dl = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!dl.ok) return res.status(502).json({ error: `Jar download failed: HTTP ${dl.status}` });
    const buf = Buffer.from(await dl.arrayBuffer());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buf);
    fs.writeFileSync(path.join(dir, 'eula.txt'), `# Accepted via Lodestone on ${new Date().toISOString()}\neula=true\n`, 'utf8');

    let javaArgs = body.javaArgs;
    if (typeof javaArgs === 'string') javaArgs = javaArgs.trim().split(/\s+/).filter(Boolean);
    if (!Array.isArray(javaArgs) || !javaArgs.length) javaArgs = ['-Xmx4G', '-Xms4G'];

    const entry = {
      id: genId(),
      name,
      dir,
      jar: filename,
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
    res.json({ ok: true, server: serverWithStatus(entry) });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

function validateTask(body) {
  const type = String(body.type || '').toLowerCase();
  if (!TASK_TYPES.includes(type)) return { error: 'Unknown task type' };
  const serverId = String(body.serverId || '').trim();
  if (!findServer(serverId)) return { error: 'Unknown server' };
  const cronExpr = String(body.cron || '').trim();
  if (!cron.validate(cronExpr)) return { error: 'Invalid cron expression' };
  const command = type === 'command' ? String(body.command || '').trim() : '';
  if (type === 'command' && !command) return { error: 'A command is required' };
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
  const v = validateTask(req.body || {});
  if (v.error) return res.status(400).json({ error: v.error });
  if (!Array.isArray(config.tasks)) config.tasks = [];
  const task = { id: genId(), ...v.value };
  config.tasks.push(task);
  saveConfig(config);
  setupSchedulers();
  res.json({ ok: true, task: publicTask(task) });
});

app.put('/api/tasks/:id', (req, res) => {
  const t = (config.tasks || []).find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  const v = validateTask({ ...t, ...req.body });
  if (v.error) return res.status(400).json({ error: v.error });
  Object.assign(t, v.value);
  saveConfig(config);
  setupSchedulers();
  res.json({ ok: true, task: publicTask(t) });
});

app.delete('/api/tasks/:id', (req, res) => {
  if (!Array.isArray(config.tasks)) config.tasks = [];
  const before = config.tasks.length;
  config.tasks = config.tasks.filter((x) => x.id !== req.params.id);
  if (config.tasks.length === before) return res.status(404).json({ error: 'Task not found' });
  saveConfig(config);
  setupSchedulers();
  res.json({ ok: true });
});

app.post('/api/tasks/:id/run', (req, res) => {
  const t = (config.tasks || []).find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  try { runTask(t); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Static files (last, so they don't shadow /api)
// ---------------------------------------------------------------------------

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
      const u = await pidusage(m.proc.pid);
      // pidusage sums CPU across all cores (can exceed 100%); normalize to 0-100
      const cores = os.cpus().length || 1;
      proc = { cpu: Math.min(100, u.cpu / cores), memory: u.memory };
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
