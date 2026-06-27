import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60',
        'focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'transition-colors resize-vertical',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
