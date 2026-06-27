import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-secondary-foreground border border-border',
        online: 'bg-status-online/10 text-status-online border border-status-online/20',
        offline: 'bg-muted text-muted-foreground border border-border',
        starting: 'bg-status-warn/10 text-status-warn border border-status-warn/20',
        stopping: 'bg-status-warn/10 text-status-warn border border-status-warn/20',
        active: 'bg-primary/15 text-primary border border-primary/25',
        destructive: 'bg-status-error/10 text-status-error border border-status-error/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
