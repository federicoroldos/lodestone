# Iter 1 — Investigation Report (Foundation & Architecture)

> **Important discrepancy with the brief.** The brief describes Lodestone as a
> vanilla-HTML/CSS/JS, no-build, no-framework project with
> `public/index.html` + `public/app.js` + `public/style.css`. The actual
> codebase is a modern **React 18 + Vite 6 + Tailwind 3 + Radix UI +
> shadcn-style components + lucide-react + cva** SPA, with `src/index.css`,
> `src/components/*`, `src/views/*`, and a `npm run build` that emits
> `public/assets/index-*.js` and `public/assets/index-*.css`. The legacy
> `public/style.css`/`public/app.js` were deleted on the `prunell` branch and
> the `public/index.html` is a Vite build manifest, not hand-written HTML.
> `CLAUDE.md` is consequently out of date and this report is grounded in the
> files that actually exist on disk (`git status` confirms the working
> tree).

The hard rules that *do* still apply: **English only**, **no Claude
co-author trailer**, **don't commit secrets**, **don't push without asking**.
The "no build, no framework" rule is moot — the framework is already in
place; this iteration is about *polishing* its design system, not
re-platforming it.

---

## Current state summary

### Design language today

- **Stack**: shadcn-style tokens (HSL CSS variables) in
  `src/index.css:6-46`, mapped to Tailwind utilities in
  `tailwind.config.js:28-67`. Dark theme is hardcoded — `<html class="dark">`
  in `index.html:2`, no light variant exists.
- **Color palette** (HSL, current):
  - `background 200 6% 9%` → near-neutral charcoal, very slight cyan tint
  - `card 204 8% 13%` → +4% lift over bg
  - `muted 199 8% 16%`, `border 199 9% 22%`
  - `foreground 220 2% 68%` (medium gray), `muted-foreground 210 4% 57%`
  - `primary 156 46% 58%` → mint/teal green, used as accent and brand
  - `destructive 352 57% 57%` → desaturated red
  - `ls-orange 33 63% 55%` → warn color, only inside `.console-area`
  - `ls-accent-dim` / `ls-accent-glow` as raw RGBA — not a token
- **Typography**: body `font-size: 14px; line-height: 1.5` on
  `src/index.css:54-56`. Stack is macOS-first
  (`-apple-system, BlinkMacSystemFont, SF Pro Display, SF Pro Text…Arial`).
  Mono stack: SF Mono / JetBrains Mono / Cascadia Code. **No size scale is
  defined** — every view uses `text-xs`, `text-sm`, `text-[10px]`,
  `text-[10.5px]`, `text-[11px]`, `text-xl` arbitrarily.
- **Layout**: Sidebar `position: fixed; width: 220px` (`src/index.css:131`,
  `src/components/layout/Sidebar.jsx:76-79`). Main uses
  `margin-left: var(--sidebar-w)` (`src/App.jsx:138`). Header is also
  `position: fixed; left: var(--sidebar-w); right: 0; height: h-14` (56px,
  `src/components/layout/Header.jsx:21-23`).
- **Spacing**: ad-hoc Tailwind utilities — `p-5`, `gap-4`, `gap-5`, `mb-3`,
  `py-2.5`, etc. No base unit declared; the 4-px grid is implicit.
- **Radius**: `--radius: 0.5rem` (8px) at `src/index.css:36`, mapped to
  `borderRadius.lg/md/sm` in `tailwind.config.js:63-67`.
- **Shadows**: only `shadow-sm` on Card and `shadow-xl` on the
  ServerSelector popover. No shadow scale.
- **Motion**: `fade-up 0.18s ease-out` for view transitions
  (`src/index.css:121-127`), `pulse-ring 1.4s ease-out infinite` for the
  online dot (`src/index.css:93-104`), `shimmer 2.5s linear infinite` defined
  but only used by `.shimmer-btn` (which is never referenced in JSX — dead
  code). Dialog open/close animations come from `tailwindcss-animate`.

### What's working

1. **shadcn-style token plumbing is in place.** Every semantic name
   (`bg-card`, `text-muted-foreground`, `border-border`, `ring-ring`) works
   out of the box because the Tailwind config wires the CSS variables
   correctly. Future token changes only need to touch `:root`.
2. **Sidebar grouping + localStorage persistence.** `Sidebar.jsx:52-73` reads
   and writes `ls-collapsed-navs` for which group sections are collapsed.
   That pattern should be kept.
3. **Lucide + Radix + CVA primitives.** The 9 `components/ui/*` files
   (button, card, dialog, input, select, tabs, etc.) follow the shadcn
   pattern with `React.forwardRef` + CVA variants. Button has 7 variants
   and 6 sizes — solid foundation.
