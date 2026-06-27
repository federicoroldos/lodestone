<div align="center">

# ◆ Lodestone

### A beautiful, self-hosted web panel for your Minecraft servers on Windows

One small Node.js process turns any Spigot / Paper / Purpur / Fabric / Forge server
into a clean browser dashboard — start it, watch the console, manage players,
install plugins, edit files, schedule backups, and reach it from anywhere.

![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows&logoColor=white)
![No build step](https://img.shields.io/badge/Frontend-Zero%20build%20step-8B5CF6)
![License](https://img.shields.io/badge/Use-Personal%20%2F%20Self--hosted-22C55E)

</div>

---

## ✨ What you get

| | Feature | What it does |
|---|---|---|
| 🖥️ | **Multi-server** | Register existing servers *or* **create a brand-new one** from the panel — it downloads the jar for you. Run several at once and switch the *active* one. |
| ▶️ | **Lifecycle control** | Start / Stop / Restart with a graceful stop and a kill-timeout fallback. |
| 📟 | **Live console** | Real-time output over WebSocket, colour-coded by level, with a command input. |
| 📊 | **Dashboard & Metrics** | KPI tiles (status, players, TPS, uptime), live RAM/CPU/disk sparklines, and **7 days of history** (CPU, memory, players, world size). |
| 👥 | **Player management** | Online list with op / kick / ban, plus full **whitelist / ops / bans** that you can edit **even while the server is offline**. |
| 🧩 | **Plugins & mods** | Upload / delete jars, or **one-click install from Modrinth** — auto-detects your loader and Minecraft version. |
| 🗂️ | **File manager** | Browse, edit, upload, download, rename and delete files — safely sandboxed to each server's folder. |
| ⚙️ | **Config editor** | Quick edit of `server.properties` and any `.yml` / `.yaml` (a timestamped `.bak` is saved first). |
| 💾 | **Backups** | Zip your worlds on demand or on a schedule, with retention and one-click download. |
| ⏰ | **Schedules** | Per-server cron tasks (run a command, restart, or back up) plus scheduled restarts with in-game warnings. |
| 🛡️ | **Watchdog** | Auto-restart on crash, with a crash-loop guard so it never spins forever. |
| 🗺️ | **World map** | Embeds BlueMap / Dynmap right inside the panel. |
| 🔔 | **Discord** | Webhook alerts for crashes, a full server, and optional join / leave. |
| 🔐 | **Multi-user login** | Email + password accounts (hashed), signed sessions, and a Users tab to manage who has access. |
| 🌍 | **Reach it anywhere** | Works great over your LAN or **Tailscale** — no port-forwarding, nothing exposed to the public internet. |

---

## 🚀 Quick start

> **You need:** [**Node.js 18+**](https://nodejs.org/) and **Java** on your `PATH` (whatever version your server jar needs).
> Verify with `node -v` and `java -version`.

1. **Set a secret.** Open `config.json` and change `jwtSecret` to a long random string.
   *(Don't have a `config.json` yet? Copy `config.example.json` to `config.json`.)*
2. **Launch.** Double-click **`start-panel.bat`**.
   - First run installs dependencies automatically (`npm install`).
   - Then it starts the panel and prints the URL.
3. **Open** **<http://localhost:2121>** and log in.
   - Default account on a fresh install: **`fede212yt@gmail.com`** / the password is `changeme123` unless you migrated from an older `password` setting. **Change it in the Users tab right away.**

Prefer the terminal?

```bat
npm install   :: first time only
npm start     :: same as: node server.js
```

> 💡 Keep the window open while the panel runs. `Ctrl+C` stops the **panel only** —
> your Minecraft servers keep running, so restarting the panel never drops your players.

---

## 🧭 A tour of the panel

The sidebar is grouped so everything has an obvious home:

#### Overview
- **Dashboard** — status, players, TPS and uptime at a glance, with live resource sparklines.
- **Servers** — your home base. **✨ Create new** downloads a fresh Paper/Purpur/Vanilla/Fabric server, or **+ Register existing** points Lodestone at a folder you already have (with a built-in folder browser). Each server has Start / Stop / Restart and a **Set active** toggle.
- **Metrics** — historical graphs over the last hour / 6 h / day / week.

#### Operate
- **Console** — live output + command line.
- **Players** — who's online and the whitelist / ops / bans (editable offline too).
- **Map** — your BlueMap/Dynmap embedded.

#### Content
- **Plugins** — upload or delete jars.
- **Modrinth** — search and install plugins/mods that match your server.
- **Files** — a full file manager for the active server's folder.
- **Configs** — quick editor for `server.properties` and YAML files.

#### Maintenance
- **Backups** — create, download, delete; set a schedule and retention.
- **Schedules** — per-server cron jobs (command / restart / backup).

#### Settings
- **Users** — add, edit and remove the people who can log in.

> The **active** server (highlighted on the Servers tab, and shown in the top-left dropdown)
> is the one Console, Players, Plugins, Files, Configs and Backups act on.

---

## ✨ Creating a server (no manual download needed)

On the **Servers** tab click **✨ Create new**:

1. Pick a type — **Paper**, **Purpur**, **Vanilla** or **Fabric**.
2. Choose the Minecraft version (the list is fetched live from each project).
3. Pick a parent folder, give it a name, set Java args (e.g. `-Xmx4G -Xms4G`).
4. Accept the Minecraft EULA and create.

Lodestone downloads the correct jar, writes `eula.txt`, registers the server and you're ready to start it. 🎉

---

## ⚙️ Configuration (`config.json`)

Most things are managed from the UI, but everything lives in `config.json` and is hand-editable. **Restart the panel after editing it.**

| Key | Meaning |
| --- | --- |
| `appName` | Display name / Discord webhook username. |
| `panelPort` | Port the panel listens on (default **`2121`**). |
| `panelHost` | `0.0.0.0` = reachable on LAN/Tailscale · `127.0.0.1` = this PC only. |
| `jwtSecret` | **Long random string** that signs login sessions — change it. Changing it logs everyone out. |
| `sessionHours` | How long a login stays valid (default `168` = 7 days). |
| `consoleHistoryLines` | Console scrollback kept per server (default `500`). |
| `playerListIntervalSeconds` | How often the panel polls `list` / `tps`. |
| `servers[]` | Registered servers (managed from the Servers tab). |
| `activeServerId` | The server the views act on by default. |
| `users[]` | Login accounts (managed from the Users tab; passwords are hashed). |
| `backups` · `scheduledRestart` · `discord` · `map` · `tasks[]` | See below. |

<details>
<summary><strong>🛡️ Watchdog</strong> — auto-restart on crash (per server)</summary>

Each server has its own watchdog, edited from the Servers tab's **Edit** button:

```json
"watchdog": { "enabled": true, "maxRestarts": 3, "windowMinutes": 10 }
```

If the server exits **unexpectedly** (not via Stop), Lodestone relaunches it after 5 s.
If it crashes `maxRestarts` times within `windowMinutes`, it stops relaunching to avoid a crash-loop and pings Discord.
</details>

<details>
<summary><strong>⏰ Scheduled restart</strong> (active server)</summary>

```json
"scheduledRestart": { "enabled": true, "cron": "0 4 * * *", "warnMinutes": [5, 1] }
```

Standard 5-field cron (`min hour day month weekday`). `0 4 * * *` = every day at 04:00.
Players get in-game `say` warnings at each `warnMinutes` mark before the restart.
For finer control, use the **Schedules** tab to attach command/restart/backup jobs to *specific* servers.
</details>

<details>
<summary><strong>💾 Backups</strong></summary>

```json
"backups": {
  "dir": "C:\\Servers\\mc-backups",
  "retainCount": 10,
  "scheduledEnabled": true,
  "scheduledCron": "0 3 * * *",
  "worlds": ["world", "world_nether", "world_the_end"]
}
```

- `worlds` are the folders (relative to the server dir) zipped into each backup.
- If the server is online, Lodestone runs `save-off` + `save-all flush` during the copy, then `save-on`.
- `retainCount` keeps only the newest N zips **per server**. Make backups any time from the **Backups** tab.
</details>

<details>
<summary><strong>🔔 Discord notifications</strong></summary>

```json
"discord": {
  "webhookUrl": "https://discord.com/api/webhooks/XXX/YYY",
  "notifyOnCrash": true,
  "notifyOnFull": true,
  "notifyOnJoinLeave": false
}
```

Get a URL in Discord → **Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL**.
Leave `webhookUrl` empty (`""`) to disable Discord entirely.
</details>

<details>
<summary><strong>🗺️ Map</strong></summary>

```json
"map": { "url": "http://localhost:8100" }
```

The **Map** tab embeds this URL. Leave it `""` until you've set up BlueMap (next section);
if empty, the panel falls back to `http://<this-host>:8100`.
</details>

---

## 🗺️ World map with BlueMap

> **Heads-up:** this installs a plugin **into your real server** and opens a local web port (default `8100`). It's a well-known plugin, but it does touch your server folder — do it deliberately.

1. Install **BlueMap** from the panel's **Modrinth** tab (or download the Spigot/Paper build from <https://modrinth.com/plugin/bluemap>) and **restart the server**.
2. On first start BlueMap asks you to accept its texture download: open `<serverDir>\plugins\BlueMap\core.conf`, set `accept-download: true`, and restart again.
3. BlueMap serves a live map at **<http://localhost:8100>** (the first render of a big world takes a while).
4. Set `"map": { "url": "http://localhost:8100" }` and restart the panel — the **Map** tab now shows it.

To view remotely, use your LAN/Tailscale IP instead of `localhost` (e.g. `http://100.x.y.z:8100`).
Dynmap works the same way — point `map.url` at its port (usually `8123`).

---

## 🌍 Remote access with Tailscale (recommended)

Tailscale gives every device a private, encrypted IP, so you can reach the panel from anywhere **without port-forwarding** or exposing anything publicly.

1. Install Tailscale on the **server PC** (<https://tailscale.com/download/windows>) and sign in.
2. Install it on your phone/laptop and sign in with the **same account**.
3. On the server PC, run `tailscale ip -4` to get its `100.x.y.z` address.
4. Make sure `config.json` has `"panelHost": "0.0.0.0"`, then restart the panel.
5. From any device, open **`http://100.x.y.z:2121`** and log in.

> Windows Firewall may prompt the first time the panel binds the port — allow it on private networks.

---

## 🔒 Security notes

- Logins use email + password (hashed with scrypt) and a signed JWT session. **Change `jwtSecret`** and remove the default account's password before sharing any link.
- Prefer Tailscale or your LAN over exposing the port to the public internet. There's no rate-limiting or 2FA.
- The **Files** manager and **Configs** editor are sandboxed to each server's folder (with a path-traversal guard); plugin upload only accepts `.jar`.
- The **folder browser** (used when registering/creating a server) can list directories anywhere on the machine. It's read-only and needs a valid session — another reason to keep the panel behind a password and Tailscale/LAN.

---

## 🩺 Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Node.js was not found` | Install Node 18+ and reopen the `.bat`. |
| Server won't start, "Jar not found" | Check the server's folder and jar on the Servers tab (Edit). |
| Java error immediately on start | Run `java -version`; install/repair Java or adjust the Java args. |
| TPS always shows `—` | TPS needs EssentialsX or Paper's `/tps`. Everything else still works without it. |
| Can't reach the panel from another device | Use the LAN/Tailscale IP (not `localhost`), confirm `panelHost` is `0.0.0.0`, and allow the port in Windows Firewall. |
| Map tab is blank | BlueMap must be installed, rendered, and `map.url` set. Large worlds take time to render. |

---

## 🗂️ Project layout

```
config.json          # all settings + registered servers + users (git-ignored; has secrets)
config.example.json  # template to copy when starting fresh
metrics.json         # rolling 7-day metrics history (git-ignored)
server.js            # Node backend: REST API + WebSocket + per-server process manager
start-panel.bat      # Windows launcher (installs deps on first run, then starts)
public/
  index.html         # the whole UI (single page)
  style.css          # dark theme
  app.js             # frontend logic
```

---

<div align="center">

**Lodestone** — made for running Minecraft servers without the headache. ◆

</div>
