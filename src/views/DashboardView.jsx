import { useEffect, useRef, useCallback, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useServer } from '@/context/ServerContext';
import { useApi } from '@/hooks/useApi';
import { fmtUptime, fmtBytes } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { KpiTile } from '@/components/shared/KpiTile';
import { Server, Users, Activity, Clock, Cpu, HardDrive } from 'lucide-react';

// Sparkline canvas helper
function drawSpark(canvas, data) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  const c = getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim();
  ctx.strokeStyle = `hsl(${c})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = `hsl(${c} / 0.08)`;
  ctx.fill();
}

function Sparkline({ data }) {
  const ref = useRef(null);
  useEffect(() => { drawSpark(ref.current, data); }, [data]);
  return <canvas ref={ref} className="h-9 w-full" />;
}

function MetricRow({ label, value, unit, data }) {
  return (
    <div className="pb-3 mb-3 border-b border-border last:border-0 last:mb-0 last:pb-0">
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground tabular-nums">{value} {unit}</span>
      </div>
      <Sparkline data={data} />
    </div>
  );
}

const MAX_SPARK = 150;

export function DashboardView({ active }) {
  const { activeServerId, statuses, servers } = useServer();
  const api = useApi();
  const status = activeServerId ? (statuses[activeServerId] || { status: 'offline' }) : { status: 'offline' };
  const server = servers.find(s => s.id === activeServerId);

  // Sparkline data
  const sparkRef = useRef({ procmem: [], proccpu: [], syscpu: [], sysmem: [] });
  const [stats, setStats] = useState(null);

  const onStats = useCallback((s) => {
    setStats(s);
    const sp = sparkRef.current;
    const push = (key, val) => {
      sp[key] = [...sp[key], val].slice(-MAX_SPARK);
    };
    push('procmem', s.procMem / 1048576);
    push('proccpu', s.procCpu || 0);
    push('syscpu', s.cpuSystem || 0);
    push('sysmem', s.memSystemUsed / 1073741824);
  }, []);

  // Register stats listener via context (parent passes it in)
  useEffect(() => {
    if (active) window.__dashOnStats = onStats;
    return () => { if (active) delete window.__dashOnStats; };
  }, [active, onStats]);

  const running = status.status !== 'offline';
  const uptime = running ? fmtUptime(status.uptimeMs) : '—';

  const kpiTone = {
    online: 'online', starting: 'warn', stopping: 'warn', offline: 'neutral',
  }[status.status] || 'neutral';

  const tpsTone = status.tps >= 19 ? 'online' :
                  status.tps >= 15 ? 'warn' :
                  status.tps ? 'error' : 'neutral';

  return (
    <div className="space-y-5">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiTile
          icon={Server}
          label="Status"
          value={status.status}
          sub={server?.name || '—'}
          tone={kpiTone}
        />
        <KpiTile
          icon={Users}
          label="Players online"
          value={`${status.playerCount || 0}`}
          sub={`/ ${status.maxPlayers || 0} max`}
          tone="primary"
        />
        <KpiTile
          icon={Activity}
          label="Performance (TPS)"
          value={status.tps != null && running ? status.tps.toFixed(1) : '—'}
          tone={tpsTone}
        />
        <KpiTile
          icon={Clock}
          label="Uptime"
          value={uptime}
          tone="neutral"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        {/* Live resources */}
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Live resources</CardTitle>
            <span className="text-xs text-muted-foreground">last ~5 min</span>
          </CardHeader>
          <CardContent>
            <MetricRow
              label="Server RAM"
              value={stats ? Math.round(stats.procMem / 1048576) : 0}
              unit="MB"
              data={sparkRef.current.procmem}
            />
            <MetricRow
              label="Server CPU"
              value={stats ? (stats.procCpu || 0).toFixed(0) : 0}
              unit="%"
              data={sparkRef.current.proccpu}
            />
            <MetricRow
              label="System RAM"
              value={stats ? `${(stats.memSystemUsed / 1073741824).toFixed(1)} / ${(stats.memSystemTotal / 1073741824).toFixed(1)} GB` : '—'}
              unit=""
              data={sparkRef.current.sysmem}
            />
            <MetricRow
              label="System CPU"
              value={stats ? (stats.cpuSystem || 0).toFixed(0) : 0}
              unit="%"
              data={sparkRef.current.syscpu}
            />
            {stats?.disk?.total && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Disk usage</span>
                  <span className="font-medium text-foreground tabular-nums">
                    {((stats.disk.total - stats.disk.free) / 1073741824).toFixed(0)} /&nbsp;
                    {(stats.disk.total / 1073741824).toFixed(0)} GB
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      ((stats.disk.total - stats.disk.free) / stats.disk.total) >= 0.9 ? 'bg-status-error' :
                      ((stats.disk.total - stats.disk.free) / stats.disk.total) >= 0.75 ? 'bg-status-warn' :
                      'bg-primary'
                    )}
                    style={{ width: `${(((stats.disk.total - stats.disk.free) / stats.disk.total) * 100).toFixed(1)}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Server info */}
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Server info</CardTitle></CardHeader>
          <CardContent className="space-y-0 p-0">
            {[
              { label: 'Version', value: server?.mcVersion || '—' },
              { label: 'Jar', value: server?.jar || '—' },
              { label: 'Worlds', value: server?.worlds?.join(', ') || '—' },
              { label: 'Folder', value: server?.dir || '—' },
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
  );
}
