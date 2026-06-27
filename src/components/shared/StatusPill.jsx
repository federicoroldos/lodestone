import { cn } from '@/lib/utils';

const STATUS_VARIANTS = {
  online:   'bg-status-online/10 text-status-online border border-status-online/20',
  offline:  'bg-muted/50 text-muted-foreground border border-border',
  starting: 'bg-status-warn/10 text-status-warn border border-status-warn/20',
  stopping: 'bg-status-warn/10 text-status-warn border border-status-warn/20',
};

export function StatusPill({ status = 'offline', className }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
      STATUS_VARIANTS[status] || STATUS_VARIANTS.offline,
      className
    )}>
      <StatusDot status={status} />
      {status}
    </span>
  );
}

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
