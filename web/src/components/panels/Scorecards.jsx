import { motion } from 'framer-motion'
import { useDashboard } from '../../store/useDashboard.js'
import { levelOf } from '../../lib/risk.js'
import NeonNumber from '../common/NeonNumber.jsx'

// Overall Risk Summary — one glowing tile per layer with count-up score + delta arrow.
export default function Scorecards() {
  const cards = useDashboard((s) => s.scorecards)
  const setActiveLayer = useDashboard((s) => s.setActiveLayer)
  const activeLayer = useDashboard((s) => s.activeLayer)

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((c, i) => {
        const lvl = levelOf(c.score)
        const delta = c.delta_since_2016 ?? 0
        return (
          <motion.button
            key={c.id}
            onClick={() => setActiveLayer(c.id)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`glass flex flex-col items-start p-2.5 text-left transition ${
              activeLayer === c.id ? 'ring-1 ring-neon/60' : 'hover:ring-1 hover:ring-cyan/40'
            }`}
          >
            <span className="text-[10px] uppercase tracking-wide text-ink-dim">{c.label}</span>
            <div className="flex items-baseline gap-1.5">
              <NeonNumber value={c.score} color={lvl.color} className="text-2xl font-bold" />
              {delta !== 0 && (
                <span className={`text-[11px] ${delta > 0 ? 'text-risk-high' : 'text-neon'}`}>
                  {delta > 0 ? '▲' : '▼'}
                  {Math.abs(delta)}
                </span>
              )}
            </div>
            <span className="text-[10px]" style={{ color: lvl.color }}>
              {c.level || lvl.label}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
