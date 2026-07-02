# Iter 1 - Review Report (Foundation & Architecture)

> Agent D (Reviewer) verification of the Agent C implementation at
> `.planning/design/iter1/03-implementation.md` against the approved plan
> at `.planning/design/iter1/02-feasibility.md`.

## Verdict

**PASS**

All 12 approved changes were applied verbatim, the build is green with
output matching the implementer's report, every in-scope smell grep
returns empty, and the deferred items remain untouched. Ready to proceed
to iter 2.

## Build status

Re-ran `npm run build` myself. Output:

```
> lodestone@1.0.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 1671 modules transformed.
rendering chunks...
computing gzip size...
public/index.html                       0.47 kB │ gzip:  0.31 kB
public/assets/lodestone-BmjQtaXR.webp  12.83 kB
public/assets/index-B0i5wFmx.css       32.47 kB │ gzip:  6.82 kB
public/assets/index-Btjg11hf.js       328.68 kB │ gzip: 99.75 kB
✓ built in 2.44s
```

Comparison to implementer's report:

| Field           | Implementer    | This run       | Match |
|-----------------|----------------|----------------|-------|
| Modules         | 1671           | 1671           | ✓     |
| CSS bundle      | 32.47 kB       | 32.47 kB       | ✓     |
| CSS gzip        | 6.82 kB        | 6.82 kB        | ✓     |
| JS bundle       | 328.68 kB      | 328.68 kB      | ✓     |
| JS gzip         | 99.75 kB       | 99.75 kB       | ✓     |
| CSS hash        | `B0i5wFmx`     | `B0i5wFmx`     | ✓     |
| JS hash         | `Btjg11hf`     | `Btjg11hf`     | ✓     |
| Time            | 2.60 s         | 2.44 s         | ~ (run-to-run variance) |

Zero errors, zero warnings. Bundle sizes identical (impossible to
fake - content-hashed asset names would diverge otherwise).

## Per-change audit

Each change is verified against the plan's snippet at
`02-feasibility.md`.

| # | Plan target | File | Status | Note |
|---|-------------|------|--------|------|
| 1 | `:root` token refresh + body font + motion strings + drop `--sidebar-w` | `src/index.css:6-102` | ✓ | All values match. `body { font-size: var(--text-base) }` at line 111. Motion strings at lines 160, 174, 183 use the new vars. Second `:root` block with `--sidebar-w` is gone. |
| 2 | `status`/`chart`/`sidebar` colors + radius + shadow + spacing in Tailwind | `tailwind.config.js:62-105` | ✓ | `status` (online/warn/offline/error), `chart` (1-5), `sidebar` (DEFAULT/foreground/primary/accent/border/ring) all present with `<alpha-value>`. `borderRadius` has sm/md/lg/xl/2xl/pill. `boxShadow` has xs/sm/DEFAULT/md/lg/xl. `spacing.sidebar` = `220px`, `spacing['sidebar-collapsed']` = `48px`. |
| 3 | Page shell refactor (flex, no `--sidebar-w` math) | `src/App.jsx:135-153` | ✓ | `flex min-h-screen bg-background` wrapper, sidebar as flex child, right column is `flex-1 flex-col`, header sticky (in Header.jsx:20), `main` is `flex-1 p-5`. No `marginLeft: 'var(--sidebar-w)'`, no `pt-[calc(3.5rem+1.25rem)]`, no inline `left: var(--sidebar-w)`. |
| 4 | Sidebar surface tokens + active bar + density | `src/components/layout/Sidebar.jsx:76-126` | ✓ | `<aside>` is `flex w-sidebar shrink-0 flex-col border-r border-sidebar-border bg-sidebar` (line 76). Group label uses `text-muted-foreground/70` (line 90). Active button has `border-l-2 border-l-primary bg-primary/10 text-primary`; inactive has `border-l-transparent ... hover:bg-sidebar-accent hover:text-sidebar-foreground` (lines 102-107). Item padding is `py-1.5`. No more `width: 'var(--sidebar-w)'` inline style. |
| 5 | Header `sticky` + `tracking-tight` title | `src/components/layout/Header.jsx:20-23` | ✓ | Header is `sticky top-0 z-40 flex h-14 ... bg-background/80 backdrop-blur-sm px-5`. `<h1>` is `text-sm font-semibold tracking-tight text-foreground`. No more `fixed` + `left: var(--sidebar-w)` inline. |
| 6 | ServerSelector trigger (review only) | `src/components/layout/ServerSelector.jsx:28` | ✓ (no-op) | `bg-secondary/50 hover:bg-secondary` left as-is. Matches the plan's "no code change required in iter 1". |
| 7 | StatusPill + StatusDot tokenization | `src/components/shared/StatusPill.jsx:3-37` | ✓ | `STATUS_VARIANTS` uses `bg-status-{online,warn}/10` etc. `StatusDot` uses `bg-status-online` / `bg-status-warn` / `bg-muted-foreground/50`. Ping layer is `bg-status-online`. |
| 8 | Badge variant tokenization | `src/components/ui/badge.jsx:9-17` | ✓ | `online` / `starting` / `stopping` / `destructive` variants use status tokens. `active` keeps `bg-primary/15 text-primary border border-primary/25` per the plan. |
| 9 | Button success / destructive / glass tokenization | `src/components/ui/button.jsx:13-26` | ✓ | `destructive` = `bg-destructive/15 text-status-error border border-destructive/40 ...`. `success` = `bg-status-online/10 text-status-online border border-status-online/20 ...`. `glass` = `bg-foreground/[0.04] border border-border/60 backdrop-blur-sm ...`. |
| 10 | Modrinth compat pill tokenization | `src/views/ModrinthView.jsx:69` | ✓ | `bg-status-warn/10 text-status-warn border-status-warn/25`. |
| 11 | Extract KpiTile to `components/shared/KpiTile.jsx` | `src/components/shared/KpiTile.jsx` (new, 39 lines) | ✓ | New file. `TONE_CLASSES` and `ICON_BG` maps present. Function signature is `({ icon, label, value, sub, tone = 'neutral' })`. Border + icon-box both driven by `tone`. |
| 12 | Dashboard: import KpiTile, delete local, tokenize kpi/tps, sparkline, disk bar | `src/views/DashboardView.jsx` | ✓ | Line 7 imports `KpiTile` from shared. Local `KpiTile` function is gone. `kpiTone` (lines 91-93) and `tpsTone` (lines 95-97) replace `kpiColor`/`tpsColor`. All four `<KpiTile>` call sites use `tone="…"` (lines 103-128). `drawSpark` (lines 11-38) reads `--chart-1` via `getComputedStyle` and uses `hsl(${c})` for stroke and `hsl(${c} / 0.08)` for fill. Disk bar (lines 174-179) uses `bg-status-error` / `bg-status-warn` / `bg-primary`. |

