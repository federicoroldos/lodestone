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
