import { cn } from '@/lib/utils';

const THRESHOLD_COLORS = {
  low: 'bg-primary',
  medium: 'bg-status-warn',
  high: 'bg-status-error',
};

function getThresholdColor(value) {
  if (value >= 90) return THRESHOLD_COLORS.high;
  if (value >= 75) return THRESHOLD_COLORS.medium;
  return THRESHOLD_COLORS.low;
}

export function Progress({ value = 0, max = 100, color, showLabel = false, className, trackClassName, ...props }) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const fillColor = color || getThresholdColor(pct);

  return (
    <div
      className={cn('h-2 w-full rounded-full bg-muted overflow-hidden', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      {...props}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-300', fillColor)}
        style={{ width: `${pct}%` }}
      />
      {showLabel && (
        <span className="sr-only">{Math.round(pct)}%</span>
      )}
    </div>
  );
}
