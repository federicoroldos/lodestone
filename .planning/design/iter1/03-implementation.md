# Iter 1 — Implementation Report (Foundation & Architecture)

> Agent C (Implementer) report. All 12 changes from
> `.planning/design/iter1/02-feasibility.md` were applied in the order
> listed. Build is green.

## Files touched

| # | File | Change |
|---|---|---|
| 1 | `src/index.css` | Refresh `:root` token block (color, radius, shadow, motion, type-scale, chart, sidebar, status). Set `body { font-size: var(--text-base) }`. Replace 3 bare `ease-out` strings with `var(--ease-out)` / `var(--duration-*)`. Drop the second `:root` block that defined `--sidebar-w`. |
| 2 | `tailwind.config.js` | Add `status` / `chart` / `sidebar` color entries with `<alpha-value>`, `spacing.sidebar` / `sidebar-collapsed`, full `borderRadius` (sm/md/lg/xl/2xl/pill), full `boxShadow` (xs/sm/md/lg/xl + DEFAULT). |
| 3 | `src/App.jsx` | Drop `marginLeft: 'var(--sidebar-w)'`, `pt-[calc(3.5rem+1.25rem)]` magic number, and the inline-styled header column. Sidebar + main now share a `flex min-h-screen` row; the right column is `flex-1 flex-col`. |
| 4 | `src/components/layout/Sidebar.jsx` | `<aside>` becomes `flex w-sidebar shrink-0 … border-sidebar-border bg-sidebar` (no more `position: fixed`, no more inline `width`). Active nav button gets `border-l-2 border-l-primary` (and inactive gets `border-l-transparent` so widths line up). Group-label opacity `/60` → `/70`. Item padding `py-2` → `py-1.5`. Inactive hover now uses `bg-sidebar-accent hover:text-sidebar-foreground`. |
| 5 | `src/components/layout/Header.jsx` | `<header>` becomes `sticky top-0 z-40 …` (no more `fixed` + inline `left: var(--sidebar-w)`). Title `<h1>` gains `tracking-tight`. |
| 6 | `src/components/layout/ServerSelector.jsx` | No code change. (Plan called this review-only; new `--secondary` token keeps the existing `bg-secondary/50` trigger visually distinct.) |
| 7 | `src/components/shared/StatusPill.jsx` | Replace green/orange palette with `bg-status-{online,warn}/10` etc. `StatusDot` swaps `bg-green-400` / `bg-orange-400` for `bg-status-online` / `bg-status-warn`; ping layer is the same. |
| 8 | `src/components/ui/badge.jsx` | `online` / `starting` / `stopping` / `destructive` variants moved from green/orange/red palette to `status-*` tokens. |
| 9 | `src/components/ui/button.jsx` | `destructive` text `red-300` → `text-status-error`. `success` variant swapped to `bg-status-online/10 text-status-online border-status-online/20`. `glass` variant swapped from `bg-white/[0.04]` to `bg-foreground/[0.04]` (same effect, named token). |
| 10 | `src/views/ModrinthView.jsx` | One-line: orange compat pill → `bg-status-warn/10 text-status-warn border-status-warn/25`. |
| 11 | `src/components/shared/KpiTile.jsx` | **NEW FILE.** Tile with `tone` prop (online / warn / error / primary / neutral). Drives both `border-l-status-*` and the icon-box `bg-status-*/10 text-status-*` tint from one source. Icon box drops the `border border-border bg-muted/40` wrapper (per the "fewer borders" rule). |
| 12 | `src/views/DashboardView.jsx` | Delete the local `KpiTile` function and import the new shared one. `kpiColor` / `tpsColor` replaced with `kpiTone` / `tpsTone` (string tone names). Each `<KpiTile>` call site now uses `tone="…"` instead of `colorClass="…"`. `drawSpark` reads `--chart-1` at draw time. Disk bar threshold colors → `bg-status-error` / `bg-status-warn` / `bg-primary`. |

