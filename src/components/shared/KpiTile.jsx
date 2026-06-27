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
      'flex items-center gap-4 rounded-lg border border-border bg-card/82 backdrop-blur-sm p-4',
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
