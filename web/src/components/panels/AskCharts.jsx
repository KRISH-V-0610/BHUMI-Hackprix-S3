import ReactECharts from 'echarts-for-react'
import { motion } from 'framer-motion'
import { useDashboard } from '../../store/useDashboard.js'

// Renders the charts[] array returned by POST /ask. Each entry is bar | line | radar.
function toOption(c) {
  const base = { backgroundColor: 'transparent', tooltip: {}, grid: { left: 40, right: 12, top: 16, bottom: 40 } }
  if (c.type === 'radar') {
    return {
      ...base,
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
          areaStyle: { opacity: 0.2 },
          lineStyle: { color: '#16a34a' },
          itemStyle: { color: '#16a34a' },
        },
      ],
    }
  }
  // bar | line
  return {
    ...base,
    xAxis: {
      type: 'category',
      data: c.x,
      axisLabel: { color: '#7fa890', fontSize: 9, interval: 0, rotate: 30 },
      axisLine: { lineStyle: { color: '#2c4a3a' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#7fa890', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(127,168,144,0.12)' } },
    },
    series: [
      {
        type: c.type === 'line' ? 'line' : 'bar',
        data: c.y,
        smooth: c.type === 'line',
        itemStyle: { color: '#8aa68a', borderRadius: [4, 4, 0, 0] },
      },
    ],
  }
}

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
          transition={{ delay: i * 0.12 }}
          className="glass p-2.5"
        >
          <div className="mb-1 text-[11px] font-semibold text-ink-dim">{c.title}</div>
          <ReactECharts option={toOption(c)} style={{ height: 150 }} notMerge />
        </motion.div>
      ))}
    </div>
  )
}
