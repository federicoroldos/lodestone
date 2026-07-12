import { cn } from '@/lib/utils';

function Page({ className, children }) {
  return (
    <div className={cn('mx-auto w-full max-w-[1600px] space-y-5', className)}>
      {children}
    </div>
  );
}

function PageIntro({ eyebrow, title, description, actions, className }) {
  return (
    <section className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <p className="text-[10.5px] font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>}
        {title && <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>}
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
    </section>
  );
}

function PageToolbar({ className, children }) {
  return (
    <div className={cn('flex min-h-10 flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/70 px-3 py-2 shadow-sm backdrop-blur-sm', className)}>
      {children}
    </div>
  );
}

function SummaryGrid({ className, children }) {
  return <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>;
}

function SummaryItem({ icon: Icon, label, value, tone = 'primary', className }) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    online: 'bg-status-online/10 text-status-online',
    warn: 'bg-status-warn/10 text-status-warn',
    error: 'bg-status-error/10 text-status-error',
    neutral: 'bg-muted text-muted-foreground',
  };
  return (
    <div className={cn('flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-card/82 px-4 py-3 shadow-sm backdrop-blur-sm', className)}>
      {Icon && <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tones[tone] || tones.primary)}><Icon className="h-4 w-4" /></span>}
      <div className="min-w-0">
        <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export { Page, PageIntro, PageToolbar, SummaryGrid, SummaryItem };
