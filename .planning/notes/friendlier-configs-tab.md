---
title: Friendlier Configs tab for non-tech-savvy users
date: 2026-06-27
context: User-initiated ideation (gsd-explore)
status: crystallized into Phase 1
---

## The problem (today)

`src/views/ConfigsView.jsx` is a 71-line raw editor: a `<select>` of files
(`server.properties`, `spigot.yml`, `paper-world-defaults.yml`, `bukkit.yml`,
…) plus a monospace `<textarea>` plus a Save button. A non-tech user opening
this sees ~70 `key=value` lines and walls of YAML, and is expected to know the
exact key name, valid values, and (for YAML) the indentation. One typo = a
server that won't start. There is no validation, no highlighting, no
descriptions, no diff, no help, and no safety net.

## The dream (what it could become)

Distilled from the gsd-explore session. Ranked by leverage for non-tech users.

1. **Friendly forms for `server.properties`** — each known key becomes a
   labeled, typed input with a plain-English description:
   - `max-players=20` → number input, range 1–1,000,000, label "Max players
     that can join"
   - `gamemode=survival` → segmented control: Survival / Creative / Adventure
     / Spectator
   - `pvp=true` → switch, "Players can hurt each other"
   - `difficulty=normal` → radio: Peaceful / Easy / Normal / Hard
   - `motd=...` → text input, "Shown to players in the server list"
   - `white-list=false` → switch
   Unknown keys collapse into an "Advanced keys" disclosure so power users
   aren't locked out. Implemented as a `SCHEMAS.serverProperties` constant
   colocated with the view.
2. **Per-file mode** — `server.properties` defaults to the friendly form;
   `*.yml`/`.yaml` files show a syntax-highlighted raw view (Prism via CDN
   or `@radix-ui`-free alternative; zero new deps preferred). A "Switch to
   raw / friendly" link in the card header.
3. **Live validation** — before save: YAML parses, enums are valid, numbers
   in range, required keys not missing. Red highlights + a yellow "Are you
   sure?" panel listing what would break.
4. **Diff preview before save** — green/red diff against the on-disk file
   using a tiny line-diff helper in `src/lib/diff.js`. No new deps.
5. **"Requires restart" banner** — after save, a persistent banner across the
   top of the Configs card with a one-click Restart button (existing
   `restart` action). A small "🔒 Restart" or "🔥 Hot-reload via /reload"
   badge next to each friendly key when known.
6. **Grouped file nav** instead of a flat dropdown: *Gameplay*
   (`server.properties`, `bukkit.yml`), *Performance* (`spigot.yml`,
   `paper-world-defaults.yml`), *World* (`ops.json`, `whitelist.json`, …),
   *Other*. Implemented as a left rail of grouped links.
7. **Per-key search** in the raw view (Cmd-F-style in-page). For the friendly
   form, a top-of-page search that filters fields ("max players" → jumps to
   `max-players`).
8. **`.bak` history + restore** — the backend already writes a timestamped
   backup on every save. Surface a "History" dropdown in the card header
   listing recent `.bak` files, with a one-click restore. Needs two small
   new endpoints: `GET /api/configs/:name/backups` and
   `POST /api/configs/:name/restore`.
9. **Presets** — "Survival for friends", "Hardcore", "Creative building",
   "PvP arena" — one click applies a curated set of values with a diff
   preview. (Phase 2, not Phase 1.)
10. **First-run wizard** when a new server is created: "What kind of server?"
    → generates the starter `server.properties`. (Phase 3, not Phase 1.)

## Phase 1 scope (decided)

Items **1, 3, 4, 5, 6, 8** from the list above. Friendly forms + live
validation + diff preview + restart banner + grouped file nav + `.bak`
history/restore. Skips items 2 (full Prism highlighting — keep raw monospace
for now), 7 (per-key search — defer to Phase 1.5 if needed), 9 (presets),
and 10 (wizard).

## Constraints / hard rules to respect

- English only (CLAUDE.md rule 1). All new UI strings go into the `en`
  dictionary under `configs.*`. The `es` block is pre-existing legacy
  content; do **not** add Spanish strings as part of this work.
- Don't commit secrets or push unless asked.
- Path-traversal guards already exist in `safeResolve` / `resolveEditable` —
  reuse them, don't add new filesystem routes that bypass them.
- The `.bak` endpoints must be JWT-protected like every other `/api/*` route
  and must refuse any name that escapes the server folder.
- The friendly form for `server.properties` must not break the file format
  (lines like `key=value` with no comments on edited lines is fine; preserve
  comments on lines not touched by the form).

## Open questions (to resolve during planning)

- For YAML files in Phase 1: do we ship any friendly keys, or only raw view
  with syntax highlighting deferred? (Current scope: raw only, with
  validation that it parses as YAML before save.)
- Should `.bak` restore create a new `.bak` of the current file (so users
  can undo the restore)? (Recommendation: yes — same pattern as PUT save.)
- For the friendly form, do we offer "Reset to default" per key using a
  bundled default value table, or only show the current value? (Phase 1:
  current value only; defaults are a Phase 2 nicety.)