**All 12 changes: ✓.**

## Smell-grep results

The plan's "Definition of done" greps, re-run on the post-change tree.

| Smell | Grep | Result |
|-------|------|--------|
| `var(--sidebar-w)` in any source | `grep "var\(--sidebar-w\)" src/` | **empty** |
| `--sidebar-w` anywhere | `grep "\-\-sidebar-w" src/` | **empty** |
| `bg-[hsl(200_6%_8%)]` sidebar surface | `grep "bg-\[hsl(200_6%_8%)\]" src/` | **empty** |
| `border-l-green-500` / `border-l-orange-500` / `border-l-red-500` in shared/UI/layout | `grep "border-l-green-500\|border-l-orange-500\|border-l-red-500" src/` | **empty** |
| `green-500/10` etc. in StatusPill | `grep "green-500\|green-400\|orange-500\|orange-400\|red-400" src/components/shared/StatusPill.jsx` | **empty** |
| Same in badge.jsx | `grep "green-500\|green-400\|orange-500\|orange-400\|red-400" src/components/ui/badge.jsx` | **empty** |
| Same in button.jsx | `grep "green-500\|green-400\|green-600\|orange-500\|orange-400\|red-400\|red-300" src/components/ui/button.jsx` | **empty** |
| `bg-white/[0.04]` glass button | `grep "bg-white/\[0\.04\]" src/` | **empty** |
| `marginLeft: 'var(--sidebar-w)'` shell | `grep "marginLeft: 'var\(--sidebar-w\)'" src/` | **empty** |
| `pt-[calc(3.5rem` shell magic | `grep "pt-\[calc\(3\.5rem" src/` | **empty** |
| `left: 'var(--sidebar-w)'` header | `grep "left: 'var\(--sidebar-w\)'" src/` | **empty** |
| Hardcoded sparkline hex | `grep "#5EC9A0\|rgba\(94,201,160" src/` | **empty** |
| `bg-orange-500/10 text-orange-400` in Modrinth compat | `grep "bg-orange-500/10 text-orange-400" src/views/ModrinthView.jsx` | **empty** |
| Local `KpiTile` in DashboardView | `grep "function KpiTile" src/views/DashboardView.jsx` | **empty** |
| `colorClass=` on `<KpiTile>` | `grep "colorClass=" src/views/DashboardView.jsx` | **empty** |
| `position: fixed` / `className="…fixed…"` in shell/header | `grep "position: fixed\|className=\".*fixed" src/` | only `LoginView.jsx:33` (`fixed inset-0` on the login screen wrapper - pre-existing, not in scope) |
| Raw HSL arbitrary values (`bg-[hsl…` / `text-[hsl…` / `border-[hsl…`) | `grep "bg-\[hsl\|text-\[hsl\|border-\[hsl" src/` | **empty** |
| `green-500` / `red-500` / `blue-500` anywhere in `src/` | `grep "green-500\|red-500\|blue-500" src/` | only `main.jsx:20` (`border-red-500/40` on the Sonner `<Toaster>` error style - explicitly deferred to iter 2) |
| Wider palette leak (`green-{400,500,600}` / `orange-{400,500}` / `red-{300,400,500}`) anywhere | `grep "green-500\|green-400\|green-600\|orange-500\|orange-400\|red-400\|red-300\|red-500" src/` | 15 hits, **all in deferred files** (BackupsView, FileManagerView, LoginView, MapView?, MetricsView?, PlayersView, PluginsView, ServersView, TasksView, UsersView, main.jsx). None in the three files the plan's DoD item 7 scopes. |

