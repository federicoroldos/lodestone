# Lodestone

A lightweight web panel to manage a Minecraft (Spigot/Paper) server on Windows, Linux, or macOS.

One small Node.js process gives you a browser dashboard with:

- **Register multiple servers from the UI** (with a built-in folder browser) and switch the *active* one
- **Start / Stop / Restart** each server (graceful stop, with a kill-timeout fallback)
- **Live console** over WebSocket, plus a command input
- **Players** list with op / kick / ban / whitelist actions
- **Plugins** manager: upload, delete, and one-click install from **Modrinth**
- **Config editor** for `server.properties` and any `.yml` / `.yaml` (a timestamped `.bak` is saved before every overwrite)
- **Backups**: zip your worlds on demand or on a schedule, with retention
- **Live resources**: server + system RAM/CPU sparklines, and TPS (if EssentialsX/Paper is present)
- **Watchdog** (auto-restart on crash, with a crash-loop guard) and **scheduled restarts**
- **Discord** webhook notifications (crash, server full, optional join/leave)
- **World map** tab that embeds BlueMap/Dynmap (see the BlueMap guide below)

---

## 1. Requirements

- **Node.js 18 or newer** — <https://nodejs.org/> (the LTS installer is fine). Verify with `node -v`.
- **Java** — you do **not** need to install it yourself. The panel downloads and manages the
  correct Temurin (Adoptium) JRE per Minecraft version automatically, the first time a server
  that needs it is started (stored under `runtimes/`). If a matching Java is already on your
  `PATH`, the panel uses that instead. Extraction uses the system `tar` (built into Linux,
  macOS, and Windows 10+).
- A Spigot/Paper server jar already set up in its own folder (with `eula.txt` accepted, etc.).

---

## 2. Quick start

1. Open `config.json` and set at least `password` (see section 3). You no longer need to set the
   server folder by hand — you register servers from the UI (see section 2.1).
2. Start the panel:
   - **Windows:** double-click **`start-panel.bat`**.
   - **Linux / macOS:** run **`./start-panel.sh`** in a terminal.
   - On the first run it automatically runs `npm install` to fetch dependencies, builds the
     frontend, and (on Linux/macOS) offers to install Node/npm if they are missing.
   - It then starts the panel and prints the URL.
3. Open **<http://localhost:2121>** in your browser and log in. The default account is
   **`admin`** / **`admin`** — change it from the Users tab right away.

### 2.1. Registering servers (Servers tab)

The **Servers** tab (first item in the sidebar) is where you manage your servers:

- **+ Register server** opens a form. Type a name, click **Browse…** to pick the server
  folder with the built-in folder browser, choose the server jar (auto-detected from the
  folder), and set the Java args (e.g. `-Xmx4G -Xms4G`). Save.
- Each registered server shows its status and has **Start / Stop / Restart** buttons, so you
  can run several servers at once (each must use a different port in its own `server.properties`).
- One server is the **active** one (highlighted). The Console, Players, Plugins, Configs and
  Backups tabs all act on the active server. Switch it with **Set active** or the dropdown in
  the top-right header.

> **Auto-migration:** if you already had the old single-server `config.json` (with `serverDir`/`jar`),
> the panel converts it into a registered server automatically on first start — nothing to do.

Prefer the command line? From this folder:

```bat
npm install      :: only needed the first time
npm start        :: same as "node server.js"
```

Leave the window open while you want the panel running. Press `Ctrl+C` to stop the **panel**.
Stopping the panel does **not** stop the Minecraft server — stop that from the panel's Stop button (this is intentional, so a panel restart doesn't drop your players).

---

## 3. Configuration (`config.json`)

Everything is hand-editable in `config.json`. Restart the panel after editing it.

| Key | Meaning |
| --- | --- |
| `appName` | Display name / Discord bot username. |
| `servers` | Array of registered servers (managed from the **Servers** tab — you rarely edit this by hand). Each entry: `id`, `name`, `dir`, `jar`, `javaArgs`, `mcVersion`, `stopTimeoutSeconds`, `worlds`, `watchdog`. |
| `activeServerId` | The `id` of the server the panel views act on by default (set via the UI). |
| `panelPort` | **Port** the panel listens on (default `2121`). |
| `panelHost` | `0.0.0.0` = reachable on your LAN/Tailscale; `127.0.0.1` = this PC only. |
| `password` | **Login password.** Change it before exposing the panel. |
| `jwtSecret` | A long random string used to sign sessions. **Change it** to anything long and random. |
| `sessionHours` | How long a login stays valid (default 168 = 7 days). |
| `playerListIntervalSeconds` | How often the panel polls `list`/`tps`. |

> Per-server settings (folder, jar, Java args, MC version, worlds, watchdog) live **inside each
> `servers[]` entry** and are best edited from the Servers tab's **Edit** button. The legacy
> top-level `serverDir`/`jar`/`javaArgs` keys are only read once, to migrate an old config.

### Change the password / port

Edit `password` (and ideally `jwtSecret`) and/or `panelPort` in `config.json`, then restart the panel.
Changing `jwtSecret` logs everyone out (existing sessions become invalid), which is exactly what you want after sharing a link.

### Watchdog (auto-restart on crash) — per server

Each `servers[]` entry has its own `watchdog`, edited from the Servers tab's **Edit** button:

```json
"watchdog": { "enabled": true, "maxRestarts": 3, "windowMinutes": 10 }
```

If that server exits **unexpectedly** (not via the Stop button), the panel relaunches it after 5s.
If it crashes `maxRestarts` times within `windowMinutes`, the panel stops relaunching to avoid a crash-loop and notifies Discord.

### Scheduled restart (active server)

```json
"scheduledRestart": { "enabled": true, "cron": "0 4 * * *", "warnMinutes": [5, 1] }
```

