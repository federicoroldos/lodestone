'use strict';

/* ===== Lodestone frontend ===== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let token = localStorage.getItem('lodestone_token') || '';
let ws = null;
let mapUrl = null;
let activeServerId = null;
let serversCache = []; // [{id,name,dir,jar,...,status:{...}}]

// ----- helpers -----
function api(path, opts = {}) {
  opts.headers = Object.assign({}, opts.headers, { Authorization: `Bearer ${token}` });
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  return fetch(path, opts).then(async (r) => {
    if (r.status === 401) { logout(); throw new Error('Session expired'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });
}

let toastTimer = null;
function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

// Returns a human size string *with its unit* (e.g. "512 MB", "1.5 GB"), so
// callers must not append their own " MB" — a 1.5 GB value was being shown as
// "1.5 MB" when the unit was hard-coded by the caller.
function fmtBytes(b) {
  if (b == null) return '—';
  const mb = b / 1048576;
  if (mb < 1024) return mb.toFixed(0) + ' MB';
  return (mb / 1024).toFixed(1) + ' GB';
}
function fmtUptime(ms) {
  if (!ms) return '';
  let s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  const parts = [];
  if (d) parts.push(d + 'd');
  if (h || d) parts.push(h + 'h');
  parts.push(m + 'm');
  return 'uptime ' + parts.join(' ');
}

// ----- login -----
let currentUser = null;
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#login-username').value.trim();
  const pass = $('#login-pass').value;
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: pass }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error');
    token = data.token;
    currentUser = data.user || null;
    localStorage.setItem('lodestone_token', token);
    boot();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

function logout() {
  localStorage.removeItem('lodestone_token');
  token = '';
  currentUser = null;
  if (ws) { try { ws.close(); } catch (_) {} ws = null; }
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}
$('#btn-logout').addEventListener('click', logout);

// ----- boot -----
async function boot() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#login-error').textContent = '';
  if (!currentUser) { try { currentUser = await api('/api/me'); } catch (_) {} }
  connectWs();
  loadConfig();
  await loadServers();
  loadPlugins();
  loadConfigsList();
  loadBackups();
}

async function loadConfig() {
  try {
    const cfg = await api('/api/config');
    // Map: BlueMap by default on :8100 of the same host
    mapUrl = (cfg.map && cfg.map.url) || `http://${location.hostname}:8100`;
  } catch (_) {}
}

// ----- WebSocket -----
function setConn(state) {
  const dot = $('#conn-dot'), label = $('#conn-label');
  if (!dot) return;
  dot.className = 'dot ' + (state === 'ok' ? 'ok' : state === 'bad' ? 'bad' : '');
  label.textContent = state === 'ok' ? 'connected' : state === 'bad' ? 'reconnecting…' : 'connecting…';
}
let wsRetries = 0;
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
  ws.onopen = () => {
    wsRetries = 0;
    setConn('ok');
    if (activeServerId) ws.send(JSON.stringify({ type: 'getHistory', serverId: activeServerId }));
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (_) { return; }
    handleWs(msg);
  };
  ws.onclose = () => {
    setConn('bad');
    if (!token) return;
    // Exponential backoff (2s → 30s) so an invalid token / down server doesn't
    // hammer the endpoint every 2s forever.
    const delay = Math.min(30000, 2000 * Math.pow(2, wsRetries++));
    setTimeout(connectWs, delay);
  };
}

function handleWs(msg) {
  if (msg.type === 'meta') {
    if (!activeServerId) activeServerId = msg.activeServerId;
  } else if (msg.type === 'history') {
    if (msg.serverId !== activeServerId) return;
    $('#console').innerHTML = '';
    for (const line of msg.lines) appendConsole(line);
    scrollConsole(true);
  } else if (msg.type === 'line') {
    if (msg.serverId !== activeServerId) return;
    appendConsole(msg.line);
    scrollConsole();
  } else if (msg.type === 'status') {
    updateServerStatus(msg.status);
    if (msg.status.serverId === activeServerId) applyStatus(msg.status);
  } else if (msg.type === 'stats') {
    if (msg.stats.serverId && msg.stats.serverId !== activeServerId) return;
    applyStats(msg.stats);
  }
}

// Merge an incoming status into the servers cache and refresh its row.
function updateServerStatus(status) {
  const s = serversCache.find((x) => x.id === status.serverId);
  if (s) { s.status = status; renderServers(); }
}

// ----- console -----
const consoleEl = $('#console');
function appendConsole(line) {
  const span = document.createElement('span');
  span.className = 'l l-' + (line.level || 'info');
  span.textContent = line.text + '\n';
  consoleEl.appendChild(span);
  // client-side trim
  while (consoleEl.childNodes.length > 1200) consoleEl.removeChild(consoleEl.firstChild);
}
function scrollConsole(force) {
  // While the view is hidden the element has no height, so the "near bottom"
  // check is meaningless — only auto-scroll when it's actually measurable,
  // unless forced (e.g. right after opening the Console view).
  if (force || consoleEl.clientHeight === 0) {
    consoleEl.scrollTop = consoleEl.scrollHeight;
    updateJumpBtn();
    return;
  }
  const nearBottom = consoleEl.scrollHeight - consoleEl.scrollTop - consoleEl.clientHeight < 120;
  if (nearBottom) consoleEl.scrollTop = consoleEl.scrollHeight;
  updateJumpBtn();
}

// "Jump to latest" floating button: shown only when scrolled away from the
// bottom (so new output is arriving below the fold).
const consoleJump = $('#console-jump');
function updateJumpBtn() {
  if (!consoleJump) return;
  const dist = consoleEl.scrollHeight - consoleEl.scrollTop - consoleEl.clientHeight;
  const away = consoleEl.clientHeight > 0 && dist > 120;
  consoleJump.classList.toggle('hidden', !away);
}
if (consoleJump) {
  consoleEl.addEventListener('scroll', updateJumpBtn);
  consoleJump.addEventListener('click', () => scrollConsole(true));
}

$('#cmd-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#cmd-input');
  const cmd = input.value.trim();
  if (!cmd) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'command', cmd }));
  }
  input.value = '';
});

// ----- status -----
let currentStatus = 'offline';
function applyStatus(s) {
  currentStatus = s.status;
  const pill = $('#status-pill');
  pill.textContent = s.status;
  pill.className = 'pill pill-' + s.status;
  const upStr = (s.status === 'online' || s.status === 'stopping') ? fmtUptime(s.uptimeMs) : '';
  $('#stat-players').textContent = s.playerCount;
  $('#stat-players-max').textContent = '/' + (s.maxPlayers || 0);
  $('#stat-tps').textContent = s.tps != null ? s.tps.toFixed(1) : '—';
  pushSpark('players', s.playerCount);

  const running = s.status !== 'offline';

  // ----- dashboard KPI tiles -----
  $('#dash-status').textContent = s.status;
  $('#dash-uptime').textContent = upStr ? upStr.replace('uptime ', '') : '—';
  $('#dash-server-name').textContent = s.name || '—';

  // status tile color
  const stTile = $('#kpi-status');
  stTile.className = 'kpi ' + (s.status === 'online' ? 'is-online' : s.status === 'offline' ? 'is-offline' : 'is-busy');

  // tps tile color
  const tpsTile = $('#kpi-tps');
  if (s.tps == null || !running) {
    tpsTile.className = 'kpi';
  } else {
    const tps = s.tps;
    tpsTile.className = 'kpi ' + (tps >= 19 ? 'tps-good' : tps >= 15 ? 'tps-warn' : 'tps-bad');
  }

  $('#btn-start').disabled = running;
  $('#btn-stop').disabled = !running;
  $('#btn-restart').disabled = false;

  renderPlayers(s.players, s.maxPlayers);
  renderServerInfo();
}

function renderServerInfo() {
  const s = serversCache.find((x) => x.id === activeServerId);
  if (!s) return;
  $('#info-version').textContent = s.mcVersion || '—';
  $('#info-jar').textContent = s.jar || '—';
  $('#info-worlds').textContent = (s.worlds && s.worlds.length) ? s.worlds.join(', ') : '—';
  $('#info-dir').textContent = s.dir || '—';
}

// ----- stats / sparklines -----
const sparks = {};
const sparkData = {};
function initSpark(key) {
  const c = $('#spark-' + key);
  if (!c) return;
  sparks[key] = c;
  sparkData[key] = [];
}
['players', 'procmem', 'proccpu', 'sysmem', 'syscpu', 'tps'].forEach(initSpark);

function pushSpark(key, val) {
  const data = sparkData[key];
  if (!data) return;
  data.push(val);
  if (data.length > 150) data.shift(); // ~5 min at 2s
  drawSpark(key);
}

function drawSpark(key) {
  const c = sparks[key];
  if (!c) return;
  const data = sparkData[key];
  const rect = c.getBoundingClientRect();
  c.width = rect.width * devicePixelRatio;
  c.height = rect.height * devicePixelRatio;
  const ctx = c.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = 'rgba(168,85,247,0.12)';
  ctx.fill();
}

function applyStats(s) {
  $('#stat-procmem').textContent = fmtBytes(s.procMem); // includes unit (MB/GB)
  $('#stat-proccpu').textContent = (s.procCpu || 0).toFixed(0);
  $('#stat-syscpu').textContent = (s.cpuSystem || 0).toFixed(0);
  $('#stat-sysmem').textContent = (s.memSystemUsed / 1073741824).toFixed(1);
  $('#stat-sysmem-total').textContent = ' / ' + (s.memSystemTotal / 1073741824).toFixed(1) + ' GB';
  if (s.tps != null) $('#stat-tps').textContent = s.tps.toFixed(1);
  pushSpark('procmem', s.procMem / 1048576);
  pushSpark('proccpu', s.procCpu || 0);
  pushSpark('syscpu', s.cpuSystem || 0);
  pushSpark('sysmem', s.memSystemUsed / 1073741824);
  if (s.tps != null) pushSpark('tps', s.tps);

  // disk usage bar
  if (s.disk && s.disk.total) {
    const usedPct = ((s.disk.total - s.disk.free) / s.disk.total) * 100;
    const usedGb = ((s.disk.total - s.disk.free) / 1073741824).toFixed(0);
    const totalGb = (s.disk.total / 1073741824).toFixed(0);
    $('#stat-disk').textContent = `${usedGb} / ${totalGb} GB (${usedPct.toFixed(0)}%)`;
    const bar = $('#disk-bar');
    bar.style.width = usedPct.toFixed(1) + '%';
    bar.className = 'bar-fill' + (usedPct >= 90 ? ' bad' : usedPct >= 75 ? ' warn' : '');
  }
}

// ----- server actions -----
$('#btn-start').addEventListener('click', () => api('/api/server/start', { method: 'POST' }).then(r => { if (r.error) toast(r.error, true); }).catch(e => toast(e.message, true)));
$('#btn-stop').addEventListener('click', () => api('/api/server/stop', { method: 'POST' }).catch(e => toast(e.message, true)));
$('#btn-restart').addEventListener('click', () => {
  if (!confirm('Restart the server?')) return;
  api('/api/server/restart', { method: 'POST' }).catch(e => toast(e.message, true));
});

// ----- sidebar navigation -----
const VIEW_TITLES = {
  servers: 'Servers', dashboard: 'Dashboard', metrics: 'Metrics', console: 'Console', players: 'Players', plugins: 'Plugins',
  configs: 'Configs', files: 'Files', tasks: 'Schedules', backups: 'Backups', modrinth: 'Modrinth', map: 'Map', users: 'Users',
};
$$('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    const name = item.dataset.view;
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    $$('.view').forEach(v => v.classList.remove('active'));
    item.classList.add('active');
    $(`.view[data-view="${name}"]`).classList.add('active');
    $('#page-title').textContent = VIEW_TITLES[name] || name;
    if (name === 'console') requestAnimationFrame(() => scrollConsole(true));
    if (name === 'servers') loadServers();
    if (name === 'metrics') loadMetricsView();
    if (name === 'map') openMap();
    if (name === 'backups') loadBackups();
    if (name === 'plugins') loadPlugins();
    if (name === 'players') loadPlayerLists();
    if (name === 'users') loadUsers();
    if (name === 'files') loadFiles('');
    if (name === 'tasks') loadTasks();
    if (name === 'modrinth') loadModrinth();
  });
});

// ----- servers registry -----
async function loadServers() {
  try {
    const data = await api('/api/servers');
    serversCache = data.servers || [];
    if (!activeServerId || !serversCache.some((s) => s.id === activeServerId)) {
      activeServerId = data.activeServerId || (serversCache[0] && serversCache[0].id) || null;
    }
    renderServers();
    renderActiveSelect();
    const act = serversCache.find((s) => s.id === activeServerId);
    if (act) applyStatus(act.status);
  } catch (e) { toast(e.message, true); }
}

function setServerSelectOpen(open) {
  const root = $('#server-select');
  const btn = $('#server-select-btn');
  if (!root) return;
  root.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function renderActiveSelect() {
  const label = $('#server-select-label');
  const menu = $('#server-select-menu');
  if (!label || !menu) return;
  menu.innerHTML = '';

  if (!serversCache.length) {
    label.textContent = 'No servers';
    const empty = document.createElement('div');
    empty.className = 'server-select-empty';
    empty.textContent = 'No servers';
    menu.appendChild(empty);
    return;
  }

  for (const s of serversCache) {
    const online = s.status && s.status.status !== 'offline';
    if (s.id === activeServerId) label.textContent = s.name;

    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'server-select-opt' + (s.id === activeServerId ? ' is-active' : '');
    opt.setAttribute('role', 'option');
    opt.innerHTML = `<span class="ss-dot ${online ? 'on' : ''}"></span><span class="ss-name"></span>`;
    opt.querySelector('.ss-name').textContent = s.name;
    opt.addEventListener('click', () => {
      setServerSelectOpen(false);
      if (s.id !== activeServerId) setActive(s.id);
    });
    menu.appendChild(opt);
  }
}

$('#server-select-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  setServerSelectOpen(!$('#server-select').classList.contains('open'));
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#server-select')) setServerSelectOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setServerSelectOpen(false);
});

// SVG icons used in the server table action buttons
const ICONS = {
  play: '<svg class="ico" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7V5z" fill="currentColor" stroke="none"/></svg>',
  stop: '<svg class="ico" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/></svg>',
  restart: '<svg class="ico" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/></svg>',
  star: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 17.8 6.6 19.6l1-6L3.3 9.4l6-.9L12 3z"/></svg>',
  edit: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  trash: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  server: '<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><circle cx="7" cy="7" r="1"/><circle cx="7" cy="17" r="1"/></svg>',
};

function renderServers() {
  const el = $('#servers-list');
  if (!el) return;
  if (!serversCache.length) {
    el.innerHTML = '<div class="empty">No servers registered yet. Use “Create new” or “Register existing”.</div>';
    return;
  }

  const rows = serversCache.map((s) => {
    const st = s.status || { status: 'offline', playerCount: 0, maxPlayers: 0 };
    const running = st.status !== 'offline';
    const isActive = s.id === activeServerId;
    const players = running ? `${st.playerCount}/${st.maxPlayers || '?'}` : '—';
    const uptime = running ? (fmtUptime(st.uptimeMs).replace('uptime ', '') || '0m') : '—';
    const ver = s.mcVersion || '—';
    return `
      <tr data-id="${s.id}" class="${isActive ? 'active' : ''}">
        <td>
          <div class="srv-name-cell">
            <span class="srv-ico">${ICONS.server}</span>
            <div class="srv-name-main">
              <div class="srv-name" data-act="open">${escapeHtml(s.name)} ${isActive ? '<span class="badge-active">active</span>' : ''}</div>
              <div class="srv-sub">${escapeHtml(s.dir || '')}</div>
            </div>
          </div>
        </td>
        <td><span class="pill pill-${st.status}">${st.status}</span></td>
        <td class="srv-num">${players}</td>
        <td class="srv-num col-opt">${uptime}</td>
        <td class="srv-num col-opt">${escapeHtml(ver)}</td>
        <td class="ta-r">
          <div class="srv-actions">
            <button class="act-btn go-start" data-act="start" title="Start" ${running ? 'disabled' : ''}>${ICONS.play}</button>
            <button class="act-btn" data-act="restart" title="Restart">${ICONS.restart}</button>
            <button class="act-btn go-stop" data-act="stop" title="Stop" ${running ? '' : 'disabled'}>${ICONS.stop}</button>
            <button class="act-btn" data-act="active" title="Set active" ${isActive ? 'disabled' : ''}>${ICONS.star}</button>
            <button class="act-btn" data-act="edit" title="Edit">${ICONS.edit}</button>
            <button class="act-btn go-del" data-act="delete" title="Remove">${ICONS.trash}</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  el.innerHTML = `
    <table class="srv-table">
      <thead>
        <tr>
          <th>Server</th>
          <th>Status</th>
          <th>Players</th>
          <th class="col-opt">Uptime</th>
          <th class="col-opt">Version</th>
          <th class="ta-r">Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  el.querySelectorAll('tbody tr').forEach((tr) => {
    const s = serversCache.find((x) => x.id === tr.dataset.id);
    if (!s) return;
    tr.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', (e) => { e.stopPropagation(); serverAction(b.dataset.act, s); });
    });
  });
}

function serverAction(act, s) {
  if (act === 'open') {
    // Clicking a server name (Crafty-style) makes it active and opens its dashboard.
    const go = () => { const d = $('.nav-item[data-view="dashboard"]'); if (d) d.click(); };
    if (s.id === activeServerId) { go(); return; }
    return setActive(s.id).then(go);
  }
  if (act === 'start') return api(`/api/servers/${s.id}/start`, { method: 'POST' }).then(r => { if (r.error) toast(r.error, true); }).catch(e => toast(e.message, true));
  if (act === 'stop') return api(`/api/servers/${s.id}/stop`, { method: 'POST' }).then(r => { if (r.error) toast(r.error, true); }).catch(e => toast(e.message, true));
  if (act === 'restart') { if (!confirm(`Restart "${s.name}"?`)) return; return api(`/api/servers/${s.id}/restart`, { method: 'POST' }).catch(e => toast(e.message, true)); }
  if (act === 'active') return setActive(s.id);
  if (act === 'edit') return openServerModal(s);
  if (act === 'delete') {
    if (!confirm(`Remove "${s.name}" from the panel? (the server files are NOT deleted)`)) return;
    return api(`/api/servers/${s.id}`, { method: 'DELETE' })
      .then((r) => { toast('Server removed'); if (activeServerId === s.id) activeServerId = r.activeServerId; loadServers(); })
      .catch(e => toast(e.message, true));
  }
}

async function setActive(id) {
  if (!id || id === activeServerId) return;
  try {
    await api('/api/active', { method: 'POST', body: { serverId: id } });
    activeServerId = id;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'getHistory', serverId: id }));
    await loadServers();
    loadPlugins();
    loadConfigsList();
    loadBackups();
    // Refresh whichever data view is currently open and depends on the server.
    if ($('.view[data-view="modrinth"]').classList.contains('active')) loadModrinth();
    if ($('.view[data-view="files"]').classList.contains('active')) loadFiles('');
    if ($('.view[data-view="metrics"]').classList.contains('active')) loadMetricsView();
    if ($('.view[data-view="players"]').classList.contains('active')) loadPlayerLists();
    toast('Active server switched');
  } catch (e) { toast(e.message, true); }
}

// ----- register / edit server modal -----
let editingServerId = null;
function openServerModal(server) {
  editingServerId = server ? server.id : null;
  $('#server-modal-title').textContent = server ? 'Edit server' : 'Register server';
  $('#sf-name').value = server ? server.name : '';
  $('#sf-dir').value = server ? server.dir : '';
  $('#sf-args').value = server ? (server.javaArgs || []).join(' ') : '-Xmx4G -Xms4G';
  $('#sf-mcver').value = server ? (server.mcVersion || '') : '';
  $('#sf-worlds').value = server ? (server.worlds || []).join(', ') : 'world, world_nether, world_the_end';
  $('#sf-error').textContent = '';
  const jarSel = $('#sf-jar');
  jarSel.innerHTML = server && server.jar
    ? `<option value="${escapeHtml(server.jar)}" selected>${escapeHtml(server.jar)}</option><option value="">— re-pick folder to change —</option>`
    : '<option value="">— pick the folder first —</option>';
  $('#server-modal').classList.remove('hidden');
}
function closeServerModal() { $('#server-modal').classList.add('hidden'); }
$('#server-add').addEventListener('click', () => openServerModal(null));
$('#server-modal-close').addEventListener('click', closeServerModal);
$('#sf-cancel').addEventListener('click', closeServerModal);

$('#sf-save').addEventListener('click', async () => {
  const body = {
    name: $('#sf-name').value.trim(),
    dir: $('#sf-dir').value.trim(),
    jar: $('#sf-jar').value,
    javaArgs: $('#sf-args').value.trim(),
    mcVersion: $('#sf-mcver').value.trim(),
    worlds: $('#sf-worlds').value.trim(),
  };
  try {
    if (editingServerId) await api(`/api/servers/${editingServerId}`, { method: 'PUT', body });
    else await api('/api/servers', { method: 'POST', body });
    closeServerModal();
    toast(editingServerId ? 'Server updated' : 'Server registered');
    loadServers();
  } catch (e) { $('#sf-error').textContent = e.message; }
});

// ----- folder browser -----
let fsCurrent = '';
let fsTarget = 'register'; // 'register' (server modal) | 'create' (create modal)
$('#sf-browse').addEventListener('click', () => { fsTarget = 'register'; openFs($('#sf-dir').value.trim() || ''); });
$('#fs-modal-close').addEventListener('click', () => $('#fs-modal').classList.add('hidden'));
$('#fs-cancel').addEventListener('click', () => $('#fs-modal').classList.add('hidden'));
$('#fs-use').addEventListener('click', () => {
  if (!fsCurrent) return toast('Navigate into a folder first', true);
  $('#fs-modal').classList.add('hidden');
  if (fsTarget === 'create') {
    $('#cf-parent').value = fsCurrent;
  } else {
    $('#sf-dir').value = fsCurrent;
    // Auto-fill the server name from the folder name when it's still empty,
    // so importing an existing server pre-fills the fields for you.
    if (!$('#sf-name').value.trim()) {
      const seg = fsCurrent.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
      if (seg) $('#sf-name').value = seg;
    }
    loadJarsInto(fsCurrent); // auto-populate jars from the chosen folder
  }
});

async function openFs(start) {
  $('#fs-modal').classList.remove('hidden');
  await fsNavigate(start || '');
}
async function fsNavigate(p) {
  try {
    const data = await api(`/api/fs?path=${encodeURIComponent(p)}`);
    fsCurrent = data.path || '';
    $('#fs-current').textContent = fsCurrent || 'This PC (drives)';
    const list = $('#fs-list');
    list.innerHTML = '';
    // up / parent
    if (data.path) {
      const up = document.createElement('div');
      up.className = 'fs-item fs-up';
      up.textContent = '⬆ ..';
      up.addEventListener('click', () => fsNavigate(data.parent || ''));
      list.appendChild(up);
    }
    if (data.drives && data.drives.length) {
      for (const d of data.drives) {
        const it = document.createElement('div');
        it.className = 'fs-item';
        it.textContent = '💽 ' + d;
        it.addEventListener('click', () => fsNavigate(d));
        list.appendChild(it);
      }
    }
    for (const d of (data.dirs || [])) {
      const it = document.createElement('div');
      it.className = 'fs-item';
      it.textContent = '📁 ' + d;
      it.addEventListener('click', () => fsNavigate(joinPath(data.path, d)));
      list.appendChild(it);
    }
    const jars = data.jars || [];
    $('#fs-jars').textContent = jars.length ? `Jars here: ${jars.join(', ')}` : 'No .jar in this folder.';
  } catch (e) { toast(e.message, true); }
}
function joinPath(base, name) {
  if (!base) return name;
  return base.replace(/[\\/]+$/, '') + '\\' + name;
}
async function loadJarsInto(dir) {
  try {
    const data = await api(`/api/fs?path=${encodeURIComponent(dir)}`);
    const sel = $('#sf-jar');
    const jars = data.jars || [];
    sel.innerHTML = '';
    if (!jars.length) {
      sel.innerHTML = '<option value="">— no .jar found —</option>';
      return;
    }
    for (const j of jars) {
      const o = document.createElement('option');
      o.value = j; o.textContent = j;
      sel.appendChild(o);
    }
    // pick a likely server jar by default
    const guess = jars.find((j) => /spigot|paper|purpur|server|bukkit|fabric|forge/i.test(j)) || jars[0];
    sel.value = guess;
  } catch (e) { toast(e.message, true); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ----- players -----
function renderPlayers(players, max) {
  const el = $('#players-list');
  if (!players || players.length === 0) {
    el.innerHTML = '<span class="empty">Nobody connected.</span>';
    return;
  }
  el.innerHTML = '';
  for (const name of players) {
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    chip.innerHTML = `<span class="player-name">${name}</span>
      <div class="player-actions">
        <button class="btn btn-glass btn-xs" data-act="op">OP</button>
        <button class="btn btn-glass btn-xs" data-act="kick">Kick</button>
        <button class="btn btn-red btn-xs" data-act="ban">Ban</button>
      </div>`;
    chip.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => playerAction(b.dataset.act, name));
    });
    el.appendChild(chip);
  }
}
function playerAction(action, name) {
  api(`/api/players/${action}`, { method: 'POST', body: { name } })
    .then((r) => { if (r.error) toast(r.error, true); else toast(`${action} → ${name}`); })
    .catch(e => toast(e.message, true));
}
$('#players-refresh').addEventListener('click', () => {
  api('/api/command', { method: 'POST', body: { cmd: 'list' } }).catch(() => {});
});
$$('.manual-player [data-paction]').forEach((b) => {
  b.addEventListener('click', () => {
    const name = $('#manual-player-name').value.trim();
    if (!name) return toast('Enter a name', true);
    playerAction(b.dataset.paction, name);
  });
});

// ----- plugins -----
async function loadPlugins() {
  try {
    const { plugins } = await api('/api/plugins');
    const el = $('#plugins-list');
    if (!plugins.length) { el.innerHTML = '<span class="empty">No plugins.</span>'; return; }
    el.innerHTML = '';
    for (const p of plugins) {
      const row = document.createElement('div');
      row.className = 'file-row';
      row.innerHTML = `<span class="file-name">${escapeHtml(p.name)}</span>
        <span class="file-meta">${fmtBytes(p.size)}</span>
        <button class="btn btn-sm btn-stop">Delete</button>`;
      row.querySelector('button').addEventListener('click', () => {
        if (!confirm(`Delete ${p.name}?`)) return;
        api(`/api/plugins/${encodeURIComponent(p.name)}`, { method: 'DELETE' })
          .then(() => { toast('Deleted. Restart to apply.'); loadPlugins(); })
          .catch(e => toast(e.message, true));
      });
      el.appendChild(row);
    }
  } catch (e) { toast(e.message, true); }
}
$('#plugins-refresh').addEventListener('click', loadPlugins);
$('#plugin-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('plugin', file);
  try {
    await api('/api/plugins/upload', { method: 'POST', body: fd });
    toast('Uploaded. Restart to apply.');
    loadPlugins();
  } catch (err) { toast(err.message, true); }
  e.target.value = '';
});

// ----- configs -----
async function loadConfigsList() {
  try {
    const { files } = await api('/api/configs');
    const sel = $('#config-select');
    sel.innerHTML = '';
    for (const f of files) {
      const opt = document.createElement('option');
      opt.value = f; opt.textContent = f;
      sel.appendChild(opt);
    }
    if (files.length) loadConfigFile(files[0]);
    sel.onchange = () => loadConfigFile(sel.value);
  } catch (e) { toast(e.message, true); }
}
async function loadConfigFile(name) {
  try {
    const { content } = await api(`/api/configs/${encodeURIComponent(name)}`);
    $('#config-editor').value = content;
    $('#config-msg').textContent = '';
  } catch (e) { toast(e.message, true); }
}
$('#config-save').addEventListener('click', async () => {
  const name = $('#config-select').value;
  try {
    const r = await api(`/api/configs/${encodeURIComponent(name)}`, { method: 'PUT', body: { content: $('#config-editor').value } });
    $('#config-msg').textContent = r.note || 'Saved.';
    toast('Saved (.bak created). Restart to apply.');
  } catch (e) { toast(e.message, true); }
});

// ----- backups -----
async function loadBackups() {
  try {
    const { backups } = await api('/api/backups');
    const el = $('#backups-list');
    if (!backups.length) { el.innerHTML = '<span class="empty">No backups yet.</span>'; return; }
    el.innerHTML = '';
    for (const b of backups) {
      const row = document.createElement('div');
      row.className = 'file-row';
      const date = new Date(b.mtime).toLocaleString();
      row.innerHTML = `<span class="file-name">${escapeHtml(b.name)}</span>
        <span class="file-meta">${fmtBytes(b.size)} · ${date}</span>
        <a class="btn btn-sm btn-ghost" href="/api/backups/${encodeURIComponent(b.name)}/download?token=${encodeURIComponent(token)}">⬇</a>
        <button class="btn btn-sm btn-stop">Delete</button>`;
      row.querySelector('button').addEventListener('click', () => {
        if (!confirm(`Delete ${b.name}?`)) return;
        api(`/api/backups/${encodeURIComponent(b.name)}`, { method: 'DELETE' })
          .then(() => { toast('Backup deleted'); loadBackups(); })
          .catch(e => toast(e.message, true));
      });
      el.appendChild(row);
    }
  } catch (e) { toast(e.message, true); }
}
$('#backup-now').addEventListener('click', async () => {
  $('#backup-status').textContent = 'Creating backup... (may take a while depending on world size)';
  $('#backup-now').disabled = true;
  try {
    const r = await api('/api/backups', { method: 'POST' });
    $('#backup-status').textContent = `Done: ${r.name} (${fmtBytes(r.size)})`;
    toast('Backup created');
    loadBackups();
  } catch (e) {
    $('#backup-status').textContent = '';
    toast(e.message, true);
  } finally {
    $('#backup-now').disabled = false;
  }
});

// ----- Modrinth -----
let modrinthCategoriesLoaded = false;
let modrinthCompat = null;

// Loads when entering the view: shows the most popular compatible content.
async function loadModrinth() {
  doModrinthSearch();
}

function renderCompatPill(compat, note) {
  const pill = $('#modrinth-compat');
  if (!compat || !compat.projectType) {
    pill.textContent = note || 'No compatible loader';
    pill.className = 'compat-pill warn';
    return;
  }
  const kind = compat.projectType === 'mod' ? 'mods' : 'plugins';
  pill.textContent = `${compat.label} ${kind}${compat.mcVersion ? ' · ' + compat.mcVersion : ''}`;
  pill.className = 'compat-pill';
}

async function doModrinthSearch() {
  const q = $('#modrinth-q').value.trim();
  const sort = $('#modrinth-sort').value;
  const category = $('#modrinth-category').value;
  const el = $('#modrinth-results');
  el.innerHTML = '<span class="muted">Loading…</span>';
  try {
    const data = await api(`/api/modrinth/search?q=${encodeURIComponent(q)}&sort=${encodeURIComponent(sort)}&category=${encodeURIComponent(category)}`);
    modrinthCompat = data.compat || null;
    renderCompatPill(modrinthCompat, data.note);

    // populate category dropdown once
    if (!modrinthCategoriesLoaded && data.categories) {
      const sel = $('#modrinth-category');
      for (const c of data.categories) {
        const o = document.createElement('option');
        o.value = c; o.textContent = c.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
        sel.appendChild(o);
      }
      modrinthCategoriesLoaded = true;
    }

    const hits = data.hits || [];
    if (!hits.length) { el.innerHTML = `<span class="empty">${data.note || 'No compatible results.'}</span>`; return; }
    el.innerHTML = '';
    for (const h of hits) {
      const card = document.createElement('div');
      card.className = 'mod-card';
      card.innerHTML = `
        <img src="${h.icon_url || ''}" alt="" onerror="this.style.visibility='hidden'" />
        <div class="mod-body">
          <div class="mod-title">${escapeHtml(h.title || '')}</div>
          <div class="mod-desc">${escapeHtml((h.description || '').slice(0, 140))}</div>
          <div class="mod-meta">⬇ ${Number(h.downloads).toLocaleString()} · ♥ ${Number(h.follows || 0).toLocaleString()} · ${escapeHtml(h.author || '')}</div>
        </div>
        <div class="mod-actions">
          <button class="btn btn-sm btn-start">Install</button>
        </div>`;
      card.querySelector('button').addEventListener('click', () => installMod(h.project_id || h.slug, card));
      el.appendChild(card);
    }
  } catch (err) { el.innerHTML = `<span class="empty">${escapeHtml(err.message)}</span>`; }
}

$('#modrinth-form').addEventListener('submit', (e) => { e.preventDefault(); doModrinthSearch(); });
$('#modrinth-sort').addEventListener('change', doModrinthSearch);
$('#modrinth-category').addEventListener('change', doModrinthSearch);

async function installMod(projectId, card) {
  const btn = card.querySelector('button');
  btn.disabled = true; btn.textContent = 'Finding version…';
  try {
    const { matched } = await api(`/api/modrinth/versions/${encodeURIComponent(projectId)}`);
    const version = (matched && matched[0]) || null;
    // The server only lists compatible versions; if there are none, it's not
    // installable on this server — block it rather than forcing an incompatible jar.
    if (!version) {
      toast('No compatible version for this server.', true);
      btn.disabled = false; btn.textContent = 'Install';
      return;
    }
    btn.textContent = 'Downloading…';
    const r = await api('/api/modrinth/install', { method: 'POST', body: { versionId: version.id } });
    toast(`Installed: ${r.name}. Restart to apply.`);
    btn.textContent = '✓ Installed';
    loadPlugins();
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false; btn.textContent = 'Install';
  }
}

// ----- map -----
function openMap() {
  const wrap = $('#map-wrap');
  if (!mapUrl) { wrap.innerHTML = '<div class="map-placeholder">Configure the map (BlueMap/Dynmap) first.</div>'; return; }
  if (wrap.dataset.loaded === mapUrl) return;
  wrap.dataset.loaded = mapUrl;
  wrap.innerHTML = `<iframe src="${mapUrl}" referrerpolicy="no-referrer"></iframe>`;
}
$('#map-open').addEventListener('click', () => { if (mapUrl) window.open(mapUrl, '_blank'); });

// ----- users -----
async function loadUsers() {
  try {
    const { users } = await api('/api/users');
    const el = $('#users-list');
    if (!users.length) { el.innerHTML = '<span class="empty">No users.</span>'; return; }
    el.innerHTML = '';
    for (const u of users) {
      const isSelf = currentUser && u.id === currentUser.id;
      const row = document.createElement('div');
      row.className = 'file-row';
      row.innerHTML = `<span class="file-name">${escapeHtml(u.username)}${isSelf ? ' <span class="badge-active">you</span>' : ''}</span>
        <span class="file-meta">${escapeHtml(u.name || '—')}</span>
        <button class="btn btn-sm btn-glass" data-act="edit">Edit</button>
        <button class="btn btn-sm btn-stop" data-act="delete" ${isSelf ? 'disabled' : ''}>Delete</button>`;
      row.querySelector('[data-act="edit"]').addEventListener('click', () => openUserModal(u));
      const del = row.querySelector('[data-act="delete"]');
      if (!isSelf) del.addEventListener('click', () => {
        if (!confirm(`Delete user ${u.username}?`)) return;
        api(`/api/users/${u.id}`, { method: 'DELETE' })
          .then(() => { toast('User deleted'); loadUsers(); })
          .catch(e => toast(e.message, true));
      });
      el.appendChild(row);
    }
  } catch (e) { toast(e.message, true); }
}

let editingUserId = null;
function openUserModal(user) {
  editingUserId = user ? user.id : null;
  $('#user-modal-title').textContent = user ? 'Edit user' : 'Add user';
  $('#uf-name').value = user ? (user.name || '') : '';
  $('#uf-username').value = user ? user.username : '';
  $('#uf-pass').value = '';
  $('#uf-pass-label').textContent = user ? 'New password (leave blank to keep)' : 'Password';
  $('#uf-error').textContent = '';
  $('#user-modal').classList.remove('hidden');
}
function closeUserModal() { $('#user-modal').classList.add('hidden'); }
$('#user-add').addEventListener('click', () => openUserModal(null));
$('#user-modal-close').addEventListener('click', closeUserModal);
$('#uf-cancel').addEventListener('click', closeUserModal);

$('#uf-save').addEventListener('click', async () => {
  const body = {
    name: $('#uf-name').value.trim(),
    username: $('#uf-username').value.trim(),
  };
  const pass = $('#uf-pass').value;
  if (pass || !editingUserId) body.password = pass;
  try {
    if (editingUserId) await api(`/api/users/${editingUserId}`, { method: 'PUT', body });
    else await api('/api/users', { method: 'POST', body });
    closeUserModal();
    toast(editingUserId ? 'User updated' : 'User added');
    loadUsers();
  } catch (e) { $('#uf-error').textContent = e.message; }
});

// ----- file manager -----
let fmPath = '';
async function loadFiles(rel) {
  fmPath = rel || '';
  try {
    const data = await api(`/api/files?path=${encodeURIComponent(fmPath)}`);
    fmPath = data.path || '';
    $('#fm-path').textContent = '/' + fmPath;
    $('#fm-up').disabled = !fmPath;
    const el = $('#fm-list');
    if (!data.entries.length) { el.innerHTML = '<span class="empty">Empty folder.</span>'; return; }
    el.innerHTML = '';
    for (const e of data.entries) {
      const row = document.createElement('div');
      row.className = 'fm-row' + (e.dir ? ' is-dir' : '');
      const ico = e.dir
        ? '<svg class="fm-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>'
        : '<svg class="fm-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/></svg>';
      const meta = e.dir ? '' : `${fmBytes(e.size)} · ${new Date(e.mtime).toLocaleDateString()}`;
      row.innerHTML = `${ico}
        <span class="fm-name">${escapeHtml(e.name)}</span>
        <span class="fm-meta">${meta}</span>
        <div class="fm-actions">
          ${e.editable ? '<button class="icon-btn" data-act="edit" title="Edit">✎</button>' : ''}
          ${e.dir ? '' : `<a class="icon-btn" title="Download" href="/api/files/download?path=${encodeURIComponent(joinRel(fmPath, e.name))}&token=${encodeURIComponent(token)}">⬇</a>`}
          <button class="icon-btn" data-act="rename" title="Rename">✏</button>
          <button class="icon-btn danger" data-act="delete" title="Delete">🗑</button>
        </div>`;
      const nameEl = row.querySelector('.fm-name');
      if (e.dir) nameEl.addEventListener('click', () => loadFiles(joinRel(fmPath, e.name)));
      else if (e.editable) nameEl.addEventListener('click', () => openFileEditor(joinRel(fmPath, e.name), e.name));
      row.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => fileAction(b.dataset.act, e)));
      el.appendChild(row);
    }
  } catch (err) { toast(err.message, true); }
}
function joinRel(base, name) { return base ? base + '/' + name : name; }
function fmBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function fileAction(act, e) {
  const rel = joinRel(fmPath, e.name);
  if (act === 'edit') return openFileEditor(rel, e.name);
  if (act === 'rename') {
    const nn = prompt('Rename to:', e.name);
    if (!nn || nn === e.name) return;
    api('/api/files/rename', { method: 'POST', body: { path: rel, name: nn } })
      .then(() => loadFiles(fmPath)).catch(err => toast(err.message, true));
  }
  if (act === 'delete') {
    if (!confirm(`Delete ${e.name}${e.dir ? ' and everything inside it' : ''}?`)) return;
    api(`/api/files?path=${encodeURIComponent(rel)}`, { method: 'DELETE' })
      .then(() => { toast('Deleted'); loadFiles(fmPath); }).catch(err => toast(err.message, true));
  }
}
$('#fm-up').addEventListener('click', () => {
  const i = fmPath.lastIndexOf('/');
  loadFiles(i === -1 ? '' : fmPath.slice(0, i));
});
$('#files-refresh').addEventListener('click', () => loadFiles(fmPath));
$('#file-mkdir').addEventListener('click', () => {
  const name = prompt('New folder name:');
  if (!name) return;
  api('/api/files/mkdir', { method: 'POST', body: { path: fmPath, name } })
    .then(() => loadFiles(fmPath)).catch(err => toast(err.message, true));
});
$('#file-upload').addEventListener('change', async (e) => {
  if (!e.target.files.length) return;
  const fd = new FormData();
  for (const f of e.target.files) fd.append('files', f);
  try {
    await api(`/api/files/upload?path=${encodeURIComponent(fmPath)}`, { method: 'POST', body: fd });
    toast('Uploaded');
    loadFiles(fmPath);
  } catch (err) { toast(err.message, true); }
  e.target.value = '';
});

let editingFilePath = null;
async function openFileEditor(rel, name) {
  try {
    const { content } = await api(`/api/files/read?path=${encodeURIComponent(rel)}`);
    editingFilePath = rel;
    $('#fileedit-title').textContent = name;
    $('#fileedit-area').value = content;
    $('#fileedit-modal').classList.remove('hidden');
  } catch (err) { toast(err.message, true); }
}
$('#fileedit-close').addEventListener('click', () => $('#fileedit-modal').classList.add('hidden'));
$('#fileedit-cancel').addEventListener('click', () => $('#fileedit-modal').classList.add('hidden'));
$('#fileedit-save').addEventListener('click', async () => {
  try {
    await api('/api/files/write', { method: 'PUT', body: { path: editingFilePath, content: $('#fileedit-area').value } });
    $('#fileedit-modal').classList.add('hidden');
    toast('Saved');
  } catch (err) { toast(err.message, true); }
});

// ----- create server -----
$('#server-create').addEventListener('click', openCreateModal);
$('#create-modal-close').addEventListener('click', () => $('#create-modal').classList.add('hidden'));
$('#cf-cancel').addEventListener('click', () => $('#create-modal').classList.add('hidden'));
$('#cf-browse').addEventListener('click', () => { fsTarget = 'create'; openFs($('#cf-parent').value.trim() || ''); });
$('#cf-type').addEventListener('change', loadCreateVersions);

function openCreateModal() {
  $('#cf-name').value = '';
  $('#cf-parent').value = '';
  $('#cf-args').value = '-Xmx4G -Xms4G';
  $('#cf-eula').checked = false;
  $('#cf-error').textContent = '';
  $('#create-modal').classList.remove('hidden');
  loadCreateVersions();
}
async function loadCreateVersions() {
  const sel = $('#cf-version');
  sel.innerHTML = '<option value="">loading…</option>';
  try {
    const { versions } = await api(`/api/create/versions?type=${encodeURIComponent($('#cf-type').value)}`);
    sel.innerHTML = '';
    for (const v of versions.slice(0, 60)) {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    }
    if (!versions.length) sel.innerHTML = '<option value="">none found</option>';
  } catch (err) {
    sel.innerHTML = '<option value="">failed to load</option>';
    toast(err.message, true);
  }
}
$('#cf-save').addEventListener('click', async () => {
  const btn = $('#cf-save');
  const body = {
    name: $('#cf-name').value.trim(),
    type: $('#cf-type').value,
    mcVersion: $('#cf-version').value,
    parentDir: $('#cf-parent').value.trim(),
    javaArgs: $('#cf-args').value.trim(),
    eula: $('#cf-eula').checked,
  };
  $('#cf-error').textContent = '';
  btn.disabled = true; btn.textContent = 'Downloading…';
  try {
    await api('/api/create', { method: 'POST', body });
    $('#create-modal').classList.add('hidden');
    toast('Server created');
    loadServers();
  } catch (err) { $('#cf-error').textContent = err.message; }
  finally { btn.disabled = false; btn.textContent = 'Download & create'; }
});

// ----- scheduled tasks -----
async function loadTasks() {
  try {
    const { tasks } = await api('/api/tasks');
    const el = $('#tasks-list');
    if (!tasks.length) { el.innerHTML = '<span class="empty">No scheduled tasks yet.</span>'; return; }
    el.innerHTML = '';
    for (const t of tasks) {
      const row = document.createElement('div');
      row.className = 'file-row';
      const desc = t.type === 'command' ? `command: ${t.command}` : t.type;
      row.innerHTML = `<span class="file-name">${escapeHtml(t.name)}${t.enabled ? '' : ' <span class="badge-active">paused</span>'}</span>
        <span class="file-meta">${escapeHtml(t.serverName)} · ${escapeHtml(desc)} · <code>${escapeHtml(t.cron)}</code></span>
        <button class="btn btn-sm btn-glass" data-act="run">Run now</button>
        <button class="btn btn-sm btn-glass" data-act="edit">Edit</button>
        <button class="btn btn-sm btn-stop" data-act="delete">Delete</button>`;
      row.querySelector('[data-act="run"]').addEventListener('click', () =>
        api(`/api/tasks/${t.id}/run`, { method: 'POST' }).then(() => toast('Task ran')).catch(e => toast(e.message, true)));
      row.querySelector('[data-act="edit"]').addEventListener('click', () => openTaskModal(t));
      row.querySelector('[data-act="delete"]').addEventListener('click', () => {
        if (!confirm(`Delete task "${t.name}"?`)) return;
        api(`/api/tasks/${t.id}`, { method: 'DELETE' }).then(() => { toast('Task deleted'); loadTasks(); }).catch(e => toast(e.message, true));
      });
      el.appendChild(row);
    }
  } catch (e) { toast(e.message, true); }
}

let editingTaskId = null;
function openTaskModal(task) {
  editingTaskId = task ? task.id : null;
  $('#task-modal-title').textContent = task ? 'Edit task' : 'New task';
  // populate server select from cache
  const ssel = $('#tf-server');
  ssel.innerHTML = '';
  for (const s of serversCache) {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.name;
    ssel.appendChild(o);
  }
  $('#tf-name').value = task ? task.name : '';
  $('#tf-server').value = task ? task.serverId : (activeServerId || '');
  $('#tf-type').value = task ? task.type : 'restart';
  $('#tf-command').value = task ? (task.command || '') : '';
  $('#tf-cron').value = task ? task.cron : '0 4 * * *';
  $('#tf-enabled').checked = task ? task.enabled !== false : true;
  $('#tf-error').textContent = '';
  toggleTaskCommand();
  $('#task-modal').classList.remove('hidden');
}
function toggleTaskCommand() {
  $('#tf-command-field').style.display = $('#tf-type').value === 'command' ? '' : 'none';
}
$('#tf-type').addEventListener('change', toggleTaskCommand);
$('#task-add').addEventListener('click', () => {
  if (!serversCache.length) return toast('Register a server first', true);
  openTaskModal(null);
});
$('#task-modal-close').addEventListener('click', () => $('#task-modal').classList.add('hidden'));
$('#tf-cancel').addEventListener('click', () => $('#task-modal').classList.add('hidden'));
$$('.cron-presets [data-cron]').forEach((b) => b.addEventListener('click', () => { $('#tf-cron').value = b.dataset.cron; }));
$('#tf-save').addEventListener('click', async () => {
  const body = {
    name: $('#tf-name').value.trim(),
    serverId: $('#tf-server').value,
    type: $('#tf-type').value,
    command: $('#tf-command').value.trim(),
    cron: $('#tf-cron').value.trim(),
    enabled: $('#tf-enabled').checked,
  };
  try {
    if (editingTaskId) await api(`/api/tasks/${editingTaskId}`, { method: 'PUT', body });
    else await api('/api/tasks', { method: 'POST', body });
    $('#task-modal').classList.add('hidden');
    toast(editingTaskId ? 'Task updated' : 'Task created');
    loadTasks();
  } catch (e) { $('#tf-error').textContent = e.message; }
});

// ----- metrics (Crafty-style history charts) -----
let metricsRange = '6h';
let lastMetricsPoints = [];

function fmtMB(mb) {
  if (mb == null) return '—';
  if (mb < 1024) return Math.round(mb) + ' MB';
  return (mb / 1024).toFixed(1) + ' GB';
}
function niceMax(v) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}
function fmtChartTime(t) {
  const d = new Date(t);
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (metricsRange === 'day' || metricsRange === 'week') {
    return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' }) + ' ' + hm;
  }
  return hm;
}

function drawChart(canvasId, points, key, opts) {
  const c = document.getElementById(canvasId);
  if (!c) return;
  const rect = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  c.width = rect.width * dpr; c.height = rect.height * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  ctx.clearRect(0, 0, W, H);
  const text3 = '#7d8593', grid = 'rgba(255,255,255,0.06)';
  if (!points.length) {
    ctx.fillStyle = text3; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('No data yet — samples are collected every minute.', W / 2, H / 2);
    return;
  }
  const padL = 46, padR = 12, padT = 10, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = points.map((p) => p[key]);
  const maxV = niceMax(Math.max(...vals, opts.minMax || 1));
  const t0 = points[0].t, t1 = points[points.length - 1].t || (t0 + 1);
  const x = (t) => padL + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const y = (v) => padT + plotH - (v / maxV) * plotH;

  ctx.strokeStyle = grid; ctx.fillStyle = text3; ctx.font = '10px system-ui'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = maxV * i / 4, yy = y(v);
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(opts.fmt(v), padL - 6, yy + 3);
  }

  ctx.beginPath();
  points.forEach((p, i) => { const xx = x(p.t), yy = y(p[key]); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); });
  ctx.strokeStyle = opts.color; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.lineTo(x(t1), y(0)); ctx.lineTo(x(t0), y(0)); ctx.closePath();
  ctx.fillStyle = opts.fill; ctx.fill();

  ctx.fillStyle = text3; ctx.font = '10px system-ui';
  ctx.textAlign = 'left'; ctx.fillText(fmtChartTime(t0), padL, H - 7);
  ctx.textAlign = 'right'; ctx.fillText(fmtChartTime(t1), W - padR, H - 7);
}

function drawMetrics(points) {
  lastMetricsPoints = points;
  const last = points[points.length - 1];
  $('#m-cpu-last').textContent = last ? last.cpu + '%' : '—';
  $('#m-mem-last').textContent = last ? fmtMB(last.mem) : '—';
  $('#m-players-last').textContent = last ? String(last.players) : '—';
  $('#m-world-last').textContent = last ? fmtMB(last.world) : '—';
  drawChart('chart-cpu', points, 'cpu', { color: '#4f8cff', fill: 'rgba(79,140,255,0.13)', fmt: (v) => Math.round(v) + '%', minMax: 100 });
  drawChart('chart-mem', points, 'mem', { color: '#36c275', fill: 'rgba(54,194,117,0.13)', fmt: fmtMB });
  drawChart('chart-players', points, 'players', { color: '#f0a23b', fill: 'rgba(240,162,59,0.13)', fmt: (v) => Math.round(v), minMax: 4 });
  drawChart('chart-world', points, 'world', { color: '#6f9fff', fill: 'rgba(111,159,255,0.13)', fmt: fmtMB });
}

async function loadMetricsView() {
  try {
    const q = activeServerId ? `&serverId=${encodeURIComponent(activeServerId)}` : '';
    const d = await api(`/api/metrics?range=${encodeURIComponent(metricsRange)}${q}`);
    drawMetrics(d.points || []);
  } catch (e) { toast(e.message, true); }
}

// Auto-refresh the charts every minute while the Metrics view is open.
setInterval(() => {
  if ($('.view[data-view="metrics"]').classList.contains('active')) loadMetricsView();
}, 60000);

$('#metrics-range').addEventListener('click', (e) => {
  const b = e.target.closest('.seg-btn');
  if (!b) return;
  metricsRange = b.dataset.range;
  $$('#metrics-range .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
  loadMetricsView();
});

window.addEventListener('resize', () => {
  if ($('.view[data-view="metrics"]').classList.contains('active')) drawMetrics(lastMetricsPoints);
});

// ----- player management: whitelist / operators / banned -----
async function loadPlayerLists() {
  try {
    const d = await api('/api/playerlists');
    const wlToggle = $('#wl-toggle');
    if (wlToggle) wlToggle.checked = !!d.whitelistEnabled;
    renderPlList('wl-list', d.whitelist, 'whitelist');
    renderPlList('op-list', d.ops, 'op');
    renderPlList('ban-list', d.banned, 'ban');
  } catch (e) { toast(e.message, true); }
}

function renderPlList(elId, items, kind) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!items || !items.length) { el.innerHTML = '<div class="pl-empty">Empty.</div>'; return; }
  el.innerHTML = '';
  for (const it of items) {
    const name = typeof it === 'string' ? it : it.name;
    const reason = (it && typeof it === 'object' && it.reason) ? it.reason : '';
    const row = document.createElement('div');
    row.className = 'pl-item';
    row.innerHTML = `<img src="https://minotar.net/helm/${encodeURIComponent(name)}/22.png" alt="" onerror="this.style.visibility='hidden'" />
      <span class="pl-name">${escapeHtml(name)}${reason ? `<span class="pl-reason">${escapeHtml(reason)}</span>` : ''}</span>
      <button class="pl-rm" title="${kind === 'ban' ? 'Pardon' : 'Remove'}">×</button>`;
    row.querySelector('.pl-rm').addEventListener('click', () => plAction(kind, 'remove', name));
    el.appendChild(row);
  }
}

function plAction(kind, op, name) {
  return api(`/api/playerlists/${kind}/${op}`, { method: 'POST', body: { name } })
    .then((r) => {
      if (r && r.error) { toast(r.error, true); return; }
      toast(r && r.note ? r.note : `${kind} ${op}: ${name}`);
      loadPlayerLists();
      setTimeout(loadPlayerLists, 1200); // catch file changes after an in-game command
    })
    .catch((e) => toast(e.message, true));
}

$$('.pl-add').forEach((f) => f.addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = f.querySelector('.pl-input');
  const name = inp.value.trim();
  if (!name) return toast('Enter a name', true);
  plAction(f.dataset.kind, 'add', name).then(() => { inp.value = ''; });
}));

const wlToggleEl = $('#wl-toggle');
if (wlToggleEl) wlToggleEl.addEventListener('change', (e) => {
  api('/api/whitelist/toggle', { method: 'POST', body: { enabled: e.target.checked } })
    .then((r) => toast(r && r.note ? r.note : 'Whitelist ' + (e.target.checked ? 'enabled' : 'disabled')))
    .catch((err) => { toast(err.message, true); loadPlayerLists(); });
});

// ----- startup -----
if (token) {
  // quick token validation
  api('/api/status').then(boot).catch(() => logout());
}
