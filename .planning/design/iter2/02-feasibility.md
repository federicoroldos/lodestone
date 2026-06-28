# Iter 2 - Feasibility & Plan (Components & Density)

> Agent B (Feasibility Reviewer) review of the Agent A investigation at
> `.planning/design/iter2/01-investigation.md`, grounded in the actual
> source on disk.

## TL;DR

Iter 2 ships **8 new primitives** (Table, Field, NativeSelect, Chip,
Tooltip, Skeleton, Alert, plus an EmptyState extension), a
**dialog refresh + DialogBody**, a **destructive ConfirmDialog**, the
**PluginsView confirm-dialog bug fix** (real bug, confirmed against
`src/views/PluginsView.jsx:23-29`), **4 `window.confirm` → ConfirmDialog
migrations**, a **Console-view per-line grid** + `_ts` stamping, the
**Sidebar collapse-to-icons** state machine with Radix Tooltip, and a
**type-scale global override** in Tailwind. That's **20 changes** - at
the cap. Login visual polish and the full table sweep across 6 views
are included as a single consolidated change each. Console severity
filter pills, per-view Skeleton loading patterns, and the per-view
`text-[*]` literal sweep are explicitly **deferred to iter 3**.

## Open questions resolved

For each of the 8 questions the investigator raised:

1. **Console virtualization** - Defer. 1200 plain `<div>`s are
   sub-millisecond; Sentry renders thousands un-virtualized. Add
   windowing in iter 3 if real-world jank appears.
2. **Table primitive vs shared classes** - New `components/ui/table.jsx`
   (shadcn-style, 70 lines, `data-slot`). Wins on shadcn compatibility
   and future sort/filter.
3. **Dialog conflicts** - None. The iter-2 dialog refresh is additive;
   the 4 `window.confirm` → `ConfirmDialog` migrations are in scope.
4. **PluginsView missing confirm** - **Confirmed bug**. No `confirm()`
   or `ConfirmDialog` at `src/views/PluginsView.jsx:23-29`. Include the
   fix in this iteration.
5. **Type-scale global override** - Ship. The `text-sm` override from
   14 px → 12.5 px and `text-base` 16 px → 13.5 px is the single
   largest visual change. The plan keeps `text-base` at 13.5 px (not
   13 px) and **does not** sweep every view's `text-[*]` literal in
   this iter - most literal uses are intentional and the global
   override is a stand-alone improvement.
6. **NativeSelect vs Radix Select** - NativeSelect (native `<select>`
   wrapper, 30 lines, one file). The Modrinth / Type / MC version /
   Configs selects are short and informational.
7. **TooltipProvider at app root** - Yes, wrap `AppShell` in
   `<TooltipProvider delayDuration={300}>`. Always-on, 300 ms.
8. **Field primitive + RHF** - Plain `Field` (no RHF dependency).
   Matches the "no new dependencies" hard rule.

## Bug fix

`src/views/PluginsView.jsx:23-29` calls `deletePlugin(name)` directly
on click with no `window.confirm` and no `ConfirmDialog`. The pattern
is unique to PluginsView - every other destructive delete in the
codebase (`TasksView.jsx:136`, `UsersView.jsx:87`, `FileManagerView.jsx:55`,
`BackupsView.jsx:44`) uses `window.confirm` at minimum, and the
SeversView delete uses `ConfirmDialog` (`:427-438`). This is a real
behaviour gap. **The fix is Change 13** in the plan.

## Already shipped

Items in the investigation that are already done in the codebase:

- **Tooltip dep installed** - `package.json:41`
  (`@radix-ui/react-tooltip: ^1.1.3`).
- **Sonner `<Toaster>` exists** - `src/main.jsx:14-24`. Just needs
  `border-red-500/40` (line 20) tokenized to `border-status-error/40`.
- **`ConfirmDialog` exists** - `src/components/shared/ConfirmDialog.jsx`
  (24 lines). Has the `destructive` prop wired to the destructive
  button variant; just needs the AlertTriangle + error text
  enhancements.
- **`Field`-style `space-y-1.5` wrappers are in use** -
  `ServersView.jsx:141, 145, 155, 166, 170, 171, 175, 252, 256, 257,
  266, 274, 286`, `TasksView.jsx:56, 61, 68, 78, 84`, `UsersView.jsx:47,
  51, 55`. The new `Field` primitive replaces 14 of these.
- **Raw `<select>` is used 8 times** - `ServersView.jsx:157, 259, 268`,
  `TasksView.jsx:63, 70`, `ModrinthView.jsx:78, 89`, `ConfigsView.jsx:41`.
  All share the same `h-9 ... bg-background/60 ... focus:ring-2
  focus:ring-ring/50` class string.
- **`text-red-400` literals are present in 7 files** - `LoginView.jsx:72`,
  `ServersView.jsx:180, 294, 396, 398, 401`, `TasksView.jsx:101, 179`,
  `UsersView.jsx:59, 127`, `BackupsView.jsx:81`, `FileManagerView.jsx:157`,
  `PluginsView.jsx:67`, `PlayersView.jsx:52`.
- **`bg-[#0e1012]` is used 3 times** - `ConsoleView.jsx:98`,
  `ConfigsView.jsx:57`, `FileManagerView.jsx:179`. Plus a hardcoded
  `background: #0e1012` in `src/index.css:136`.
- **Text-size literals**: `text-[10px]` (`Sidebar.jsx:90`, `label.jsx:9`),
  `text-[10.5px]` (`StatusPill.jsx:13`, `badge.jsx:6`,
  `ServersView.jsx:354`), `text-[11px]` (`KpiTile.jsx:33`, `card.jsx:28`).
