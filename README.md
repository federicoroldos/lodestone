# Lodestone

A web panel for running Minecraft servers on Windows, Linux or macOS. It's one Node.js
process that serves a REST API, a WebSocket, and a single-page UI. You point it at a server
folder (or have it download a fresh server), and then start/stop it, watch the console,
manage players, install plugins and mods, edit files, and run backups from the browser.

Works with Spigot, Paper, Vanilla, Fabric, Forge and NeoForge. The frontend is a React +
Vite app that gets built into `public/`; the backend stays a single `server.js`.

## Requirements

- Node.js 18 or newer (the panel uses the global `fetch`).
- Java is optional to install yourself. The panel downloads and manages the right Temurin
  (Adoptium) JRE per Minecraft version the first time a server needs it, storing it under
  `runtimes/`. If a matching Java is already on your `PATH`, it uses that instead. Extraction
  uses the system `tar` (built into Linux, macOS, and Windows 10+).

Check Node with `node -v` before you start.

## Running it

- Windows: double-click `start-panel.bat`.
- Linux / macOS: run `./start-panel.sh` in a terminal.

The first run does `npm install`, builds the frontend, creates a `config.json` with a random
`jwtSecret`, and prints the URL. Open <http://localhost:2121> and log in.

The default account on a fresh install is `admin` / `Lodestone1` (also printed in the console
window while it's still the default). Change the password from the Users tab as soon as you're
in; the notice disappears once you do.

From a terminal it's the same thing:

```bat
npm install     :: first time only
npm run build   :: build the frontend into public/
npm start       :: node server.js
```

Leave the window open while the panel runs. `Ctrl+C` stops the panel, not your Minecraft
servers. Those keep running, so restarting the panel doesn't drop anyone who's online.

## What's in the panel

The sidebar is grouped by what you're doing.

**Overview**
- Dashboard: status, players, TPS and uptime, with live CPU/RAM/disk sparklines.
- Servers: register a folder you already have, or create a new server (it downloads the jar
  and the matching Java). Each one has Start/Stop/Restart and a Set active toggle.
- Metrics: history graphs for the last hour, 6 hours, day or week.

**Operate**
- Console: live output over WebSocket, colour-coded, with a command box.
- Players: who's online with op/kick/ban, plus the whitelist, ops and bans lists. You can
  edit those even while the server is offline.
- Map: embeds your BlueMap or Dynmap page.

**Content**
- Plugins: upload or delete jars.
- Mods (Modrinth + CurseForge): search and install plugins or mods from Modrinth, with a
  CurseForge browser alongside it. Modrinth installs check the result's loader and Minecraft
  version against your server before writing it.
- Files: a file manager for the active server's folder.
- Configs: a quick editor for `server.properties`, `.yml`/`.yaml`, and Paper's config files.
  It saves a timestamped `.bak` before overwriting.

**Maintenance**
- Backups: zip your worlds on demand or on a schedule, with retention and download.
- Schedules: per-server cron jobs that run a command, restart, or back up.

**Settings**
- Users: add, edit and remove who can log in, and set each account's role.

Most views act on the active server (the one highlighted on the Servers tab, and shown in the
dropdown on the floating control dock). Set active to switch which one they target.

### User roles

Each account has a role: `admin` or `operator`. Admins can do everything, including managing
other users and their roles. Operators get the least-privilege set: they run servers and use
the panel, but can't manage accounts or change roles. New accounts default to `operator`, and
the panel never lets you delete or demote the last remaining admin, so you can't lock yourself
out.

## Creating a server

On the Servers tab, Create new walks you through it:

1. Pick a type: Vanilla, Spigot, Paper, Fabric, Forge or NeoForge.
2. Pick a Minecraft version (fetched live from each project).
3. Pick a parent folder, name it, set Java args (e.g. `-Xmx4G -Xms4G`).
4. Accept the Minecraft EULA.

Lodestone downloads the right jar, fetches the matching Java if needed, writes `eula.txt`,
registers the server, and it's ready to start.

## config.json

You manage most of this from the UI, but it all lives in `config.json` and you can edit it by
hand. Restart the panel after editing it.

| Key | Meaning |
| --- | --- |
| `appName` | Display name, also used as the Discord webhook username. |
| `panelPort` | Port the panel listens on (default `2121`). |
| `panelHost` | `0.0.0.0` is reachable on your LAN and over Radmin VPN, `127.0.0.1` is this PC only. |
| `jwtSecret` | Random string that signs login sessions. Changing it logs everyone out. Generated for you on first run. |
| `sessionHours` | How long a login stays valid (default `168`, i.e. 7 days). |
| `consoleHistoryLines` | Console scrollback kept per server (default `500`). |
| `playerListIntervalSeconds` | How often the panel polls `list` and `tps`. |
| `servers[]` | Registered servers (managed from the Servers tab). Each entry: `id`, `name`, `dir`, `jar`, `javaArgs`, `mcVersion`, `stopTimeoutSeconds`, `worlds`, `watchdog`. |
| `activeServerId` | The server the views target by default. |
| `users[]` | Login accounts (managed from the Users tab). Each has `id`, `username`, `name`, `role`, and a scrypt-hashed password. |
| `backups`, `scheduledRestart`, `discord`, `map`, `tasks[]` | See below. |

### Watchdog (per server)

Each server has its own watchdog, edited from the Servers tab via Edit:

```json
"watchdog": { "enabled": true, "maxRestarts": 3, "windowMinutes": 10 }
```

If the server exits on its own (not via Stop), Lodestone relaunches it after 5 seconds. If it
does that `maxRestarts` times within `windowMinutes`, it gives up so it doesn't sit in a crash
loop, and pings Discord if that's configured.

### Scheduled restart (active server)

```json
"scheduledRestart": { "enabled": true, "cron": "0 4 * * *", "warnMinutes": [5, 1] }
```

Standard 5-field cron (`min hour day month weekday`); `0 4 * * *` is every day at 04:00.
Players get an in-game `say` warning at each `warnMinutes` mark. For per-server jobs, use the
Schedules tab instead.

### Backups

```json
"backups": {
  "dir": "C:\\Servers\\mc-backups",
  "maxCount": 10,
  "maxSizeMB": 0,
  "scheduledEnabled": true,
  "scheduledCron": "0 3 * * *",
  "worlds": ["world", "world_nether", "world_the_end"]
}
```

`worlds` are the folders (relative to the server dir) that go into each zip. If the server is
online, Lodestone runs `save-off` and `save-all flush` during the copy and `save-on` after.
Retention is per server: a fresh backup deletes the oldest once the set passes `maxCount`
(newest-N) or `maxSizeMB` (total size). Set either to `0` to disable that cap. Both are also
editable from the Backups tab.

### Discord

```json
"discord": {
  "webhookUrl": "https://discord.com/api/webhooks/XXX/YYY",
  "notifyOnCrash": true,
  "notifyOnFull": true,
  "notifyOnJoinLeave": false
}
```

Get the URL from Discord under Server Settings, Integrations, Webhooks, New Webhook, Copy
Webhook URL. Leave `webhookUrl` empty to turn Discord off.

### Map

```json
"map": { "url": "http://localhost:8100" }
```

The Map tab embeds this URL. Leave it empty until BlueMap is set up (see below); if empty, the
panel falls back to `http://<this-host>:8100`. The map URL can also be set per server from the
Servers tab.

## World map with BlueMap

This installs a plugin into your actual server and opens a local web port (8100 by default).
BlueMap is well known, but it does touch your server folder, so do it on purpose.

1. Install BlueMap from the Mods tab (or grab the Spigot/Paper build from
   <https://modrinth.com/plugin/bluemap>) and restart the server.
2. On first start it asks you to accept its texture download. Open
   `<serverDir>/plugins/BlueMap/core.conf`, set `accept-download: true`, and restart again.
3. It serves a live map at <http://localhost:8100>. The first render of a big world takes a
   while.
4. Set `"map": { "url": "http://localhost:8100" }` and restart the panel. The Map tab shows it.

To view it from another device, use your LAN or Radmin VPN IP instead of `localhost`. Dynmap
works the same way; point `map.url` at its port (usually 8123).

## Remote access

`panelHost` defaults to `0.0.0.0`, so the panel is reachable on every network the server PC is
on. How another device connects depends on where it is.

### Same network (same router)

1. On the server PC, find its LAN IPv4 (run `ipconfig` on Windows, `ip addr` on Linux/macOS),
   usually `192.168.x.y`.
2. From the other device on the same Wi-Fi/router, open `http://192.168.x.y:2121` and log in.

### Anywhere else, with Radmin VPN

Radmin VPN is a free VPN that gives every device a private `26.x.y.z` IP, so you can reach the
panel from another house without port-forwarding or exposing anything to the public internet.

1. Install Radmin VPN on the server PC (<https://www.radmin-vpn.com/>) and create a network
   (give it a name and password).
2. Install it on the other PC and join that same network with the name and password.
3. On the server PC, the Radmin VPN window shows its `26.x.y.z` address (or run `ipconfig`).
4. From the other PC, open `http://26.x.y.z:2121` and log in.

Both PCs need Radmin VPN running and connected to the same network for this to work. The `26.x`
IP is stable per device, so you can bookmark it.

### Firewall

Other devices can only reach the panel if its port is allowed through your firewall. On Windows
you may get a prompt the first time the panel binds the port; allow it on private networks. To
add the rule by hand from an admin PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Lodestone Panel" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 2121
```

On Linux, open the port with your firewall tool (e.g. `sudo ufw allow 2121/tcp`).

## Security notes

- Logins are username + password (scrypt-hashed) with a signed JWT session, and each account
  has an `admin` or `operator` role. `jwtSecret` is generated on first run. Change the default
  `admin` password before you share any link.
- Keep it on your LAN or Radmin VPN rather than exposing the port to the internet. There's no
  rate-limiting beyond the login throttle, and no 2FA.
- The Files manager and Configs editor are sandboxed to each server's folder with a
  path-traversal guard. Plugin upload only accepts `.jar`.
- The folder browser used when registering or creating a server can list directories anywhere
  on the machine. It's read-only and needs a valid session, which is another reason to keep the
  panel behind a password and a private network.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Node.js was not found` | Install Node 18+ and re-run the launcher (`start-panel.bat` on Windows, `./start-panel.sh` on Linux/macOS). |
| Server won't start, "Jar not found" | Check the folder and jar on the Servers tab (Edit). On Windows, paths in `config.json` use double backslashes. |
| Java runtime download fails | The panel fetches the Temurin JRE from `api.adoptium.net` and extracts it with `tar`; check internet access and that `tar` is available. You can also install a matching Java on your `PATH`. |
| TPS stays blank | TPS needs EssentialsX or Paper's `/tps`. The rest works without it. |
| Can't reach the panel from another device | Use the LAN or Radmin VPN IP (not `localhost`), confirm `panelHost` is `0.0.0.0`, and allow port 2121 in your firewall. |
| Map tab is blank | BlueMap has to be installed, rendered, and `map.url` set. Big worlds take time to render. |

## Project layout

```
config.json          all settings, registered servers and users (git-ignored, has secrets)
config.example.json  template copied on first run
metrics.json         rolling 7-day metrics history (git-ignored)
server.js            Node backend: REST API, WebSocket, per-server process manager
i18n.json            UI translations
start-panel.bat      Windows launcher (installs deps, builds, then starts)
start-panel.sh       Linux/macOS launcher (checks deps, installs, builds, then starts)
runtimes/            managed Temurin JREs downloaded per Java major (git-ignored)
src/                 React + Vite frontend source
public/              built frontend served by the backend (npm run build)
```