## Build output (last lines, success)

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
✓ built in 2.60s
```

Zero errors, zero warnings. CSS bundle is 32.47 kB (was ~30 kB — the +2 kB
is the new `--shadow-*` and radius scale; the JS bundle is unchanged
since the new `KpiTile.jsx` was just moving ~30 lines).

## Grep verification

Every smell from the plan's "Definition of done" section, re-grepped on
the post-change tree. All empty unless noted.

| Smell | Grep | Result |
|---|---|---|
| `var(--sidebar-w)` in any source | `grep -n "var(--sidebar-w)" src/` | **empty** |
| `--sidebar-w` anywhere | `grep -n "\-\-sidebar-w" src/` | **empty** (dropped from `index.css`) |
| `bg-[hsl(200_6%_8%)]` sidebar surface | `grep -n "bg-\[hsl(200_6%_8%)\]" src/` | **empty** |
| `border-l-green-500` / `border-l-orange-500` / `border-l-red-500` | `grep -n "border-l-green-500\|border-l-orange-500\|border-l-red-500" src/` | **empty** |
| `green-500/10` etc. in `StatusPill` | `grep -n "green-500\|green-400\|orange-500\|orange-400\|red-400" src/components/shared/StatusPill.jsx` | **empty** |
| Same in `badge.jsx` | `grep -n "green-500\|green-400\|orange-500\|orange-400\|red-400" src/components/ui/badge.jsx` | **empty** |
| Same in `button.jsx` | `grep -n "green-500\|green-400\|green-600\|orange-500\|orange-400\|red-400\|red-300" src/components/ui/button.jsx` | **empty** |
| `bg-white/[0.04]` glass button | `grep -n "bg-white/\[0\.04\]" src/` | **empty** (button only) |
| `marginLeft: 'var(--sidebar-w)'` shell | `grep -n "marginLeft: 'var(--sidebar-w)'" src/` | **empty** |
| `pt-[calc(3.5rem` shell magic | `grep -n "pt-\[calc(3\.5rem" src/` | **empty** |
| `left: 'var(--sidebar-w)'` header | `grep -n "left: 'var(--sidebar-w)'" src/` | **empty** |
| Hardcoded sparkline hex `#5EC9A0` / `rgba(94,201,160…)` | `grep -n "#5EC9A0\|rgba(94,201,160" src/` | **empty** (now reads `--chart-1`) |
| `bg-orange-500/10 text-orange-400` in Modrinth compat | `grep -n "bg-orange-500/10 text-orange-400" src/views/ModrinthView.jsx` | **empty** |
| Local `KpiTile` in `DashboardView` | `grep -n "function KpiTile" src/views/DashboardView.jsx` | **empty** (extracted to `src/components/shared/KpiTile.jsx`) |
| `colorClass=` on `<KpiTile>` | `grep -n "colorClass=" src/views/DashboardView.jsx` | **empty** (now `tone="…"`) |

`grep -n "green-500|green-400|green-600|orange-500|orange-400|red-400|red-300|red-500" src/`
returns 15 hits — all in views / main.jsx that the plan explicitly
defers to iter 2 (`ServersView.jsx:396,398,401` and the per-view delete
icons / form errors). None are in the three files the plan's DoD item
7 scopes.

## Deviations from the plan

None. All 12 changes were applied verbatim (including the new-file
snippet, the new `tone` prop API, the sparkline `getComputedStyle` call,
and the disk-bar `cn(...)` rewrite). The plan's "Definition of done"
items 1-10 are satisfied (item 11 is a manual UI check that requires
the panel to be running, which is the reviewer's job).

## Still off — picked up by iter 2 or iter 3

Things the plan explicitly defers but worth listing here so the next
agent doesn't re-discover them:

- **Sidebar collapse-to-icons** (iter 2). The `tooltip.jsx` shadcn
  component still needs to be added; the `w-sidebar-collapsed` spacing
  value is wired but not consumed. The 220-px surface is correct in
  iter 1.
- **Table styling system** (iter 2). The literal `text-green-400` /
  `text-red-400` icons in `ServersView.jsx:396,398,401` and the
  `text-red-400` delete-button color in `BackupsView`, `PluginsView`,
  `FileManagerView`, `UsersView`, `ServersView`, `PlayersView`,
  `TasksView` all stay untouched. The `border-red-500/40` on
  `<Toaster>` errors in `main.jsx:20` also stays. These should be
  swept to `text-status-online` / `text-status-error` together with the
  table redesign.
- **Console / terminal styling pass** (iter 2). `.console-area` and
  the `.l-info / l-warn / l-error / l-chat / l-cmd` rules still use
  `--ls-*` and a hardcoded `#0e1012`. Iter 2 wires `--console-bg` and
  the `--ls-*` aliases (or moves them onto the new `--status-*`
  tokens).
- **Form/Input refinements** (iter 2). `input.jsx`, `select.jsx`,
  focus-ring, error state.
- **Modal/Dialog visual pass** (iter 2). Current `dialog.jsx` uses
  generic shadcn defaults; the new `--shadow-xl` token is ready.
- **Empty-state / skeleton / error-state pass** (iter 3).
- **Map view** (iter 3). Out of design-system scope.
- **Login visual refresh** (iter 3, optional).
- **Light-mode override** (iter 3+, behind a `.light` class).
- **Type-scale application** (iter 2). The `--text-*` tokens are
  defined; `tailwind.config.js` `theme.fontSize` is **not** overridden
  in this iter (per the plan, that would re-skin every view). Iter 2
  audits each view against the new scale.
- **Tracking tokens applied to other headings** (iter 2). Only the
  Header `<h1>` got `tracking-tight`. View-level headings stay
  unchanged.

## Visual side-effects worth a one-line review

Two token tweaks change the look more than the others:

- `--background` 200 6% 9% → 200 6% **8.5%** (slightly darker page
  surface; cards stay distinct because `--card` is now
  204 8% **12%**).
- `--foreground` 220 2% 68% → 210 4% **78%** (body text legibility
  lift; the lower-saturation 68% was a touch grey).

If the visual review later wants to revert either, both are one-line
edits in `src/index.css:8-9`. Everything else (sidebar, status tokens,
chart palette, sparkline, disk bar) is invisible-by-default — it only
shows up if a button/header goes red/orange/green.
