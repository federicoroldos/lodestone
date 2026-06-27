# CLAUDE.md

Guidance for Claude Code (and any AI assistant) working in this repository.

## What this is

**Lodestone** is a self-hosted web panel for managing Minecraft servers (Spigot / Paper /
Purpur / Vanilla / Fabric / Forge) on **Windows**. It is a single Node.js process that
serves a REST API + WebSocket and a static single-page frontend. There is **no build step**
and **no framework** on the frontend — plain HTML/CSS/JS.

- Backend: **`server.js`** (~2090 lines, one file, CommonJS).
- Frontend: **`public/index.html`**, **`public/app.js`**, **`public/style.css`**.
- Settings + state: **`config.json`** (git-ignored), **`metrics.json`** (git-ignored).
- Launcher: **`start-panel.bat`** (installs deps on first run, then `node server.js`).

Default URL: `http://localhost:2121`. Node **18+** required (uses the global `fetch`).

## Hard rules (read before doing anything)

1. **English only.** All UI text, code comments, logs, and docs are in English. The app was
   migrated from Spanish — do **not** reintroduce Spanish anywhere.
2. **Git attribution: never co-author as Claude.** Commit and push **only** under the user's
   identity (`Federico Roldos <fede212yt@gmail.com>`). Do **not** add `Co-Authored-By: Claude`
   trailers or any AI attribution to commits or PRs in this repo. (This overrides the global
   default.)
3. **Zero-config principle.** The core app must work with **zero** user setup beyond a
   password/secret. Never make a core feature require an API key or external account.
   Anything that needs user-supplied credentials must be an **optional, opt-in addon**
   (see "Future work" below).
4. **Don't commit or push unless asked.** `config.json` and `metrics.json` are git-ignored
   because they hold secrets (JWT secret, scrypt password hashes) and machine paths — keep
   it that way; never commit real secrets.

## Run / develop

```bat
npm install      :: first time only
npm start        :: node server.js  (no watch; restart manually after backend edits)
```

There are **no tests, no linter, and no build**. "Verify" means: start the panel, open
`http://localhost:2121`, log in, and exercise the affected tab. Frontend edits are picked up
on a browser refresh; backend edits need a panel restart.

## Architecture

### Multi-server model
- `config.servers[]` holds registered servers: `{ id, name, dir, jar, javaArgs, mcVersion,
  stopTimeoutSeconds, worlds, watchdog }`.
- One **`ServerManager`** instance per server, kept in the `managers` Map. Each wraps a
  `child_process.spawn('java', ...)` (no shell, so spaces and non-ASCII paths work) and tracks
  status, console history, players, TPS, and the watchdog.
- `config.activeServerId` is the default target for most views. Endpoints also accept
  `?serverId=` (query) or `serverId` (body) to override — see `targetManager(req)`.
- Status flows: `offline → starting → online → stopping → offline`. "online" is detected by
  the `Done (Xs)!` line; players/TPS are parsed out of console lines and refreshed by polling
  `list` / `tps` on an interval.

### Auth
- Users live in `config.users[]` as `{ id, username, name, passwordHash }` (an optional
  `email` field is reserved for a future opt-in feature and is not used for login). Passwords
  are hashed with **scrypt** (`salt:hash`), compared with `timingSafeEqual`.
- Login (`POST /api/login`) returns a **JWT** signed with `config.jwtSecret`. All `/api/*`
  routes except `/api/login` require `Authorization: Bearer <token>` (or `?token=` for
  downloads / the WebSocket). `userFromToken` re-resolves the live user, so deleting a user
  immediately invalidates their sessions.
- Any logged-in user can manage users and servers (no role system).

### WebSocket (`/ws`)
- Token-checked on upgrade. On connect the client gets a `meta` frame, a `status` frame per
  server, and the active server's console `history`. Live frames: `line`, `status`, `stats`.
- `globalBroadcast` fans out to all clients. Resource `stats` for the active server are pushed
  every 2 s; per-minute `metrics` samples are persisted to `metrics.json` (7-day retention).

### Config persistence
- `loadConfig()` reads `config.json`; `saveConfig(next)` writes the whole object back
  (pretty-printed). **Any mutation of `config` must be followed by `saveConfig(config)`** to
  persist. `migrateConfig()` upgrades legacy single-server / single-password configs on boot.

## API surface (all under `/api`, JWT-protected except `/login`)

