import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'
import { cityAverage, heatColor } from '../../lib/risk.js'
import { TIMELINE_YEARS } from '../../lib/years.js'
import { layerMeta } from '../../lib/insights.js'

const W = 380
const H = 150
const PAD = { l: 34, r: 16, t: 18, b: 28 }
const IW = W - PAD.l - PAD.r
const IH = H - PAD.t - PAD.b

// Floating trend line that tracks the active layer city-average across all timeline years.
// A dotted cursor drops at the currently selected year so users can see exactly where they are
// in the climate arc while scrubbing the Time Machine slider.
export default function TrendMiniChart() {
  const tmPlaying = useDashboard((s) => s.tmPlaying)
  const wards    = useDashboard((s) => s.wards)
  const year     = useDashboard((s) => s.year)
  const layer    = useDashboard((s) => s.activeLayer)
  const features = wards?.features ?? []

  const meta   = layerMeta(layer)
  const series = useMemo(
    () => TIMELINE_YEARS.map((y) => ({ year: y, v: cityAverage(features, y, layer) })),
    [features, layer]
  )

  // only visible while the Time Machine is playing — hidden on pause (like the spectral panel)
  const show = features.length > 0 && tmPlaying

  const vals = series.map((s) => s.v)
  const lo   = Math.max(0,   Math.min(...vals) - 4)
  const hi   = Math.min(100, Math.max(...vals) + 4)

  const toX = (i) => PAD.l + (i / Math.max(series.length - 1, 1)) * IW
  const toY = (v) => PAD.t + IH - ((v - lo) / (hi - lo || 1)) * IH

  const pts      = series.map((s, i) => `${toX(i)},${toY(s.v)}`).join(' ')
  const fillPath = [
    `M${toX(0)},${toY(series[0].v)}`,
    ...series.map((s, i) => `L${toX(i)},${toY(s.v)}`),
    `L${toX(series.length - 1)},${PAD.t + IH}`,
    `L${toX(0)},${PAD.t + IH}`,
    'Z',
  ].join(' ')

  const curIdx = TIMELINE_YEARS.indexOf(Number(year))
  const curX   = curIdx >= 0 ? toX(curIdx) : null
  const cur    = curIdx >= 0 ? series[curIdx] : null
  const lineCol = cur ? heatColor(cur.v) : '#7e9b73'

  // Y grid labels at top + bottom of inner area
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y:   PAD.t + f * IH,
    val: Math.round(hi - f * (hi - lo)),
  }))

  return (
    <AnimatePresence>
      {show && (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      transition={{ duration: 0.32 }}
      className="pointer-events-auto overflow-hidden rounded-2xl p-4"
      style={{
        width: W + 24,
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.50)',
        boxShadow: '0 8px 32px rgba(31,41,55,0.13), inset 0 1px 0 rgba(255,255,255,0.90)',
      }}
    >
      {/* header */}
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-dim">
          <TrendingUp size={13} className="text-cyan" />
          {meta.label} trend
        </span>
        {cur && (
          <span className="flex items-baseline gap-1">
            <span className="font-serif text-xl font-extrabold tabular-nums text-ink">{cur.v}</span>
            <span className="text-[10px] text-ink-dim">/100</span>
          </span>
        )}
      </div>

      <svg width={W} height={H} className="overflow-visible">
        <defs>
          <linearGradient id="tmg-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineCol} stopOpacity="0.22" />
            <stop offset="100%" stopColor={lineCol} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* grid */}
        {gridLines.map(({ y, val }) => (
          <g key={val}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y}
              stroke="rgba(0,0,0,0.07)" strokeWidth="0.8" />
            <text x={PAD.l - 4} y={y + 3} textAnchor="end" fontSize="6.5" fill="#9ca3af">
              {val}
            </text>
          </g>
        ))}

        {/* area fill */}
        <path d={fillPath} fill="url(#tmg-fill)" />

        {/* trend line */}
        <polyline points={pts} fill="none" stroke={lineCol} strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* data dots */}
        {series.map((s, i) => {
          const active = i === curIdx
          return (
            <circle key={s.year}
              cx={toX(i)} cy={toY(s.v)}
              r={active ? 5.5 : 3.5}
              fill={heatColor(s.v)}
              stroke="white" strokeWidth={active ? 2 : 1}
            />
          )
        })}

        {/* cursor at current year */}
        {curX != null && (
          <line x1={curX} x2={curX} y1={PAD.t} y2={PAD.t + IH}
            stroke={lineCol} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.65" />
        )}

        {/* x-axis year labels */}
        {series.map((s, i) => {
          const show = i === 0 || i === series.length - 1 || i === curIdx
          if (!show) return null
          return (
            <text key={s.year} x={toX(i)} y={H - 5}
              textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}
              fontSize="7" fill={i === curIdx ? lineCol : '#9ca3af'}
              fontWeight={i === curIdx ? '700' : '400'}
            >
              {s.year}
            </text>
          )
        })}
      </svg>

      {/* footer */}
      <div className="mt-1 text-[10px] text-ink-dim">
        City average · {TIMELINE_YEARS[0]}–{TIMELINE_YEARS[TIMELINE_YEARS.length - 1]} · {layer}
      </div>
    </motion.div>
      )}
    </AnimatePresence>
  )
}
