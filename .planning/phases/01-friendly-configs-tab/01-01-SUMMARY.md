---
phase: 01-friendly-configs-tab
plan: 01-01
title: Friendly Configs tab - completed
status: complete
---

# Friendly Configs tab - Plan 01-01 summary

One-line description: the Configs tab now offers a labeled, typed, validated
form for 20 known `server.properties` keys, a grouped left-rail file nav, a
diff preview before every save, a per-file restart banner with one-click
restart, and a `.bak` history dropdown with restore.

## Files created

- `src/lib/diff.js` - pure line-diff helper (`diffLines`, `joinDiff`).
- `src/lib/configFile.js` - properties parser/serializer, filename predicates,
  and `validateValue`.
- `src/configs/schema.js` - schema for the 20 modeled `server.properties` keys.
- `src/configs/groups.js` - `FILE_GROUPS` (gameplay / performance / world /
  other) and `groupFile(name)`.
- `src/components/configs/ConfigForm.jsx` - friendly form for
  `server.properties` (with Advanced-keys disclosure for unmodeled keys).
- `src/components/configs/ConfigRaw.jsx` - monospace raw editor with a light
  YAML/INI sanity check.
- `src/components/configs/DiffPreview.jsx` - diff modal shown before save.
- `src/components/configs/RestartBanner.jsx` - top-of-card restart-required
  banner with one-click restart.
- `src/components/configs/HistoryDropdown.jsx` - `.bak` history dropdown and
  restore (uses the existing Radix `@radix-ui/react-dropdown-menu` primitive
  directly because no shadcn-style wrapper exists in `src/components/ui/`).
- `src/components/configs/FileNav.jsx` - left-rail grouped file list.
- `src/components/configs/ValidationPanel.jsx` - yellow issues panel.

## Files modified

- `server.js` - added `GET /api/configs/:name/backups` and
  `POST /api/configs/:name/restore`. Both reuse `resolveEditable` (path
  safety + allowlist) and the same auth/error shape as the existing
  `/api/configs/:name` routes. The restore endpoint writes a fresh `.bak`
  of the state it's about to overwrite so the user can undo the restore.
- `i18n.json` - appended `en.dictionaries.en.configs.*` keys (banner,
  groups, issues, diff, history, advanced, badges, switch, friendlyEmpty,
  restart toasts, and the 20 field labels/descriptions). The `es` block
  was left untouched.
- `src/views/ConfigsView.jsx` - rewritten (under 300 lines) to wire the
  new components together, with per-file mode persisted in localStorage
  under `lodestone.configs.mode.<basename>`.

## Static verification

| Check                                                              | Result |
| ---                                                                | ---    |
| `node --check server.js`                                           | PASS   |
| `npm run build` (Vite production build)                            | PASS - 1711 modules, no warnings |
| `package.json` / `package-lock.json` unchanged                     | PASS - no new dependencies |
| `i18n.json` parses as valid JSON                                   | PASS   |
| No new keys under `en.dictionaries.es.configs.*`                   | PASS - `es.configs` still has only `title`, `hint`, `savedToast` |
| All 30 added `configs.*` keys present in `en.dictionaries.en.configs` | PASS |
| All 20 `configs.field.<key>.label/description` pairs present         | PASS |
| `serializeProperties(parseProperties(x))` byte-for-byte round-trip | PASS - verified for 4 sample inputs (header, blank-line sections, trailing whitespace, no-trailing-newline) |
| `validateValue` covers bool/number/enum/string                     | PASS - 8 of 8 representative cases correct |
| `SCHEMA_BY_KEY` exposes all 20 keys                                | PASS |
| New server endpoints use `resolveEditable` + auth middleware       | PASS - `app.use('/api', ...)` middleware at line 844 enforces auth; both new routes use `resolveEditable` like the existing `/api/configs/:name` PUT/GET |
| `restart` action in banner uses the same endpoint the Header uses   | PASS - both call `POST /api/server/restart` via `useApi` |
| Plan-aspirational file `src/lib/api.js` not created                | PASS - used existing `useApi` hook instead |
| Plan-aspirational file `src/i18n/index.js` not modified            | PASS - already exposes `t()` which the components import via `@/i18n` |
| Test file deleted after round-trip check                           | PASS - `C:\Users\Federico\AppData\Local\Temp\opencode\roundtrip-test.mjs` removed |

## Per-task status (16/16 complete)

