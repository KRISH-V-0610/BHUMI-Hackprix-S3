import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { useDashboard } from '../../store/useDashboard.js'
import { rankWards, riskToRGB } from '../../lib/risk.js'

// Top-5 High Risk Wards for the active layer/year, as a ranked list with horizontal bars.
// Highlighted wards (from /ask) are pulled to the top + glow.
export default function TopWards() {
  const wards = useDashboard((s) => s.wards)
  const year = useDashboard((s) => s.year)
  const activeLayer = useDashboard((s) => s.activeLayer)
  const legend = useDashboard((s) => s.activeLegend())
  const highlightWards = useDashboard((s) => s.highlightWards)
  const setSelectedWard = useDashboard((s) => s.setSelectedWard)
  const highlightSet = useMemo(() => new Set(highlightWards), [highlightWards])

  const ranked = useMemo(() => rankWards(wards, year, activeLayer, 5), [wards, year, activeLayer])

  return (
    <div className="glass p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-dim">
        Top-5 High Risk Wards · {activeLayer}
      </div>
      <div className="flex flex-col gap-1.5">
        {ranked.map((w, i) => {
          const [r, g, b] = riskToRGB(w.score, legend, 255)
          const hot = highlightSet.has(w.name)
          return (
            <motion.button
              key={w.name}
              onClick={() => setSelectedWard(w.name)}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`group flex items-center gap-2 rounded-lg px-1.5 py-1 text-left ${
                hot ? 'bg-hover ring-1 ring-neon/50' : 'hover:bg-hover'
              }`}
            >
              <span className="w-4 text-xs font-bold text-ink-dim">{i + 1}</span>
              <div className="flex-1">
                <div className="flex justify-between text-xs">
                  <span className={hot ? 'text-neon' : 'text-ink'}>{w.name}</span>
                  <span className="text-ink-dim">{w.score}</span>
                </div>
                <div className="mt-0.5 h-1.5 w-full rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${w.score}%`, background: `rgb(${r},${g},${b})` }}
                  />
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
