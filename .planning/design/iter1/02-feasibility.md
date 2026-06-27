# Iter 1 — Feasibility & Plan (Foundation & Architecture)

> Agent B (Feasibility Reviewer) review of the Agent A investigation at
> `.planning/design/iter1/01-investigation.md`, grounded in the actual
> source on disk.

## TL;DR

Iter 1 is feasible and well-scoped if we narrow the investigation to
"page shell + dashboard + token plumbing". **Approve** the color/typography/
motion/shadow/sidebar token refresh, the page-shell refactor (sidebar + header
out of `position: fixed` into flex), the StatusPill/badge tokenization, and
the dashboard's KPI tile + sparkline + disk-bar cleanup. **Extract** KpiTile
to `components/shared/KpiTile.jsx` (the investigator's recommendation).
**Defer** sidebar collapse-to-icons, console styling, table styling, form
polish, light mode, full type-scale application, and the rest of the
investigation's "out of scope" list. The investigation's claim that a full
type scale should be wired to Tailwind in iter 1 is too aggressive — define
the tokens, don't re-skin every view.

## Already shipped

These investigation items are already in the codebase, no work needed.

- **shadcn-style HSL tokens wired to Tailwind** — `src/index.css:6-46`
  (`:root` block) → `tailwind.config.js:28-67` (semantic color mapping).
  Every `bg-card`, `text-muted-foreground`, `border-border`, `ring-ring`
  utility resolves today.
- **Sidebar grouping with `localStorage` persistence** —
  `src/components/layout/Sidebar.jsx:52-73` reads/writes
  `ls-collapsed-navs`. Pattern is already in place; collapse-to-icons
  should reuse it.
- **StatusPill with `pulse-ring` animation** —
  `src/components/shared/StatusPill.jsx:23-37` (StatusDot uses
  `animate-ping` on the inner ring).
- **KPI tile composition** — `src/views/DashboardView.jsx:10-29`
  (icon box + label + value + sub on a card with `border-l-2` accent).
- **Sparkline-on-canvas with 150-point rolling buffer** —
  `src/views/DashboardView.jsx:32-58` (DPR-aware, line + area fill).
- **Header with `backdrop-blur-sm`, 1-px bottom border, `bg-background/80`** —
  `src/components/layout/Header.jsx:21-23`.
- **ServerSelector with `StatusDot`, `bg-secondary/50` trigger, popover
  with `shadow-xl`** — `src/components/layout/ServerSelector.jsx:1-70`.
- **9 shadcn-style UI primitives** in `src/components/ui/` (button, card,
  dialog, input, select, tabs, textarea, label, checkbox, badge) using
  `React.forwardRef` + `cva`. The shadcn scaffold is complete.
- **Sonner toaster** in `src/App.jsx:2-3`. Toast for actions already works.
- **`fade-up` view transition** — `src/index.css:121-127`, used by
  `.view-enter` in `App.jsx:147`.
- **`@radix-ui/react-tooltip` already in devDependencies**
  (`package.json:41`). The `src/components/ui/tooltip.jsx` file does not
  exist yet, so adding the sidebar collapse needs the shadcn tooltip
  component — which means deferring collapse to iter 2 unless we add the
  component in this iter (deferred; see below).
- **KPI tile is currently a local function in DashboardView, not
  extracted** — `src/components/shared/KpiTile.jsx` does not exist. We
  **will** extract it in this iteration.

## Approved for this iteration

Grouped by area, with file:line targets. Every item here is bounded, in
scope of "Foundation & Architecture", and has a concrete change
described in the "Concrete change list" section below.

### Token plumbing (`src/index.css` + `tailwind.config.js`)

- **Color refresh** — `:root` at `src/index.css:6-46`. Slightly deeper
  `--background` and `--card`, lift `--foreground` from 68% to 78% for
  body-text legibility, decouple `--accent` from `--primary`, tighten
  `--border`/`--input`. (No new visual identity; just a denser, less
  gray-on-gray feel.)
- **New semantic status tokens** — `--status-online / -warn / -offline
  / -error` in `:root` at `src/index.css:6-46` (added). Wire to
  `tailwind.config.js` `theme.extend.colors.status` (use the
  `<alpha-value>` placeholder so `bg-status-online/10` and
  `border-l-status-online` both work).
- **Chart palette** — `--chart-1..5` in `:root`. Wire to
  `tailwind.config.js` `theme.extend.colors.chart`. Sparkline and
  disk-bar will consume these.
- **Sidebar token family** — `--sidebar / --sidebar-foreground /
  --sidebar-border / --sidebar-primary / --sidebar-accent` in `:root`.
  Wire to `tailwind.config.js` `theme.extend.colors.sidebar`. The
  Sidebar surface uses these.
- **Border-radius full scale** — `--radius-sm / md / lg / xl / 2xl /
  pill` in `:root`. Extend `tailwind.config.js` `theme.extend.borderRadius`
  (today only `sm/md/lg` are mapped at `tailwind.config.js:63-67`).
- **Shadow scale** — `--shadow-xs / -sm / -md / -lg / -xl` in `:root`.
  Wire to `tailwind.config.js` `theme.extend.boxShadow`. Today only
  `shadow-sm` (Card) and `shadow-xl` (ServerSelector) are used —
  this is the foundation for future modals/popovers.
- **Motion tokens** — `--ease-out / --ease-in / --ease-in-out /
  --ease-spring`, `--duration-fast / -base / -slow` in `:root`.
  Replace the bare `ease-out` strings at `src/index.css:103, 117, 126`
  with `var(--ease-out)`. Do not sweep every component.
- **Type-scale foundation tokens** — `--text-xs / -sm / -base / -md /
  -lg / -xl / -2xl` and `--tracking-tight / -normal / -wide` in
  `:root`. **Do not** override `tailwind.config.js` `theme.fontSize`
  in this iteration — that would re-skin every view. Define the
  tokens and the tracking, leave view-level application to iter 2.
  (The exception: update the body font-size to `var(--text-base)`
  in `src/index.css:54` — this is one line and barely visible
  because most elements use explicit `text-*` classes.)
- **Drop `--sidebar-w` CSS variable** — `src/index.css:130-132`.
  After the flex refactor, the sidebar width lives in Tailwind, not
  a CSS var.

### Page shell (`src/App.jsx`)

- **Sidebar + header out of `position: fixed` into flex** — `App.jsx:136-151`.
  Header becomes `sticky top-0 z-40` (still always visible during scroll,
  but composed in the flex column). Main drops `margin-left: var(--sidebar-w)`
  and the `pt-[calc(3.5rem+1.25rem)]` magic number → plain `p-5`.

### Sidebar (`src/components/layout/Sidebar.jsx`)

- **Use `--sidebar` token for the surface** — `Sidebar.jsx:77`.
  `bg-[hsl(200_6%_8%)]` → `bg-sidebar`.
- **Use `--sidebar-border` for the right divider** — `Sidebar.jsx:77`.
  `border-r border-border` → `border-r border-sidebar-border`.
- **Add 2-px left accent on the active item** — `Sidebar.jsx:105-110`.
  Today the active item is `bg-primary/10 text-primary`; add a 2-px
  left bar in `border-l-2 border-l-primary` to make the active state
  read against the hover state's `bg-secondary`. The 2-px bar reads
  even when the background is muted.
- **Bump group-label opacity floor** — `Sidebar.jsx:93`. `text-muted-foreground/60`
  → `text-muted-foreground/70` so the label reads on the slightly
  darker `--sidebar` surface.
- **Tighten nav-item vertical padding** — `Sidebar.jsx:106`. `py-2` →
  `py-1.5` to match Linear/Pterodactyl density.

### Header (`src/components/layout/Header.jsx`)

- **Switch from `position: fixed` to `sticky`** — `Header.jsx:20-23`.
  `fixed right-0 top-0 z-40 ...` + inline `left: 'var(--sidebar-w)'`
  → `sticky top-0 z-40 ...` (the left offset is no longer needed
  because the header is a flex child).
- **Add `tracking-tight` to the view title** — `Header.jsx:26`.
  `text-sm font-semibold` → `text-sm font-semibold tracking-tight`.

### ServerSelector (`src/components/layout/ServerSelector.jsx`)

- **Tokenize the trigger background** — `ServerSelector.jsx:28`. Keep
  the existing `bg-secondary/50` effect, but the new `--secondary` and
  `--muted` token values (`200 6% 16%` / `200 6% 18%`) make the
  selector visually distinct from the header. No change needed if the
  computed look is fine; otherwise use `bg-muted/50`. This is a no-op
  in code if the existing class still works.

### StatusPill (`src/components/shared/StatusPill.jsx`)

- **Replace `green-500/10` / `orange-500/10` palette with status tokens** —
  `StatusPill.jsx:3-8`. Switch the four status variant strings to
  `bg-status-online/10 text-status-online border border-status-online/20`,
  `bg-status-warn/10 text-status-warn border border-status-warn/20`, etc.
- **Tokenize StatusDot** — `StatusPill.jsx:30-35`. `bg-green-400` →
  `bg-status-online`, `bg-orange-400` → `bg-status-warn`, ping layer
  the same.

### Badge primitive (`src/components/ui/badge.jsx`)

- **Same tokenization as StatusPill** — `badge.jsx:11-16`. Replace
  `green-500/orange-500/red-400` palette with the new status tokens.
  Mechanical change, in scope because the badge is a UI primitive
  consumed across views.

### Button primitive (`src/components/ui/button.jsx`)

- **Tokenize the `success` variant** — `button.jsx:23-24`.
  `bg-green-600/20 text-green-400 border border-green-600/40` →
  `bg-status-online/10 text-status-online border border-status-online/20`.
- **Tokenize the `destructive` variant text color** — `button.jsx:14`.
  `text-red-300` → `text-status-error` (the `352 70% 60%` fresh red is
  readable on a 15% destructive bg and looks consistent with the
  badge's destructive variant).
- **Tokenize the `glass` variant** — `button.jsx:25-26`.
  `bg-white/[0.04]` → `bg-foreground/[0.04]` (same effect, named token).

### Modrinth compat pill (`src/views/ModrinthView.jsx`)

- **Tokenize the orange fallback** — `ModrinthView.jsx:69`.
  `bg-orange-500/10 text-orange-400 border-orange-500/25` →
  `bg-status-warn/10 text-status-warn border-status-warn/25`. One-line
  mechanical change.

### Dashboard (`src/views/DashboardView.jsx` + new shared component)

- **Extract KpiTile to `src/components/shared/KpiTile.jsx`** (NEW FILE).
  Resolve the investigator's open question: **yes, extract it**. The
  shape is clearly reusable (Servers, Backups, Tasks, Users will all
  want a "Total X" / "Active Y" tile in iter 2), the file location
  already exists, and the cost is one file move with a small prop
  refactor.
- **Replace the `colorClass` string prop with a typed `tone` prop** —
  `KpiTile.jsx` (new). Values: `'online' | 'warn' | 'error' | 'primary'
  | 'neutral'`. The tile maps tone → both the left-border color and
  the icon-box tint via the new status tokens. Cleaner API than a
  free-form Tailwind class string.
- **Drop the icon-box `border border-border bg-muted/40`** — new
  `KpiTile.jsx`. The "use fewer borders" refactoring rule from the
  investigation. Icon box becomes a flat `rounded-md bg-{tone}/10
  text-{tone}` 40×40 square.
- **Replace `border-l-green-500` / `border-l-orange-500` /
  `border-l-red-500` with status tokens** — `DashboardView.jsx:111-120`
  (the `kpiColor` and `tpsColor` maps). Becomes `border-l-status-online`,
  `border-l-status-warn`, `border-l-status-error`.
- **Tokenize the sparkline stroke and fill** —
  `DashboardView.jsx:52, 56`. Replace hardcoded `#5EC9A0` and
  `rgba(94,201,160,0.08)` by reading `--chart-1` at draw time:
  `const c = getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim();
   ctx.strokeStyle = \`hsl(\${c})\`; ctx.fillStyle = \`hsl(\${c} / 0.08)\`;`
- **Tokenize the disk-usage bar thresholds** — `DashboardView.jsx:199-201`.
  `bg-red-500` → `bg-status-error`, `bg-orange-500` → `bg-status-warn`,
  `bg-primary` → keep.

## Deferred to later iterations

Each item gets an iteration number (2 = components/density, 3 = polish/
micro) and a one-line reason. **Be ruthless**: the next iterations
will pick these up.

- **Sidebar collapse-to-icons (220 px ↔ 48 px)** — **Iter 2**. Needs
  the shadcn `tooltip.jsx` component (`@radix-ui/react-tooltip` is
  installed but `src/components/ui/tooltip.jsx` does not exist),
  localStorage state machine, width/opacity transitions. Too much
  behavior change for a "foundation" pass. The 220-px fixed surface
  in this iter is fine.
- **Console view styling pass** — **Iter 2**. Terminal-grade
  typography, level-color tokens for `l-info / l-warn / l-error /
  l-chat / l-cmd`, `.console-area` background token (`#0e1012` →
  `--console-bg`). Out of scope per the brief.
- **Table styling system** — **Iter 2**. Servers / Players / Modrinth
  / Backups / Tasks / Users / Configs all need column widths, sticky
  headers, row hover, status column conventions. The `text-red-400`
  / `text-green-400` literal icons in `ServersView.jsx:396,398,401`
  and similar in other views stay untouched.
- **Form/Input refinements** — **Iter 2**. Focus-ring token, error
  state, help text. The `input.jsx` and `select.jsx` primitives are
  not touched in iter 1.
- **Modal/Dialog visual pass** — **Iter 2**. The current `dialog.jsx`
  uses generic shadcn defaults; iter 2 aligns shadows, radii, and
  spacing with the new scale.
- **Empty states, loading skeletons, error states per view** — **Iter 3**.
  The `EmptyState` component stays as-is.
- **Map view refinement** — **Iter 3**. Leaflet dark-tile theming
  is not a design-system concern.
- **Login visual refresh** — **Iter 3** (or never — out of brief). The
  single-card-on-grid layout works.
- **Light-mode token override under `.light`** — **Iter 3+**. The
  brief says dark-only; defining an unused `.light` block now is
  low value. The CSS vars are already theme-agnostic HSL components,
  so a future override is a 30-line addition.
- **OKLCH migration** — **v2**. HSL matches shadcn v1 and the rest
  of the file. No urgency.
- **Logo and brand identity** — **Never in this project** unless
  asked. The `◆` glyph is a placeholder; out of scope per the brief.
- **Full type-scale application (override Tailwind `fontSize`)** —
  **Iter 2**. The investigation's proposed scale (`xs = 11px`,
  `sm = 12.5px`, `base = 13.5px`, …) would re-skin every `text-sm`
  and `text-xs` literal across 14 view files. Define the tokens
  now, sweep later. Iter 2 audits each view against the new scale.
- **Tracking tokens applied to other headings** — **Iter 2**. Only
  the Header title uses `tracking-tight` in this iter; no other
  headings change.
- **Spacing-scale sweep** — **Iter 2**. The `--space-{n}` tokens
  are defined but Tailwind's default 4-px scale already covers
  them. The only "sweep" in this iter is removing the
  `pt-[calc(3.5rem+1.25rem)]` magic number, which is a one-line
  refactor that comes free with the page-shell change.

## Rejected

These are in the investigation but should not happen.

- **Move the `pulse-dot::after` rule's `ease-out` to `var(--ease-out)`
  AND also use it for a Radix Tooltip-driven "tooltip on the sidebar
  icon"** — Reject. Tooltips need the `tooltip.jsx` component, which
  is not in scope for "Foundation & Architecture". The motion-token
  substitution happens, the tooltip doesn't.
- **Add a `surface-elevated` token for the `glass` button variant** —
  Reject. The investigation suggests this, but the cleanest move is
  to use the existing `bg-foreground/[0.04]` pattern (text-color at
  4% alpha) — no new token needed.
- **Add `--ls-orange` and `--ls-accent-dim` aliases for the new
  status tokens** — Reject. The `--ls-*` tokens are used by
  `.console-area` for level colors (info / warn / error / chat) and
  have different semantics from the new `--status-*` tokens (online /
  warn / offline / error). Keep both. Console view is iter 2.
- **Decouple `--accent` and immediately use `bg-accent` for hover
  states in the sidebar** — Reject. The investigation proposes
  `--accent: 199 60% 22%` (a blue-grey) for hover/selected rows.
  Decoupling is in scope; using it for a new hover pattern is
  iter-2 work. The change ships the token, not the new hover.
- **Bump Header `z-40` to `z-50`** — Reject. The investigation flags
  this as "quick check". No popover is leaking in the current code,
  so no change.
- **Pill-radius for every status element (`$border-radius: 50rem`
  in Kuma style)** — Reject. Kuma goes too far; pill rounding is
  for status pills only, not buttons, inputs, or cards.

## Concrete change list

Every change has a file, a one-line summary, and a copy-pasteable
before/after. **Do not** invent variations — apply these exactly.

---

### Change 1 — Token refresh in `src/index.css`

- **File**: `src/index.css`
- **What**: Replace the `:root` block (lines 6-46) with the new token
  set; add the sidebar/chart/status/radius/shadow/motion/type-scale
  tokens; drop the `--sidebar-w` second `:root` block (lines 130-132);
  use motion tokens in the three `ease-out` strings; use the type-scale
  base for body.
- **Snippet**: Replace lines 6-46 (the entire `:root` block) with:

```css
  :root {
    /* shadcn/ui dark theme — refreshed for Lodestone */
    --background: 200 6% 8.5%;
    --foreground: 210 4% 78%;

    --card: 204 8% 12%;
    --card-foreground: 210 4% 78%;

    --popover: 204 8% 14%;
    --popover-foreground: 210 4% 78%;

    --primary: 156 46% 58%;
    --primary-foreground: 158 46% 9%;

    --secondary: 200 6% 16%;
    --secondary-foreground: 210 4% 78%;

    --muted: 200 6% 18%;
    --muted-foreground: 210 4% 56%;

    --accent: 199 60% 22%;
    --accent-foreground: 210 4% 92%;

    --destructive: 352 57% 57%;
    --destructive-foreground: 0 0% 98%;

    --border: 200 8% 20%;
    --input: 200 8% 20%;
    --ring: 156 46% 58%;

    --radius: 0.5rem;
    --radius-sm: 0.3rem;
    --radius-md: 0.4rem;
    --radius-lg: 0.5rem;
    --radius-xl: 0.7rem;
    --radius-2xl: 0.9rem;
    --radius-pill: 9999px;

    /* Semantic status */
    --status-online: 142 52% 50%;
    --status-warn: 33 80% 56%;
    --status-offline: 210 4% 56%;
    --status-error: 352 70% 60%;

    /* Chart palette */
    --chart-1: 156 46% 58%;
    --chart-2: 199 80% 60%;
    --chart-3: 266 60% 65%;
    --chart-4: 33 80% 56%;
    --chart-5: 352 70% 60%;

    /* Sidebar surface */
    --sidebar: 200 8% 7%;
    --sidebar-foreground: 210 4% 78%;
    --sidebar-primary: 156 46% 58%;
    --sidebar-primary-foreground: 158 46% 9%;
    --sidebar-accent: 199 60% 22%;
    --sidebar-accent-foreground: 210 4% 92%;
    --sidebar-border: 200 8% 16%;
    --sidebar-ring: 156 46% 58%;

    /* Shadow scale */
    --shadow-xs: 0 1px 2px 0 hsl(200 30% 0% / 0.20);
    --shadow-sm: 0 1px 2px 0 hsl(200 30% 0% / 0.30), 0 1px 1px -1px hsl(200 30% 0% / 0.20);
    --shadow-md: 0 4px 6px -1px hsl(200 30% 0% / 0.30), 0 2px 4px -2px hsl(200 30% 0% / 0.20);
    --shadow-lg: 0 10px 15px -3px hsl(200 30% 0% / 0.40), 0 4px 6px -4px hsl(200 30% 0% / 0.20);
    --shadow-xl: 0 20px 25px -5px hsl(200 30% 0% / 0.40), 0 8px 10px -6px hsl(200 30% 0% / 0.20);

    /* Motion */
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-in: cubic-bezier(0.4, 0, 1, 1);
    --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --duration-fast: 120ms;
    --duration-base: 180ms;
    --duration-slow: 280ms;

    /* Type scale (foundation; applied in iter 2) */
    --text-xs: 11px;
    --text-sm: 12.5px;
    --text-base: 13.5px;
    --text-md: 14px;
    --text-lg: 16px;
    --text-xl: 20px;
    --text-2xl: 28px;
    --tracking-tight: -0.011em;
    --tracking-normal: 0;
    --tracking-wide: 0.04em;

    /* Lodestone semantic colors (kept for console view) */
    --ls-green: 148 44% 52%;
    --ls-red: 352 57% 57%;
    --ls-orange: 33 63% 55%;
    --ls-accent: 156 46% 58%;
    --ls-accent-dim: rgba(94, 201, 160, 0.12);
    --ls-accent-glow: rgba(94, 201, 160, 0.28);
  }
```

- **Snippet (body font-size)**: Replace line 54-55 of `src/index.css`:

```css
  body {
    @apply bg-background text-foreground font-sans;
    font-size: var(--text-base);
    line-height: 1.5;
  }
```

- **Snippet (motion tokens)**: Replace the three `ease-out` strings at
  `src/index.css:103, 117, 126`:

  - Line 103: `animation: pulse-ring 1.4s ease-out infinite;` →
    `animation: pulse-ring 1.4s var(--ease-out) infinite;`
  - Line 117: `animation: shimmer 2.5s linear infinite;` →
    `animation: shimmer 2.5s var(--duration-slow) linear infinite;`
  - Line 126: `animation: fade-up 0.18s ease-out;` →
    `animation: fade-up var(--duration-base) var(--ease-out);`

- **Snippet (drop --sidebar-w)**: Delete the second `:root` block at
  `src/index.css:130-132`:

```css
  /* Sidebar width */
  :root {
    --sidebar-w: 220px;
  }
```

(Remove the comment and the three lines.)

---

### Change 2 — Wire status / chart / sidebar colors + shadow + spacing in `tailwind.config.js`

- **File**: `tailwind.config.js`
- **What**: Add `status`, `chart`, `sidebar` color entries with the
  `<alpha-value>` placeholder; add a `borderRadius.xl / 2xl / pill`
  entry; add a `boxShadow` mapping; add `sidebar` and
  `sidebarCollapsed` spacing values.
- **Snippet**: Replace the existing `colors: { ... }` block at
  `tailwind.config.js:28-62` and the `borderRadius` block at
  `tailwind.config.js:63-67`. After the change:

```js
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        status: {
          online: 'hsl(var(--status-online) / <alpha-value>)',
          warn: 'hsl(var(--status-warn) / <alpha-value>)',
          offline: 'hsl(var(--status-offline) / <alpha-value>)',
          error: 'hsl(var(--status-error) / <alpha-value>)',
        },
        chart: {
          1: 'hsl(var(--chart-1) / <alpha-value>)',
          2: 'hsl(var(--chart-2) / <alpha-value>)',
          3: 'hsl(var(--chart-3) / <alpha-value>)',
          4: 'hsl(var(--chart-4) / <alpha-value>)',
          5: 'hsl(var(--chart-5) / <alpha-value>)',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      spacing: {
        sidebar: '220px',
        'sidebar-collapsed': '48px',
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },
```

The existing `keyframes` and `animation` blocks remain untouched.

---

### Change 3 — Page shell refactor in `src/App.jsx`

- **File**: `src/App.jsx`
- **What**: Drop the `position: fixed` + `margin-left: var(--sidebar-w)`
  + `pt-[calc(3.5rem+1.25rem)]` pattern. Sidebar becomes a flex
  child, header becomes `sticky top-0` (no more `left: var(--sidebar-w)`).
- **Snippet**: Replace the return body of `AppShell` at `App.jsx:135-153`:

```jsx
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar currentView={currentView} onNavigate={navigate} />
      <div className="flex min-h-screen flex-1 min-w-0 flex-col">
        <Header
          currentView={currentView}
          onServerSwitch={handleSetActive}
          onStart={() => serverAction('start')}
          onStop={() => serverAction('stop')}
          onRestart={() => serverAction('restart')}
        />
        <main className="flex-1 p-5">
          <div className="view-enter" key={currentView}>
            {views[currentView] || null}
          </div>
        </main>
      </div>
    </div>
  );
```

---

### Change 4 — Sidebar surface tokens + active bar + density

- **File**: `src/components/layout/Sidebar.jsx`
- **What**: Use the new `--sidebar` / `--sidebar-border` tokens; add
  a 2-px left accent to the active item; bump group-label opacity;
  tighten item padding; drop the `width: 'var(--sidebar-w)'` inline
  style in favor of `w-sidebar shrink-0`.
- **Snippet**: Replace the `<aside>` opening tag at `Sidebar.jsx:76-79`:

```jsx
    <aside className="flex w-sidebar shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
```

- **Snippet**: Replace the active-button `cn(...)` call at
  `Sidebar.jsx:105-110`:

```jsx
                className={cn(
                  'flex w-full items-center gap-3 rounded-md border-l-2 px-3 py-1.5 text-sm transition-colors',
                  currentView === view
                    ? 'border-l-primary bg-primary/10 text-primary'
                    : 'border-l-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
```

- **Snippet**: Bump the group-label opacity at `Sidebar.jsx:93`:

```jsx
              className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 hover:text-muted-foreground transition-colors"
```

(only the `/60` → `/70` changes; the rest is a verbatim restatement so
the implementer can copy the whole line.)

---

### Change 5 — Header sticky + tracking-tight title

- **File**: `src/components/layout/Header.jsx`
- **What**: Switch from `position: fixed` (with `left: var(--sidebar-w)`)
  to `sticky top-0`; add `tracking-tight` to the view title.
- **Snippet**: Replace the `<header>` opening tag at `Header.jsx:20-23`:

```jsx
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-5">
```

- **Snippet**: Replace the `<h1>` at `Header.jsx:26-28`:

```jsx
        <h1 className="text-sm font-semibold tracking-tight text-foreground">
```

---

### Change 6 — ServerSelector trigger surface

- **File**: `src/components/layout/ServerSelector.jsx`
- **What**: No structural change. The trigger's `bg-secondary/50` is
  acceptable against the new `--secondary` token (`200 6% 16%`). If
  visual review shows the trigger blends into the header, swap to
  `bg-muted/60`. No code change required in iter 1.
- **Snippet**: None (review-only).

---

### Change 7 — StatusPill tokenization

- **File**: `src/components/shared/StatusPill.jsx`
- **What**: Replace the four `STATUS_VARIANTS` strings with
  status-token variants; tokenize `StatusDot` colors.
- **Snippet**: Replace lines 3-8:

```js
const STATUS_VARIANTS = {
  online:   'bg-status-online/10 text-status-online border border-status-online/20',
  offline:  'bg-muted/50 text-muted-foreground border border-border',
  starting: 'bg-status-warn/10 text-status-warn border border-status-warn/20',
  stopping: 'bg-status-warn/10 text-status-warn border border-status-warn/20',
};
```

- **Snippet**: Replace lines 23-37 (the whole `StatusDot` function):

```jsx
export function StatusDot({ status = 'offline', className }) {
  const isOnline = status === 'online';
  const dotClass =
    isOnline ? 'bg-status-online' :
    status === 'offline' ? 'bg-muted-foreground/50' :
    'bg-status-warn';
  return (
    <span className={cn('relative flex h-1.5 w-1.5 shrink-0', className)}>
      {isOnline && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-online opacity-60" />
      )}
      <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', dotClass)} />
    </span>
  );
}
```

---

### Change 8 — Badge tokenization

- **File**: `src/components/ui/badge.jsx`
- **What**: Same token swap as `StatusPill` — palette colors → status
  tokens.
- **Snippet**: Replace the `variant` map at `badge.jsx:9-17`:

```js
      variant: {
        default: 'bg-secondary text-secondary-foreground border border-border',
        online: 'bg-status-online/10 text-status-online border border-status-online/20',
        offline: 'bg-muted text-muted-foreground border border-border',
        starting: 'bg-status-warn/10 text-status-warn border border-status-warn/20',
        stopping: 'bg-status-warn/10 text-status-warn border border-status-warn/20',
        active: 'bg-primary/15 text-primary border border-primary/25',
        destructive: 'bg-status-error/10 text-status-error border border-status-error/20',
      },
```

---

### Change 9 — Button success / destructive / glass tokenization

- **File**: `src/components/ui/button.jsx`
- **What**: Replace the `success`, `destructive`, and `glass` variant
  strings.
- **Snippet**: Replace lines 13-14 (`destructive`), 23-24 (`success`),
  and 25-26 (`glass`) of `src/components/ui/button.jsx`:

```js
        destructive:
          'bg-destructive/15 text-status-error border border-destructive/40 hover:bg-destructive/25 hover:-translate-y-px active:translate-y-0',
```

```js
        success:
          'bg-status-online/10 text-status-online border border-status-online/20 hover:bg-status-online/15 hover:-translate-y-px active:translate-y-0',
```

```js
        glass:
          'bg-foreground/[0.04] border border-border/60 backdrop-blur-sm hover:bg-foreground/[0.08] hover:-translate-y-px active:translate-y-0',
```

The `default`, `outline`, `secondary`, `ghost`, `link` variants stay
unchanged.

---

### Change 10 — Modrinth compat pill tokenization

- **File**: `src/views/ModrinthView.jsx`
- **What**: One-line swap on the orange fallback pill.
- **Snippet**: Replace line 69:

```jsx
            : 'bg-status-warn/10 text-status-warn border-status-warn/25'
```

---

### Change 11 — Extract KpiTile to `src/components/shared/KpiTile.jsx`

- **File (new)**: `src/components/shared/KpiTile.jsx`
- **What**: New file. Move the `KpiTile` function out of
  `DashboardView.jsx` and replace the `colorClass` string prop with a
  `tone` prop. The tile drives both the left border and the icon-box
  tint from `tone`.
- **Snippet**: New file contents:

```jsx
import { cn } from '@/lib/utils';

const TONE_CLASSES = {
  online:  'border-l-status-online',
  warn:    'border-l-status-warn',
  error:   'border-l-status-error',
  primary: 'border-l-primary',
  neutral: 'border-l-border',
};

const ICON_BG = {
  online:  'bg-status-online/10 text-status-online',
  warn:    'bg-status-warn/10 text-status-warn',
  error:   'bg-status-error/10 text-status-error',
  primary: 'bg-primary/10 text-primary',
  neutral: 'bg-muted/40 text-muted-foreground',
};

export function KpiTile({ icon: Icon, label, value, sub, tone = 'neutral' }) {
  return (
    <div className={cn(
      'flex items-center gap-4 rounded-lg border border-border bg-card p-4',
      'border-l-2 transition-all hover:-translate-y-0.5',
      TONE_CLASSES[tone]
    )}>
      <div className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
        ICON_BG[tone]
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold text-foreground truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  );
}
```

---

### Change 12 — Dashboard: tokenize kpi/tps colors, sparkline, disk bar; import the new KpiTile

- **File**: `src/views/DashboardView.jsx`
- **What**:
  1. Import `KpiTile` from `@/components/shared/KpiTile` and **delete**
     the local `KpiTile` function (lines 10-29).
  2. Replace `kpiColor` / `tpsColor` (lines 111-120) with a `tone` map.
  3. Update each `<KpiTile>` call site to use `tone="..."` instead of
     `colorClass="border-l-..."`.
  4. Tokenize the sparkline stroke and fill (lines 52, 56).
  5. Tokenize the disk bar thresholds (lines 199-201).
- **Snippet (delete the local KpiTile)**: Delete the entire block
  `DashboardView.jsx:9-29` (the `// KPI tile component` comment + the
  `KpiTile` function). Add the import at the top alongside the other
  imports:

```jsx
import { KpiTile } from '@/components/shared/KpiTile';
```

- **Snippet (kpi/tps colors)**: Replace `DashboardView.jsx:111-120`
  with a `tone` map:

```jsx
  const kpiTone = {
    online: 'online', starting: 'warn', stopping: 'warn', offline: 'neutral',
  }[status.status] || 'neutral';

  const tpsTone = status.tps >= 19 ? 'online' :
                  status.tps >= 15 ? 'warn' :
                  status.tps ? 'error' : 'neutral';
```

- **Snippet (KPI call sites)**: Replace each `colorClass="border-l-..."`
  with `tone="..."` at `DashboardView.jsx:131, 138, 144, 150`:

  - Tile 1 (Status): drop `colorClass={kpiColor}` and add
    `tone={kpiTone}`.
  - Tile 2 (Players online): drop `colorClass="border-l-primary"`
    and add `tone="primary"`.
  - Tile 3 (Performance/TPS): drop `colorClass={tpsColor}` and add
    `tone={tpsTone}`.
  - Tile 4 (Uptime): drop `colorClass="border-l-border"` and add
    `tone="neutral"`.

- **Snippet (sparkline colors)**: Replace lines 32-58 of
  `DashboardView.jsx` (`drawSpark` function):

```jsx
function drawSpark(canvas, data) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const c = getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim();
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = `hsl(${c})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = `hsl(${c} / 0.08)`;
  ctx.fill();
}
```

- **Snippet (disk bar)**: Replace the threshold `cn(...)` at
  `DashboardView.jsx:197-202`:

```jsx
                    className={cn(
                      'h-full rounded-full transition-all',
                      ((stats.disk.total - stats.disk.free) / stats.disk.total) >= 0.9 ? 'bg-status-error' :
                      ((stats.disk.total - stats.disk.free) / stats.disk.total) >= 0.75 ? 'bg-status-warn' :
                      'bg-primary'
                    )}