4. **Status pill pattern with pulse animation** (`StatusPill.jsx:23-37`)
   already uses an `animate-ping` ring on the inner dot. Worth keeping.
5. **KPI tile composition** (`DashboardView.jsx:10-29`): icon-box + label +
   value + sub on a single card with a colored left border. Reads cleanly,
   just needs a token pass.
6. **Sparkline-on-canvas** (`DashboardView.jsx:32-58`): pure-DPR canvas,
   150-point rolling buffer per metric, line + area fill, accent-colored.
   Good primitive; just hardcodes `#5EC9A0` for the stroke.
7. **No JS dependencies outside the existing list** — `package.json` has
   React, Radix, lucide, cva, clsx, tailwind-merge, sonner, tailwindcss-
   animate. The footprint matches the zero-config ethos once you accept
   the build step.

### What's dated or weak

1. **Hardcoded Tailwind palette colors leak into JSX.** Examples:
   - `DashboardView.jsx:112-120` — `border-l-green-500`, `border-l-orange-500`,
     `border-l-red-500` on KPI tiles. A brand-color change requires editing
     these strings.
   - `StatusPill.jsx:3-8` — `bg-green-500/10 text-green-400 border
     border-green-500/20`, same for orange. The status palette is not
     tokenized.
   - `button.jsx:24-26` — `bg-green-600/20 text-green-400 border
     border-green-600/40` for the success variant. Same problem.
   - `ConsoleView.jsx:72` — `text-red-400` on login error. Should be
     `text-destructive`.
   - `LoginView.jsx:36-40` — the login grid is
     `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px)`. The
     `1px` line is too dark/opaque at 0.03 alpha on this background.
   - `DashboardView.jsx:199-201` — disk-usage bar uses raw `bg-red-500`,
     `bg-orange-500`, `bg-primary` thresholds inline.
2. **No light-mode tokens exist.** The brief says "dark mode dashboard"
   so this is acceptable, but defining `.light` scope tokens now costs
   almost nothing and saves a future migration.
3. **No semantic chart palette.** Sparklines and the disk bar all share
   one green. Five distinct chart series would help the Metrics view later
   even if not used now.
4. **No sidebar-specific tokens.** shadcn v3 has
   `--sidebar / --sidebar-foreground / --sidebar-primary / --sidebar-border
   / --sidebar-ring` for the exact reason that sidebars often need a
   slightly different surface than the main area. We currently re-use
   `--background` and `--border`, which is fine but limits future contrast
   tweaks.
5. **Fixed-position sidebar + fixed-position header is a 2018-era pattern.**
   `App.jsx:136-151` uses `position: fixed` and `margin-left: var(--sidebar-w)`
   to compose. The shadcn approach is a single `<div class="flex min-h-screen">`
   with `<Sidebar />` as a flex child. Same result, no global CSS var
   needed.
6. **Sidebar has no collapse-to-icons option.** It is fixed at 220px and
   the only state it remembers is which group sections are expanded. A
   "widescreen" with 13 nav items wants a collapse option for monitors
   and TVs.
7. **KPI card has a 2-px left border that visually misaligns the icon
   box** (`DashboardView.jsx:13-16`). The icon box is also a
   `border border-border bg-muted/40` square — busy. Drop the icon
   background, use a flat tinted icon and a single left border.
8. **Sparkline stroke color is hardcoded `#5EC9A0`** — should reference
   the primary token.
9. **No backdrop-blur / translucent surface vocabulary.** The header has
   `bg-background/80 backdrop-blur-sm` (good), but nothing else does.
10. **Logo is `◆` + the word "Lodestone"** with no real visual identity.
    Out of scope here (would be a separate design pass), but worth
    noting that the current mark is a unicode diamond.
11. **Console `.console-area` background is hardcoded `#0e1012`**
    (`src/index.css:79`). Should be a token so it stays in sync with the
    app surface.
12. **Density of the dashboard body text is on the high side.** Body is
    14 px with `text-[10.5px]`-uppercase labels everywhere — verges on
    cramped on a 1080p monitor at 100% scaling. A 13-px body with a clearer
    type scale reads better.

---

## Inspiration sources

Each item is a real, verifiable reference (URL, what to borrow, why it
matters to Lodestone).

### 1. shadcn/ui — Theming docs
- **URL**: https://ui.shadcn.com/docs/theming
- **Why it matters for Lodestone**: the project is already a shadcn fork
  in everything-but-name. Adopting shadcn's *exact* token list (including
  `chart-1`–`chart-5` and the `sidebar-*` family) lines us up with
  ecosystem knowledge: any new component copied from shadcn will Just
  Work.