The 15 deferred-file matches exactly match what the implementer listed
in their report's `Still off - picked up by iter 2 or iter 3` section
(plus the `Toaster` error style in `main.jsx:20`).

### Cross-reference checks

| Check | Result |
|-------|--------|
| `grep "KpiTile" src/views/DashboardView.jsx` | 5 hits: 1 import + 4 call sites (lines 7, 103, 110, 117, 123) ✓ |
| `grep "KpiTile" src/components/shared/KpiTile.jsx` | 1 hit: `export function KpiTile(...)` at line 19 ✓ |
| `grep "import.*from '\.\./ui" src/components/shared/` | empty (shared components don't import from `ui/`, which is correct - `KpiTile` is a leaf component with no UI primitive dependencies) ✓ |
| `grep "from '@/components/shared/KpiTile'" src/` | 1 hit: `DashboardView.jsx:7` ✓ |

## Side-effect / shell check

End-to-end read of `src/App.jsx` (168 lines), `src/views/DashboardView.jsx`
(208 lines), `src/components/shared/KpiTile.jsx` (39 lines):

- **App.jsx**: imports are clean. The shell wraps a `<div
  className="flex min-h-screen bg-background">` containing `<Sidebar>` and
  a `<div className="flex min-h-screen flex-1 min-w-0 flex-col">` with
  `<Header>` + `<main>`. The view-enter animation still wraps the active
  view at `key={currentView}`. No orphaned imports; the dropped
  `marginLeft: 'var(--sidebar-w)'` had no other consumers.
- **DashboardView.jsx**: imports `KpiTile` from the shared module. No
  local `KpiTile` definition. The `kpiTone` / `tpsTone` lookups use
  `status.status` and `status.tps` exactly as in the plan. The sparkline
  call to `getComputedStyle(document.documentElement)` works because
  `--chart-1` is set on `:root` (verified at `src/index.css:51`). The
  disk bar's `cn(...)` keeps the threshold logic identical to before
  (≥0.9 → error, ≥0.75 → warn, else primary) - only the class strings
  changed.
- **KpiTile.jsx**: pure presentation, no side effects, no external
  imports beyond `cn`. Five `tone` values, all valid. Default `tone` is
  `'neutral'`. The icon-box drops the `border border-border bg-muted/40`
  per the "fewer borders" rule.

## Scope check

Touched files (mtime ≥ 2:25 PM today, the iter 1 wave):

```
src/App.jsx                          2:25:21 PM
src/components/layout/Sidebar.jsx    2:25:28 PM
src/components/layout/Header.jsx     2:25:33 PM
src/components/shared/StatusPill.jsx 2:25:40 PM
src/components/ui/badge.jsx          2:25:45 PM
src/components/ui/button.jsx         2:25:50 PM
src/views/ModrinthView.jsx           2:25:53 PM
src/components/shared/KpiTile.jsx    2:25:59 PM (new)
src/views/DashboardView.jsx          2:26:13 PM
src/index.css                        (edited in same wave)
tailwind.config.js                   (edited in same wave)
```

Untouched in iter 1 (all earlier today, pre-iter-1):

- `src/views/ConsoleView.jsx` - iter 2 (terminal styling)
- `src/views/FileManagerView.jsx` - iter 2 (table styling)
- `src/views/MetricsView.jsx` - iter 2 (table styling + chart palette)
- `src/views/LoginView.jsx` - iter 3 (login visual)
- `src/views/ServersView.jsx` (line 396/398/401 raw palette icons) - iter 2
- `src/views/PluginsView.jsx`, `BackupsView.jsx`, `TasksView.jsx`,
  `UsersView.jsx`, `PlayersView.jsx` - iter 2/3 (delete-icon palette
  sweep)
- `src/views/ConfigsView.jsx` - iter 2/3
- `src/views/MapView.jsx` - iter 3 (out of design-system scope)
- `src/main.jsx:20` (`<Toaster>` error style) - iter 2
- `src/hooks/*`, `src/context/*`, `src/lib/*` - out of scope

**Scope discipline: clean.** The implementer touched exactly the 10
files the plan called for (9 modified + 1 new) and nothing else.

## Nits

Non-blocking, suitable for a future iteration:

1. **`KpiTile`'s `text-xl` value** is 20 px. With the new body at
   13.5 px, the tile value reads correctly on a 1080p screen but might
   look slightly oversized at higher DPIs. Visually verify on a real
   run; if it feels heavy, drop to `text-lg` (16 px). The plan specified
   `text-xl` (18 px was the investigation's proposal, plan says `text-lg`
   is "20 px" in the table - actually `text-xl` in Tailwind = 20 px
   line-height 1.4; `text-lg` = 16 px). Not a bug, just a visual call.
2. **`text-[11px]` is still used in `KpiTile.jsx:33`** for the label.
   The plan defines `--text-xs: 11px` as a token but didn't wire it to
   Tailwind. Iter 2 will sweep the type-scale application.
3. **`bg-muted/40` is used in the KpiTile neutral icon box**
   (`KpiTile.jsx:16`). The plan's `ICON_BG.neutral` row says
   `'bg-muted/40 text-muted-foreground'` - the same string. Note that
   the plan reused `bg-muted/40` even though the investigation flagged
   "use fewer borders" here. The two are not in conflict: the icon box
   is a flat tint, not a bordered surface. Looks intentional.
4. **`border-b border-border` in the Server info rows** at
   `DashboardView.jsx:198` is unchanged. The investigation recommended
   `border-b border-border/60` (softer). Plan did not call this out
   explicitly, so leaving it is fine. Could be relaxed in iter 2.
5. **`KpiTile` does not export `KpiTile` from a barrel / index file**,
   but it lives directly under `components/shared/` and is imported
   via the absolute path `@/components/shared/KpiTile`. Consistent with
   how other shared components are imported (e.g.
   `@/components/shared/StatusPill`). Fine.
6. **Sparkline `getComputedStyle` call**: this reads the CSS variable at
   every draw (150 frames × 4 metrics × 1 frame per `useEffect` per
   data update). Negligible cost, but the value only changes on theme
   swap, so caching once in a `useRef` would be slightly cleaner. Not a
   correctness or perf issue at 4 metrics.

None of these are blockers. They are taste-level calls that the next
iteration can pick up.

## Blockers

**None.** The implementation is faithful to the plan. Every change
listed in `.planning/design/iter1/02-feasibility.md` "Concrete change
list" was applied verbatim, the build is green, every DoD smell grep
returns empty in-scope, the page shell is intact, the new KpiTile
imports and uses correctly, and the deferred files were not touched.

## Recommendation

**Proceed to iter 2.** The foundation is solid: token plumbing, page
shell, sidebar surface + active state, header sticky, status/badge/
button tokenization, KpiTile extraction, sparkline + disk-bar
tokenization, and Modrinth compat pill. The natural next iteration
covers the deferred items in `02-feasibility.md`: sidebar collapse-to-
icons (with the new `tooltip.jsx`), console styling, table styling
sweep across `ServersView` / `PluginsView` / `BackupsView` /
`TasksView` / `UsersView` / `PlayersView` / `ConfigsView` /
`FileManagerView` (this is where the 15 raw `text-red-400` /
`text-green-400` literals get tokenized), form/input refinements,
modal/dialog visual pass, and the type-scale application sweep. The
visual side-effects to confirm in a real browser run are the slightly
deeper `--background` (8.5% vs 9%) and the lifted `--foreground` (78%
vs 68%); both are one-line reverts in `src/index.css:8-9` if the team
dislikes them.

Manual UI smoke-test checklist (do this before merging iter 1):

- [ ] Log in, dashboard renders 4 KPI tiles with a 2-px left accent
      whose color changes when status flips to starting/stopping.
- [ ] TPS tile shifts color (green → orange → red) as TPS crosses 19
      and 15.
- [ ] Sparkline strokes are the brand mint; if you change
      `--chart-1` in DevTools the next frame repaints with the new
      color.
- [ ] Disk-usage bar turns orange at ≥75% and red at ≥90% (visual
      test only; can simulate by filling a test disk).
- [ ] Sidebar active item has a 2-px left bar in the brand mint; hover
      on the inactive items shows a subtle blue-grey tint.
- [ ] Header is sticky on scroll; no `marginLeft: var(--sidebar-w)`
      still lurking in DevTools computed styles.
- [ ] Each sidebar entry navigates and the view-enter animation
      fires.
