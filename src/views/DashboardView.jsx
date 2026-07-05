import { useEffect, useRef, useCallback, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AreaChart, RadialGauge } from '@/components/ui/chart';
import { useServer } from '@/context/ServerContext';
import { useT } from '@/context/I18nContext';
import { fmtUptime } from '@/lib/utils';
import { KpiTile } from '@/components/shared/KpiTile';
import { KpiTileSkeleton, ChartCardSkeleton, InfoRowSkeleton } from '@/components/shared/Skeletons';
import { Server, Users, Activity, Clock, Terminal, FolderOpen, Database } from 'lucide-react';

const MAX_SPARK = 150;

export function DashboardView({ active, onNavigate }) {
  const { activeServerId, statuses, servers } = useServer();
  const t = useT();
  const dash = t('common.dashPlaceholder');
  const status = activeServerId ? (statuses[activeServerId] || { status: 'offline' }) : { status: 'offline' };
  const server = servers.find(s => s.id === activeServerId);

  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const sparkRef = useRef({ procmem: [], proccpu: [], syscpu: [], sysmem: [] });
  const [stats, setStats] = useState(null);

  const onStats = useCallback((s) => {
    setStats(s);
    setReady(true);
    const sp = sparkRef.current;
    const push = (key, val) => {
      sp[key] = [...sp[key], val].slice(-MAX_SPARK);
    };
    push('procmem', s.procMem / 1048576);
    push('proccpu', s.procCpu || 0);
    push('syscpu', s.cpuSystem || 0);
    push('sysmem', s.memSystemUsed / 1073741824);
  }, []);

  useEffect(() => {
    if (active) window.__dashOnStats = onStats;
    return () => { if (active) delete window.__dashOnStats; };
  }, [active, onStats]);

  const running = status.status !== 'offline';
  const uptime = running ? fmtUptime(status.uptimeMs) : dash;

  const kpiTone = {
    online: 'online', starting: 'warn', stopping: 'warn', offline: 'neutral',
  }[status.status] || 'neutral';

  const tpsTone = status.tps >= 19 ? 'online' :
                  status.tps >= 15 ? 'warn' :
                  status.tps ? 'error' : 'neutral';

  // Build area chart series from spark data
  const sparkSeries = (key, label, colorIdx = 0) => {
    const data = sparkRef.current[key];
    if (!data || data.length < 2) return [];
    return [{
      name: label,
      data: data.map((v, i) => ({ x: i, y: Math.round(v * 100) / 100 })),
    }];
  };

  const diskPct = stats?.disk?.total
    ? ((stats.disk.total - stats.disk.free) / stats.disk.total) * 100
    : 0;

  const quickLinks = [
    { view: 'console', icon: Terminal, label: t('dashboard.quickConsole') },
    { view: 'players', icon: Users, label: t('dashboard.quickPlayers') },
    { view: 'files', icon: FolderOpen, label: t('dashboard.quickFiles') },
    { view: 'backups', icon: Database, label: t('dashboard.quickBackups') },
  ];

  if (!ready && activeServerId) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiTileSkeleton />
          <KpiTileSkeleton />
          <KpiTileSkeleton />
          <KpiTileSkeleton />
        </div>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
          <ChartCardSkeleton />
          <div className="xl:col-span-2 rounded-2xl border border-border bg-card p-5 space-y-3">
            <InfoRowSkeleton />
            <InfoRowSkeleton />
            <InfoRowSkeleton />
            <InfoRowSkeleton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* StatCard grid */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiTile
          icon={Server}
          label={t('dashboard.status')}
          value={t(`status.${status.status}`)}
          sub={server?.name || dash}
          tone={kpiTone}
          delta={status.status === 'online' ? { value: 'live', direction: 'up' } : undefined}
        />
        <KpiTile
          icon={Users}
          label={t('dashboard.playersOnline')}
          value={`${status.playerCount || 0}`}
          sub={t('dashboard.playersOnlineSub', { max: status.maxPlayers || 0, maxWord: t('common.maxWord') })}
          tone="primary"
        />
        <KpiTile
          icon={Activity}
          label={t('dashboard.tps')}
          value={status.tps != null && running ? status.tps.toFixed(1) : dash}
          tone={tpsTone}
          delta={status.tps >= 19 ? { value: 'great', direction: 'up' } : status.tps >= 15 ? { value: 'fair', direction: 'neutral' } : undefined}
        />
        <KpiTile
          icon={Clock}
          label={t('dashboard.uptime')}
          value={uptime}
          tone="neutral"
          delta={running ? { value: fmtUptime(status.uptimeMs).split(' ')[0] || '', direction: 'up' } : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        {/* Live resources - Area chart card */}
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>{t('dashboard.liveResources')}</CardTitle>
            <span className="text-xs text-muted-foreground">{t('dashboard.last5min')}</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium text-foreground">{t('dashboard.serverRam')}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {stats ? Math.round(stats.procMem / 1048576) : 0} {t('common.unitMB')}
                  </span>
                </div>
                <AreaChart
                  data={sparkSeries('procmem', t('dashboard.serverRam'))}
                  height={90}
                  options={{
                    chart: { sparkline: { enabled: true } },
                    stroke: { width: 1.5 },
                    tooltip: { enabled: false },
                    yaxis: { show: false, labels: { show: false }, min: 0 },
                    grid: { show: false, padding: { left: 0, right: 0, top: 4, bottom: 0 } },
                  }}
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium text-foreground">{t('dashboard.serverCpu')}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {stats ? (stats.procCpu || 0).toFixed(0) : 0} {t('common.unitPercent')}
                  </span>
                </div>
                <AreaChart
                  data={sparkSeries('proccpu', t('dashboard.serverCpu'))}
                  height={90}
                  options={{
                    chart: { sparkline: { enabled: true } },
                    stroke: { width: 1.5 },
                    tooltip: { enabled: false },
                    yaxis: { show: false, labels: { show: false }, min: 0, max: 100 },
                    grid: { show: false, padding: { left: 0, right: 0, top: 4, bottom: 0 } },
                  }}
                />
              </div>
              {stats?.disk?.total && (
                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium text-foreground">{t('dashboard.disk')}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {((stats.disk.total - stats.disk.free) / 1073741824).toFixed(0)} / {(stats.disk.total / 1073741824).toFixed(0)} {t('common.unitGB')}
                    </span>
                  </div>
                  <Progress value={diskPct} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right column: Radial gauge + Server info */}
        <div className="xl:col-span-2 space-y-5">
          {/* TPS gauge */}
          {running && status.tps != null && (
            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.tps')}</CardTitle>
                <span className="text-xs text-muted-foreground">{status.tps.toFixed(1)}</span>
              </CardHeader>
              <CardContent className="flex justify-center">
                <RadialGauge
                  value={Math.round((status.tps / 20) * 100)}
                  label="TPS"
                  height={180}
                />
              </CardContent>
            </Card>
          )}

          {/* Server info */}
          <Card>
            <CardHeader><CardTitle>{t('dashboard.serverInfo')}</CardTitle></CardHeader>
            <CardContent className="space-y-0 p-0">
              {[
                { label: t('dashboard.version'), value: server?.mcVersion || dash },
                { label: t('dashboard.jar'), value: server?.jar || dash },
                { label: t('dashboard.worlds'), value: server?.worlds?.join(', ') || dash },
                { label: t('dashboard.folder'), value: server?.dir || dash },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-3 px-5 py-2.5 border-b border-border last:border-0 text-sm">
                  <span className="text-muted-foreground shrink-0">{label}</span>
                  <span className="font-medium text-foreground text-right truncate max-w-[160px] font-mono text-xs">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.quickActions')}</CardTitle>
          <span className="text-xs text-muted-foreground">{t('dashboard.quickActionsHint')}</span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {quickLinks.map(({ view, icon: Icon, label }) => (
              <Button
                key={view}
                variant="glass"
                className="h-12 justify-start px-3"
                onClick={() => onNavigate?.(view)}
                disabled={!activeServerId}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
