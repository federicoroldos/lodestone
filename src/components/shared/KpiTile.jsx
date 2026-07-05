import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AreaChart } from '@/components/ui/chart';

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

const DELTA_VARIANTS = {
  up: 'softSuccess',
  down: 'softError',
  neutral: 'softInfo',
};

export function KpiTile({ icon: Icon, label, value, sub, tone = 'neutral', delta, sparkData }) {
  const deltaVariant = delta?.direction || 'neutral';
  return (
    <div className={cn(
      'flex items-start gap-4 rounded-xl border border-border bg-card/82 backdrop-blur-sm p-4',
      'border-l-2 transition-all hover:-translate-y-0.5 hover:shadow-md',
      TONE_CLASSES[tone]
    )}>
      <div className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
        ICON_BG[tone]
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <p className="text-xl font-semibold text-foreground truncate">{value}</p>
          {delta && (
            <Badge variant={DELTA_VARIANTS[deltaVariant]} className="text-[10px]">
              {deltaVariant === 'up' ? '↑' : deltaVariant === 'down' ? '↓' : '→'} {delta.value}
            </Badge>
          )}
        </div>
        {sub && <p className="text-xs text-muted-foreground truncate mt-0.5">{sub}</p>}
        {sparkData && sparkData.length > 1 && (
          <div className="mt-2 -mx-1">
            <AreaChart
              data={[{ name: label, data: sparkData.map((v, i) => ({ x: i, y: v })) }]}
              height={40}
              options={{
                chart: { sparkline: { enabled: true } },
                stroke: { width: 1.2 },
                fill: {
                  type: 'gradient',
                  gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.4, opacityFrom: 0.3, opacityTo: 0.02 },
                },
                tooltip: { enabled: false },
                yaxis: { show: false, labels: { show: false } },
                grid: { show: false, padding: { left: 0, right: 0 } },
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