- **Borrow**:
  1. The full token list including `chart-1..5`, `sidebar`, `sidebar-primary`,
     `sidebar-accent`, `sidebar-border`, `sidebar-ring`, `sidebar-foreground`,
     `sidebar-primary-foreground`, `sidebar-accent-foreground` — defined in
     `:root` and overridden under `.dark` (or vice versa for our dark-first
     approach).
  2. The radius scale derivation: `--radius-sm = --radius * 0.6`,
     `--radius-md = --radius * 0.8`, `--radius-lg = --radius`,
     `--radius-xl = --radius * 1.4`. One knob, five sizes.
  3. The semantic pair convention: every `bg-*` token has a matching
     `*-foreground`. So `bg-card` always pairs with `text-card-foreground`.
     Today Lodestone's `primary-foreground` is `158 46% 9%` (dark green on
     light-green primary) — that's the *correct* shape.

### 2. Uptime Kuma — `vars.scss`
- **URL**: https://github.com/louislam/uptime-kuma/blob/master/src/assets/vars.scss
- **Why it matters for Lodestone**: closest spiritual sibling — also a
  self-hosted, single-process ops panel on Windows/Linux. Their color
  file is 23 lines of well-considered SCSS that we can read as a sanity
  check.
- **Borrow**:
  1. **Brand green** `#5cdd8b` — almost identical to Lodestone's
     `hsl(156 46% 58%)` ≈ `#5ec9a0`. Confirms our accent is on-trend for
     monitoring tools (vs. Linear's purple or Vercel's monochrome).
  2. **`$dark-bg: #0d1117`** for the page surface and **`$dark-bg2:
     #070a10`** as a deeper "stage" behind the console. Lodestone's
     `console-area` background is `#0e1012`; we should tokenize this as
     `--console-bg` ≈ `#0c0f12`.
  3. **`$border-radius: 50rem`** for status pills, but Kuma goes too far
     (everything becomes a pill). We will keep the existing 8-px default
     and only use pill rounding on status indicators.
  4. **`$easing-in / $easing-out / $easing-in-out`** as concrete
     `cubic-bezier()` values. Worth adopting rather than the generic
     `ease-out` we use today.

### 3. Pterodactyl — `NavigationBar.tsx`
- **URL**: https://github.com/pterodactyl/panel/blob/develop/resources/scripts/components/NavigationBar.tsx
- **Why it matters for Lodestone**: Pterodactyl is the *direct* competitor
  in the game-server-panel space. Their top nav is a `bg-neutral-900`
  with `h-[3.5rem]` (= 56 px, same as our current `h-14`) and an *inset
  bottom border* on the active link via `box-shadow: inset 0 -2px
  ${theme`colors.cyan.600`.toString()};`. That is the cleanest active-state
  indicator in the category and works whether or not we end up on a
  top nav or a side nav.
- **Borrow**:
  1. **Active indicator pattern** — for sidebar items, a 2-px left
     border or a tinted background + a left-side accent strip. (The
     current Lodestone sidebar already does `bg-primary/10`; we just need
     to standardize it as a token.)
  2. **Header height** of 56 px — keep.
  3. **`hover:text-foreground bg-black` reverse-hover** on the right-side
     nav links. This is the simplest, hardest-to-mess-up hover state.

### 4. Refactoring UI — book
- **URL**: https://refactoringui.com
- **Why it matters for Lodestone**: not a visual reference; a *design
  philosophy* reference. Adam Wathan and Steve Schoger are the authors
  of Tailwind CSS, so their design rules line up with our token system
  by definition.
- **Borrow**:
  1. **"Use fewer borders."** The dashboard currently draws a
     `border border-border` on the icon box *inside* the KPI card. Drop
     it; rely on the card border alone.
  2. **"Ditch hex for HSL"** — we already do this, but their further
     advice is to also ditch raw `bg-white/10` and use named tokens.
     Today `class="bg-white/[0.04] border border-border/60 backdrop-blur-sm"`
     on the `glass` button variant (`button.jsx:26`) is a smell; replace
     with a `surface-elevated` token.
  3. **"Establish a type scale."** We do not have one. Refactoring UI
     suggests a geometric series around 1.125–1.250. Concrete proposal
     below.
  4. **"Establish a spacing and sizing system."** We have 4-px and 8-px
     mixed freely. Standardize on a 4-px scale.

### 5. Beszel — marketing site
- **URL**: https://beszel.dev
- **Why it matters for Lodestone**: the *aesthetic* Beszel hits (clean,
  two-tone, dark by default, no marketing fluff) matches what we want
  the panel to feel like. We cannot extract their actual tokens (the
  hub is PocketBase-served, not on a public marketing page), but their
  visual language is the north star.