Cron is standard 5-field (`min hour day month weekday`). `0 4 * * *` = every day at 04:00.
Players get in-game `say` warnings at each `warnMinutes` mark before the restart.
The scheduled restart and scheduled backup act on the **active** server.

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

- `worlds` are the folders (relative to `serverDir`) zipped into each backup.
- If the server is online, the panel runs `save-off` + `save-all flush` during the copy, then `save-on`.
- Retention is **per server**: when a fresh backup pushes that server's
  set over either `maxCount` (newest-N) or `maxSizeMB` (total size on disk),
  the oldest is deleted. Set either value to `0` to disable that cap.
  Both caps are also configurable from the **Backups** tab.
  Backups can be created on demand from the **Backups** tab.

### Discord notifications (webhook)

```json
"discord": {
  "webhookUrl": "https://discord.com/api/webhooks/XXX/YYY",
  "notifyOnCrash": true,
  "notifyOnFull": true,
  "notifyOnJoinLeave": false
}
```

To get a webhook URL: in Discord, **Server Settings → Integrations → Webhooks → New Webhook**, pick a channel, **Copy Webhook URL**, and paste it as `webhookUrl`. Leave it empty (`""`) to disable Discord entirely.

### Map

```json
"map": { "url": "http://localhost:8100" }
```

The **Map** tab embeds this URL in an iframe. Leave it `""` until you've set up BlueMap (next section). If empty, the panel falls back to `http://<this-host>:8100`.

---

## 4. World map with BlueMap

> **Heads-up:** this installs a plugin **into your real server** and opens a local web port (default `8100`). It's a normal, well-known plugin, but it does touch your server folder — do it deliberately.

1. Download the **Spigot/Paper** build of BlueMap from <https://modrinth.com/plugin/bluemap> (you can also search "BlueMap" in the panel's **Modrinth** tab and install it there).
2. Put the jar in `serverDir\plugins\` (the Modrinth install does this for you) and **restart the server**.
3. On first start BlueMap asks you to accept its download of game textures. Open `serverDir\plugins\BlueMap\core.conf` and set `accept-download: true`, then restart the server again.
4. BlueMap renders the world and serves a live map at **<http://localhost:8100>**. The first full render of a large world can take a while.
5. Set `"map": { "url": "http://localhost:8100" }` in `config.json` and restart the panel. The **Map** tab will now show the map.

To reach the map from another device, use your LAN IP or Tailscale IP instead of `localhost` (e.g. `http://100.x.y.z:8100`).
(Dynmap works the same way — just point `map.url` at its port, usually `8123`.)

---

## 5. Remote access with Tailscale (recommended)

Tailscale gives every device a private, encrypted IP so you can reach the panel from anywhere **without port-forwarding** or exposing anything to the public internet.

1. Install Tailscale on the **server PC**: <https://tailscale.com/download/windows>. Sign in (Google/GitHub/email).
2. Install Tailscale on each device you'll use to manage the server (phone, laptop) and sign in with the **same account**.
3. On the server PC, find its Tailscale IP: run `tailscale ip -4` (or check the Tailscale tray icon). It looks like `100.x.y.z`.
4. Make sure `config.json` has `"panelHost": "0.0.0.0"` so the panel listens on all interfaces, then restart the panel.
5. From any of your devices, open **`http://100.x.y.z:2121`** and log in.

Tips:
- Keep `panelHost` at `0.0.0.0` for LAN + Tailscale, or set it to `127.0.0.1` if you want the panel reachable **only** through an SSH/Tailscale tunnel.
- Windows Firewall may prompt the first time the panel binds the port — allow it on private networks.
- For the BlueMap tab to work remotely, set `map.url` to the Tailscale IP (`http://100.x.y.z:8100`).

---

## 6. Security notes

- The panel is protected by a single password and a signed (JWT) session — **change `password` and `jwtSecret`** before sharing any link.
- Prefer Tailscale or your LAN over exposing the port to the public internet. There is no rate-limiting or 2FA.
- The config editor only allows `server.properties` and `.yml`/`.yaml` files inside the active server's folder; plugin upload only accepts `.jar`. These are deliberate guardrails — don't loosen them unless you understand the risk.
- The **folder browser** (used when registering a server) lets the logged-in user list directories anywhere on the machine. It's read-only (it never deletes or writes) and requires a valid session, but it's another reason to keep the panel behind a password and Tailscale/LAN rather than the public internet.

---

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Node.js was not found` | Install Node 18+ and re-run the launcher (`start-panel.bat` on Windows, `./start-panel.sh` on Linux/macOS). |
| Server won't start, "Jar not found" | Check the server's folder and jar in the Servers tab. On Windows paths in `config.json` use double backslashes. |
| Java runtime download fails | The panel fetches the Temurin JRE from `api.adoptium.net` and extracts it with `tar`; check internet access and that `tar` is available. You can also install a matching Java on your `PATH`. |
| TPS always shows `—` | TPS needs EssentialsX or Paper's `/tps`. Without them it stays blank — everything else still works. |
| Can't reach the panel from another device | Use the LAN/Tailscale IP (not `localhost`), confirm `panelHost` is `0.0.0.0`, and allow the port in your firewall. |
| Map tab is blank | BlueMap must be installed, rendered, and `map.url` set. Large worlds take time to render. |

---

## 8. Project layout

```
config.json        # all settings (hand-edited)
server.js          # Node backend: REST API + WebSocket + server process manager
start-panel.bat    # Windows launcher (installs deps on first run, then starts)
start-panel.sh     # Linux/macOS launcher (checks deps, installs them, then starts)
runtimes/          # managed Temurin JREs downloaded per Java major (git-ignored)
src/               # React + Vite frontend source
public/            # built frontend served by the backend (npm run build)
```
