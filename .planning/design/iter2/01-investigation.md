# Iter 2 — Investigation Report (Components & Density)

> Agent A (Iteration 2, Stage 1) — design investigation for the
> post-foundation pass. Covers the eight in-scope areas from the brief:
> Console view, table sweep, forms/inputs, dialogs/modals,
> empty/loading/error, sidebar collapse, type-scale wiring, and the
> login view. Investigation only — no source code is modified here.

## Already shipped (do not re-propose)

These landed in iter 1 and are the foundation this iteration builds on.
Re-shipping any of them is out of scope. See
`.planning/design/iter1/{01-investigation,02-feasibility,03-implementation,04-review}.md`.

- **Token system** in `:root` (`src/index.css:6-103`): `--background /
  --card / --popover / --secondary / --muted / --accent /
  --destructive`, plus `--status-{online,warn,offline,error}`,
  `--chart-1..5`, full `--radius-{sm,md,lg,xl,2xl,pill}`,
  `--shadow-{xs,sm,md,lg,xl}`, `--ease-{out,in,in-out,spring}`,
  `--duration-{fast,base,slow}`, type scale `--text-{xs,sm,base,md,lg,xl,2xl}`
  and `--tracking-{tight,normal,wide}`. The `--ls-{green,red,orange,accent,
  accent-dim,accent-glow}` aliases are intentionally kept for the Console
  view (`src/index.css:96-101`).
- **Tailwind wiring** in `tailwind.config.js:62-105`: `colors.{status,
  chart, sidebar}` with `<alpha-value>`, `borderRadius.{sm,md,lg,xl,
  2xl,pill}`, `boxShadow.{xs,sm,DEFAULT,md,lg,xl}`, `spacing.{sidebar,
  sidebar-collapsed}`.
- **Page shell** (`src/App.jsx:136-153`): `flex min-h-screen` row with
  `Sidebar` + flex-col right column; Header is `sticky top-0` (no more
  `position: fixed` / `left: var(--sidebar-w)`).
- **Sidebar** (`src/components/layout/Sidebar.jsx:76-126`): `w-sidebar
  bg-sidebar border-sidebar-border`; active item has `border-l-2
  border-l-primary bg-primary/10`; group labels at `text-[10px] uppercase
  tracking-widest text-muted-foreground/70`; per-group collapse persisted
  in `ls-collapsed-navs`.
- **Header** (`src/components/layout/Header.jsx:20-29`): `sticky top-0
  z-40 bg-background/80 backdrop-blur-sm`; title `text-sm font-semibold
  tracking-tight`.
- **KpiTile** extracted to `src/components/shared/KpiTile.jsx` with a
  typed `tone` prop (`online | warn | error | primary | neutral`) that
  drives both the left border and the icon-box tint.
- **Sparkline** (`src/views/DashboardView.jsx:11-38`) reads `--chart-1`
  at draw time; disk-bar thresholds at `DashboardView.jsx:174-179` use
  `bg-status-error / bg-status-warn / bg-primary`.
- **StatusPill / StatusDot / Badge / Button** tokenized: `green-500/10`
  etc. swept to `status-*` tokens in
  `src/components/shared/StatusPill.jsx:3-37`,
  `src/components/ui/badge.jsx:9-17`, `src/components/ui/button.jsx:13-26`.
- **Modrinth compat pill** at `src/views/ModrinthView.jsx:69` now uses
  `bg-status-warn/10 text-status-warn border-status-warn/25`.

## Scope reminder

Backend is out of scope. No new dependencies. This iteration is the
"components & density" pass: the same data, but the surfaces it lives on
(console, tables, forms, modals, sidebar) become coherent, accessible,
and token-consistent.

---

## 1. Console view

### Inspiration sources

- **shadcn/ui Table (registry new-york-v4)** — https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/table.tsx
  Establishes the precedent that even log-shaped content benefits from a
  primitive (a 2-col "table" of timestamp + body) and that dense
  monospaced rows are best rendered as **block elements**, not `<span>`s
  with literal `'\n'` (the current approach in `ConsoleView.jsx:90-96`,
  which breaks alignment, prevents per-column styling, and prevents
  click-to-copy on the timestamp).
- **Dribbble — Terminal Logs** — https://dribbble.com/search/terminal-logs
  The pattern that wins: monospaced body, 1-px left or right
  severity indicator bar (3-px wide), dimmed timestamp column on the
  left (`text-muted-foreground/40`), severity color in the gutter or the
  first non-whitespace word.
- **Sentry Issue Details log lines** — https://sentry.io/welcome/ —
  1000+ lines, no virtualization, plain `<div>` per row at
  `line-height: 1.5`, monospaced, 12.5–13 px. This is the density we
  want; if Sentry can do 1000s un-virtualized we don't need
  `react-window` at 1200 lines.
- **Tailwind v3 docs — customizing font family** — https://v3.tailwindcss.com/docs/font-family
  Confirms the existing mono stack
  (`SF Mono / JetBrains Mono / Cascadia Code / Consolas`) is appropriate
  for terminal output. Keep it.

### Concrete ideas

1. **Render lines as block elements, not `<span>`s with `'\n'`.** Today
   `ConsoleView.jsx:90-96` is a single `<div class="console-area">`
   containing `<span class="l-...">{line.text}{'\n'}</span>` repeated.
   Move to a per-line structure so we can style timestamp and body
   independently and align them in columns.

2. **Layout per line** (CSS Grid, 3 columns, fixed gutter + ts + body):

   ```jsx
   <div className="grid grid-cols-[6px_72px_1fr] gap-x-3 items-start">
     <span className="h-full w-[3px] self-stretch rounded-full bg-{level} mt-1.5" />
     <span className="text-muted-foreground/40 tabular-nums select-none">{ts}</span>
     <span className={`l-${level} whitespace-pre-wrap break-words`}>{line.text}</span>
   </div>
   ```

   - Column 1 (6 px): a 3-px vertical severity bar. Defaults to
     transparent (`bg-transparent`) when `level` is empty. When set,
     uses `bg-status-online / bg-status-warn / bg-status-error /
     bg-primary` per the existing `--ls-*` aliases. Centralises the
     signal in the gutter (Dribbble reference).
   - Column 2 (72 px): timestamp formatted as `HH:MM:SS.mmm`, in
     `font-mono text-muted-foreground/40 tabular-nums`. Fixed width so
     the body column is perfectly aligned regardless of message length.
   - Column 3 (1 fr): the line text in
     `font-mono text-[12.5px] leading-[1.55] whitespace-pre-wrap
     break-words`. `break-words` is more forgiving than the current
     `word-break: break-all` (`src/index.css:135`), which breaks
     inside long paths and identifiers. Switch to `overflow-wrap:
     anywhere` only for plain lines that need it.

3. **Add timestamps to lines that don't have them.** The backend
   (`server.js` console frames) sends `{ text, level }` without a
   timestamp. The WebSocket `line` frame in `useWebSocket` doesn't
   stamp one either. Either (a) parse `HH:MM:SS` out of the line
   itself (most Minecraft logs start with `[12:34:56] [INFO] ...`),
   or (b) stamp on receive in `App.jsx`'s `onLine` callback
   (`App.jsx:74-77`) and add a `_ts` field. **(b)** is cleaner — one
   line: `_ts: msg.ts || Date.now()` — and is what we recommend.

4. **Level colorization** — keep the existing
   `.l-info / .l-warn / .l-error / .l-chat / .l-cmd` rules in
   `src/index.css:142-147` (the `--ls-*` aliases are there on purpose).
   Add two more:
   - `.l-stack` (multi-line exception traces, currently unstyled) →
     `color: hsl(var(--muted-foreground) / 0.55); font-style: italic;`
   - `.l-system` (the `Done (Xs)!` ready line) →
     `color: hsl(var(--primary)); font-weight: 600;`

5. **Severity filter pills** — strip of small toggles above the log
   area, the same shape as `badge.jsx` but interactive:

   ```jsx
   <div className="flex items-center gap-1.5 px-4 pt-3 pb-2">
     {['all', 'error', 'warn', 'info', 'cmd'].map(level => (
       <button key={level}
         onClick={() => toggleFilter(level)}
         className={cn(
           'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide border transition-colors',
           active
             ? level === 'error' ? 'bg-status-error/10 text-status-error border-status-error/20'
             : level === 'warn'  ? 'bg-status-warn/10 text-status-warn border-status-warn/20'
             : level === 'info'  ? 'bg-status-online/10 text-status-online border-status-online/20'
             : 'bg-primary/15 text-primary border-primary/25'
             : 'bg-transparent text-muted-foreground border-border hover:bg-secondary'
         )}>
         {level} <span className="tabular-nums opacity-60">{count[level] ?? ''}</span>
       </button>
     ))}
   </div>
   ```

   State lives in `useState`; `displayLines` is `lines.filter(matches)`.
   Per-line count is cheap (a single `reduce` over the last 1200 lines
   on each render is sub-millisecond). The `all` pill is the default
   and shows the total count.