- **Borrow**:
  1. **One hero metric per card, no decoration** — Beszel's systems
     table shows CPU%, MEM%, disk% as the *only* numbers on each row.
     We should resist the urge to add sub-metrics to every tile.
  2. **Time-window chips** at the top of every chart ("5m / 1h / 12h /
     24h / 7d"). Out of scope for this iteration but worth a follow-up.
  3. **Single-color status semantics** (green = good, orange = warn,
     red = bad) — exactly what we already have, no change needed.

### 6. Linear — `linear.app`
- **URL**: https://linear.app
- **Why it matters for Lodestone**: Linear's sidebar (grouped sections,
  icons + label, 220-px wide, no collapse-on-mobile) is the gold
  standard for the nav shape we already have. Their typography is
  Inter at 13-px body with very tight letter-spacing.
- **Borrow**:
  1. **13-px body** with `tracking-tight` on headings. We are at 14 px;
     step down to 13.5 px and re-check density.
  2. **Sidebar group labels in 10.5-px uppercase with 0.08em
     letter-spacing, 40% opacity** — almost exactly what we have at
     `text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60`
     on `Sidebar.jsx:93`. Keep it.
  3. **Single-line nav items with 6-px vertical padding** — we are at
     `py-2` (8 px). Tighten to `py-1.5` for a denser look that matches
     Linear and Pterodactyl.

### 7. Vercel — `vercel.com` dashboard
- **URL**: https://vercel.com
- **Why it matters for Lodestone**: Vercel is the densest "ops
  dashboard with status" in production today. Their header is a single
  line with project selector, environment switcher, deployment state
  pill, and a "Promote to Production" primary button — almost exactly
  the shape of our Header.
- **Borrow**:
  1. **Header right-to-left action order**: status pill → secondary
     action → primary action. (We currently have Start → Restart → Stop
     which is correct for our domain — keep, but render the destructive
     Stop button last so the thumb targets it deliberately.)
  2. **Backdrop-blur header with 1-px bottom border**. We have
     `bg-background/80 backdrop-blur-sm` — keep.
  3. **View title lives on the *left* of the header, not above it** —
     we already do this. Confirms.

### 8. Grafana Cloud — public dashboard
- **URL**: https://grafana.com
- **Why it matters for Lodestone**: Grafana is the densest panel in the
  world and we do not want to look like Grafana. We borrow only its
  *card layout* convention: 12-col grid, KPI strip on top, then a
  two-column area for time series + sidebar info.
- **Borrow**:
  1. **KPI strip is 4 tiles, full row, equal width** — we have
     `grid-cols-2 xl:grid-cols-4`. Keep.
  2. **Below the KPI strip, a 2/3 + 1/3 split** for the main panel +
     details card. We have `xl:grid-cols-5` with 3+2 — that's the same
     proportion. Keep.

### 9. shadcn/ui — Sidebar component (registry preview)
- **URL**: https://ui.shadcn.com/docs/components/sidebar
- **Why it matters for Lodestone**: the most recent shadcn sidebar is
  the canonical collapsible pattern: it uses a CSS variable
  `--sidebar-width` and a state machine for `expanded | collapsed |
  icon-only`. It is the model for the optional icons-only mode we
  should ship.
- **Borrow**:
  1. **A toggle that snaps sidebar between 220-px expanded and 48-px
     icon-rail.** Persisted in `localStorage` (same pattern as
     `ls-collapsed-navs`).
  2. **Sidebar surface is `--sidebar` (slightly darker than
     `--background`)** with `--sidebar-border` for the divider. Provides
     the subtle "stage" look Kuma and Linear use.

### 10. Tailwind v4 OKLCH palette reference
- **URL**: https://tailwindcss.com/docs/customizing-colors
- **Why it matters for Lodestone**: the Tailwind docs list the
  authoritative OKLCH values for every shade of every color. If we
  move to OKLCH (recommended for v4; optional for us), we can
  ground-truth our choices against this table. Concretely the
  `--color-zinc-900 = oklch(0.21 0.006 285.885)` is the closest
  canonical match to Lodestone's current
  `hsl(200 6% 9%) ≈ #161a1c`.
- **Borrow**:
  1. **Don't move to OKLCH in this iteration** — HSL works and matches
     the existing shadcn-style tokens. Flag as a v2 opportunity.
  2. **The `zinc` and `neutral` scales** are the closest reference for
     our `--border` and `--muted` shades; we are already in the same
     neighborhood.

---

## Proposed design tokens

> All values replace or augment the `:root` block in `src/index.css:6-46`.
> Shadcn-style semantic naming is preserved. Names marked **(new)** are
> additions; everything else is a value refresh of the existing token.

