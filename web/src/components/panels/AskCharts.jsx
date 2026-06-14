import ReactECharts from 'echarts-for-react'
import { motion } from 'framer-motion'
import { useDashboard } from '../../store/useDashboard.js'
import { heatColor } from '../../lib/risk.js'

// Series palette for multi-series (e.g. before/after, year-vs-year).
const SERIES_COLORS = ['#94a3b8', '#16a34a', '#0ea5b7', '#f59e0b', '#a855f7']

const AXIS = {
  axisLabel: { color: '#7fa890', fontSize: 9 },
  axisLine: { lineStyle: { color: '#2c4a3a' } },
  splitLine: { lineStyle: { color: 'rgba(127,168,144,0.12)' } },
}

// Build an ECharts option for one chart object. Supports:
//   radar · gauge · pie/doughnut · scatter · bar/line (single c.y OR multi c.series[])
function toOption(c) {
  const base = { backgroundColor: 'transparent', tooltip: { trigger: 'item' }, animationDuration: 600 }

  if (c.type === 'radar') {
    return {
      ...base,
      tooltip: { trigger: 'item' },
      radar: {
        indicator: (c.axes || []).map((a) => ({ name: a, max: 100 })),
        axisName: { color: '#64798a', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(100,121,138,0.18)' } },
        splitArea: { show: false },
      },
      series: [
        {
          type: 'radar',
          data: [{ value: c.values }],
          areaStyle: { opacity: 0.25, color: '#16a34a' },
          lineStyle: { color: '#16a34a', width: 2 },
          itemStyle: { color: '#16a34a' },
        },
      ],
    }
  }

  if (c.type === 'gauge') {
    const v = Math.round(c.value ?? 0)
    return {
      ...base,
      series: [
        {
          type: 'gauge',
          min: 0,
          max: c.max ?? 100,
          progress: { show: true, width: 14, itemStyle: { color: heatColor(v) } },
          axisLine: { lineWidth: 14, lineStyle: { color: [[1, 'rgba(127,168,144,0.18)']] } },
          axisTick: { show: false },
          splitLine: { length: 8, lineStyle: { color: '#cdd6c9' } },
          axisLabel: { color: '#7fa890', fontSize: 9, distance: 14 },
          pointer: { width: 4, itemStyle: { color: heatColor(v) } },
          anchor: { show: true, size: 10, itemStyle: { color: heatColor(v) } },
          detail: {
            valueAnimation: true,
            fontSize: 26,
            fontWeight: 800,
            offsetCenter: [0, '38%'],
            color: heatColor(v),
            formatter: '{value}',
          },
          data: [{ value: v }],
        },
      ],
    }
  }

  if (c.type === 'pie' || c.type === 'doughnut') {
    const data = (c.data || []).map((d) => ({
      name: d.name,
      value: d.value,
      itemStyle: d.color ? { color: d.color } : undefined,
    }))
    return {
      ...base,
      legend: { bottom: 0, textStyle: { color: '#64798a', fontSize: 9 }, itemWidth: 8, itemHeight: 8 },
      series: [
        {
          type: 'pie',
          radius: c.type === 'doughnut' ? ['45%', '72%'] : '70%',
          center: ['50%', '44%'],
          label: { color: '#64798a', fontSize: 9, formatter: '{b}\n{c}' },
          labelLine: { length: 6, length2: 6 },
          data,
        },
      ],
    }
  }

  if (c.type === 'scatter') {
    return {
      ...base,
      tooltip: { trigger: 'item' },
      xAxis: { type: 'value', ...AXIS, name: c.xName },
      yAxis: { type: 'value', ...AXIS, name: c.yName },
      series: [{ type: 'scatter', symbolSize: 12, data: c.points || [], itemStyle: { color: '#16a34a', opacity: 0.75 } }],
    }
  }

  // ── bar | line | area (single c.y, or grouped c.series[]) ──
  const isArea = c.type === 'area'
  const isLine = c.type === 'line' || isArea
  const multi = Array.isArray(c.series) && c.series.length > 0
  const looksRisk = !multi && (c.y || []).every((v) => v >= 0 && v <= 100)

  const series = multi
    ? c.series.map((s, i) => ({
        name: s.name,
        type: isLine ? 'line' : 'bar',
        data: s.data,
        smooth: isLine,
        areaStyle: isArea ? { opacity: 0.18 } : undefined,
        itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length], borderRadius: isLine ? 0 : [4, 4, 0, 0] },
        barMaxWidth: 22,
      }))
    : [
        {
          type: isLine ? 'line' : 'bar',
          data: c.y,
          smooth: isLine,
          areaStyle: isArea ? { opacity: 0.2, color: '#16a34a' } : undefined,
          // colour each risk bar by its severity (heat ramp); otherwise a calm green
          itemStyle: looksRisk
            ? { color: (p) => heatColor(p.value), borderRadius: [4, 4, 0, 0] }
            : { color: '#8aa68a', borderRadius: [4, 4, 0, 0] },
          label: looksRisk
            ? { show: true, position: 'top', formatter: '{c}', color: '#64798a', fontSize: 9 }
            : undefined,
          lineStyle: isLine ? { color: '#16a34a', width: 2 } : undefined,
          barMaxWidth: 26,
        },
      ]

  return {
    ...base,
    tooltip: { trigger: 'axis' },
    grid: { left: 38, right: 12, top: multi ? 28 : 18, bottom: 46 },
    legend: multi ? { top: 0, textStyle: { color: '#64798a', fontSize: 9 }, itemWidth: 10, itemHeight: 8 } : undefined,
    xAxis: { type: 'category', data: c.x, ...AXIS, axisLabel: { ...AXIS.axisLabel, interval: 0, rotate: 32 } },
    yAxis: { type: 'value', ...AXIS },
    series,
  }
}

const HEIGHTS = { gauge: 170, pie: 180, doughnut: 180, radar: 190 }

export default function AskCharts({ charts: chartsProp }) {
  const storeCharts = useDashboard((s) => s.charts)
  const charts = chartsProp ?? storeCharts
  if (!charts?.length) return null

  return (
    <div className="flex flex-col gap-2">
      {charts.map((c, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="glass p-2.5"
        >
          <div className="mb-1 text-[11px] font-semibold text-ink-dim">{c.title}</div>
          <ReactECharts option={toOption(c)} style={{ height: HEIGHTS[c.type] || 160 }} notMerge />
        </motion.div>
      ))}
    </div>
  )
}