| Area | Routes |
| --- | --- |
| Auth / users | `POST /login`, `GET /me`, `GET/POST /users`, `PUT/DELETE /users/:id` |
| Config | `GET /config` (secrets stripped) |
| Filesystem browser | `GET /fs?path=` (drive + dir listing, for registering servers) |
| Servers registry | `GET/POST /servers`, `PUT/DELETE /servers/:id`, `POST /active`, `POST /servers/:id/{start,stop,restart}` |
| Active-server control | `GET /status`, `POST /server/{start,stop,restart}`, `POST /command` |
| Players | `GET /players`, `POST /players/:action`, `GET /playerlists`, `POST /whitelist/toggle`, `POST /playerlists/:kind/:op` |
| Metrics | `GET /metrics?serverId=&range=` |
| Plugins | `GET /plugins`, `POST /plugins/upload`, `DELETE /plugins/:name` |
| Configs editor | `GET /configs`, `GET/PUT /configs/:name` |
| File manager | `GET /files`, `GET /files/read`, `PUT /files/write`, `POST /files/{mkdir,rename,upload}`, `DELETE /files`, `GET /files/download` |
| Backups | `GET/POST /backups`, `DELETE /backups/:name`, `GET /backups/:name/download` |
| Modrinth | `GET /modrinth/search`, `GET /modrinth/versions/:projectId`, `POST /modrinth/install` |
| Server creator | `GET /create/versions?type=`, `POST /create` |
| Schedules | `GET/POST /tasks`, `PUT/DELETE /tasks/:id`, `POST /tasks/:id/run` |
| System | `GET /system` |

## Frontend (`public/`)

- **`index.html`** is the entire SPA. The sidebar `nav-item` buttons carry `data-view="..."`;
  matching `<section class="view" data-view="...">` blocks are shown/hidden. Views:
  `dashboard, servers, metrics, console, players, map, plugins, modrinth, files, configs,
  backups, tasks (Schedules), users`.
- **`app.js`** holds all logic: token in `localStorage`, `fetch` wrapper that attaches the
  bearer token, the WebSocket client, and per-view render functions. No bundler — keep it
  vanilla, no imports.
- **`style.css`** is a hand-written dark theme using CSS custom properties (see `:root`).
  Match the existing card / button / pill classes (`.card`, `.btn`, `.btn-pri`, `.pill`, …)
  rather than inventing new styling.

## Important guardrails (don't loosen without understanding them)

- **Path traversal:** the file manager and configs editor resolve user paths through
  `safeResolve(root, rel)` / `resolveEditable(...)`, which refuse anything escaping the server
  folder. Keep every new filesystem route behind one of these.
- **Upload filters:** plugin upload only accepts `.jar`; the config editor only allows
  `server.properties` and `.yml`/`.yaml`. The general file manager allows text files up to
  2 MB for editing (see `TEXT_EXTS`, `MAX_EDIT_BYTES`).
- **Modrinth install** verifies the downloaded version's loader and MC version against the
  server's detected compat (`detectCompat`) before writing it — don't bypass that check.
- **Stopping the panel never stops the Minecraft servers** (intentional, so a panel restart
  doesn't drop players). `shutdown()` leaves running children alive.
- **Backups** run `save-off` + `save-all flush` before zipping an online server and `save-on`
  after; `backupInProgress` guards against overlap.

## Conventions

- Two-space indent, single quotes, semicolons, `'use strict'`, CommonJS `require`.
- Endpoints return `{ ok: true, ... }` on success or `{ error: 'message' }` with a 4xx/5xx
  status. User-facing error strings are short and plain-English.
- Use `log(...)` (timestamped) for panel logs; per-server console lines go through
  `m.pushLine(text, level)` where level ∈ `info | warn | error | cmd`.
- IDs are `crypto.randomUUID()`; user-facing folder names go through `slugify()`.

## Future work (deferred — do NOT build unless asked)

- **CurseForge addon:** an optional, opt-in second plugin/mod source alongside Modrinth.
  It requires the *user's own* CurseForge API key, so per the zero-config principle it must be
  an opt-in addon, never wired into the core flow.

## User memory

Persistent notes live in
`C:\Users\fedew\.claude\projects\C--Users-fedew-Desktop-Minecraft-Server-Dashboard\memory\`
(`MEMORY.md` is the index). Check it for standing decisions; the rules in this file
(English-only, git attribution, zero-config) mirror what's recorded there.
