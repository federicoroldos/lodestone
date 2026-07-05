import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AreaChart } from '@/components/ui/chart';
import { useApi } from '@/hooks/useApi';
import { useServer } from '@/context/ServerContext';
import { useT } from '@/context/I18nContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ChartCardSkeleton } from '@/components/shared/Skeletons';
import { ErrorState } from '@/components/shared/ErrorState';

function fmtMB(mb) {
  if (mb == null) return '-';
  if (mb < 1024) return Math.round(mb) + ' MB';
  return (mb / 1024).toFixed(1) + ' GB';
}

const RANGES = [
  { key: 'hour', labelKey: 'metrics.range1h' },
  { key: '6h',   labelKey: 'metrics.range6h' },
  { key: 'day',  labelKey: 'metrics.range24h' },
  { key: 'week', labelKey: 'metrics.range7d' },
];

export function MetricsView() {
  const api = useApi();
  const { activeServerId } = useServer();
  const t = useT();
  const [range, setRange] = useState('6h');
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(r) {
    setLoading(true);
    setError('');
    try {
      const q = activeServerId ? `&serverId=${encodeURIComponent(activeServerId)}` : '';
      const d = await api(`/api/metrics?range=${encodeURIComponent(r)}${q}`);
      setPoints(d.points || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { load(range); }, [range, activeServerId]);

  const last = points[points.length - 1];

  const charts = [
    { key: 'cpu', label: t('metrics.chartCpu'), lastVal: last ? last.cpu + '%' : t('common.dashPlaceholder'), fmt: v => Math.round(v) + '%' },
    { key: 'mem', label: t('metrics.chartMemory'), lastVal: last ? fmtMB(last.mem) : t('common.dashPlaceholder'), fmt: fmtMB },
    { key: 'players', label: t('metrics.chartPlayers'), lastVal: last ? String(last.players) : t('common.dashPlaceholder'), fmt: v => Math.round(v) },
    { key: 'world', label: t('metrics.chartWorldSize'), lastVal: last ? fmtMB(last.world) : t('common.dashPlaceholder'), fmt: fmtMB },
  ];

  // Build ApexCharts series from points
  const chartData = (metricKey) => {
    if (!points || points.length === 0) return [];
    const rangeMs = range === 'hour' ? 3600000 : range === '6h' ? 21600000 : range === 'day' ? 86400000 : 604800000;
    const now = Date.now();
    const cutoff = now - rangeMs;
    return [{
      name: metricKey,
      data: points
        .filter(p => p.t >= cutoff)
        .map(p => ({ x: p.t, y: metricKey === 'mem' || metricKey === 'world' ? p[metricKey] : Math.round(p[metricKey]) })),
    }];
  };

  if (error && !loading && points.length === 0) {
    return <ErrorState error={error} onRetry={() => load(range)} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5 gap-0.5">
          {RANGES.map(r => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-semibold transition-colors',
                range === r.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(r.labelKey)}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{t('metrics.sampledEveryMinute')}</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ChartCardSkeleton />
          <ChartCardSkeleton />
          <ChartCardSkeleton />
          <ChartCardSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {charts.map(c => (
            <Card key={c.key}>
              <CardHeader>
                <CardTitle>{c.label}</CardTitle>
                <span className="text-xs text-muted-foreground">{c.lastVal}</span>
              </CardHeader>
              <CardContent>
                {points.length > 0 ? (
                  <AreaChart
                    data={chartData(c.key)}
                    height={192}
                    options={{
                      xaxis: { type: 'datetime', labels: { format: range === 'week' ? 'MMM dd' : 'HH:mm' } },
                      yaxis: {
                        labels: { formatter: c.fmt },
                        forceNiceScale: true,
                      },
                      tooltip: {
                        x: { format: range === 'week' ? 'MMM dd HH:mm' : 'HH:mm' },
                        y: { formatter: c.fmt },
                      },
                    }}
                  />
                ) : (
                  <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                    {t('metrics.noData')}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