6. **Virtualization — do not add.** Current `MAX_LINES = 1200`
   (`ConsoleView.jsx:21`). At ~20 px per row + the existing 62 vh
   container, that's ~30 visible rows out of 1200. 1200 plain
   `<div>`s is well under any rendering budget. The
   `[...prev, msg.line].slice(-1200)` in `App.jsx:76` already
   caps memory. If we ever raise MAX_LINES to 10000+ we can revisit
   with a hand-rolled window (the `useRef` + `IntersectionObserver`
   pattern), but the brief says "no new dependencies" and the
   hand-roll is ~80 lines of state. Defer to iter 3 if needed.

7. **Container background → token.** Replace
   `background: #0e1012` at `src/index.css:136` and
   `bg-[#0e1012]` at `ConsoleView.jsx:98, 179, 57` (file editor
   textarea) with `--console-bg`. Add the token to `:root` at
   `src/index.css:6-103`:

   ```css
   --console-bg: 200 10% 5%;
   /* one shade deeper than --background (8.5%) — gives the log
      stream a subtle "stage" that reads as a different surface
      without needing a visible border */
   ```

   Then `.console-area { background: hsl(var(--console-bg)); }` and
   `bg-console-bg` (after wiring it in `tailwind.config.js:28`
   alongside `background`).

8. **New tokens** (add to `:root`):

   ```css
   --log-info:    156 46% 58%;   /* same hue as --primary; for "info" level */
   --log-warn:    33  80% 56%;   /* matches --status-warn */
   --log-error:   352 70% 60%;   /* matches --status-error */
   --log-cmd:     199 80% 60%;   /* matches --chart-2 — distinct from info */
   --log-chat:    280 50% 70%;   /* purple, distinct from the rest */
   --log-muted:   210 4% 56%;
   ```

   These mirror the existing `--ls-*` aliases. We add the `--log-*`
   pair so future views (a future "audit log" view, the per-player
   chat replay) can reuse the same level palette without going
   through `--ls-*` which were intentionally scoped to the console
   area. Add `<alpha-value>`-friendly Tailwind entries in
   `tailwind.config.js:28`:
   `log: { info: 'hsl(var(--log-info) / <alpha-value>)', ... }`.

9. **Autoscroll polish** — keep the "near bottom" detection at
   `ConsoleView.jsx:33` but reduce the threshold from 120 px to 64 px
   so a 3-line jump at the bottom doesn't fail to trigger. Also: when
   the user scrolls up, hide the autoscroll checkbox and replace it
   with a small "↓ Jump to live" button at the bottom-right of the log
   area (a 28-px circle, `bg-primary/20 text-primary`, lucide
   `ArrowDown`).

10. **Command input** at `ConsoleView.jsx:98-113` — keep the shape
    (mono input + `>` glyph + Send button), but:
    - Replace `bg-[#0e1012]` with `bg-console-bg`.
    - Replace the raw `<input>` (which is invisible to the `Input`
      primitive) with the existing `<Input className="font-mono
      border-0 bg-transparent focus-visible:ring-0 h-7" />` from
      `src/components/ui/input.jsx`. We get consistent focus
      behavior for free.
    - The `>` glyph: change from `text-primary` to
      `text-status-online` (the success accent) so it reads as a
      prompt indicator, not a brand mark.
    - The Send button: switch to `variant="default" size="xs"` (it
      already is). Add a keyboard hint: `text-[10px]
      text-muted-foreground/50` reading `Enter` to the right of the
      button on `sm:` and up.

### Specific token additions

- `--console-bg`, `--log-info / -warn / -error / -cmd / -chat /
  -muted` (all HSL components, no alpha).
- Tailwind: `colors.console = 'hsl(var(--console-bg))'`,
  `colors.log.{info,warn,error,cmd,chat,muted}` with `<alpha-value>`.

### Specific file targets

- `src/index.css:130-147` — refresh `.console-area` rules, add
  `.l-stack` and `.l-system`.
- `src/views/ConsoleView.jsx:21-114` — restructure render to
  per-line grid, add severity filter pills, change container
  background to `bg-console-bg`, add "Jump to live" button.
- `src/App.jsx:74-77` — stamp `_ts: msg.ts || Date.now()` on receive.

---

## 2. Table styling

### Inspiration sources

- **shadcn/ui Table** — https://ui.shadcn.com/docs/components/table +
  https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/table.tsx
  The canonical primitive composition: `Table / TableHeader / TableBody
  / TableFooter / TableHead / TableRow / TableCell / TableCaption`. The
  current codebase has none of these; every view rolls its own rows.
  That's the smell to fix.
- **Dribbble — Table Dark UI** — https://dribbble.com/search/table-dark-ui
  The wins: 1-px row dividers (`border-b border-border/60` — softer
  than the current `border-border` at `ServersView.jsx:369, 354`),
  hover tint `hover:bg-muted/40` (slightly more visible than the
  current `hover:bg-secondary/40`), monospace for IDs/paths/dates
  (`font-mono text-xs tabular-nums`), right-aligned numeric columns
  with `text-right tabular-nums`, sticky header at
  `sticky top-0 bg-card/95 backdrop-blur-sm` (the new
  `--shadow-xs` sits under the sticky line).
- **Linear app — Issues table** — https://linear.app
  Linear's table is the gold standard for ops-panel density: 32-px row
  height (their `py-2`), `text-[13px]` body, `text-muted-foreground`
  for secondary columns, status pill inline. Their header is
  `text-[11px] uppercase tracking-wider text-muted-foreground/60` —
  exactly the pattern already used in the header rows at
  `ServersView.jsx:354` and `MetricsView.jsx:138`. Confirm and
  standardise.
- **Vercel — Activity log table** — https://vercel.com/docs/activity-log
  Vercel uses a single `border-y border-border` on the table itself
  and `border-b border-border/60` per row. Cleaner than 1-px
  border-around-card-and-rows.

### Concrete ideas

1. **New primitive: `src/components/ui/table.jsx`** (shadcn-style,
   70 lines, one file). Mirrors the shadcn `Table` family but with
   the iter-1 token set:

   ```jsx
   function Table({ className, ...props }) {
     return (
       <div data-slot="table-container"
            className="relative w-full overflow-x-auto">
         <table data-slot="table"
                className={cn('w-full caption-bottom text-sm', className)}
                {...props} />
       </div>
     );
   }
   function TableHeader({ className, ...props }) {
     return <thead data-slot="table-header"
                   className={cn('[&_tr]:border-b border-border/60', className)}
                   {...props} />;
   }
   function TableBody({ className, ...props }) {
     return <tbody data-slot="table-body"
                   className={cn('[&_tr:last-child]:border-0', className)}
                   {...props} />;
   }
   function TableFooter({ className, ...props }) {
     return <tfoot data-slot="table-footer"
                   className={cn('border-t bg-muted/40 font-medium', className)}
                   {...props} />;
   }
   function TableRow({ className, ...props }) {
     return <tr data-slot="table-row"
                className={cn(
                  'border-b border-border/60 transition-colors',
                  'hover:bg-muted/40 data-[state=selected]:bg-muted/60',
                  className)}
                {...props} />;
   }
   function TableHead({ className, ...props }) {
     return <th data-slot="table-head"
                className={cn(
                  'h-9 px-3 text-left align-middle font-semibold',
                  'text-[10.5px] uppercase tracking-wider text-muted-foreground',
                  '[&:has([role=checkbox])]:pr-0', className)}
                {...props} />;
   }
   function TableCell({ className, ...props }) {
     return <td data-slot="table-cell"
                className={cn(
                  'px-3 py-2.5 align-middle text-sm',
                  '[&:has([role=checkbox])]:pr-0', className)}
                {...props} />;
   }
   function TableCaption({ className, ...props }) {
     return <caption data-slot="table-caption"
                     className={cn('mt-4 text-sm text-muted-foreground', className)}
                     {...props} />;
   }
   ```

   - 9 named exports, 70 lines, no deps beyond `cn`.
   - Sticky header is opt-in: `<TableHeader sticky>` would add
     `[&_tr]:sticky [&_tr]:top-0 [&_tr]:bg-card/95
     [&_tr]:backdrop-blur-sm [&_tr]:z-10`. (The current `ServersView`
     table is the only one with long enough content to need it; we
     opt-in per view rather than pay the backdrop cost everywhere.)
   - `data-slot` is the shadcn convention for queryable nodes; we
     don't use it now but it costs nothing and unblocks future
     shadcn-derived components.

