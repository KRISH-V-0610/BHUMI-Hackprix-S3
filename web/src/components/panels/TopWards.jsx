import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { Flame } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'
import { rankWards, heatGradient, heatGlow, heatColor, HEAT_CSS } from '../../lib/risk.js'

// Top-5 High-Risk Wards as a RISK PYRAMID: the #1 ward is the widest, hottest band at the top,
// each lower rank tapering inward — so the eye instantly reads "these few wards dominate the risk".
// Colored by the shared heat ramp; highlighted wards (from /ask) glow brighter + ring.
export default function TopWards() {
  const wards = useDashboard((s) => s.wards)
  const year = useDashboard((s) => s.year)
  const activeLayer = useDashboard((s) => s.activeLayer)
  const highlightWards = useDashboard((s) => s.highlightWards)
  const setSelectedWard = useDashboard((s) => s.setSelectedWard)
  const highlightSet = useMemo(() => new Set(highlightWards), [highlightWards])

  const ranked = useMemo(() => rankWards(wards, year, activeLayer, 5), [wards, year, activeLayer])

  return (
    <div className="glass p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink">
          <span
            className="grid h-5 w-5 place-items-center rounded-md"
            style={{ background: heatGradient(ranked[0]?.score ?? 80) }}
          >
            <Flame size={12} className="text-white" />
          </span>
          Risk Pyramid
        </span>
        <span className="rounded-full bg-bg-soft px-2 py-0.5 text-[10px] font-semibold capitalize text-ink-dim">
          {activeLayer}
        </span>
      </div>

      {/* the funnel: tapering glossy gradient bands, widest (worst) at the top — left-aligned so
          the rank badge + ward name are always fully visible */}
      <div className="flex flex-col items-start gap-1.5">
        {ranked.map((w, i) => {
          const width = Math.max(62, 100 - i * 9) // 100, 91, 82, 73, 64 — readable floor
          const hot = highlightSet.has(w.name)
          return (
            <motion.button
              key={w.name}
              onClick={() => setSelectedWard(w.name)}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 240, damping: 26 }}
              whileHover={{ scale: 1.02 }}
              style={{
                width: `${width}%`,
                background: heatGradient(w.score),
                boxShadow: hot ? heatGlow(w.score, 0.6) : heatGlow(w.score, 0.3),
              }}
              className={`relative flex h-11 w-full items-center gap-2 overflow-hidden rounded-xl px-2.5 text-white ring-1 transition ${
                hot ? 'ring-2 ring-white/80' : 'ring-white/15'
              }`}
              title={`${w.name} · ${w.score}/100`}
            >
              {/* glossy top-light so the band reads as a polished pill, not a flat bar */}
              <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-linear-to-b from-white/25 to-transparent" />
              <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-black/15 text-[11px] font-bold tabular-nums ring-1 ring-white/20">
                {i + 1}
              </span>
              <span className="relative min-w-0 flex-1 truncate text-left text-[13px] font-semibold drop-shadow-sm">
                {i === 0 && <Flame size={11} className="mr-1 inline -translate-y-px" />}
                {w.name}
              </span>
              <span className="relative shrink-0 text-base font-extrabold tabular-nums drop-shadow-sm">
                {w.score}
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* heat legend so the color coding reads as intentional */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[10px] font-medium text-ink-dim">low</span>
        <div className="h-1.5 flex-1 rounded-full" style={{ background: HEAT_CSS }} />
        <span className="text-[10px] font-medium text-ink-dim">severe</span>
      </div>
    </div>
  )
}