### Background scale (4 shades, darkest → lightest)

| Token               | Current            | Proposed            | Notes                          |
| ------------------- | ------------------ | ------------------- | ------------------------------ |
| `--background`      | `200 6% 9%` (≈#16191b) | `200 6% 8.5%` (≈#14181a) | Slightly deeper, matches Kuma  |
| `--card`            | `204 8% 13%` (≈#1d2428) | `204 8% 12%` (≈#1b2226) | +3% lift, keeps visible card edge |
| `--popover`         | `204 8% 13%`       | `204 8% 14%` (≈#1d2428) | One shade higher than card so it floats |
| `--secondary`       | `199 8% 16%`       | `200 6% 16%` (≈#252a2d) | Decouples secondary from card |
| `--muted`           | `199 8% 16%`       | `200 6% 18%` (≈#292e31) | Slightly higher to read as a "row" surface |
| `--sidebar` **(new)** | n/a              | `200 8% 7%` (≈#11161a) | Deeper than bg, gives the nav a subtle "stage" |

### Foreground / text scale (4 shades)

| Token                    | Current          | Proposed           | Notes                          |
| ------------------------ | ---------------- | ------------------ | ------------------------------ |
| `--foreground`           | `220 2% 68%`     | `210 4% 78%` (≈#c9d0d6) | Lifts body text legibility on dark |
| `--muted-foreground`     | `210 4% 57%`     | `210 4% 56%` (≈#8a9499) | Keep, but tighten ratio |
| `--card-foreground`      | `220 2% 68%`     | `210 4% 78%`      | Match `--foreground`            |
| `--popover-foreground`   | `220 2% 68%`     | `210 4% 78%`      | Match `--foreground`            |
| `--secondary-foreground` | `220 2% 68%`     | `210 4% 78%`      | Match `--foreground`            |
| `--sidebar-foreground` **(new)** | n/a       | `210 4% 78%`      | Inherits foreground             |

### Accent / brand (Lodestone mint)

| Token                    | Current            | Proposed            | Notes                          |
| ------------------------ | ------------------ | ------------------- | ------------------------------ |
| `--primary`              | `156 46% 58%` (≈#5ec9a0) | `156 46% 58%`      | **No change** — confirmed against Kuma |
| `--primary-foreground`   | `158 46% 9%` (≈#0e2419)  | `158 46% 9%`       | **No change** — dark-green text on light-green pill |
| `--accent`               | `156 46% 58%`     | `199 60% 22%` (≈#1c3a4a) | Decouple from primary; subtle blue-grey for hover/selected rows |
| `--accent-foreground`    | `158 46% 9%`      | `210 4% 92%` (≈#e6eaee) | Light text on the blue-grey hover |
| `--ring`                 | `156 46% 58%`     | `156 46% 58%`      | **No change** — focus ring = brand |

### Semantic status colors (new tokens, replacing inline Tailwind palette)

| Token                          | Value               | Notes                          |
| ------------------------------ | ------------------- | ------------------------------ |
| `--status-online` **(new)**    | `142 52% 50%` (≈#34c97a) | Online dot + "online" pill text |
| `--status-online-bg` **(new)** | `142 52% 50% / 0.10` | Pill background                |
| `--status-online-border` **(new)** | `142 52% 50% / 0.22` | Pill border                    |
| `--status-warn` **(new)**      | `33 80% 56%` (≈#f2962a) | Starting / stopping / mid-TPS  |
| `--status-warn-bg` **(new)**   | `33 80% 56% / 0.10`  |                                 |
| `--status-warn-border` **(new)** | `33 80% 56% / 0.22` |                                 |
| `--status-offline` **(new)**   | `210 4% 56%` (≈#8a9499) | Offline                        |
| `--status-offline-bg` **(new)** | `210 4% 56% / 0.08` |                                 |
| `--status-offline-border` **(new)** | `210 4% 56% / 0.20` |                             |
| `--status-error` **(new)**     | `352 70% 60%` (≈#e74555) | Destructive / error / critical |
| `--status-error-bg` **(new)**  | `352 70% 60% / 0.10` |                                 |
| `--status-error-border` **(new)** | `352 70% 60% / 0.22` |                               |
| `--destructive`                | `352 57% 57%`      | Keep, for destructive buttons   |
| `--destructive-foreground`     | `0 0% 98%`         | Keep                            |

This kills the `green-500/10`, `orange-500/10`, `red-500` literals
scattered across `StatusPill.jsx`, `DashboardView.jsx`, `button.jsx`.

### Chart palette (5 series, new)

| Token                | Value               | Use                                |
| -------------------- | ------------------- | ---------------------------------- |
| `--chart-1`          | `156 46% 58%`       | Primary metric (CPU%, RAM%)        |
| `--chart-2`          | `199 80% 60%` (≈#3eb3e8) | Network, players                |
| `--chart-3`          | `266 60% 65%` (≈#9b7bd9) | TPS, secondary metric            |
| `--chart-4`          | `33 80% 56%`        | Disk, warn                         |
| `--chart-5`          | `352 70% 60%`       | Error, critical                    |

### Border / divider

| Token       | Current            | Proposed           | Notes                          |
| ----------- | ------------------ | ------------------ | ------------------------------ |
| `--border`  | `199 9% 22%` (≈#323a3f) | `200 8% 20%` (≈#2c3338) | Slightly tighter contrast  |
| `--input`   | `199 9% 22%`       | `200 8% 20%`      | Match border                   |
| `--sidebar-border` **(new)** | n/a   | `200 8% 16%` (≈#252a2d) | Slightly softer than main border |

### Typography

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI Variable",
             "Segoe UI", Inter, "Helvetica Neue", Arial, sans-serif;
--font-mono: ui-monospace, "JetBrains Mono", "Cascadia Code", "SF Mono",
             Consolas, "Liberation Mono", monospace;
--tracking-tight: -0.011em;     /* used on h1, h2 */
--tracking-normal: 0;
--tracking-wide: 0.04em;        /* used on uppercase labels */
```

Type scale (replace the ad-hoc Tailwind sizes, used as `--text-{step}`):

| Step | Size   | Line-height | Weight | Use                          |
| ---- | ------ | ----------- | ------ | ---------------------------- |
| `xs` | 11 px  | 1.45        | 500    | Uppercase labels, captions   |
| `sm` | 12.5 px | 1.5       | 400    | Table cells, secondary text  |
| `base` | 13.5 px | 1.55     | 400    | Body                         |
| `md` | 14 px  | 1.5         | 500    | KPI value, button text       |
| `lg` | 16 px  | 1.4         | 600    | Card title (rare)            |
| `xl` | 20 px  | 1.3         | 600    | Page h1                      |
| `2xl` | 28 px | 1.2         | 600    | Hero (login)                 |

(Step down from 14 px to 13.5 px body — Linear is at 13, Vercel at 14,
shadcn docs at 14. 13.5 is the middle ground for the dense panel we
have. Confirm visually before locking in.)

### Spacing scale (4-px base, named tokens)

```css
--space-0:  0;
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

In Tailwind: keep the existing utilities (`p-4`, `gap-3`, `mb-5`) but
**remove arbitrary values** like `p-[calc(3.5rem+1.25rem)]` on
`App.jsx:146`. The header is 56 px (3.5 rem) and the desired content
top padding is 20 px (`pt-5`). So `pt-[calc(3.5rem+1.25rem)]` should
be `pt-20` (5 rem = 80 px, gives 24 px of breathing room under the
header — actually close to right; confirm visually).

### Radius scale (derive from `--radius`)

```css
--radius:      0.5rem;   /* 8 px — base */
--radius-sm:   0.3rem;   /* 4.8 px — inputs, pills */
--radius-md:   0.4rem;   /* 6.4 px — buttons */
--radius-lg:   0.5rem;   /* 8 px — cards, modals */
--radius-xl:   0.7rem;   /* 11.2 px — popovers */
--radius-2xl:  0.9rem;   /* 14.4 px — hero login card */
--radius-pill: 9999px;   /* status pill */
```

Add to `tailwind.config.js` `theme.extend.borderRadius` so `rounded-md`,
`rounded-lg`, etc. resolve to the named CSS vars (today only
`sm/md/lg` are mapped at `tailwind.config.js:63-67`).

### Shadow scale

```css
--shadow-xs: 0 1px 2px 0 hsl(200 30% 0% / 0.20);
--shadow-sm: 0 1px 2px 0 hsl(200 30% 0% / 0.30),
             0 1px 1px -1px hsl(200 30% 0% / 0.20);
--shadow-md: 0 4px 6px -1px hsl(200 30% 0% / 0.30),
             0 2px 4px -2px hsl(200 30% 0% / 0.20);
--shadow-lg: 0 10px 15px -3px hsl(200 30% 0% / 0.40),
             0 4px 6px -4px hsl(200 30% 0% / 0.20);
--shadow-xl: 0 20px 25px -5px hsl(200 30% 0% / 0.40),
             0 8px 10px -6px hsl(200 30% 0% / 0.20);
```

Wire to `theme.extend.boxShadow` in Tailwind so `shadow-sm`, `shadow-md`,
etc. resolve to these. Today only `shadow-sm` (Card) and `shadow-xl`
(ServerSelector popover) are used — we'll see the full scale appear as
modals and the sidebar collapse menu get shadows.

### Motion

```css
--ease-out:   cubic-bezier(0.16, 1, 0.3, 1);   /* "expo out" — view change */
--ease-in:    cubic-bezier(0.4, 0, 1, 1);
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* popovers */

--duration-fast:  120ms;   /* hover, button press */
--duration-base:  180ms;   /* fade, slide */
--duration-slow:  280ms;   /* view change, modal open */
```

Replace the ad-hoc `ease-out` strings with the named easings in
`src/index.css:103, 117, 126` and any future `transition-*` utilities.

---

## Proposed layout

### Page shell

```
+---------------------------------------------------------------+
| <Sidebar>   | <Header>                                        |
| 220 px      | 56 px tall                                      |
| fixed       | fixed, backdrop-blur, 1-px bottom border         |
| flex-col    | h-14 px-5                                       |
|             |                                                 |
|             | <main>  flex-1, p-5, pt-20, min-h-screen        |
|             |   <div.view-enter key=currentView>              |
|             |     {views[currentView]}                        |
|             |   </div>                                        |
|             | </main>                                         |
+---------------------------------------------------------------+
```

**Change vs. today**: drop the `position: fixed` + `margin-left:
var(--sidebar-w)` pattern in favor of a single flex container
(`App.jsx:136-151`). Same visual result, less custom CSS, easier to
make the sidebar collapse without recomputing the margin.

### Sidebar

- **Default width**: 220 px (keep).
- **Collapsed width** (new, opt-in toggle in sidebar footer): 48 px.
  - Only the icon shows; group labels hide; tooltip on hover via
    Radix `Tooltip` (already in the dependency list).
  - State stored in `localStorage.ls-sidebar-mode = 'expanded' | 'collapsed'`.
- **Surface**: `--sidebar` (slightly deeper than page bg).
- **Right border**: `1px solid var(--sidebar-border)`.
- **Sections** (5 today, keep): Overview / Operate / Content /
  Maintenance / Settings. Per-section collapse already works.
- **Active item indicator** (new): 2-px left accent in
  `--sidebar-primary` (= `--primary`) with `bg-primary/10` background.
  Today we have the background but no left bar. The 2-px bar reads
  even when the background is muted by `hover:bg-secondary`.
- **Group label**: keep current 10-px uppercase tracking-widest
  `text-muted-foreground/60`, but bump the opacity floor to `/70` so it
  reads on the darker `--sidebar` surface.
- **Footer**: "Log out" button today, but add a small collapse/expand
  toggle (ChevronLeft / ChevronRight) to the right of it. Keyboard
  shortcut: `Cmd/Ctrl + B`.

### Header

- **Height**: 56 px (`h-14`, keep).
- **Position**: fixed, full-width to the right of the sidebar. Use
  `flex` instead of `position: fixed + left/right` so the math is the
  container's job.
- **Surface**: `bg-background/80 backdrop-blur-sm` (keep, on
  `--background`).
- **Bottom border**: `1px solid var(--border)` (today: `border-b`, keep).
- **Z-index**: `z-40` (keep). Bump to `z-50` if popovers are leaking
  over the header in practice — quick check.
- **Content layout** (left → right):
  1. **Server selector** (keep, with `--sidebar` background instead of
     `bg-secondary/50` for visual continuity).
  2. **View title** — `text-sm font-semibold tracking-tight` (was
     `text-sm font-semibold`, add the tracking).
  3. **Right group**:
     - Status pill (keep).
     - Stop button (`destructive` variant, last position so it is the
       far-right / thumb-reachable target).
     - Restart button (`glass` variant).
     - Start button (`success` variant, primary left-to-right reading
       is *Start → Restart → Stop*, but visually we want Stop closest
       to the edge — *Start, Restart, Stop* left-to-right, with
       Start visually emphasized as the safe default).

### Dashboard view

Grid (12 columns at `xl`, 6 at `lg`, 2 at `md`):

```
+--------------------- 12 cols ---------------------+
| KPI  | KPI  | KPI  | KPI  |      <- 4 x col-span-3
+----------------------------+
| Live resources (8 cols) | Server info (4 cols)
| - sparkline grid (4 rows) | - key/value list
| - disk bar               |
+----------------------------+
| (future) Recent backups, recent commands, alerts
+----------------------------+
```

KPI tile (refined):
- Remove the inner icon-box `border border-border bg-muted/40`. Replace
  with a flat 40×40 rounded-md using `bg-primary/10` (or status-tinted
  bg) and the icon in `text-primary` (or status-tinted foreground).
- Keep the `border-l-2` accent — change to `border-l-[2px]
  border-l-{status-online|status-warn|status-error|border}` mapped
  through the new semantic tokens.
- Label: 10.5-px uppercase tracking-wider muted.
- Value: 18-px (`text-lg`) semibold tabular-nums.
- Sub: 11.5-px muted.

Live resources card:
- Header: `Live resources` left, `last ~5 min` right (today's copy,
  keep).
- Each row: label (12.5 px muted, left) + value (12.5 px semibold
  tabular-nums, right) + 36-px-tall sparkline (full width).
- Row separator: 1-px `border-b border-border/60` (today `border-b
  border-border` — soften the contrast).
- Sparkline stroke: use the chart-1 token
  (`hsl(var(--chart-1))`) instead of hardcoded `#5EC9A0`.

Server info card:
- Header: `Server info` only (no right-side sub).
- Rows: label (12.5 px muted) + value (12 px mono, right-aligned,
  truncate). No nested borders — use row dividers.

---

## Risks / open questions

### What might be hard with vanilla CSS/JS

- **Sidebar collapse animation** (220 px ↔ 48 px) needs a CSS
  transition on `width` *and* on the inner icon/label `opacity`.
  Doable with `transition-[width,opacity] duration-[var(--duration-base)]
  ease-[var(--ease-out)]`. No JS animation lib needed.
- **Persisting collapsed state** is already a pattern we have
  (`ls-collapsed-navs`); extend with `ls-sidebar-mode` and
  `ls-sidebar-width` keys.

### What needs API additions (out of scope, call out)

- None. The data the dashboard shows — `status.status`,
  `status.playerCount`, `status.maxPlayers`, `status.tps`, `stats.procMem`,
  `stats.procCpu`, `stats.memSystemUsed`, `stats.cpuSystem`, `stats.disk`
  — is already in `/api/status` and the WebSocket `stats` frame. No
  backend change required.
- The brief lists API surface and we do not need to extend it for this
  iteration.

### Conflicts with the hard rules

- **No new dependencies** — we already have everything we need:
  Radix Tooltip is in `devDependencies` (`@radix-ui/react-tooltip`)
  and the file `src/components/ui/tooltip.jsx` does not yet exist but
  the dependency does, so the import will resolve. The shadcn-style
  tooltip component is ~40 lines. **If the team prefers "no new
  components in this iteration"**, the sidebar collapse can ship
  without tooltips in v1 and add them in v2.
- **No build step** — already moot; the build is in place and produces
  `public/assets/index-*.js` + `public/assets/index-*.css` which the
  existing `server.js` static handler serves. Token changes only
  require `npm run build` (or `npm run dev` for HMR).
- **English only** — all proposed copy is English. The Dashboard
  view's "Live resources" / "Server info" strings are already English
  in the codebase.
- **No Claude co-author** — when this work is eventually committed
  (not in scope here), do it as the user only, per `CLAUDE.md`.

### Things explicitly out of scope for this iteration

The brief limits us to "Foundation & Architecture: page layout,
sidebar, header, color palette, typography scale, spacing, and the
dashboard view. Don't get into component micro-details (cards,
tables, console styling)." The following are flagged for follow-up
iterations, not this one:

1. **Console view styling pass** (terminal-grade typography, line
   height, level-color tokens, link to `--console-bg`).
2. **Table styling system** for Servers / Players / Modrinth /
   Backups / Tasks / Users / Configs (column widths, sticky header,
   row hover, status column conventions).
3. **Form/Input refinements** (focus ring token, error state token,
   help text size).
4. **Modal/Dialog pass** (the current `dialog.jsx` is solid but uses
   generic shadcn defaults; later pass to align shadows, radii,
   spacing).
5. **Empty states, loading skeletons, error states** for each view.
6. **Map view refinement** (Leaflet dark-tile theming — currently
   pulls in OSM tiles; not design-system work).
7. **Login visual** (today a single card on a grid; could become a
   split-screen with a hero illustration — but the brief says no new
   visual identity work).
8. **Light mode** — tokens can be scoped under `.light` for future
   use but no toggle is built.
9. **OKLCH migration** — HSL is the shadcn v1 convention and matches
   the rest of the file. v2.
10. **Logo and brand identity** — `◆` is fine as a placeholder.

### One open question for the next agent

The KPI tile today is a *single component* used 4× on the dashboard.
For a future Settings or Users view, the same shape will want to
display different data (e.g. "Total users" / "Active sessions"). Is
the team OK with the KPI tile being a *generic* component in
`components/shared/KpiTile.jsx` (currently defined inside
`DashboardView.jsx:10-29`), or do we want it duplicated per view?
My recommendation: extract it to `components/shared/` and own the
border-l-tint and the icon-box as props, so the Files / Backups /
Tasks views can reuse it.
