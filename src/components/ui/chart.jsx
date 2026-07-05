import { useMemo } from 'react';
import ReactApexChart from 'react-apexcharts';

function readCssVar(name, fallback = '#5ec9a0') {
  if (typeof document === 'undefined') return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!val) return fallback;
  return `hsl(${val})`;
}

function parseHslValue(name, fallback = '156 46% 58%') {
  if (typeof document === 'undefined') return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return val || fallback;
}

export function useChartTheme() {
  return useMemo(() => ({
    colors: [
      readCssVar('--chart-1', '#5ec9a0'),
      readCssVar('--chart-2', '#4f8cff'),
      readCssVar('--chart-3', '#a78bfa'),
      readCssVar('--chart-4', '#f0a23b'),
      readCssVar('--chart-5', '#e06070'),
    ],
    foreground: readCssVar('--foreground', '#c4cbd1'),
    mutedForeground: readCssVar('--muted-foreground', '#7d8593'),
    border: readCssVar('--border', '#2e353a'),
  }), []);
}

const BASE_OPTIONS = {
  chart: {
    type: 'area',
    toolbar: { show: false },
    zoom: { enabled: false },
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    foreColor: undefined,
    dropShadow: { enabled: false },
    sparkline: { enabled: false },
    animations: { easing: 'easeout', speed: 600, dynamicAnimation: { speed: 600 } },
    background: 'transparent',
  },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 2 },
  fill: {
    type: 'gradient',
    gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.3, opacityFrom: 0.35, opacityTo: 0.05 },
  },
  grid: {
    borderColor: undefined,
    strokeDashArray: 4,
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: true } },
    padding: { left: 0, right: 4 },
  },
  xaxis: {
    type: 'datetime',
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: { style: { fontSize: '10px', fontWeight: 500 } },
    tooltip: { enabled: false },
  },
  yaxis: {
    labels: { style: { fontSize: '10px', fontWeight: 500 } },
    min: 0,
    forceNiceScale: true,
  },
  tooltip: {
    theme: 'dark',
    x: { format: 'HH:mm' },
    style: { fontSize: '12px', fontFamily: 'Inter' },
  },
  legend: {
    show: true,
    position: 'top',
    horizontalAlign: 'right',
    fontSize: '11px',
    fontWeight: 500,
    markers: { width: 8, height: 8, radius: 2 },
    itemMargin: { horizontal: 8, vertical: 0 },
  },
};

export function AreaChart({ data, categories, height = 180, options: extraOptions, ...props }) {
  const theme = useChartTheme();

  const options = useMemo(() => {
    const base = structuredClone(BASE_OPTIONS);
    base.chart.type = 'area';
    base.chart.foreColor = theme.foreground;
    base.colors = theme.colors;
    base.grid.borderColor = theme.border;
    base.fill.gradient.shade = 'dark';
    if (extraOptions) Object.assign(base, extraOptions);
    if (extraOptions?.xaxis) Object.assign(base.xaxis, extraOptions.xaxis);
    if (extraOptions?.yaxis) Object.assign(base.yaxis, extraOptions.yaxis);
    if (extraOptions?.stroke) Object.assign(base.stroke, extraOptions.stroke);
    if (extraOptions?.fill) Object.assign(base.fill, extraOptions.fill);
    if (extraOptions?.grid) Object.assign(base.grid, extraOptions.grid);
    if (extraOptions?.legend) Object.assign(base.legend, extraOptions.legend);
    if (extraOptions?.tooltip) Object.assign(base.tooltip, extraOptions.tooltip);
    if (extraOptions?.dataLabels) base.dataLabels = extraOptions.dataLabels;
    return base;
  }, [theme, extraOptions]);

  const series = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return [{ data }];
  }, [data]);

  return (
    <ReactApexChart
      options={options}
      series={series}
      type="area"
      height={height}
      {...props}
    />
  );
}

export function BarChart({ data, categories, height = 180, options: extraOptions, ...props }) {
  const theme = useChartTheme();

  const options = useMemo(() => {
    const base = structuredClone(BASE_OPTIONS);
    base.chart.type = 'bar';
    base.chart.foreColor = theme.foreground;
    base.colors = theme.colors;
    base.grid.borderColor = theme.border;
    base.fill = { colors: theme.colors };
    if (extraOptions) Object.assign(base, extraOptions);
    if (extraOptions?.xaxis) Object.assign(base.xaxis, extraOptions.xaxis);
    if (extraOptions?.yaxis) Object.assign(base.yaxis, extraOptions.yaxis);
    if (extraOptions?.plotOptions) base.plotOptions = extraOptions.plotOptions;
    if (extraOptions?.grid) Object.assign(base.grid, extraOptions.grid);
    if (extraOptions?.legend) Object.assign(base.legend, extraOptions.legend);
    return base;
  }, [theme, extraOptions]);

  const series = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return [{ data }];
  }, [data]);

  return (
    <ReactApexChart
      options={options}
      series={series}
      type="bar"
      height={height}
      {...props}
    />
  );
}

export function RadialGauge({ value, label, color, height = 200, ...props }) {
  const theme = useChartTheme();

  const options = useMemo(() => ({
    chart: {
      type: 'radialBar',
      toolbar: { show: false },
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      foreColor: theme.foreground,
      background: 'transparent',
      animations: { easing: 'easeout', speed: 600 },
    },
    colors: [color || theme.colors[0]],
    plotOptions: {
      radialBar: {
        startAngle: -135,
        endAngle: 135,
        hollow: { size: '60%' },
        dataLabels: {
          name: { show: true, fontSize: '13px', fontWeight: 600, color: theme.foreground, offsetY: -8 },
          value: { show: true, fontSize: '22px', fontWeight: 700, color: theme.foreground, offsetY: 6, formatter: (v) => v + '%' },
        },
        track: { background: theme.border, strokeWidth: '100%', margin: 5 },
      },
    },
    fill: { type: 'solid' },
    stroke: { lineCap: 'round' },
    labels: [label || ''],
    tooltip: { enabled: false },
  }), [theme, color, label]);

  return (
    <ReactApexChart
      options={options}
      series={[value]}
      type="radialBar"
      height={height}
      {...props}
    />
  );
}
