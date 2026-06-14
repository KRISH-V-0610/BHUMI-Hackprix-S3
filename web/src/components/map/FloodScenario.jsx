import { motion, AnimatePresence } from 'framer-motion'
import { Waves, Square, ArrowRight, AlertTriangle } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'
import { useWorkspace } from '../../store/useWorkspace.js'
import { useFloodScenario } from '../../store/useFloodScenario.js'
import { useUI } from '../../store/useUI.js'
import { heatColor, heatGradient } from '../../lib/risk.js'

// Dock button — runs the Musi-river monsoon flood scenario (camera traces downstream, bank wards
// flood, future-risk wards pulse). Click again to stop.
export function FloodScenarioButton() {
  const active = useFloodScenario((s) => s.active)
  const run = useFloodScenario((s) => s.run)
  const stop = useFloodScenario((s) => s.stop)

  const onClick = () => {
    if (active) return stop()
    const st = useDashboard.getState()
    st.setActiveLayer('flood')
    st.setView('2.5d')
    run(st.wards, st.year, st.flyTo)
  }

  return (
    <button
      onClick={onClick}
      title={active ? 'Stop flood scenario' : 'Monsoon flood scenario (Musi river)'}
      className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${
        active ? 'bg-risk-high/15 text-risk-high' : 'text-ink-dim hover:bg-hover hover:text-cyan'
      }`}
    >
      {active ? <Square size={14} fill="currentColor" /> : <Waves size={15} />}
      {active ? 'Stop' : 'Flood'}
    </button>
  )
}

// HUD shown while the scenario plays — "what if a flood comes?": progress, the MOST-AFFECTED areas
// ranked by risk, the forecast spread, and a hand-off to the drainage planner.
export function FloodScenarioHud() {
  const active = useFloodScenario((s) => s.active)
  const time = useFloodScenario((s) => s.time)
  const data = useFloodScenario((s) => s.data)
  const stop = useFloodScenario((s) => s.stop)

  const sendToPlanner = () => {
    const names = (data?.floodWards || []).map((w) => w.name)
    useDashboard.getState().setActiveLayer('flood')
    useDashboard.getState().setHighlightWards(names)
    useWorkspace.getState().setPlannerIntervention('drain_desilt')
    useUI.getState().setPlannerOpen(true)
    stop()
  }

  // The areas that would be hit hardest, ranked by flood severity (the answer to "which areas?").
  const topAffected = data
    ? [...data.floodWards].sort((a, b) => b.flood - a.flood).slice(0, 5)
    : []
  const prog = data ? (time / data.duration) * 100 : 0

  return (
    <AnimatePresence>
      {active && data && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="glass absolute left-1/2 top-20 z-20 w-80 -translate-x-1/2 p-3"
        >
          <div className="flex items-center gap-1.5 text-xs font-bold text-cyan">
            <Waves size={14} className="animate-pulse-glow" />
            What if a flood comes? · Musi river
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan to-risk-high transition-[width] duration-150"
              style={{ width: `${Math.min(100, prog)}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-ink-dim">
            <span>
              <span className="font-semibold text-cyan">
                {data.floodWards.filter((w) => w.t <= prog).length}
              </span>{' '}
              wards inundated
            </span>
            <span>
              <span className="font-semibold text-amber">{data.future.length}</span> projected by {data.futureYear}
            </span>
          </div>

          {/* most-affected ranking — the direct answer to "which areas?" */}
          <div className="mt-2.5 rounded-lg bg-bg-soft p-2">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-risk-high">
              <AlertTriangle size={11} /> Most affected areas
            </div>
            <div className="space-y-1">
              {topAffected.map((w, i) => {
                const inundated = w.t <= prog
                return (
                  <div key={w.name} className="flex items-center gap-2 text-[11px]">
                    <span className="w-3 text-ink-dim">{i + 1}</span>
                    <span className={`flex-1 truncate ${inundated ? 'font-semibold text-ink' : 'text-ink-dim'}`}>
                      {w.name}
                    </span>
                    <span className="h-1.5 w-12 rounded-full" style={{ background: heatGradient(w.flood) }} />
                    <span className="w-6 text-right font-bold tabular-nums" style={{ color: heatColor(w.flood) }}>
                      {w.flood}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <button
            onClick={sendToPlanner}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-neon-deep px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
          >
            Send at-risk wards to drainage planner <ArrowRight size={13} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
