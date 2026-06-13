import ReactECharts from 'echarts-for-react'
import { useDashboard } from '../../store/useDashboard.js'

// Rainfall Trend — ECharts line, 2016 vs 2026 series from GET /timeseries?metric=rainfall.
export default function RainfallChart() {
  const ts = useDashboard((s) => s.timeseries)
  if (!ts) return null

  const option = {
    backgroundColor: 'transparent',
    grid: { left: 36, right: 12, top: 28, bottom: 24 },
    tooltip: { trigger: 'axis' },
    legend: {
      data: ts.series.map((s) => s.name),
      textStyle: { color: '#64798a' },
      right: 0,
      top: 0,
    },
    xAxis: {
      type: 'category',
      data: ts.labels,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#64798a', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: ts.unit,
      nameTextStyle: { color: '#64798a' },
      splitLine: { lineStyle: { color: 'rgba(100,121,138,0.15)' } },
      axisLabel: { color: '#64798a', fontSize: 10 },
    },
    series: ts.series.map((s, i) => ({
      name: s.name,
      type: 'line',
      smooth: true,
      symbol: 'none',
      data: s.data,
      lineStyle: { width: 2 },
      color: i === 0 ? '#0e7490' : '#16a34a',
      areaStyle: { opacity: 0.1 },
    })),
  }

  return (
    <div className="glass p-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">
        Rainfall Trend
      </div>
      <ReactECharts option={option} style={{ height: 160 }} notMerge />
    </div>
  )
}
