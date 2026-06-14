import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'
import { heatColor, heatRGB } from '../../lib/risk.js'

// Change summary — one card per layer, led by the CHANGE since 2016 (▲ worsened / ▼ improved),
// heat-tinted by the current score, with the live score as a pill. Click a card → map shows it.
export default function Scorecards() {
  const cards = useDashboard((s) => s.scorecards)
  const setActiveLayer = useDashboard((s) => s.setActiveLayer)
  const activeLayer = useDashboard((s) => s.activeLayer)

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((c, i) => {
        const delta = c.delta_since_2016 ?? 0
        const worse = delta > 0
        const flat = delta === 0
        const dColor = flat ? '#9aa39a' : worse ? '#e0383b' : '#22a05a'
        const active = activeLayer === c.id
        const Icon = flat ? Minus : worse ? TrendingUp : TrendingDown
        const [r, g, b] = heatRGB(c.score)
        return (
          <motion.button
            key={c.id}
            onClick={() => setActiveLayer(c.id)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            whileHover={{ y: -2 }}
            style={{
              backgroundColor: '#ffffff',
              backgroundImage: `linear-gradient(155deg, rgba(${r},${g},${b},0.18) 0%, rgba(${r},${g},${b},0.05) 55%, rgba(255,255,255,0) 100%)`,
              borderColor: active ? dColor : 'transparent',
              boxShadow: active ? `0 4px 16px rgba(${r},${g},${b},0.35)` : undefined,
            }}
            className="relative flex flex-col items-start overflow-hidden rounded-xl border-2 p-2.5 text-left transition"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-dim">{c.label}</span>

            {/* hero: the change since 2016 */}
            <div
              className="mt-0.5 flex items-center gap-1 rounded-md px-1.5 py-0.5"
              style={{ background: `${dColor}1a`, color: dColor }}
            >
              <Icon size={15} strokeWidth={2.5} />
              <span className="text-lg font-extrabold leading-none tabular-nums">{Math.abs(delta)}</span>
            </div>

            {/* live score pill */}
            <span className="mt-1.5 flex items-center gap-1 text-[10px] text-ink-dim">
              now
              <span
                className="rounded-full px-1.5 py-px font-bold text-white tabular-nums"
                style={{ background: heatColor(c.score) }}
              >
                {c.score}
              </span>
              since 2016
            </span>

            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/5">
              <div className="h-full" style={{ width: `${c.score}%`, background: heatColor(c.score) }} />
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
