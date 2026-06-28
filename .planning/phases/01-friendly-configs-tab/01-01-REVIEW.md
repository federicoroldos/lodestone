---
phase: 01-friendly-configs-tab
plan: 01-01
title: Review of friendly-configs implementation
status: review
verdict: ready-to-merge-with-minor-fixes
---

# Review: Friendly Configs tab (01-01)

## Verdict

**Ready to merge with minor fixes recommended.**

The implementation covers all 10 must_haves, the build passes, no new
npm deps were added, no commits were made, all new i18n strings are
English-only (no Spanish keys added under `en.dictionaries.es.configs`),
the backend reuses `resolveEditable` + the existing `/api` auth
middleware, the file round-trip is stable, and the four declared
deviations are all reasonable. There are no blockers, but a handful
of issues are worth fixing before the user runs the 10 manual steps.

## Per-must_have score

| # | Must-have | Score | Verdict | One-line reason |
|---|-----------|-------|---------|-----------------|
| 1 | Friendly controls for the 20 listed `server.properties` keys | 10 | PASS | All 20 keys defined in `src/configs/schema.js` with `key`, `type`, range/options, `restartRequired`, `group`; each has `label` + `description` in `i18n.json`. |
| 2 | Unknown keys collapse into "Advanced keys" disclosure | 10 | PASS | `ConfigForm.jsx:165-183` renders a `<details>` listing `parsed.order.filter(k => !modeled.has(k))`. |
| 3 | Live validation with yellow Issues panel; save disabled on error | 9 | PASS | `validateValue` covers bool/number/enum/string; `ValidationPanel` surfaces them; `ConfigsView.jsx:117` disables save on any `severity: 'error'`. One nit: validation messages are hardcoded English strings inside `validateValue` and `ConfigForm` (not routed through `t()`). |
| 4 | Diff preview before save; confirm-before-PUT | 10 | PASS | `DiffPreview` (green/red/unmuted, "Show unchanged" toggle, Save disabled when 0 added+0 removed). `ConfigsView.jsx:184` only calls `doSave` on confirm. |
| 5 | Restart banner with working Restart button after save | 10 | PASS | `RestartBanner` calls `/api/server/restart` (same endpoint as `App.jsx:109`); dismisses on success, keeps on failure; banner persists per-file in `pendingRestart`. |
| 6 | Grouped left-rail file nav: Gameplay / Performance / World / Other | 10 | PASS | `FileNav` + `FILE_GROUPS` with case-insensitive matching; "other" is a catch-all bucket. |
| 7 | History dropdown with relative timestamps, sizes, confirm dialog | 9 | PASS | `HistoryDropdown` lists backups, shows rel-time + size, opens `ConfirmDialog` before restore. The rel-time helper is inline (no `date-fns` dep), as the plan said. |
| 8 | Restoring a `.bak` creates a fresh `.bak` of the current state first | 10 | PASS | `server.js:1841-1842` snapshots the existing file with `bakStamp()` before `fs.copyFileSync(bakPath, full)`. |
| 9 | New endpoints are JWT-protected, allowlisted, path-safe | 10 | PASS | Both routes live under `app.use('/api', authMiddleware)` (line 844). `resolveEditable` does the allowlist + basename stripping. `path.basename(req.body.backup)` strips any path prefix. `BAK_SUFFIX_RE` enforces the on-disk shape. |
| 10 | New UI strings only under `en.dictionaries.en.configs.*`; no Spanish | 10 | PASS | `es.configs` still has exactly 3 keys (`title`, `hint`, `savedToast`); 30 new top-level keys + 20 `field.*.label/description` pairs all live in `en.configs`. (Spanish additions for `backups.retention*` and `common.invalidBackupsConfig` are the user's pre-existing WIP, not part of this phase.) |

Aggregate: **98/100**. Build + syntax both green; static verification
matches the SUMMARY's claim.

## Issue list

1. **[major] Rules-of-hooks violation in `ConfigForm.jsx:96-117`.** The
   early-return `if (!isPropertiesFilename(file)) { return ... }` runs
   *before* the `useMemo` and `useEffect` calls. If the parent ever
   passes a non-properties filename to this component and then later
   switches to a properties filename, React will see the hook count
   change between renders. **Fix:** compute `isProps` first, then
   optionally early-return - never gate hooks behind a conditional.

2. **[major] `setMode` discards unsaved edits (`ConfigsView.jsx:90`).**
   `setMode` calls `setCurrent(original)`, which silently throws away
   any changes the user made in the friendly form (or raw) before
   flipping modes. **Fix:** when switching, keep `current` as-is - the
   other editor (friendly ↔ raw) will replace it on its own
   `useEffect([original])` re-parse, or serialize a fresh value the
   first time the user touches the new mode.

3. **[major] SUMMARY mismatch on save gating (`01-01-SUMMARY.md:82`).**
   The SUMMARY says "the user can still choose to save over a hard
   error", but the actual code (`ConfigsView.jsx:117`) disables Save
   whenever *any* issue has `severity: 'error'`. Either the code is
   right (save is blocked) and the SUMMARY wording is wrong, or the
   SUMMARY is right and save should be re-enabled over hard errors.
   Pick one and align both. (My read: blocking is the right call -
   fix the SUMMARY.)

4. **[minor] `Badge variant="warn"` is undefined
   (`ConfigForm.jsx:15`).** `src/components/ui/badge.jsx` only defines
   `default | online | offline | starting | stopping | active |
   destructive`. `variant="warn"` falls through to `default`, so the
   "Restart required" badge does not look warn-colored. **Fix:** add a
   `warn` variant to the Badge (one cva entry), or use `variant="starting"`
   (yellow tones already exist).

5. **[minor] Dead code: `modesRef` in `ConfigsView.jsx:56, 91`.** The
   ref is written but never read. Mode is read on every render via
   `readMode(base)` instead. Either remove the ref, or actually use it
   to skip the `localStorage` read on every render (it's effectively
   free for `localStorage`, so just delete the ref).

6. **[minor] Validation messages are not routed through `t()`
   (`configFile.js:80, 84, 88, 91, 97, 101`;
   `ConfigForm.jsx:114`).** The error strings are hardcoded English
   inside `validateValue` and re-prefixed with the key in `ConfigForm`.
   This violates the "English only" rule in spirit (they're not in
   `i18n.json`) but does not break the "no new Spanish strings" rule
   because they're not Spanish either. If a future language wants
   localized error messages, they'd need to be refactored. For Phase 1
   this is acceptable, but worth a TODO.

7. **[minor] `set-based` diff, not LCS (`src/lib/diff.js`).** The plan
   said "A simple LCS-based line diff is fine - no need for Myers or
   any library." The implementer wrote a set-based diff that walks
   the two line arrays in parallel using set membership. It works
   fine for the property-file use case (small, mostly key=value, few
   real changes), but will mis-align if many duplicate lines are
   reordered. The implementer's own comment acknowledges this. Phase 2
   can swap in a real LCS if it becomes a problem.

8. **[minor] `useEffect` missing `api` from deps
   (`HistoryDropdown.jsx:47`).** `api` is closed over but the
   dependency array is `[open, file, refreshKey]`. In practice the
   `useApi` callback is stable enough (it only changes on token
   refresh) that this is not a real bug, but ESLint would complain.
   Cheap fix: include `api` in the deps.

9. **[minor] `pairs` table redundancy (`ConfigRaw.jsx:18-19`).** The
   `pairs` and `closers` maps duplicate information. Also the
   `opener: c` field pushed onto the stack (line 23) is never read -
   `top.ch` is what `closers[c]` is compared against. Not a bug, just
   cleanup.

10. **[minor] `RestartBanner` re-reads `file` from props each render
    (`RestartBanner.jsx:54-55`).** Both `aria-label` and `title` use
    `t('configs.bannerDismiss')` instead of being empty for the icon
    button. This is fine and arguably better for accessibility, but the
    `aria-label` should arguably not duplicate the visible tooltip.

11. **[style] Inline comment grammar in
    `01-01-SUMMARY.md:103-110`.** "the actual on-disk shape from the
    existing `PUT /api/configs/:name` route is the ISO-stamp
    `2026-06-27T12-30-00-000Z` (because
    `new Date().toISOString().replace(/[:.]/g, '-')` produces that)"
    - fine, just slightly long. No action needed.

## Deviation assessment

| Deviation | Acceptable? | Why |
|-----------|-------------|-----|
| **Switch → Checkbox** | Yes | No shadcn `Switch` exists in `src/components/ui/`. Using the existing `Checkbox` is consistent with how `ConsoleView.jsx` already does booleans (autoscroll). The "true/false" text label next to the box keeps the meaning explicit, which actually beats a Switch for non-tech users. |
| **Radix `DropdownMenu` used directly (no shadcn wrapper)** | Yes | The codebase has no `DropdownMenu` wrapper in `src/components/ui/`. Adding one for a single use site would be premature abstraction; the rest of the file uses `bg-popover` / `border-border` / etc. directly, so it's stylistically consistent. |
| **`.bak` filename regex matches the real on-disk format** | Yes, and **necessary** | The plan suggested `^\d{8}-\d{6}$`, but the actual `bakStamp()` produces `2026-06-27T12-30-00-000Z` (ISO with dashes). If the implementer had used the plan's regex, no real backup would ever match, and the History dropdown would always be empty. The deviation is a bug fix, not a stylistic choice. |
| **No new `src/lib/api.js` or `src/i18n/index.js`** | Yes | The plan's `files_modified` was aspirational - neither file exists. The codebase already exposes `useApi()` (in `src/hooks/useApi.js`) and `t()` (via `@/i18n`). The implementer correctly reused the existing primitives instead of inventing new ones. |

## User verification readiness

The 10 manual steps in `01-01-SUMMARY.md` (lines 118-147) are clear
and follow the implementation 1:1. The user can run them. Two small
clarifications would help:

- **Step 4** calls the toggle a "link", but it's actually a `Button`
  labeled with the `Repeat` icon. Minor; the user will find it.
- **Step 5** says "round-tripped from the form" - be aware that
  `serializeProperties` always appends a trailing newline (idempotent
  but a different byte sequence than the original file if the original
  lacked one). For files that already end in `\n` (which is the
  standard case for `server.properties`), this is invisible. Worth
  mentioning in case the user diffs the file with `git`.

The user can confidently run the 10 steps. No automated-test follow-up
needed for Phase 1; the static side of the review is clean enough.

## Build / syntax status

- `node --check server.js` - PASS (no output, exit 0).
- `npm run build` - PASS (`1711 modules transformed`, 0 warnings, 3.15s).
- `package.json` / `package-lock.json` - unchanged.
- `git log --oneline -3` - still `6dd544f` HEAD, no commits made.

## Recommendation

Fix the three major issues (rules-of-hooks, mode-switch discarding
edits, SUMMARY wording on save gating) before declaring this phase
done. The minor issues are non-blocking and could ship as-is or be
cleaned up alongside the Phase 2 follow-ups (syntax highlighting,
per-key search, presets, first-run wizard).

---

*Reviewer: opencode (minimax-m3) - static review only; the 10 manual
browser steps are owned by the user.*