2. **Cell padding scale** — three sizes (px = 12, py = 10) are
   baked into the primitive; per-view overrides via
   `className="px-2 py-1.5"` for dense tables (UsersView, TasksView)
   or `className="px-4 py-3.5"` for comfortable tables (the wide
   ServersView). Recommended defaults:
   - **Dense** (≤ 5 cols, small body text, all-mono): `px-2.5
     py-2`. Used in UsersView, TasksView, BackupsView.
   - **Default** (mixed content): `px-3 py-2.5`. Used in
     ServersView, MetricsView, ModrinthView, FileManagerView (rows
     that aren't folders).
   - **Comfortable** (icon + 2-line content): `px-3.5 py-3`. Used in
     BackupsView header rows, FileManagerView folder rows.

3. **Row height** — the primitive defaults to 40 px (py-2.5 + ~14-px
   text + line-height). For "tall" rows (icon + 2 lines of body) the
   per-view `<TableRow className="h-16">` overrides. The existing
   patterns:
   - `ServersView.jsx:369` row (icon + name + dir, 2 lines): 64 px
     effectively — keep, but via `<TableRow>` with
     `<TableCell className="py-3">` and a `min-h-[64px]` on the row.
   - `BackupsView.jsx:71-86` row (name + size/date, 2 lines): 52 px
     via `py-2.5`. The new `<TableRow>` defaults to 40 px; add
     `className="h-[52px]"` per row.
   - `TasksView.jsx:163-186` row: 52 px. Same treatment.
   - `PluginsView.jsx:64-72` row: 40 px (single line). Default.
   - `ModrinthView.jsx:115-138` row: card-style with icon, title,
     description, stats. 80 px. `className="h-20"`.
   - `FileManagerView.jsx:120-162` row: 40 px default; folders get
     a slight tint `bg-secondary/20` (already used).

4. **Sticky header** — opt-in. The ServersView table benefits most.
   Implementation: pass `sticky` to `<TableHeader>` (or just
   `className="[&_tr]:sticky [&_tr]:top-0 [&_tr]:bg-card/95
   [&_tr]:backdrop-blur-sm [&_tr]:z-10"`). When the table lives
   inside a `Card`, the sticky `top-0` resolves to the card's scroll
   container, not the page — which is what we want (the header sticks
   to the card top during internal scroll, the page scrolls behind
   it).

5. **Monospace for paths / IDs / dates** — add a `font-mono
   text-[12.5px] tabular-nums text-muted-foreground` helper class
   for cells that display file paths, server IDs, byte counts, or
   timestamps. Concretely:
   - `ServersView.jsx:382` (`{s.dir}`) →
     `className="font-mono text-xs text-muted-foreground/70 truncate max-w-[180px]"`.
   - `FileManagerView.jsx:110` (`/{path}`) → already mono, drop the
     inline override once the breadcrumb is rewrapped.
   - `FileManagerView.jsx:137` (size · date) → wrap in a single
     `<span className="font-mono text-xs text-muted-foreground">`.
   - `BackupsView.jsx:74` (size · date) → same.
   - `TasksView.jsx:171` (cron expression) → wrap in a `<code>`
     with `rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]`.
   - The `<code>` chip at `BackupsView.jsx:63` already follows this
     pattern; replicate.

6. **Sort indicator** — out of scope (no view currently sorts).
   Stub the `<TableHead>` for it: add a `sortable` prop that renders
   a `ChevronUp` / `ChevronDown` (lucide) at 12 px, `text-muted-
   foreground/40` when inactive, `text-foreground` when active. No
   call sites in this iteration; the prop is reserved for the future
   metrics / players sort work.

7. **Empty state integration** — when `data.length === 0` the
   primitive's `<TableBody>` is empty. Add a sibling below the
   table: a single `<TableRow><TableCell colSpan={n}
   className="h-24 text-center text-sm text-muted-foreground/70
   italic">No items yet.</TableCell></TableRow>`. (Or just keep
   using `<EmptyState>` outside the table — the per-view call sites
   already do this. No primitive change needed.)

8. **Specific file targets** (each view is a mechanical
   conversion):

   | File | Current | New |
   |---|---|---|
   | `ServersView.jsx:351-409` | inline `<table>` | `<Table>` family |
   | `FileManagerView.jsx:113-166` | flat `div` rows | `<Table>` family; folders get `<TableRow className="cursor-pointer">` |
   | `BackupsView.jsx:68-88` | flat `div` rows | `<Table>` family |
   | `TasksView.jsx:160-186` | flat `div` rows | `<Table>` family |
   | `UsersView.jsx:111-136` | flat `div` rows | `<Table>` family |
   | `PluginsView.jsx:62-74` | flat `div` rows | `<Table>` family |
   | `ModrinthView.jsx:111-141` | flat `div` cards | keep as cards (not a tabular layout) OR `<Table>` with a wide `Title` cell — defer the call to the implementer |

   The Plugins/Users/Tasks/Backups rows are 1-line each and benefit
   the most from a real table (vertical alignment of actions, even
   row heights, easy to add columns later).

9. **Replace the inline `text-red-400` delete-button colour** in
   the new table rows with the destructive button variant. The
   current 7 sites (Backups, Plugins, Servers, Users, Tasks,
   FileManager, Players) all use
   `text-red-400 hover:text-red-300 hover:bg-red-400/10` — replace
   with the existing `<Button variant="destructive" size="icon-xs">`
   in `button.jsx:13-14` (which is `bg-destructive/15
   text-status-error border border-destructive/40 ...`).
   - Sites: `BackupsView.jsx:81`, `PluginsView.jsx:67`,
     `ServersView.jsx:401`, `UsersView.jsx:127`, `TasksView.jsx:179`,
     `FileManagerView.jsx:157`, `PlayersView.jsx:52`.
   - ServersView also has start (`text-green-400` at `:396`) and
     stop (`text-red-400` at `:398`) icons. Replace with
     `<Button variant="ghost" size="icon-xs" className="text-status-online
     hover:text-status-online" disabled={running}>` for start, and
     `text-status-error hover:text-status-error` for stop. The
     `text-red-400` and `text-green-400` literals all move to
     status tokens.

---

## 3. Forms & inputs

### Inspiration sources

- **shadcn/ui Form (proposed) + Field** — https://ui.shadcn.com/docs/components/field
  The "Field" primitive is exactly what the codebase needs: a
  `<Field>` that wraps `<Label> + <Control> + <Description> +
  <ErrorMessage>` with consistent spacing. The shadcn docs are clear
  on the gap pattern: `space-y-2` between label and control, helper
  text in `text-xs text-muted-foreground`, error in
  `text-xs text-status-error`. The shadcn form layout is the
  reference; we adopt the *pattern* (label, control, optional
  helper, optional error) without the React Hook Form dependency.
- **Refactoring UI — Forms chapter** — https://refactoringui.com
  The "form" rules: every input has a label (no placeholder-only
  fields), labels live above the control (not beside — beside
  breaks vertical scan), required fields have a visible `*` in
  `text-status-error`, error text lives *below* the control in
  `text-xs` (current code at
  `ServersView.jsx:180, 294`, `TasksView.jsx:101`,
  `UsersView.jsx:59` does this — keep, just tokenize the colour).
- **Tremor — Standard Forms block** — https://www.tremor.so/blocks/form-layouts
  Tremor's form layout is the closest public template: 4-px label
  gap, `h-9` input height, `h-7` for the dense cron preset chips
  in `TasksView.jsx:88-93`. Confirms the existing `h-9` input
  height in `input.jsx:9` is the right choice.

### Concrete ideas

1. **New wrapper: `src/components/ui/field.jsx`** (~40 lines).
   Mirrors shadcn's Field primitive but with the iter-1 token set
   and no RHF dependency:

   ```jsx
   function Field({ label, description, error, required, children, className }) {
     return (
       <div className={cn('space-y-1.5', className)}>
         {label && (
           <Label className="flex items-center gap-1">
             {label}
             {required && <span className="text-status-error">*</span>}
           </Label>
         )}
         {children}
         {description && !error && (
           <p className="text-[11px] text-muted-foreground">{description}</p>
         )}
         {error && (
           <p className="text-[11px] text-status-error flex items-center gap-1.5">
             <AlertCircle className="h-3 w-3" />
             {error}
           </p>
         )}
       </div>
     );
   }
   ```

   - 40 lines, two props (`error` overrides `description` visually).
   - The `<Label>` is the existing one from `label.jsx:5-15`; the
     wrapper just stacks label / control / message with consistent
     6-px (`space-y-1.5`) gap.
   - Required `*` in `text-status-error` (not the destructive
     `bg-destructive/15 text-status-error` button background) — a
     single character colour is enough.
   - 14 form fields across 4 modals (ServersView `ServerModal`,
     `CreateServerModal`; UsersView `UserModal`; TasksView
     `TaskModal`; the File editor dialog has 0 form fields; the
     LoginView has 2) all convert to `<Field>` in iter 2.

2. **Tokenize the 8 raw `<select>` instances.** Every occurrence
   in the codebase uses the same hand-rolled class string:
   `flex h-9 w-full rounded-md border border-input bg-background/60
   px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50`.
   The string lives at:
   - `ServersView.jsx:158-164` (Server jar select)
   - `ServersView.jsx:259-264` (Type select in CreateServerModal)
   - `ServersView.jsx:268-272` (MC version select)
   - `TasksView.jsx:63-66` (Server select)
   - `TasksView.jsx:70-75` (Action select)
   - `ModrinthView.jsx:78-88` (Sort select)
   - `ModrinthView.jsx:89-98` (Category select)
   - `ConfigsView.jsx:41-47` (File select)

   The two natural options:
   - **(a) Replace each raw `<select>` with a Radix
     `<SelectTrigger>` (the existing `select.jsx:11-26`).** The
     Radix Select is more accessible (keyboard, typeahead) but
     renders its own trigger UI and doesn't style a native
     `<select>` for you. Each call site would need
     `<Select><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>...`
     wrapping. ~5 lines per call site. 8 call sites = ~40 lines
     changed.
   - **(b) Add a `<NativeSelect>` wrapper** that exposes the same
     API as `Input` but renders a native `<select>` with the
     correct styles. ~15 lines, one file
     (`src/components/ui/native-select.jsx`). Each call site
     changes from a 1-line class string to `<NativeSelect
     options={[{value,label}]} value={...} onChange={...} />`.

   **Recommendation: (b).** The Modrinth and Configs selects are
   informational (no search/filter), the Type / MC version selects
   are short (≤60 options per the backend cap at
   `ServersView.jsx:225`), and native `<select>` keeps mobile
   pickers. (a) is more accessible but adds complexity; defer to
   iter 3 unless we have evidence the native picker is failing
   users.

3. **NativeSelect API** (proposed):

   ```jsx
   function NativeSelect({ options, value, onChange, placeholder, className, ...props }) {
     return (
       <select
         value={value ?? ''}
         onChange={onChange}
         className={cn(
           'flex h-9 w-full items-center rounded-md border border-input',
           'bg-background/60 px-3 py-2 text-sm text-foreground',
           'focus:outline-none focus:ring-2 focus:ring-ring/50',
           'disabled:cursor-not-allowed disabled:opacity-50',
           className
         )}
         {...props}
       >
         {placeholder && <option value="" disabled>{placeholder}</option>}
         {options.map(o => (
           <option key={o.value} value={o.value}>{o.label}</option>
         ))}
       </select>
     );
   }
   ```

   - Each of the 8 sites is a 1-for-1 swap. The "Jars here:"
     special case at `ServersView.jsx:64-66` (mixed display) can
     keep its inline `<select>`.
   - The 2 Cron preset chips at `TasksView.jsx:88-95` are not
     `<select>` — they're toggle buttons. The shape
     (`rounded px-2 py-0.5 text-xs border border-border
     bg-secondary/50 ...`) is shared with the severity filter
     pills from Section 1. **Extract to `src/components/ui/chip.jsx`**
     with CVA variants: `variant: 'default' | 'active'`,
     `size: 'xs' | 'sm'`. The cron-preset site uses `<Chip
     active={form.cron === p.cron} onClick={...}>{p.label}</Chip>`;
     the console severity filter uses `<Chip active={filter[level]}
     onClick={...}>{level}</Chip>`. Same component.

4. **Input height consistency.** All `<Input>` use `h-9` (36 px). All
   `<NativeSelect>` use `h-9` (36 px). The dense `<Input
   className="h-8 text-xs">` at `PlayersView.jsx:73` and
   `ConfigsView.jsx:42` is the one exception — keep it (a
   consistent 28-px dense size is fine, but we don't need a
   primitive for it; the inline override works).

5. **Label placement** — always above the control, never to the
   left. Current code is consistent on this; the
   `PlayersView.jsx:181-184` checkbox-row is the only horizontal
   label (which is correct for inline checkbox UX). Add a
   `Checkbox` row helper:
   `<div className="flex items-center gap-2 text-sm
   text-muted-foreground"><Checkbox id="..."
   checked={...} onCheckedChange={...} /><Label
   htmlFor="...">Enabled</Label></div>`. The `<Label>` in
   `label.jsx:5-15` is hardcoded `uppercase tracking-wider`; that
   doesn't read for inline checkbox labels. The fix: pass
   `className="normal-case tracking-normal text-sm text-muted-
   foreground font-normal"` at the call site (ConsoleView
   `Autoscroll` checkbox at `:84` already does this; copy the
   pattern).

6. **Required indicator** — the LoginView `<Input required>` at
   `:62, 69` is implicit (browser default). The browser-rendered
   tooltip is a poor substitute for a visible `*`. Add the
   `required` prop to `<Field>` (item 1) and use it on the
   password / cron fields in TasksView (`cron` is required for a
   schedule to be useful; `enabled` is always on by default).
   Email/Name on UserModal are optional — keep blank.

7. **Error text style** — replace
   `text-red-400` at `ServersView.jsx:180, 294`,
   `TasksView.jsx:101`, `UsersView.jsx:59`, `LoginView.jsx:72`
   with `text-status-error` (the tokenized colour). Add a
   3-px-wide left border in `border-l-2 border-l-status-error`
   to make the error block read as a banner; wrap in a
   `<div className="rounded-md border border-status-error/30
   bg-status-error/5 px-3 py-2 text-xs text-status-error">`.

8. **Helper text** — add to the File editor dialog at
   `FileManagerView.jsx:172-187` ("Edits are saved with a .bak
   backup. Revert manually if needed.") and the Login card
   (subtle "Forgot your password? Ask the admin who set up
   Lodestone."). Use `<Field description="...">` for these.

9. **Specific file targets**:
   - **New**: `src/components/ui/field.jsx`,
     `src/components/ui/native-select.jsx`, `src/components/ui/chip.jsx`.
   - **Refactor**: `ServersView.jsx` (3 modals), `TasksView.jsx`
     (TaskModal + cron chips), `UsersView.jsx` (UserModal),
     `LoginView.jsx`, `PluginsView.jsx` (no modal but uses
     `<Input>` for plugin file size — keep), `ConfigsView.jsx`
     (the file select).

---

## 4. Dialogs & modals

### Inspiration sources

- **shadcn/ui Dialog** — https://ui.shadcn.com/docs/components/dialog
  The current `dialog.jsx` is already a shadcn port. The shadcn docs
  add two refinements the current primitive lacks: (a) `showCloseButton`
  prop to hide the X, and (b) "Scrollable Content" pattern where
  the header sticks while the body scrolls. Both apply to Lodestone.
- **Tremor — Dialogs block** — https://www.tremor.so/blocks/dialogs
  Tremor's modal scale: 384 / 448 / 512 / 576 / 672 / 768 px max
  widths (`sm / md / lg / xl / 2xl / 3xl`). Maps cleanly to shadcn's
  `max-w-sm / -md / -lg / -xl / -2xl / -3xl`. Today the codebase
  uses only `max-w-sm / -md / -lg` and `max-w-3xl`
  (FileManagerView editor) — extend to `-xl` and `-2xl` for the
  larger flows.
- **Linear — Modal/dialog patterns** — https://linear.app
  Linear's modals have 8-px inner padding on the close button, a
  1-px top border on the footer (instead of the shadcn default
  `border-t`), and a `text-sm font-medium` title (we already do
  this at `dialog.jsx:62-67`). Confirm and standardize.

### Concrete ideas

1. **Refresh the `DialogContent` padding scale** at
   `src/components/ui/dialog.jsx:25-50`:
   - Header: `px-5 py-4 border-b` → `px-6 py-5 border-b border-border/60`
     (slightly more generous, softer border). Card primitives use
     `px-5 py-3` (line `:19`); aligning the dialog header to `py-5`
     makes large modals (ServersView ServerModal) read with the
     same vertical breathing room as a Card.
   - Body: `px-5 py-3` (where the consumer adds it; e.g.
     `ConfirmDialog.jsx:11`) → `px-6 py-5` for the same reason.
   - Footer: `px-5 py-4 border-t` → `px-6 py-4 border-t
     border-border/60`.
   - Replace the body content wrapper — currently every call site
     does `<div className="px-5 py-3 ...">` or `<div className="px-5
     py-4 space-y-4">` (`ServersView.jsx:42, 140, 250`,
     `TasksView.jsx:55`, `UsersView.jsx:46`,
     `FileManagerView.jsx:174`) — with a `DialogBody` primitive:

     ```jsx
     function DialogBody({ className, ...props }) {
       return <div className={cn('px-6 py-5', className)} {...props} />;
     }
     ```

     Added to `dialog.jsx` and exported. 5-line change, removes
     the duplicated `px-5 py-3` / `px-5 py-4` / `px-5 py-3`
     strings across 6 call sites.

2. **Shadow** — `DialogContent` uses `shadow-2xl` (`dialog.jsx:32`).
   The iter-1 token set defines `--shadow-xl` (12-line token
   definition at `src/index.css:72`). Replace `shadow-2xl` with
   `shadow-xl` to consume the new token. `2xl` was shadcn's
   default; the tokenized scale ends at `xl` (20/25 shadow with
   40% black on this palette). Visually almost identical.

3. **Max-width scale** — add four size variants to
   `DialogContent` (cva or simple `max-w-*` override at call
   site). Currently callers use `max-w-sm / -md / -lg / -3xl`
   (`ConfirmDialog.jsx:7` `max-w-sm`, `ServersView.jsx:40, 136,
   248` `max-w-md / -lg`, `FileManagerView.jsx:172` `max-w-3xl`).
   Standardize to:
   - **ConfirmDialog** (yes/no destructive): `max-w-sm` (384 px) — keep.
   - **ServerModal / CreateServerModal / TaskModal** (forms with 4-6
     fields): `max-w-md` (448 px) — keep.
   - **UserModal** (3-field simple form): `max-w-sm` (384 px) — keep.
   - **FileManagerView editor** (textarea, needs space): `max-w-3xl`
     (768 px) — keep.
   - **Modrinth install / large flows** (out of scope this iter, but
     reserve): `max-w-xl / -2xl` for future.

   No code change; the call sites are already right.

4. **Close-on-escape and focus trap** — already handled by Radix
   (`DialogPrimitive.Content` does focus trap; `DialogPrimitive`
   does escape). No change.

5. **Animation** — `data-[state=open]:animate-in
   data-[state=closed]:animate-out` plus the `fade-in-0 /
   zoom-in-95` etc. animations from `tailwindcss-animate`. The
   current `slide-in-from-left-1/2` / `slide-in-from-top-[48%]`
   (`dialog.jsx:36-37`) does a 200-ms slide from the center,
   which feels slow. Drop the slide and keep only the fade +
   zoom — `data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
   data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95`.
   Matches shadcn's docs example.

6. **Destructive variant** — `ConfirmDialog.jsx:4` already takes
   a `destructive` prop that swaps the confirm button to the
   destructive variant. The visual difference between the
   "destructive" confirm and a regular confirm is currently
   subtle (just the button colour). Add a left accent: when
   `destructive`, render the title with
   `className="flex items-center gap-2 text-sm font-semibold
   text-status-error"` and a small `<AlertTriangle
   className="h-4 w-4" />` before it. Used by ServersView
   (remove-server at `:430`), TasksView (delete-task via
   `window.confirm` — would become `ConfirmDialog` if migrated),
   UsersView (delete-user), FileManagerView (delete-file via
   `window.confirm` — same), BackupsView (delete-backup via
   `window.confirm` — same), PluginsView (delete-plugin — no
   confirm at all currently, just deletes — bug).
   - **Open question**: 4 view files use `window.confirm(...)` for
     destructive actions (`TasksView.jsx:136`, `UsersView.jsx:87`,
     `FileManagerView.jsx:55`, `BackupsView.jsx:44`). Migrating
     them to `<ConfirmDialog>` is a behaviour-equivalent change
     that lands in iter 2 — it removes the native browser dialog
     and gets us the styled destructive variant. PluginsView
     `:23-29` has no confirm at all — that's a real bug (deletes
     a plugin without confirmation); this iteration adds the
     confirm.

7. **Specific file targets**:
   - `src/components/ui/dialog.jsx:25-50` — shadow, padding,
     animation refresh; add `DialogBody` primitive.
   - `src/components/shared/ConfirmDialog.jsx:11` — use
     `DialogBody`; add `AlertTriangle` icon when destructive.
   - `src/views/ServersView.jsx:427-438` (confirmDelete dialog) —
     add `destructive` prop.
   - `src/views/TasksView.jsx:135-142` — replace `window.confirm`
     with `ConfirmDialog`.
   - `src/views/UsersView.jsx:86-93` — same.
   - `src/views/FileManagerView.jsx:54-60` — same.
   - `src/views/BackupsView.jsx:43-50` — same.
   - `src/views/PluginsView.jsx:23-29` — add `ConfirmDialog` (this
     is a behaviour fix, not just a token swap; mention in the
     plan).

---

## 5. Empty/loading/error states

### Inspiration sources

- **shadcn/ui Skeleton** — https://ui.shadcn.com/docs/components/skeleton
  + https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/skeleton.tsx
  The shadcn skeleton is 10 lines:
  `function Skeleton({ className, ...props }) { return <div data-slot="skeleton" className={cn('animate-pulse rounded-md bg-accent', className)} {...props} />; }`
  No complexity. The `bg-accent` is `--accent` in our token set
  (`199 60% 22%`, line 26 of `src/index.css`).
- **shadcn/ui Empty** — https://ui.shadcn.com/docs/components/empty
  The new shadcn Empty primitive is a 6-component composition
  (Empty / EmptyHeader / EmptyMedia / EmptyTitle / EmptyDescription
  / EmptyContent). It's overkill for us: our `<EmptyState>` at
  `src/components/shared/EmptyState.jsx` is one row of
  `text-sm text-muted-foreground/70 italic` with a 1.5-px dot. Two
  options: (a) keep `<EmptyState>` and add an icon prop; (b)
  import the shadcn Empty family. (a) is lighter and matches
  Lodestone's terse style.
- **Linear — empty list states** — https://linear.app
  Linear's empty list states are: a centered icon (24-28 px), a
  one-line title (`text-sm font-medium text-foreground`), and a
  one-line description (`text-xs text-muted-foreground`). The
  current `<EmptyState>` is one line — promote it to a 3-row
  variant and use it everywhere the data is empty.

### Concrete ideas

1. **New primitive: `src/components/ui/skeleton.jsx`** (10 lines,
   verbatim from shadcn, with `bg-accent` → `bg-muted` to read on
   the card surface — the `--accent` (`199 60% 22%`) is a teal and
   the shimmer would tint slightly blue. `bg-muted` is the neutral
   choice):

   ```jsx
   import { cn } from '@/lib/utils';
   function Skeleton({ className, ...props }) {
     return (
       <div
         data-slot="skeleton"
         className={cn('animate-pulse rounded-md bg-muted', className)}
         {...props}
       />
     );
   }
   export { Skeleton };
   ```

   - 10 lines, one file, no deps. Add `data-slot` for shadcn
     compatibility.
   - Two patterns to use it:
     - **Per-row** (a list loading): render N copies of
       `<Skeleton className="h-10 w-full" />` (or a row-shaped
       variant with two side-by-side Skeletons). Used in
       ServersView / UsersView / TasksView / BackupsView /
       PluginsView / FileManagerView.
     - **Block** (a single card loading): replace the card
       content with a few stacked Skeletons matching the
       card's typical content shape. Used in
       MetricsView (chart cards), DashboardView (KPI tiles),
       ConsoleView (log area).

2. **Per-view loading patterns** (where the current code does
   `if (loading) return <p>Loading…</p>`):

   - `ModrinthView.jsx:106` — replace with a centered
     `<Skeleton className="h-12 w-full" />` × 4 (matching the
     card-shaped search results). Plus a small
     `text-xs text-muted-foreground/60` "Searching Modrinth…"
     below.
   - `MetricsView.jsx:115-116` — wrap each card's
     `<CardContent>` in a `<Skeleton className="h-48 w-full" />`
     during the initial load (when `points.length === 0`).
   - `DashboardView.jsx` — the sparklines already handle
     "no data" gracefully (the canvas clears to
     `text-muted-foreground`). Leave as is.
   - `ServersView / UsersView / TasksView / BackupsView /
     PluginsView` — render 3 rows of
     `<Skeleton className="h-10 w-full mb-1.5" />` (or
     `<Skeleton className="h-12 w-full" />` for the 2-line rows
     in BackupsView / TasksView) during the initial fetch.

3. **Extend `EmptyState` to take an icon, title, and description.**
   Keep the current 1-line shape (backward-compatible) and add
   the new props:

   ```jsx
   function EmptyState({ icon: Icon, title, message, className }) {
     if (Icon || title) {
       return (
         <div className={cn(
           'flex flex-col items-center justify-center gap-2 py-10 text-center',
           className
         )}>
           {Icon && (
             <div className="flex h-10 w-10 items-center justify-center
                             rounded-full bg-muted text-muted-foreground">
               <Icon className="h-5 w-5" />
             </div>
           )}
           {title && <p className="text-sm font-medium text-foreground">{title}</p>}
           {message && <p className="text-xs text-muted-foreground/70 max-w-xs">{message}</p>}
         </div>
       );
     }
     return (
       <div className={cn('flex items-center gap-2 py-6 text-sm text-muted-foreground/70 italic', className)}>
         <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
         {message}
       </div>
     );
   }
   ```

   - The new variant mirrors Linear's pattern. The old 1-line
     variant is preserved for backward compatibility (existing
     7 call sites at `ServersView.jsx:349`, `BackupsView.jsx:67`,
     `TasksView.jsx:159`, `UsersView.jsx:110`, `PluginsView.jsx:60`,
     `PlayersView.jsx:32` (3 calls), and `MetricView.jsx`'s
     "No data yet" stay as-is).
   - Suggested icon mapping:
     - `ServersView`: `Server` icon, title "No servers yet", desc
       "Create or register a server to get started."
     - `BackupsView`: `Database` icon, title "No backups yet",
       desc "Click Backup now to make the first one."
     - `TasksView`: `Clock` icon, title "No scheduled tasks",
       desc "Add a task to run a command or restart on a cron
       schedule."
     - `UsersView`: `Users` icon, title "No users",
       desc "Add the first user to share access."
     - `PluginsView`: `Puzzle` icon, title "No plugins",
       desc "Upload a .jar or browse Modrinth."
     - `FileManagerView`: `FolderOpen` icon, title "Empty folder",
       desc "Upload files or create a new folder." (currently
       `FileManagerView.jsx:114` uses an inline `<p className="italic">`).
     - `ModrinthView`: `Package` icon when no results.
     - `MetricsView`: no data path — already shows "No data yet"
       in the chart canvas.

4. **Inline error banner** — new tiny primitive
   `src/components/ui/alert.jsx` (~30 lines, mirrors shadcn Alert):

   ```jsx
   function Alert({ variant = 'default', children, className, ...props }) {
     const tone = {
       default: 'bg-secondary text-secondary-foreground border-border',
       error:   'bg-status-error/10 text-status-error border-status-error/20',
       warn:    'bg-status-warn/10 text-status-warn border-status-warn/20',
       info:    'bg-primary/10 text-primary border-primary/20',
     }[variant];
     return (
       <div role="alert"
            className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs', tone, className)}
            {...props}>
         {children}
       </div>
     );
   }
   ```

   - Replaces the modal-level `<p className="text-xs
     text-status-error">` error lines (5 sites) with an
     `<Alert variant="error" className="mt-2"><AlertCircle
     className="h-3.5 w-3.5 mt-0.5" />{error}</Alert>`.
   - Also useful in card-level error states (currently the
     `BackupsView.jsx:65` `<p className="text-xs text-primary">`
     is a "success" / status line, not an error — could be
     `<Alert variant="info">`).

5. **Specific file targets**:
   - **New**: `src/components/ui/skeleton.jsx`,
     `src/components/ui/alert.jsx`.
   - **Extend**: `src/components/shared/EmptyState.jsx:1-10` (add
     icon + title variant, keep 1-line backward-compat).
   - **Refactor**: `src/views/ModrinthView.jsx:106` →
     `<Skeleton>` rows; `src/views/MetricsView.jsx:156` →
     `<Skeleton className="h-48 w-full" />` when no points.
   - **Refactor**: each of the 6 views that uses
     `<EmptyState message="..." />` to the new 3-row variant
     with an icon.

---

## 6. Sidebar collapse-to-icons

### Inspiration sources

- **shadcn/ui Sidebar** — https://ui.shadcn.com/docs/components/sidebar
  The full shadcn sidebar primitive is ~600 lines (the collapsible
  + icon-rail state machine, the `SidebarProvider`, the
  `useSidebar()` hook). We don't need all of it. We need:
  - the **state machine** (`expanded | collapsed`),
  - the **CSS variable** (`--sidebar-width: 220px | 48px`),
  - the **persisted cookie/localStorage**,
  - the **Radix Tooltip on each item when collapsed**.
- **Dribbble — Sidebar Collapse** — https://dribbble.com/search/sidebar-collapse
  Pattern: collapse-toggle button at the bottom of the sidebar
  (the existing `Log out` button at `Sidebar.jsx:118-123` is the
  natural neighbor; move it down and put the toggle at top of the
  footer). Group labels and item labels animate out (`opacity-0 →
  opacity-100`, 200 ms) when collapsed; icons stay.
- **Envato — Sidebar Collapse Navigation (Dark Mode)** —
  https://elements.envato.com/sidebar-collapse-navigation-dark-mode-9VG9434
  This is the closest product pattern: when collapsed, the sidebar
  is 56-64 px wide, icons are 20 px, the active item shows a
  vertical bar (we already have `border-l-2 border-l-primary` from
  iter 1 — keep).
- **Radix Tooltip shadcn port** — https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/tooltip.tsx
  (the v4 version uses `import { Tooltip as TooltipPrimitive } from
  "radix-ui"`; our installed dep is `@radix-ui/react-tooltip` which
  exposes the same primitives via `TooltipPrimitive.Root` /
  `Trigger` / `Content` / `Provider`). The shadcn port is 50 lines;
  ours will be 40.

### Concrete ideas

1. **New primitive: `src/components/ui/tooltip.jsx`** (40 lines,
   shadcn port, `@radix-ui/react-tooltip`):

   ```jsx
   import * as React from 'react';
   import * as TooltipPrimitive from '@radix-ui/react-tooltip';
   import { cn } from '@/lib/utils';

   const TooltipProvider = TooltipPrimitive.Provider;
   const Tooltip = TooltipPrimitive.Root;
   const TooltipTrigger = TooltipPrimitive.Trigger;

   const TooltipContent = React.forwardRef(({ className, sideOffset = 6, ...props }, ref) => (
     <TooltipPrimitive.Portal>
       <TooltipPrimitive.Content
         ref={ref}
         sideOffset={sideOffset}
         className={cn(
           'z-50 overflow-hidden rounded-md border border-border bg-popover px-2.5 py-1',
           'text-xs text-popover-foreground shadow-md',
           'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
           'data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0',
           'data-[state=closed]:zoom-out-95 data-[state=delayed-open]:zoom-in-95',
           className
         )}
         {...props}
       />
     </TooltipPrimitive.Portal>
   ));
   TooltipContent.displayName = TooltipPrimitive.Content.displayName;

   export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
   ```

   - 40 lines, exports `Tooltip / TooltipTrigger / TooltipContent /
     TooltipProvider`. The Provider is a separate export because it
     must wrap the app once at the top of `App.jsx`, not at every
     usage site.
   - `delayDuration` defaults to 0; for the sidebar we override at
     the Provider to `delayDuration={300}` so the tooltip doesn't
     flash as the user moves the mouse across icons.

2. **Wrap the app in `<TooltipProvider>`** at `App.jsx:137` (the
   `<Sidebar>` mount). One line change. The provider only needs to
   wrap one tree — the `AppShell` is enough.

3. **Sidebar state machine** in `src/components/layout/Sidebar.jsx`:

   - New state: `mode` ('expanded' | 'collapsed'), initialized
     from `localStorage.getItem('ls-sidebar-mode')` and
     `setMode(...)` writes back. Default: 'expanded'.
   - The `<aside>` width: `w-sidebar` (220 px) or
     `w-sidebar-collapsed` (48 px) — the iter-1 Tailwind
     config has both at `tailwind.config.js:86-89`. Use
     `cn('flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200',
        mode === 'collapsed' ? 'w-sidebar-collapsed' : 'w-sidebar')`.
   - The brand-mark row at `Sidebar.jsx:78-81` collapses to just
     the `◆` glyph (no "Lodestone" text) when `mode === 'collapsed'`.
     Use `cn('flex items-center px-3 py-4 border-b border-border', mode
     === 'collapsed' ? 'justify-center' : 'gap-2 px-5')` and a
     conditional `<span>` for the text. The text fades out via
     `transition-opacity duration-200`:
     `className="text-sm font-semibold tracking-wide text-foreground
     transition-opacity duration-200",
     style={{ opacity: mode === 'collapsed' ? 0 : 1 }}`. Width of
     the text is preserved during the transition (`width: 0` would
     cause a layout pop — `opacity` only is smoother).
   - The group-label buttons at `Sidebar.jsx:87-96`:
     - When expanded: show "Overview / Operate / Content /
       Maintenance / Settings" labels (today).
     - When collapsed: hide entirely (`display: none` after the
       transition, or just `if (mode === 'collapsed') return null`).
   - The item buttons at `Sidebar.jsx:97-112`:
     - When expanded: show `icon + label` (today).
     - When collapsed: show just the icon, centered (`justify-
       center` instead of `gap-3`). Wrap each in
       `<Tooltip><TooltipTrigger asChild><Button ... /></TooltipTrigger><TooltipContent
       side="right" sideOffset={8}>{label}</TooltipContent></Tooltip>`.
     - Active state still uses the 2-px left bar (works in both
       modes; the bar is 2 px of the 48-px column).
   - The footer at `Sidebar.jsx:117-123`:
     - Add a collapse/expand toggle button at the top of the
       footer. Use `ChevronsLeft` / `ChevronsRight` from lucide
       (16 px). When `mode === 'collapsed'`, render the toggle
       with `justify-center`; the `Log out` button gets the same
       treatment (`justify-center`).
     - The footer becomes a vertical stack: `[Toggle] [Log out]`
       when expanded, `[Toggle] [Log out]` (both icon-only)
       when collapsed.
   - Keyboard shortcut: `Ctrl+B` (or `Cmd+B` on macOS) toggles
     mode. Add a `useEffect` that listens for `keydown` and
     checks `e.key === 'b' && (e.metaKey || e.ctrlKey)`.
     `e.preventDefault()` to override browser default.

4. **Collapsed state sketch** (48 px column):

   ```
   +-----+
   |  ◆  |  (brand mark, centered, no text)
   +-----+
   |     |
   | [⌂] |  Tooltip: "Dashboard"        <- group labels hidden
   | [🖳] |  Tooltip: "Servers"
   | [📊] |  Tooltip: "Metrics"
   |     |
   | [>_] |  Tooltip: "Console"          <- group label still hidden
   | [👥] |  Tooltip: "Players"
   | [🗺] |  Tooltip: "Map"
   |     |
   | [🧩] |  Tooltip: "Plugins"
   | ...  |
   +-----+
   | [<] |  Toggle: expand
   | [⏏] |  Tooltip: "Log out"
   +-----+
   ```

   The active item keeps its 2-px left bar in `--primary`. No
   background tint (avoids visual noise at 48 px).

5. **State persistence**:

   - `localStorage.setItem('ls-sidebar-mode', mode)` on toggle.
   - `localStorage.getItem('ls-sidebar-mode')` on mount; default
     to `'expanded'` if missing or invalid.
   - Don't break the existing `ls-collapsed-navs` key — it
     controls the per-group collapse inside the expanded mode. The
     two states are independent (the icon-rail hides group labels
     entirely; the per-group collapse hides the items within a
     group when the sidebar is expanded).

6. **Transition timing** — `transition-[width,opacity] duration-200
   ease-out` (uses `var(--ease-out)` from iter 1, and 200 ms is
   the middle of `--duration-base` (180 ms) and `--duration-slow`
   (280 ms) — pick 200 as a named CSS var:

   ```css
   --duration-collapse: 200ms;
   ```

   And use `var(--duration-collapse) var(--ease-out)` for the
   sidebar width transition. Not strictly necessary; could use
   `var(--duration-base)`. Concrete number is more legible in
   code.

7. **Specific file targets**:
   - **New**: `src/components/ui/tooltip.jsx` (40 lines).
   - **Edit**: `src/components/layout/Sidebar.jsx:61-126` — add
     `mode` state, conditional rendering, tooltip wrapping, and
     the toggle button.
   - **Edit**: `src/App.jsx:136-153` — wrap the inner tree in
     `<TooltipProvider delayDuration={300}>`.
   - **Edit**: `src/index.css:79-81` (motion tokens) — optional,
     add `--duration-collapse: 200ms;`.

---

## 7. Type-scale wiring

### Inspiration sources

- **Tailwind v3 fontSize docs** — https://v3.tailwindcss.com/docs/font-size
  Confirms that `theme.fontSize` is a record of `{ [size]: [lineHeight, { letterSpacing, fontWeight }] }` — Tailwind reads the array and produces utilities like `text-sm`, `leading-5`, `tracking-tight`. We can map our 7-step scale to existing size names so call sites don't change.
- **Vercel Geist type system** — https://vercel.com/geist
  Geist ships at 14-px body with `text-sm = 13px`, `text-xs =
  12px`, and `text-2xl = 24px`. The ratios are similar to
  Lodestone's iter-1 scale; we adopt Vercel's specific values for
  the most-used sizes because the existing views are
  already calibrated to a similar scale (most of the codebase
  uses `text-sm` for body and `text-xs` for secondary text).

### Concrete ideas

Override `theme.fontSize` in `tailwind.config.js:8-135` so the
existing utilities (`text-xs / -sm / -base / -md / -lg / -xl /
-2xl`) map to the iter-1 token values. The current defaults
(Tailwind 3.4) give us `text-xs = 12px`, `text-sm = 14px`,
`text-base = 16px` — the iter-1 scale is denser. This is the
single change that lets the views adopt the new scale without
having to rewrite every `text-sm` literal.

```js
// tailwind.config.js — replace the default fontSize in theme.extend
fontSize: {
  xs:   ['11px',   { lineHeight: '1.45' }],
  sm:   ['12.5px', { lineHeight: '1.5'  }],
  base: ['13.5px', { lineHeight: '1.55' }],
  md:   ['14px',   { lineHeight: '1.5'  }],
  lg:   ['16px',   { lineHeight: '1.4'  }],
  xl:   ['20px',   { lineHeight: '1.3'  }],
  '2xl':['28px',   { lineHeight: '1.2'  }],
  '3xl':['34px',   { lineHeight: '1.15' }],   // new — login hero
  // Preserve the standard Tailwind names for utilities we haven't
  // adopted yet, but map them to the closest iter-1 value:
  '4xl':['40px',   { lineHeight: '1.1'  }],
  '5xl':['48px',   { lineHeight: '1.05' }],
  '6xl':['60px',   { lineHeight: '1'    }],
  '7xl':['72px',   { lineHeight: '1'    }],
  '8xl':['96px',   { lineHeight: '1'    }],
  '9xl':['128px',  { lineHeight: '1'    }],
},
```

The default Tailwind fontSize has
`text-sm = [0.875rem, { lineHeight: '1.25rem' }]` (14 px / 20 px
line-height). Our override gives
`text-sm = ['12.5px', { lineHeight: '1.5' }]` (12.5 px / ~18.75 px
line-height). **This is a global change that re-skins every view.**
The brief says we can do it; the cost is a visual review pass
across the 8 in-scope views to confirm the smaller body text
still reads well.

Also wire `letterSpacing` tokens (the iter-1 `--tracking-*`
vars) into Tailwind's `theme.letterSpacing`:

```js
letterSpacing: {
  tight:   '-0.011em',
  normal:  '0',
  wide:    '0.04em',
  wider:   '0.08em',     // for the existing uppercase labels
  widest:  '0.1em',      // for the existing tracking-widest
},
```

Wait — `tracking-tight`, `tracking-wide`, `tracking-wider`, and
`tracking-widest` are already in Tailwind's default
`letterSpacing` (at `-0.025em / 0.025em / 0.05em / 0.1em`).
Adding them again with different values would conflict. The
correct move is to override them to the iter-1 values:

```js
letterSpacing: {
  tight:    '-0.011em',   // matches var(--tracking-tight)
  tightest: '-0.02em',
  normal:   '0',
  wide:     '0.04em',      // matches var(--tracking-wide)
  wider:    '0.06em',
  widest:   '0.1em',
},
```

`tracking-tighter`, `tracking-normal` keep Tailwind defaults
(no entry needed). The `tracking-widest` (0.1em) stays. The
`tracking-wide` (0.04em) and `tracking-tight` (-0.011em) become
the iter-1 values.

### Specific file target

`tailwind.config.js:8-135` — add `fontSize` and override
`letterSpacing` in `theme.extend`. The `keyframes` and
`animation` blocks remain unchanged.

### Sweep needed (not in this report — call out in the plan)

The iter-1 report explicitly defers the per-view sweep. With
the type scale wired, the following 12+ literal `text-[*]`
sites become redundant and should be cleaned up in iter 2:

- `text-[10.5px]` (header columns in `ServersView.jsx:354`,
  `MetricsView.jsx:138`, `badge.jsx:6`) — becomes `text-xs` (11
  px, close enough) or the primitive `fontSize.xs` exactly
  matches.
- `text-[11px]` (`KpiTile.jsx:33`, `MetricsView.jsx:57, 70, 86`,
  `ConsoleView.jsx:132`, `CardTitle` in `card.jsx:28`) —
  becomes `text-xs`.
- `text-[12.5px]` (`ConsoleView.jsx:132` mono) — handled by
  the new mono-default size.
- `text-[10px]` (`Sidebar.jsx:90`, `KpiTile.jsx:33` already
  covered) — becomes `text-xs` with `font-semibold uppercase
  tracking-widest text-muted-foreground/70`. Or keep the
  `text-[10px]` literals — the type scale override doesn't
  affect arbitrary values.

The implementer should treat this as a separate sub-step in
the plan ("Type-scale sweep") after the primitive change.

---

## 8. Login view

### Inspiration sources

- **shadcn/ui login blocks (via v0)** — https://ui.shadcn.com/blocks/authentication
  The "Authentication" block category has 14 login layouts. The
  common pattern: a single 384-px card on a `bg-background`
  surface with a subtle gradient or grid; brand mark + title at
  top; email + password inputs in a vertical stack; primary
  "Sign in" button; error / loading states inline.
- **Dribbble — Login card** — https://dribbble.com/search/login-card
  Density and layout: 384-px card, 32-40 px padding, the brand
  mark is 24-28 px (not 16 px), the title is `text-xl` (20 px)
  not `text-lg` (16 px), the description is `text-xs` (11-12.5
  px) `text-muted-foreground/70`. The form inputs are 40-px
  tall (`h-10`, not `h-9`).
- **Linear — Sign in** — https://linear.app/signin
  Linear's login is the gold standard: a single column, the
  brand mark + name at the top, then a single input + submit,
  no helper text. A 12-px gap between inputs, an 8-px gap
  between input and button. No "remember me" / "forgot
  password" — keep the surface tight.

### Concrete ideas

1. **Card width** — `max-w-sm` (384 px) is correct (current
   `LoginView.jsx:45`). Keep.

2. **Card padding** — `px-8 pt-8 pb-6` (line `:47`) → `px-8
   pt-10 pb-8`. More generous top, more generous bottom. The
   current `pb-6` makes the button feel cramped.

3. **Brand mark** — `◆` at 24 px (`:49`) → 28 px
   (`text-2xl`). Centered. Add a subtle 1-px ring around it for
   definition: `<div className="mx-auto flex h-12 w-12
   items-center justify-center rounded-full border
   border-border bg-card">◆</div>`. The ring matches the new
   type scale's `--text-2xl` and reads as a brand badge, not a
   decorative glyph.

4. **Title** — `Lodestone` at `text-lg font-semibold` (`:51`)
   → `text-xl font-semibold tracking-tight`. The new type scale
   `text-xl` = 20 px. `tracking-tight` (-0.011em) matches the
   Header title.

5. **Subtitle** — `Minecraft server panel` at `text-xs
   text-muted-foreground` (`:52`) → `text-xs
   text-muted-foreground/70`. Drop the `mb-6` to `mb-8` to
   add a touch more breathing room before the form.

6. **Inputs** — keep the two `<Input>`s as-is (`:55-70`).
   Replace `text-red-400` (`:72`) with `text-status-error` and
   the alert variant from Section 5: `<Alert variant="error"
   className="mt-1"><AlertCircle className="h-3.5 w-3.5
   mt-0.5" />{error}</Alert>`. Move the error *between* the
   password input and the button (today it's *after* the button
   at `:71-73`, which is wrong — errors should precede the
   submit).

7. **Button** — `Log in` / `Logging in…` (`:74-82`). Add a
   loading state with the `<Skeleton>` shimmer (the shadcn
   pattern): when `loading`, the button's text is replaced by
   `<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Signing
   in…</>`. The existing text already says "Logging in…";
   upgrade to a spinning icon.

8. **Subtle gradient background** — the current grid pattern
   at `LoginView.jsx:35-41` (`linear-gradient` at 0.03 opacity)
   is almost invisible. Replace with a radial gradient that
   reads at 0.04 alpha: `radial-gradient(ellipse at top, hsl(156
   46% 58% / 0.04), transparent 60%)` over the same
   `bg-background` surface. The brand-mint hint at the top ties
   the login to the rest of the panel without becoming a
   marketing page.

9. **"Forgot password" link** — out of scope (no password
   recovery flow in the backend). Don't add.

10. **Footer line** — add `text-[11px] text-muted-foreground/50
    text-center mt-6`: a small "Self-hosted panel · no telemetry"
    line that signals to the user that this is a self-hosted
    tool. Out of scope for the design but useful — flag for
    implementer.

11. **Specific file target**:
    `src/views/LoginView.jsx:32-86` — card padding, brand mark
    size + ring, title tracking, subtitle opacity, input error
    (move + tokenize + Alert), button loading state, gradient
    background.

---

## Risks / open questions

1. **Console virtualization — do we have a budget for hand-rolled
   windowing, or is rendering 1200 plain `<div>`s acceptable for
   now?** The investigation recommends *not* adding a windowing
   solution. With `MAX_LINES = 1200` and a 62 vh container
   showing ~30 rows, plain `<div>`s are sub-millisecond per
   update. Sentry ships thousands un-virtualized. If a user
   raises the cap to 10 000+ for a debug session, the JSX
   update is still cheap but the DOM mutation is the bottleneck.
   Defer windowing to iter 3 unless real-world testing shows
   jank.
2. **Table primitive — new `components/ui/table.jsx` vs shared
   classes.** The investigation recommends the new primitive
   (shadcn-style, 70 lines). The alternative is shared
   `className` constants (`ROW_CN = 'flex items-center gap-3
   rounded-md border border-border/60 bg-secondary/20 px-3 py-2
   hover:bg-secondary/40'`) used per view. The primitive
   wins because (a) it's shadcn-compatible, (b) it enables a
   future `<DataTable>` wrapper for sort/filter, (c) the
   `data-slot` attribute is a shadcn convention that other
   shadcn-derived components respect.
3. **Any conflicts with the existing dialog (`ConfirmDialog`)?**
   `ConfirmDialog` is a thin wrapper over `Dialog`. The
   iter-2 dialog refresh (Section 4) affects both the wrapper
   and the call sites; the changes are additive. The 4 views
   that currently use `window.confirm` (TasksView, UsersView,
   FileManagerView, BackupsView) need to be migrated to
   `ConfirmDialog` as part of iter 2 — this is a behaviour
   change for the user, not a refactor, and should be called
   out in the iter-2 plan.
4. **PluginsView deletes with no confirm** (`PluginsView.jsx:23-29`).
   The investigation adds a `ConfirmDialog` here, which is a
   real bug fix (deletes a plugin with no user confirmation).
   Confirm with the user before iter 2 ships — is the missing
   confirm an intentional "no friction" decision, or an
   oversight?
5. **Type-scale global override** is the single biggest visual
   change in iter 2. Every view will get a 1-1.5 px smaller
   body and slightly tighter line-heights. The risk is a
   1080p monitor at 100% scaling showing text that's too
   small. The mitigations: (a) keep `text-base` at 13.5 px
   (not 13 px), (b) ship the override with a 1-week soft
   release, (c) make `text-base` the new default but allow
   `text-sm` (12.5 px) to be the opt-in for compact views.
6. **`NativeSelect` vs Radix `Select`** — the investigation
   recommends `NativeSelect` (a wrapper over the native
   `<select>`). The trade-off: native is simpler, mobile-
   friendly, and zero JS; Radix is more accessible and
   styleable but adds complexity. If a future Modrinth-version
   dropdown needs search/typeahead, the call site converts to
   Radix `Select` then. For iter 2, native is the right call.
7. **TooltipProvider at the app root** — wrapping `AppShell`
   in `<TooltipProvider delayDuration={300}>` adds a context
   that every Radix Tooltip needs. The cost is a single
   subscription; the benefit is consistent tooltip timing
   across the app. Confirm the team is OK with always-on
   `delayDuration={300}` (some prefer `0` for instant
   feedback).
8. **Field primitive + RHF** — the investigation proposes a
   dependency-free `Field` wrapper (not React Hook Form).
   shadcn's `Form` primitive requires RHF. Confirm: do we
   want the simpler `Field`-only wrapper (recommended), or
   the full `Form` (more powerful, but adds RHF as a
   dependency, which violates "no new dependencies" in the
   brief)?

## Out of scope (deferred to iter 3)

The user is tempted to add these. They are explicitly **out** of
scope for iter 2 — flagged here so the implementer doesn't get
distracted:

- **Hover micro-interactions and transition polish** (Sidebar
  item hover lift, button press feel, table row hover-translate,
  etc.) — iter 3 "polish & motion" pass.
- **Light mode** (the `.light` class override block). Tokens
  are theme-agnostic; the override is a 30-line addition in
  iter 3 when there's a concrete reason.
- **OKLCH migration** — HSL is fine, shadcn v1 is HSL, no
  urgency. v2.
- **Brand/logo work** — the `◆` glyph is a placeholder. Logo
  design is its own project, not a design-system pass.
- **Animation timing polish** — the 200 ms sidebar collapse is
  a concrete number; refining every transition to a coherent
  system (e.g. 120 / 200 / 320 everywhere) is iter 3.
- **"Squish" on the sidebar animation** (the bouncy spring
  ease-in-out that some admin panels have) — defer; the
  iter-1 motion tokens are functional, not yet beautiful.
- **Map view** (`src/views/MapView.jsx`) — Leaflet dark-tile
  theming is not a design-system concern. Out of scope.
- **`toast.error` color refresh** — `main.jsx:20` has
  `border-red-500/40` on the Sonner `<Toaster>` (the
  implementation report's "still off" note). Sweep to
  `border-status-error/40` in iter 2 as a one-liner; not
  worth a section.
- **`disabled` button opacity** — current `disabled:opacity-40`
  in `button.jsx:7`. iter 2 leaves it as-is (works fine);
  iter 3 considers a per-tone `disabled` style.
- **Pagination / sort** on the tables — no view needs it now
  (max ~10 rows). Reserve the `sortable` prop stub; do not
  implement.
- **Tooltip on every Button** (the spec wants tooltips on
  sidebar icons; other places like the Start/Stop buttons
  use `title=""` HTML attributes today). Migrate the
  `title=""` to `<Tooltip>` in iter 3 if the team wants
  consistent tooltip UI; iter 2 only converts the sidebar.
- **The 7 "no border + raw input" textareas** (`ConsoleView.jsx:107`,
  `FileManagerView.jsx:179`, `ConfigsView.jsx:57` use
  `bg-[#0e1012]` hardcoded) — these become `bg-console-bg`
  per the new token. 3-line sweep, included in iter 2's
  Section 1. Other inline `bg-[#0e1012]` are not present;
  grep verified.
- **ConfirmDialog migration for the 4 `window.confirm` sites**
  is *in* scope per Section 4 (and Section 6's open question).
  PluginsView's missing-confirm is the only behaviour change;
  flag for user approval before iter 2 ships.
- **Login email vs username** — the backend `auth.login`
  takes an `email` field (`LoginView.jsx:18-20`) but the
  CLAUDE.md and iter-1 reports describe users by `email`.
  No change in iter 2.
- **PlayerList hover-revealed X button** (`PlayersView.jsx:52`)
  uses `text-muted-foreground hover:text-red-400` — sweep to
  `text-muted-foreground hover:text-status-error` in iter 2's
  table sweep.