```

(The `style={{ width: ... }}` line below it stays unchanged.)

---

### Definition of done

The implementer and reviewer both check these.

1. `npm run build` completes without warnings about unknown
   `bg-status-*`, `text-status-*`, `border-l-status-*`,
   `bg-chart-*`, `bg-sidebar*`, `border-sidebar-border`,
   `rounded-xl`, `rounded-2xl`, `rounded-pill`, `shadow-md`,
   `shadow-lg`, or `w-sidebar` utilities.
2. `src/index.css` has no `--sidebar-w` definition; the three
   `ease-out` strings are now `var(--ease-out)` or
   `var(--duration-base) var(--ease-out)`; the body font-size
   resolves to `var(--text-base)`.
3. `tailwind.config.js` exposes `status`, `chart`, `sidebar`
   colors, the new borderRadius + boxShadow entries, and the
   `sidebar` / `sidebar-collapsed` spacing values.
4. `src/components/shared/KpiTile.jsx` exists; the local
   `KpiTile` function in `src/views/DashboardView.jsx` is gone.
5. `src/App.jsx` has no `marginLeft: 'var(--sidebar-w)'`,
   no `pt-[calc(3.5rem+1.25rem)]`, and the Header is no longer
   `fixed`.
6. `src/components/layout/Sidebar.jsx` has no
   `bg-[hsl(200_6%_8%)]` or `style={{ width: 'var(--sidebar-w)' }}`;
   the active item has a `border-l-2 border-l-primary` bar.
7. `src/components/shared/StatusPill.jsx`,
   `src/components/ui/badge.jsx`, and
   `src/components/ui/button.jsx` have no literal
   `green-500`, `green-400`, `green-600`, `orange-500`,
   `orange-400`, `red-400`, or `red-300` Tailwind palette
   colors.
8. `src/views/ModrinthView.jsx:69` uses status-warn tokens.
9. Sparkline stroke reads from `--chart-1` (visual: line
   color matches the brand mint; line + area fill both update
   if `--chart-1` is changed in DevTools).
10. Disk bar uses `bg-status-error` / `bg-status-warn` /
    `bg-primary` (no Tailwind palette reds/oranges).
11. All 14 views still render — `npm run dev` boots,
    `http://localhost:2121` loads, each sidebar entry
    navigates, and the dashboard shows a four-tile KPI strip
    with tokenized left borders and a sparkline that picks up
    `--chart-1` at runtime.