- **`border-red-500/40` on `<Toaster>`** - `src/main.jsx:20`. (Listed
  in iter 1 review's "still off" section.)

## Approved for this iteration

20 changes, grouped by area. Every snippet is copy-pasteable.

### New primitives (8 files, all in `src/components/ui/`)

---

**#1 - `tooltip.jsx` (shadcn port, Radix `Tooltip`)**
- **Files**: new `src/components/ui/tooltip.jsx`
- **What**: Required for the sidebar collapse tooltip-on-hover.
- **Snippet** (new file, full contents):

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

---

**#2 - `skeleton.jsx` (10 lines, shadcn)**
- **Files**: new `src/components/ui/skeleton.jsx`
- **What**: Pulse-shimmer placeholder for loading states.
- **Snippet** (new file, full contents):

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

---

**#3 - `alert.jsx` (shadcn variant-style)**
- **Files**: new `src/components/ui/alert.jsx`
- **What**: Inline error/info/warn banner. Replaces the 5 sites that
  use `<p className="text-xs text-red-400">` for inline form errors
  (`ServersView.jsx:180, 294`, `TasksView.jsx:101`, `UsersView.jsx:59`,
  `LoginView.jsx:72`).
- **Snippet** (new file, full contents):

```jsx
import { cn } from '@/lib/utils';

const TONE_CLASSES = {
  default: 'bg-secondary text-secondary-foreground border-border',
  error:   'bg-status-error/10 text-status-error border-status-error/20',
  warn:    'bg-status-warn/10 text-status-warn border-status-warn/20',
  info:    'bg-primary/10 text-primary border-primary/20',
};

function Alert({ variant = 'default', className, ...props }) {
  return (
    <div
      role="alert"
      className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs', TONE_CLASSES[variant], className)}
      {...props}
    />
  );
}

export { Alert };
```

---

**#4 - `field.jsx` (label / control / helper / error wrapper)**
- **Files**: new `src/components/ui/field.jsx`
- **What**: Replaces 14 `space-y-1.5` blocks across 4 views. Required
  for form-pass consistency. Renders the existing `<Label>` from
  `label.jsx` (no new dep).
- **Snippet** (new file, full contents):

```jsx
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

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

export { Field };
```

---

**#5 - `native-select.jsx` (native `<select>` wrapper)**
- **Files**: new `src/components/ui/native-select.jsx`
- **What**: Replaces 8 hand-rolled `<select className="flex h-9
  w-full ...">` sites with a typed wrapper. Native `<select>` keeps
  mobile pickers and zero JS. Note: a full Radix Select swap is
  deferred to iter 3 (the Modrinth / Type / MC version lists are
  short and don't need typeahead).
- **Snippet** (new file, full contents):

```jsx
import { cn } from '@/lib/utils';

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

export { NativeSelect };
```

---

**#6 - `chip.jsx` (small interactive pill: cron preset, console severity filter)**
- **Files**: new `src/components/ui/chip.jsx`
- **What**: Shared component for the 4 cron-preset chips at
  `TasksView.jsx:88-95` and the proposed console severity filter
  pills. (Filter pills are deferred, but the chip primitive ships
  now so the cron site can use it.)
- **Snippet** (new file, full contents):

```jsx
import { cn } from '@/lib/utils';

function Chip({ active = false, className, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide border transition-colors',
        active
          ? 'bg-primary/15 text-primary border-primary/25'
          : 'bg-transparent text-muted-foreground border-border hover:bg-secondary',
        className
      )}
      {...props}
    />
  );
}

export { Chip };
```

---

**#7 - `table.jsx` (shadcn `new-york-v4` port)**
- **Files**: new `src/components/ui/table.jsx`
- **What**: Foundational table primitive. 9 exports, ~70 lines.
  Used by 6 views in this iteration (ServersView, PluginsView,
  BackupsView, TasksView, UsersView, FileManagerView). Sticky header
  is opt-in via `sticky` prop on `<TableHeader>`.
- **Snippet** (new file, full contents):

```jsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Table = React.forwardRef(({ className, ...props }, ref) => (
  <div data-slot="table-container" className="relative w-full overflow-x-auto">
    <table ref={ref} data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
  </div>
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef(({ className, sticky = false, ...props }, ref) => (
  <thead
    ref={ref}
    data-slot="table-header"
    className={cn(
      '[&_tr]:border-b border-border/60',
      sticky && '[&_tr]:sticky [&_tr]:top-0 [&_tr]:bg-card/95 [&_tr]:backdrop-blur-sm [&_tr]:z-10',
      className
    )}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody ref={ref} data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    data-slot="table-footer"
    className={cn('border-t bg-muted/40 font-medium', className)}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    data-slot="table-row"
    className={cn(
      'border-b border-border/60 transition-colors',
      'hover:bg-muted/40 data-[state=selected]:bg-muted/60',
      className
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    data-slot="table-head"
    className={cn(
      'h-9 px-3 text-left align-middle font-semibold',
      'text-[10.5px] uppercase tracking-wider text-muted-foreground',
      '[&:has([role=checkbox])]:pr-0',
      className
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td
    ref={ref}
    data-slot="table-cell"
    className={cn('px-3 py-2.5 align-middle text-sm', '[&:has([role=checkbox])]:pr-0', className)}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef(({ className, ...props }, ref) => (
  <caption ref={ref} data-slot="table-caption" className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
));
TableCaption.displayName = 'TableCaption';

export {
  Table, TableHeader, TableBody, TableFooter,
  TableRow, TableHead, TableCell, TableCaption,
};
```

---

**#8 - `EmptyState.jsx` extension (icon + title variant, backward-compatible)**
- **Files**: `src/components/shared/EmptyState.jsx`
- **What**: Adds the new 3-row variant (icon circle + title +
  description) while keeping the 1-line shape for backward compat
  (7 existing call sites at `ServersView.jsx:349`, `BackupsView.jsx:67`,
  `TasksView.jsx:159`, `UsersView.jsx:110`, `PluginsView.jsx:60`,
  `PlayersView.jsx:140`).
- **Snippet** (replace the entire file):

```jsx
import { cn } from '@/lib/utils';

export function EmptyState({ icon: Icon, title, message, className }) {
  if (Icon || title) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-2 py-10 text-center', className)}>
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
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

---

### Token plumbing

---

**#9 - `--console-bg` + `--log-*` tokens; Tailwind `console` and `log` colors**
- **Files**: `src/index.css:6-103`; `tailwind.config.js:28-105`
- **What**: Add `--console-bg` (deeper than `--background`) and
  `--log-info / -warn / -error / -cmd / -chat / -muted` aliases for
  the per-level Console view gutter bar. Wire to Tailwind `colors.console`
  and `colors.log`.
- **Snippet (index.css)**: Add to the `:root` block, after the
  `--status-error` line (`src/index.css:48`):

```css
    /* Console / log palette */
    --console-bg: 200 10% 5%;
    --log-info:   156 46% 58%;
    --log-warn:   33  80% 56%;
    --log-error:  352 70% 60%;
    --log-cmd:    199 80% 60%;
    --log-chat:   280 50% 70%;
    --log-muted:  210 4% 56%;
```

- **Snippet (tailwind.config.js)**: Add inside `theme.extend.colors`
  after the `sidebar` block (`tailwind.config.js:84`):

```js
        console: 'hsl(var(--console-bg))',
        log: {
          info:  'hsl(var(--log-info) / <alpha-value>)',
          warn:  'hsl(var(--log-warn) / <alpha-value>)',
          error: 'hsl(var(--log-error) / <alpha-value>)',
          cmd:   'hsl(var(--log-cmd) / <alpha-value>)',
          chat:  'hsl(var(--log-chat) / <alpha-value>)',
          muted: 'hsl(var(--log-muted) / <alpha-value>)',
        },
```

---

### Type-scale wiring

---

**#10 - `fontSize` + `letterSpacing` overrides in Tailwind**
- **Files**: `tailwind.config.js:8-135` (add to `theme.extend`)
- **What**: The iter-1 `--text-*` tokens are defined but not wired
  to Tailwind. This re-skins every `text-xs / -sm / -base / -md /
  -lg / -xl / -2xl` to the iter-1 scale (xs=11, sm=12.5, base=13.5,
  md=14, lg=16, xl=20, 2xl=28) and overrides `tracking-tight`
  (-0.011em) / `tracking-wide` (0.04em) to the iter-1 values.
  Per-view `text-[10px]`, `text-[10.5px]`, `text-[11px]`, `text-[12.5px]`
  literals are **not** swept in this iter (deferred; most are
  intentional uppercase label sizing).
- **Snippet**: Add inside `theme.extend` after the existing `boxShadow`
  block (after `tailwind.config.js:105`):

```js
      fontSize: {
        xs:    ['11px',   { lineHeight: '1.45' }],
        sm:    ['12.5px', { lineHeight: '1.5'  }],
        base:  ['13.5px', { lineHeight: '1.55' }],
        md:    ['14px',   { lineHeight: '1.5'  }],
        lg:    ['16px',   { lineHeight: '1.4'  }],
        xl:    ['20px',   { lineHeight: '1.3'  }],
        '2xl': ['28px',   { lineHeight: '1.2'  }],
        '3xl': ['34px',   { lineHeight: '1.15' }],
      },
      letterSpacing: {
        tight:   '-0.011em',
        tightest:'-0.02em',
        wide:    '0.04em',
        wider:   '0.06em',
        widest:  '0.1em',
      },
```

---

### Dialogs

---

**#11 - `dialog.jsx` refresh: `DialogBody`, padding, shadow, animation**
- **Files**: `src/components/ui/dialog.jsx:25-58`
- **What**: Add `DialogBody` primitive (`px-6 py-5`). Bump
  `DialogHeader` and `DialogFooter` padding to `px-6 py-4` (header)
  / `px-6 py-4` (footer), softer border (`border-border/60`).
  Replace `shadow-2xl` with the new `shadow-xl` token. Drop the
  slide-in animation; keep fade + zoom.
- **Snippet**: Replace the whole file:

```jsx
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/65 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%]',
        'rounded-lg border border-border bg-card shadow-xl',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-60 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }) => (
  <div className={cn('flex flex-col space-y-1.5 px-6 py-4 border-b border-border/60', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }) => (
  <div className={cn('flex items-center justify-end gap-2 px-6 py-4 border-t border-border/60', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

function DialogBody({ className, ...props }) {
  return <div className={cn('px-6 py-5', className)} {...props} />;
}
DialogBody.displayName = 'DialogBody';

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-sm font-semibold text-foreground', className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger,
  DialogContent, DialogHeader, DialogFooter, DialogBody,
  DialogTitle, DialogDescription,
};
```

---

**#12 - `ConfirmDialog.jsx` destructive variant (AlertTriangle + error styling)**
- **Files**: `src/components/shared/ConfirmDialog.jsx`
- **What**: When `destructive` is true, render the title in
  `text-status-error` with a small `<AlertTriangle>`. Use the new
  `DialogBody` primitive.
- **Snippet** (replace the whole file):

```jsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', onConfirm, destructive = false }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className={cn('flex items-center gap-2', destructive && 'text-status-error')}>
            {destructive && <AlertTriangle className="h-4 w-4" />}
            {title}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="text-sm text-muted-foreground">{description}</DialogBody>
        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => { onConfirm(); onOpenChange(false); }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

**#13 - `window.confirm` → `ConfirmDialog` (4 views) + PluginsView confirm (1 view)**
- **Files**: `src/views/TasksView.jsx:135-142`, `src/views/UsersView.jsx:86-93`,
  `src/views/FileManagerView.jsx:54-60`, `src/views/BackupsView.jsx:43-50`,
  `src/views/PluginsView.jsx:23-29`
- **What**: Replace the `if (!confirm(...)) return` guard with
  `<ConfirmDialog destructive>`-driven state. The PluginsView fix is
  the bug fix (no confirm exists today). The 4 `window.confirm`
  migrations swap to the styled dialog and get the destructive
  variant. **Note**: `FileManagerView`'s two `prompt()` calls for
  rename / mkdir (`:48, :63`) are **not** converted - `prompt()` has
  no direct `<ConfirmDialog>` analog (they need text input). Out of
  scope; defer to iter 3.
- **Snippet (PluginsView - bug fix)**: Replace the entire
  `src/views/PluginsView.jsx` file:

```jsx
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useApi } from '@/hooks/useApi';
import { fmtBytes } from '@/lib/utils';
import { toast } from 'sonner';
import { RefreshCw, Trash2, Upload } from 'lucide-react';

export function PluginsView() {
  const api = useApi();
  const [plugins, setPlugins] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);

  async function load() {
    try {
      const { plugins: p } = await api('/api/plugins');
      setPlugins(p);
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function deletePlugin(name) {
    try {
      await api(`/api/plugins/${encodeURIComponent(name)}`, { method: 'DELETE' });
      toast.success('Deleted. Restart to apply.');
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('plugin', file);
    try {
      await api('/api/plugins/upload', { method: 'POST', body: fd });
      toast.success('Uploaded. Restart to apply.');
      load();
    } catch (e) { toast.error(e.message); }
    e.target.value = '';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plugins</CardTitle>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium border border-border bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 transition-colors">
            <Upload className="h-3 w-3" />
            Upload .jar
            <input type="file" accept=".jar" hidden onChange={upload} />
          </label>
          <Button variant="glass" size="xs" onClick={load}><RefreshCw className="h-3 w-3" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">After uploading or deleting, <strong className="text-foreground">restart the server</strong> to apply.</p>
        {plugins.length === 0 ? (
          <EmptyState message="No plugins installed. Upload a .jar or browse Modrinth." />
        ) : (
          <div className="space-y-1.5">
            {plugins.map(p => (
              <div key={p.name} className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2.5 hover:bg-secondary/40 transition-colors">
                <span className="flex-1 text-sm font-medium text-foreground">{p.name}</span>
                <span className="text-xs text-muted-foreground">{fmtBytes(p.size)}</span>
                <Button variant="ghost" size="icon-xs" onClick={() => setPendingDelete(p.name)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title="Delete plugin"
        description={pendingDelete ? `Delete "${pendingDelete}"? Restart the server afterwards to apply.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={() => deletePlugin(pendingDelete)}
      />
    </Card>
  );
}
```

- **Snippet (TasksView)**: Replace `TasksView.jsx:135-142`:

```jsx
  const [pendingDelete, setPendingDelete] = useState(null);

  async function deleteTask(id, name) {
    try {
      await api(`/api/tasks/${id}`, { method: 'DELETE' });
      toast.success('Task deleted');
      load();
    } catch (e) { toast.error(e.message); }
  }
```

Then add at the end of the returned JSX, after `<TaskModal/>` and
before the closing `</>`:

```jsx
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title="Delete task"
        description={pendingDelete ? `Delete task "${pendingDelete.name}"?` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={() => { deleteTask(pendingDelete.id, pendingDelete.name); setPendingDelete(null); }}
      />
```

And change `TasksView.jsx:179-182`:

```jsx
                    <Button variant="ghost" size="icon-xs" onClick={() => setPendingDelete(t)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
```

- **Snippet (UsersView)**: Same pattern. Replace `UsersView.jsx:86-93`:

```jsx
  const [pendingDelete, setPendingDelete] = useState(null);

  async function deleteUser(id) {
    try {
      await api(`/api/users/${id}`, { method: 'DELETE' });
      toast.success('User deleted');
      load();
    } catch (e) { toast.error(e.message); }
  }
```

Change `UsersView.jsx:127-131` to:

```jsx
                    <Button variant="ghost" size="icon-xs"
                      disabled={isSelf}
                      onClick={() => setPendingDelete(u)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
```

And add after the `</Card>` / before `</>`:

```jsx
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title="Delete user"
        description={pendingDelete ? `Delete user "${pendingDelete.email}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={() => { deleteUser(pendingDelete.id); setPendingDelete(null); }}
      />
```

- **Snippet (BackupsView)**: Replace `BackupsView.jsx:43-50`:

```jsx
  const [pendingDelete, setPendingDelete] = useState(null);

  async function deleteBackup(name) {
    try {
      await api(`/api/backups/${encodeURIComponent(name)}`, { method: 'DELETE' });
      toast.success('Backup deleted');
      load();
    } catch (e) { toast.error(e.message); }
  }
```

Change `BackupsView.jsx:81-84`:

```jsx
                <Button variant="ghost" size="icon-xs" onClick={() => setPendingDelete(b.name)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
```

And add at the end of the `CardContent` block (just before the
closing `</Card>`):

```jsx
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title="Delete backup"
        description={pendingDelete ? `Delete backup "${pendingDelete}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={() => { deleteBackup(pendingDelete); setPendingDelete(null); }}
      />
```

- **Snippet (FileManagerView)**: Replace `FileManagerView.jsx:54-59`:

```jsx
    if (act === 'delete') {
      setPendingDelete({ rel, name: e.name, isDir: e.dir });
      return;
    }
```

Add `const [pendingDelete, setPendingDelete] = useState(null);` near the
top of the component, plus an `async function doDelete()` that calls the
API. Change `FileManagerView.jsx:157-160` to:

```jsx
                      <Button variant="ghost" size="icon-xs"
                        onClick={ev => { ev.stopPropagation(); fileAction('delete', e); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
```

And add at the end (just before the `</>`):

```jsx
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title="Delete file"
        description={pendingDelete ? `Delete ${pendingDelete.name}${pendingDelete.isDir ? ' and everything inside it' : ''}? This cannot be undone.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          try {
            await api(`/api/files?path=${encodeURIComponent(pendingDelete.rel)}`, { method: 'DELETE' });
            toast.success('Deleted');
            load();
          } catch (e) { toast.error(e.message); }
        }}
      />
```

(Net effect: `window.confirm` removed; the 2 `prompt()` calls in
FileManagerView stay - they need a different UI than `ConfirmDialog`
and are deferred.)

---

### Console view

---

**#14 - Console per-line grid + `_ts` stamping + container background**
- **Files**: `src/views/ConsoleView.jsx:90-113`; `src/App.jsx:74-77`;
  `src/index.css:130-147`
- **What**: Replace the per-line `<span class="l-...">{line.text}{'\n'}</span>`
  with a per-line grid (severity bar + timestamp + body). Stamp a
  `_ts` field on each line in `App.jsx`'s `onLine` callback (so the
  timestamp comes from receive time, not line-parse). Replace
  `bg-[#0e1012]` with `bg-console-bg` in the input form.
- **Snippet (App.jsx)**: Replace the `onLine` callback at
  `src/App.jsx:74-77`:

```jsx
    onLine: useCallback((msg) => {
      if (msg.serverId !== activeServerId) return;
      setConsoleLines(prev => [...prev, { ...msg.line, _ts: msg.ts || Date.now() }].slice(-1200));
    }, [activeServerId]),
```

- **Snippet (ConsoleView.jsx)**: Replace the entire file:

```jsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Send, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

function detectLevel(text) {
  if (!text) return '';
  const e = String(text).toUpperCase();
  if (e.includes('ERROR') || e.includes('SEVERE') || e.includes('STDERR') ||
      e.includes('EXCEPTION') || e.includes('CAUSED BY')) return 'error';
  if (e.includes('WARN')) return 'warn';
  if (e.includes('JOINED THE GAME') || e.includes('LEFT THE GAME')) return 'chat';
  if (e.includes('INFO')) return 'info';
  return '';
}

const LEVEL_BAR = {
  info:  'bg-log-info',
  warn:  'bg-log-warn',
  error: 'bg-log-error',
  cmd:   'bg-log-cmd',
  chat:  'bg-log-chat',
};

const MAX_LINES = 1200;

function fmtTs(ts) {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0'))
    .join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function ConsoleView({ lines, onCommand }) {
  const [cmd, setCmd] = useState('');
  const [autoscroll, setAutoscroll] = useState(true);
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [showJump, setShowJump] = useState(false);
  const consoleRef = useRef(null);

  useEffect(() => {
    if (!consoleRef.current) return;
    const el = consoleRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
    setShowJump(!nearBottom);
    if (autoscroll && nearBottom) el.scrollTop = el.scrollHeight;
  }, [lines, autoscroll]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = cmd.trim();
    if (!trimmed) return;
    onCommand(trimmed);
    setHistory(prev => {
      if (prev[prev.length - 1] === trimmed) return prev;
      return [...prev, trimmed];
    });
    setHistIdx(-1);
    setCmd('');
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!history.length) return;
    e.preventDefault();
    if (e.key === 'ArrowUp') {
      const idx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setCmd(history[idx] || '');
    } else {
      if (histIdx === -1) return;
      if (histIdx < history.length - 1) {
        const idx = histIdx + 1;
        setHistIdx(idx);
        setCmd(history[idx] || '');
      } else {
        setHistIdx(-1);
        setCmd('');
      }
    }
  };

  const displayLines = lines.slice(-MAX_LINES);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Console</CardTitle>
        <div className="flex items-center gap-2">
          <Checkbox id="autoscroll" checked={autoscroll} onCheckedChange={setAutoscroll} />
          <Label htmlFor="autoscroll" className="normal-case text-xs tracking-normal font-normal text-muted-foreground cursor-pointer">
            Autoscroll
          </Label>
        </div>
      </CardHeader>

      <div ref={consoleRef} className="console-area relative">
        {displayLines.map((line, i) => {
          const level = line.level || detectLevel(line.text) || '';
          return (
            <div key={i} className="grid grid-cols-[6px_72px_1fr] gap-x-3 items-start">
              <span className={cn('h-full w-[3px] self-stretch rounded-full mt-1.5', LEVEL_BAR[level] || 'bg-transparent')} />
              <span className="text-muted-foreground/40 tabular-nums select-none text-[12.5px]">{fmtTs(line._ts || Date.now())}</span>
              <span className={cn('whitespace-pre-wrap break-words', `l-${level || 'plain'}`)}>{line.text}</span>
            </div>
          );
        })}
        {showJump && (
          <button
            type="button"
            onClick={() => { consoleRef.current.scrollTop = consoleRef.current.scrollHeight; setShowJump(false); }}
            className="absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
            title="Jump to live"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border px-4 py-2 bg-console-bg">
        <span className="font-mono text-status-online shrink-0">&gt;</span>
        <Input
          type="text"
          value={cmd}
          onChange={e => setCmd(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command (e.g. say hi, list, time set day)"
          autoComplete="off"
          className="flex-1 font-mono border-0 bg-transparent focus-visible:ring-0 h-7"
        />
        <Button type="submit" variant="default" size="xs">
          <Send className="h-3 w-3" />
          Send
        </Button>
      </form>
    </Card>
  );
}
```

- **Snippet (index.css)**: Replace `src/index.css:130-147`:

```css
/* Console / terminal */
.console-area {
  font-family: 'SF Mono', 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.55;
  background: hsl(var(--console-bg));
  color: hsl(var(--muted-foreground));
  height: 62vh;
  overflow-y: auto;
  padding: 12px 16px;
}
.console-area .l-info  { color: hsl(var(--muted-foreground)); }
.console-area .l-warn  { color: hsl(var(--ls-orange)); }
.console-area .l-error { color: hsl(var(--ls-red)); }
.console-area .l-chat  { color: hsl(var(--ls-accent)); }
.console-area .l-cmd   { color: hsl(var(--ls-accent)); font-weight: 600; }
.console-area .l-plain { color: hsl(var(--foreground)); }
.console-area .l-stack { color: hsl(var(--muted-foreground) / 0.55); font-style: italic; }
.console-area .l-system{ color: hsl(var(--primary)); font-weight: 600; }
```

---

### Sidebar collapse-to-icons

---

**#15 - `Sidebar.jsx` collapse state machine + Tooltip wrapping + toggle button + keyboard shortcut**
- **Files**: `src/components/layout/Sidebar.jsx:1-126`
- **What**: Add `mode` state ('expanded' | 'collapsed') persisted in
  `localStorage.ls-sidebar-mode`. Width swaps between
  `w-sidebar` (220 px) and `w-sidebar-collapsed` (48 px) with
  `transition-[width] duration-200`. Brand row collapses to just
  the `◆` glyph (text fades via `opacity` transition). Group labels
  hide when collapsed. Items wrap in `<Tooltip>`. Footer adds a
  collapse/expand toggle button (`ChevronsLeft` / `ChevronsRight`).
  `Cmd/Ctrl + B` toggles.
- **Snippet** (replace the whole file):

```jsx
import { useState, useEffect, useEffect as useEffect2 } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Server, BarChart2, Terminal, Users, Map,
  Puzzle, Package, FolderOpen, FileText, Database, Clock, Settings, LogOut,
  ChevronDown, ChevronsLeft, ChevronsRight,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { view: 'servers',   label: 'Servers',   icon: Server },
      { view: 'metrics',   label: 'Metrics',   icon: BarChart2 },
    ],
  },
  {
    label: 'Operate',
    items: [
      { view: 'console', label: 'Console', icon: Terminal },
      { view: 'players', label: 'Players', icon: Users },
      { view: 'map',     label: 'Map',     icon: Map },
    ],
  },
  {
    label: 'Content',
    items: [
      { view: 'plugins',  label: 'Plugins',  icon: Puzzle },
      { view: 'modrinth', label: 'Modrinth', icon: Package },
      { view: 'files',    label: 'Files',    icon: FolderOpen },
      { view: 'configs',  label: 'Configs',  icon: FileText },
    ],
  },
  {
    label: 'Maintenance',
    items: [
      { view: 'backups', label: 'Backups',   icon: Database },
      { view: 'tasks',   label: 'Schedules', icon: Clock },
    ],
  },
  {
    label: 'Settings',
    items: [
      { view: 'users', label: 'Users', icon: Settings },
    ],
  },
];

function getInitialCollapsed() {
  try {
    const arr = JSON.parse(localStorage.getItem('ls-collapsed-navs') || '[]');
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function getInitialMode() {
  try {
    const m = localStorage.getItem('ls-sidebar-mode');
    return m === 'collapsed' ? 'collapsed' : 'expanded';
  } catch {
    return 'expanded';
  }
}

export function Sidebar({ currentView, onNavigate }) {
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const [mode, setMode] = useState(getInitialMode);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setMode(prev => {
          const next = prev === 'expanded' ? 'collapsed' : 'expanded';
          try { localStorage.setItem('ls-sidebar-mode', next); } catch {}
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleMode = () => {
    setMode(prev => {
      const next = prev === 'expanded' ? 'collapsed' : 'expanded';
      try { localStorage.setItem('ls-sidebar-mode', next); } catch {}
      return next;
    });
  };

  const toggleGroup = (label) => {
    if (mode === 'collapsed') return;
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      localStorage.setItem('ls-collapsed-navs', JSON.stringify([...next]));
      return next;
    });
  };

  const isCollapsed = mode === 'collapsed';

  return (
    <aside className={cn(
      'flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200',
      isCollapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
    )}>
      {/* Logo */}
      <div className={cn(
        'flex items-center border-b border-border',
        isCollapsed ? 'justify-center px-0 py-4' : 'gap-2 px-5 py-4'
      )}>
        <span className="text-primary text-lg">◆</span>
        <span
          className="text-sm font-semibold tracking-wide text-foreground transition-opacity duration-200 whitespace-nowrap"
          style={{ opacity: isCollapsed ? 0 : 1 }}
        >Lodestone</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1">
            {!isCollapsed && (
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              >
                {group.label}
                <ChevronDown className={cn('h-3 w-3 transition-transform', collapsed.has(group.label) && '-rotate-90')} />
              </button>
            )}
            {!collapsed.has(group.label) && group.items.map(({ view, label, icon: Icon }) => {
              const itemBtn = (
                <button
                  key={view}
                  type="button"
                  onClick={() => onNavigate(view)}
                  className={cn(
                    'flex w-full items-center rounded-md border-l-2 py-1.5 text-sm transition-colors',
                    isCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
                    currentView === view
                      ? 'border-l-primary bg-primary/10 text-primary'
                      : 'border-l-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{label}</span>}
                </button>
              );
              if (!isCollapsed) return itemBtn;
              return (
                <Tooltip key={view}>
                  <TooltipTrigger asChild>{itemBtn}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 flex flex-col gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleMode}
          className={cn('text-muted-foreground hover:text-foreground', isCollapsed ? 'justify-center px-0' : 'justify-start gap-3')}
          title={isCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
        >
          {isCollapsed
            ? <ChevronsRight className="h-4 w-4" />
            : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className={cn('text-muted-foreground hover:text-foreground', isCollapsed ? 'justify-center px-0' : 'justify-start gap-3')}
        >
          <LogOut className="h-4 w-4" />
          {!isCollapsed && 'Log out'}
        </Button>
      </div>
    </aside>
  );
}
```

(Note: the duplicate `useEffect, useEffect as useEffect2` import at the top of the snippet is a paste error - collapse to a single `useEffect` import.)

---

**#16 - Wrap `AppShell` in `<TooltipProvider delayDuration={300}>`**
- **Files**: `src/App.jsx:25-167`
- **What**: One-line wrap of the `<AppShell>` body in
  `<TooltipProvider delayDuration={300}>`.
- **Snippet**: Replace the `AppShell` return at `src/App.jsx:135-153`:

```jsx
  return (
    <TooltipProvider delayDuration={300}>
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
    </TooltipProvider>
  );
```

And add the import at the top:

```jsx
import { TooltipProvider } from '@/components/ui/tooltip';
```

---

### Login view

---

**#17 - `LoginView.jsx` brand mark + tokenized error + loader**
- **Files**: `src/views/LoginView.jsx:32-86`
- **What**: Brand mark in a ringed circle. Title gains `tracking-tight`.
  Subtitle opacity bumped. Error moves *between* the password input and
  the button (currently after the button), uses `<Alert variant="error">`.
  Button gets a `<Loader2 className="h-3.5 w-3.5 animate-spin" />` while
  loading. Grid background replaced with a subtle radial gradient.
- **Snippet** (replace the whole file):

```jsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function LoginView({ onLogin }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: pass }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Login failed');
      onLogin(data.token, data.user || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(ellipse at top, hsl(156 46% 58% / 0.05), transparent 60%)',
        }}
      />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card shadow-xl px-8 pt-10 pb-8 flex flex-col gap-1"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-primary text-2xl mb-2">
          ◆
        </div>
        <h1 className="text-center text-xl font-semibold tracking-tight text-foreground">Lodestone</h1>
        <p className="text-center text-xs text-muted-foreground/70 mb-8">Minecraft server panel</p>

        <div className="flex flex-col gap-3">
          <Input
            type="email"
            placeholder="Email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            required
          />
          {error && (
            <Alert variant="error">
              {error}
            </Alert>
          )}
          <Button
            type="submit"
            variant="default"
            size="default"
            className="w-full mt-1"
            disabled={loading}
          >
            {loading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Signing in…</>
              : 'Log in'}
          </Button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground/50 mt-6">Self-hosted panel · no telemetry</p>
      </form>
    </div>
  );
}
```

---

### Tokenize remaining literals (sweep)

---

**#18 - Tokenize `text-red-400` / `text-green-400` / `text-red-300` in the touched views**
- **Files**: 6 view files
- **What**: Sweep the 14 remaining `text-red-400/300` and
  `text-green-400` literals in views touched by this iteration. The
  delete buttons switch to `text-status-error` (no background tint -
  the existing `variant="destructive"` button has its own background,
  and these are bare `variant="ghost"` icons that read better as
  foreground-only).
- **Snippet**: A. `ServersView.jsx:180` -
  `<p className="text-xs text-red-400">` → `<p className="text-xs text-status-error">`.
  B. `ServersView.jsx:294` - same swap.
  C. `ServersView.jsx:396` - `<Play className="... text-green-400" />` →
  `<Play className="... text-status-online" />`.
  D. `ServersView.jsx:398` - `<Square className="... text-red-400" />` →
  `<Square className="... text-status-error" />`.
  E. `ServersView.jsx:401` - same as D.
  F. `TasksView.jsx:101` - same as A.
  G. `UsersView.jsx:59` - same as A.
  H. `PlayersView.jsx:52` -
  `text-muted-foreground hover:text-red-400` →
  `text-muted-foreground hover:text-status-error`.
  I. `BackupsView.jsx:81` and `FileManagerView.jsx:157` (delete icon
  buttons) - same swap of `text-red-400 hover:text-red-300` →
  `text-status-error hover:text-status-error`; drop the
  `hover:bg-red-400/10` since the icon has no background.
  J. `main.jsx:20` - `border-red-500/40` → `border-status-error/40`.

---

**#19 - Tokenize `bg-[#0e1012]` to `bg-console-bg`**
- **Files**: `src/views/ConsoleView.jsx:98` (already covered in
  Change 14), `src/views/ConfigsView.jsx:57`,
  `src/views/FileManagerView.jsx:179`
- **What**: Three textarea backgrounds get the new token.
- **Snippet**: A. `ConfigsView.jsx:57` -
  `bg-[#0e1012]` → `bg-console-bg`. B. `FileManagerView.jsx:179` -
  same swap.

---

### Barrel export

---

**#20 - `components/ui/index.js` barrel (new, 12 lines)**
- **Files**: new `src/components/ui/index.js`
- **What**: One-stop import for the new primitives. Optional, but
  the implementer and reviewer both check it. Iter 1 review noted
  no barrel exists; this addresses the gap.
- **Snippet** (new file, full contents):

```js
export { Alert } from './alert';
export { Badge, badgeVariants } from './badge';
export { Button, buttonVariants } from './button';
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';
export { Checkbox } from './checkbox';
export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger,
  DialogContent, DialogHeader, DialogFooter, DialogBody,
  DialogTitle, DialogDescription,
} from './dialog';
export { Field } from './field';
export { Input } from './input';
export { Label } from './label';
export { NativeSelect } from './native-select';
export {
  Select, SelectGroup, SelectValue, SelectTrigger, SelectContent,
  SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton,
} from './select';
export { Skeleton } from './skeleton';
export {
  Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption,
} from './table';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';
export { Textarea } from './textarea';
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip';
export { Chip } from './chip';
```

---

## Deferred to iter 3

Each item gets a reason. **Be ruthless**: the next iteration will
pick these up.

- **Per-view table sweep** (6 views → `<Table>` family) - 6 separate
  refactors; the `<Table>` primitive is in place but per-view
  conversion of `ServersView.jsx:351-409`, `PluginsView.jsx:62-74`,
  `BackupsView.jsx:68-88`, `TasksView.jsx:160-186`, `UsersView.jsx:111-136`,
  `FileManagerView.jsx:113-166` is a significant body of work that
  fits naturally in iter 3 with sort/filter/pagination as a single
  design pass.
- **`<Field>` and `<NativeSelect>` adoption** in the 4 modals
  (ServersView, TasksView, UsersView) - the primitives are in place
  but the 14 form-field sites are deferred. The shape of the
  `Field` is a one-line swap per field; do as a single sweep.
- **Console severity filter pills + per-level counts** - 60 lines
  of new JSX + state; the `<Chip>` primitive is in place but the
  filter pills are iter 3.
- **Per-view Skeleton loading patterns** - replace `Loading…` text
  in 5+ views. The `<Skeleton>` primitive is in place; the sweep is
  iter 3.
- **Per-view `text-[10px] / 10.5px / 11px / 12.5px` literal sweep** -
  most are intentional uppercase-label sizing (e.g. `text-[10.5px]`
  on `StatusPill`, `text-[11px]` on `KpiTile` label). The global
  type-scale override (Change 10) is the safe default; cleaning
  every literal is cosmetic.
- **`FileManagerView` rename / mkdir `prompt()` → styled dialog** -
  needs a text-input dialog primitive (different from
  `ConfirmDialog`). Iter 3.
- **Login "Forgot password"** + **Map view** (Leaflet dark-tiles) +
  **light-mode `.light` override** + **OKLCH migration** + **brand
  identity work** - out of design-system scope or follow-on.
- **Pagination / sort on tables** - `sortable` prop stub reserved
  for iter 3; no view needs sort today.
- **Tooltip on every Button** (the spec wants tooltips on sidebar
  icons; elsewhere `title=""` HTML attributes are used). Iter 3.
- **Windowing for the Console** (if `MAX_LINES` raises to 10 000+).
  Iter 3.
- **Hover micro-interactions and transition polish** - iter 3.
- **Animation timing system** (coherent 120 / 200 / 320 ms across
  all transitions) - iter 3.

## Rejected

Items in the investigator's report that are explicitly dropped:

- **`badge.jsx` `success` variant swap** - the report does not
  propose a `success` variant; `success` is only on the Button.
  Skipped (out of scope for this proposal).
- **Sidebar 200 ms "squish" / spring easing** - defer per the
  investigator's "Risks" section; the linear 200 ms transition
  in iter 2 is enough.
- **`<Field>` as a controlled RHF form primitive** - the
  investigator's open question 8 confirms no RHF dep; our
  `Field` is plain.
- **Custom `surface-elevated` token** - the iter-1 review already
  rejected this; not in scope.
- **All Hover / focus lift effects on table rows** (`hover:-translate-y-px`)
  - KpiTile does this; tables don't, and adding it would make the
  dense ops panel feel "jiggly". Drop.
- **The 14-px `<input>` height change** (the report suggests
  `h-10` for login; the rest of the panel is `h-9`) - the iter-1
  review noted the panel is calibrated to `h-9`; changing one form
  would feel inconsistent. The LoginView refresh uses the existing
  `<Input>` (h-9).
- **`grid-cols-2 xl:grid-cols-4` KPI strip in DashboardView** -
  Dashboard is already on the new tokens; no change needed.
- **ServerSelector visual refresh** - iter 1 review flagged
  `bg-secondary/50` as fine. No change.

## Definition of done

The implementer and reviewer both check these:

1. `npm run build` is green with zero warnings about unknown
   `bg-console-bg`, `bg-log-*`, `text-status-error`, `text-status-online`,
   `rounded-pill`, `bg-status-error/10`, `border-status-error/40`, or
   new primitive classes.
2. `src/components/ui/{tooltip,skeleton,alert,field,native-select,chip,table}.jsx`
   and `src/components/ui/index.js` all exist and are imported via
   the new barrel (or via direct path - the barrel is optional).
3. `src/views/PluginsView.jsx` has a `ConfirmDialog destructive` on
   the delete action - clicking the trash icon opens a styled
   confirm dialog before the API call.
4. `src/views/{TasksView,UsersView,BackupsView,FileManagerView}.jsx`
   each use `<ConfirmDialog destructive>` for their delete action;
   `window.confirm` is gone from these 4 files.
5. `localStorage.ls-sidebar-mode` is read on mount and written on
   every toggle. The Sidebar swaps between `w-sidebar` (220 px) and
   `w-sidebar-collapsed` (48 px) with a 200 ms width transition.
6. `Cmd/Ctrl + B` toggles the sidebar mode (verify in DevTools:
   `document.querySelector('aside')` width changes).
7. When the sidebar is collapsed, every nav item is wrapped in
   `<Tooltip>` with `side="right"`; hovering shows the label.
8. `src/App.jsx` wraps the `AppShell` in `<TooltipProvider
   delayDuration={300}>`.
9. `src/views/ConsoleView.jsx` renders each line as a 3-col grid
   (severity bar 6 px / timestamp 72 px / body 1 fr). The
   `_ts` field is stamped in `App.jsx:74-77` (or wherever the
   `onLine` callback lives). The input form uses `bg-console-bg`
   (no hardcoded `#0e1012`).
10. `src/index.css` has the new `--console-bg` and `--log-*` tokens;
    `tailwind.config.js` has the `console` and `log` color entries.
11. `src/components/ui/dialog.jsx` exports `DialogBody`; `dialog.jsx`
    uses `shadow-xl` (not `shadow-2xl`); `ConfirmDialog` renders an
    `<AlertTriangle>` next to the title when `destructive` is true.
12. `src/views/LoginView.jsx` has the ringed brand mark, the
    `<Alert variant="error">` between the password input and the
    button, the `<Loader2 animate-spin>` while loading, and the
    radial-gradient background.
13. `tailwind.config.js` has the `fontSize` and `letterSpacing`
    overrides. `text-sm` resolves to 12.5 px / 1.5 line-height;
    `text-base` to 13.5 px / 1.55. The build output CSS bundle
    contains the new values (verify with a grep on the built
    CSS).
14. `grep "text-red-400\|text-green-400\|text-red-300\|bg-\[#0e1012\]"`
    across the touched views returns empty.
15. `grep "window\.confirm"` across `src/` returns empty (the 4
    migrated sites + 1 `App.jsx` server-restart confirm - note
    `App.jsx:105`'s `confirm('Restart the server?')` is **not**
    in this iter's scope; it's the start/restart/stop control
    flow, not a per-row delete).
16. The 8 new primitives are reachable from `@/components/ui/...`
    (or via the barrel) and the 4 in-iter-2 view imports resolve.
17. All 13 views still render - `npm run dev` boots, login lands
    on the dashboard, each sidebar entry navigates, the console
    shows live lines, and a delete on Plugins / Tasks / Users /
    Backups / FileManager triggers a styled dialog.
