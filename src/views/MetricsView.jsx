import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { useServer } from '@/context/ServerContext';
import { useT } from '@/context/I18nContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function niceMax(v) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function fmtMB(mb) {
  if (mb == null) return '-';
  if (mb < 1024) return Math.round(mb) + ' MB';
  return (mb / 1024).toFixed(1) + ' GB';
}

function hexToRgba(hex, a) {
  let h = String(hex).replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  const n = parseInt(h, 16);
  if (isNaN(n)) return `rgba(58,53,64,${a})`;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function ChartCanvas({ points, metricKey, color, fmt, minMax, range, noDataText }) {
  const ref = useRef(null);

  function fmtTime(t) {
    const d = new Date(t);
    const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (range === 'day' || range === 'week') {
      return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' }) + ' ' + hm;
    }
    return hm;
  }

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = rect.width * dpr; c.height = rect.height * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);
    const grid = 'rgba(51,58,61,0.6)';
    const text3 = '#7d8593';

    if (!points.length) {
      ctx.fillStyle = text3; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(noDataText, W / 2, H / 2);
      return;
    }

    const padL = 46, padR = 12, padT = 10, padB = 22;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const vals = points.map(p => p[metricKey]);
    const maxV = niceMax(Math.max(...vals, minMax || 1));
    const t0 = points[0].t, t1 = points[points.length - 1].t || (t0 + 1);
    const x = t => padL + ((t - t0) / (t1 - t0 || 1)) * plotW;
    const y = v => padT + plotH - (v / maxV) * plotH;

    ctx.strokeStyle = grid; ctx.fillStyle = text3; ctx.font = '10px system-ui'; ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const v = maxV * i / 3, yy = y(v);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(fmt(v), padL - 6, yy + 3);
    }

    ctx.beginPath();
    points.forEach((p, i) => { const xx = x(p.t), yy = y(p[metricKey]); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); });
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.lineTo(x(t1), y(0)); ctx.lineTo(x(t0), y(0)); ctx.closePath();
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, hexToRgba(color, 0.15));
    grad.addColorStop(1, hexToRgba(color, 0.02));
    ctx.fillStyle = grad; ctx.fill();

    ctx.fillStyle = text3; ctx.font = '10px system-ui';
    ctx.textAlign = 'left'; ctx.fillText(fmtTime(t0), padL, H - 7);
    ctx.textAlign = 'right'; ctx.fillText(fmtTime(t1), W - padR, H - 7);
  }, [points, metricKey, color, range, noDataText]);

  return <canvas ref={ref} className="h-48 w-full" />;
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

  async function load(r) {
    try {
      const q = activeServerId ? `&serverId=${encodeURIComponent(activeServerId)}` : '';
      const d = await api(`/api/metrics?range=${encodeURIComponent(r)}${q}`);
      setPoints(d.points || []);
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => { load(range); }, [range, activeServerId]);

  const last = points[points.length - 1];

  const charts = [
    { key: 'cpu', label: t('metrics.chartCpu'), lastVal: last ? last.cpu + '%' : t('common.dashPlaceholder'), color: '#4f8cff', fmt: v => Math.round(v) + '%', minMax: 100 },
    { key: 'mem', label: t('metrics.chartMemory'), lastVal: last ? fmtMB(last.mem) : t('common.dashPlaceholder'), color: '#36c275', fmt: fmtMB },
    { key: 'players', label: t('metrics.chartPlayers'), lastVal: last ? String(last.players) : t('common.dashPlaceholder'), color: '#f0a23b', fmt: v => Math.round(v), minMax: 4 },
    { key: 'world', label: t('metrics.chartWorldSize'), lastVal: last ? fmtMB(last.world) : t('common.dashPlaceholder'), color: '#6f9fff', fmt: fmtMB },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5 gap-0.5">
          {RANGES.map(r => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={cn(
                'px-3 py-1 rounded text-xs font-semibold transition-colors',
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {charts.map(c => (
          <Card key={c.key}>
            <CardHeader>
              <CardTitle>{c.label}</CardTitle>
              <span className="text-xs text-muted-foreground">{c.lastVal}</span>
            </CardHeader>
            <CardContent>
              <ChartCanvas points={points} metricKey={c.key} color={c.color} fmt={c.fmt} minMax={c.minMax} range={range} noDataText={t('metrics.noData')} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