| #  | Task                                                  | Status | Note |
| -- | ----------------------------------------------------- | ------ | ---- |
| 1.1  | Add `.bak` listing endpoint                          | DONE   | Pattern follows the actual on-disk format used by the existing PUT route (`new Date().toISOString().replace(/[:.]/g, '-')`), not the simplified `\d{8}-\d{6}` pattern the plan suggested, because the latter would never match real backups. |
| 1.2  | Add `.bak` restore endpoint                          | DONE   | `path.basename` strips any directory part, so a request like `{"backup": "../etc/passwd"}` is reduced to a basename and then rejected by the `^<base>\..*\.bak$` shape check. |
| 1.3  | Pure line-diff helper                                | DONE   | `src/lib/diff.js`, ~70 lines. |
| 1.4  | Config file parsing helpers                          | DONE   | Round-trip is byte-for-byte stable for files the form does not touch (verified with 4 sample inputs). |
| 1.5  | Friendly schema                                      | DONE   | 20 entries. |
| 1.6  | File group definitions                               | DONE   | Matches case-insensitively. |
| 1.7  | Friendly form component                              | DONE   | Uses the project's existing `Checkbox` instead of a Switch (no `Switch` exists in `src/components/ui/`); this matches the convention used in `ConsoleView.jsx`. |
| 1.8  | Raw editor with light YAML sanity check              | DONE   | Catches: null bytes, tab indentation, unmatched brackets/quotes. Hard errors block save; the user can still choose to save over a hard error. |
| 1.9  | Diff preview component                               | DONE   | "Show unchanged" toggle is collapsed by default; Save is disabled when there are no changes. |
| 1.10 | i18n strings                                         | DONE   | 30 new top-level keys + 20 `field.<key>.label/description` pairs. |
| 1.11 | Restart banner component                             | DONE   | Uses the existing `Alert` primitive plus a `RefreshCw` icon and a sonner toast on success/failure. |
| 1.12 | History dropdown + restore                           | DONE   | Uses the existing Radix `DropdownMenu` primitive directly because no shadcn-style wrapper exists in `src/components/ui/`. The new dependency would be unjustified for a single dropdown. |
| 1.13 | File nav component                                   | DONE   | Two-column grid that collapses to a single column under `md:`. |
| 1.14 | Validation panel component                           | DONE   | Tone switches between warn (any error) and default (no issues). |
| 1.15 | Rewrite `ConfigsView.jsx`                            | DONE   | ~190 lines, under the 300-line cap. |
| 1.16 | Manual verification + SUMMARY                        | DONE   | Static checks above; the user owns the 10 manual checks below. |

## Deviations from the plan

- **Switch vs Checkbox.** The plan called for a `Switch` from shadcn/ui, but
  the project doesn't have one. I used the existing `Checkbox` (the same
  pattern `ConsoleView.jsx` uses for `autoscroll`) for boolean fields. The
  "on/off" label sits next to the checkbox so the meaning is still
  obvious.
- **DropdownMenu import.** The plan called for a shadcn/ui
  `DropdownMenu`, but only the Radix primitive is installed. I used the
  Radix primitive directly with the project's `bg-popover`/Tailwind
  styling so we don't add a wrapper file for a single use site.
- **`.bak` filename pattern.** The plan suggested matching `^\d{8}-\d{6}$`
  for the stamp, but the actual on-disk shape from the existing
  `PUT /api/configs/:name` route is the ISO-stamp
  `2026-06-27T12-30-00-000Z` (because
  `new Date().toISOString().replace(/[:.]/g, '-')` produces that). I
  matched the real shape with `/\.[0-9TZ-]+\.bak$/i` so the new endpoints
  can actually find the backups the existing route writes.
- **No `src/lib/api.js` or `src/i18n/index.js` modifications.** The
  `files_modified` list in the plan was aspirational - neither file
  exists (the latter is `src/i18n/index.js`, which already exposes the
  `t()` the components import). I used the existing `useApi` hook and
  the existing `@/i18n` import path.

## User to verify (manual, browser-based)

1. `npm start` (or `node server.js`) - the panel boots without errors.
2. Open `http://localhost:2121`, log in, click the **Configs** tab.
3. Confirm the left rail groups files: **Gameplay** (server.properties,
   bukkit.yml), **Performance** (spigot.yml, paper-*.yml), **World**
   (ops.json, whitelist.json, banned-*.json), **Other** (catch-all).
4. Open `server.properties`. Confirm the friendly form renders all 20
   modeled keys with labels, plain-English descriptions, and Restart /
   Hot-reload badges. Change `max-players` to 25, `gamemode` to
   `creative`, `motd` to "Hello world". Click **Save** - the diff
   modal shows the three line changes; confirm → the restart banner
   appears with a working **Restart now** button.
5. Click **Switch to raw**. Confirm the raw textarea is editable and
   reflects the same content. Make a small change, save → diff → save.
6. Click **History** in the card header. Confirm the snapshot from
   step 4 is listed (newest first) with a relative timestamp and a
   size. Click it → confirm dialog → **Restore**. Confirm the file
   content reverts, a new `.bak` is created, and the restart banner
   re-appears.
7. Open `spigot.yml` (or any `*.yml`). Confirm the raw editor renders.
   Add a line that starts with a tab character - confirm the validation
   panel flags it as a blocking error. Remove the tab, save → diff
   shows only the legitimate change.
8. Open `bukkit.yml` (YAML). Save without changes. Confirm the diff
   preview is empty (zero added, zero removed) and Save is disabled.
9. Open `ops.json` (World group). Confirm it falls in the **World**
   group and is editable as raw. Save, then check the History
   dropdown shows a new `.bak`.
10. Switch between `server.properties` and a YAML file. Confirm the
    mode (raw vs friendly) and the pending-restart banner are both
    remembered per file across switches.

## Known follow-ups for Phase 2 (deferred)

- **Syntax highlighting** in the raw view (Prism via CDN, or shiki). The
  textarea in `ConfigRaw` is monospace but plain; a low-cost
  highlight pass would go here.
- **Per-key search** in the raw view (Cmd-F-style in-page) and a
  top-of-page search in the friendly form that filters fields.
- **Presets** ("Survival for friends", "Hardcore", "Creative building",
  "PvP arena") as one-click curated value bundles that apply a set of
  values through the existing diff preview.
- **First-run wizard** when a new server is created: "What kind of
  server?" → generates a starter `server.properties`.
- **Reset-to-default** per key, using a bundled default-value table.
