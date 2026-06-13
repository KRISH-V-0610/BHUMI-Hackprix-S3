import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MapPin, TreePine, Building2, Waves, Droplets, RotateCcw, Sparkles } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'
import { heatColor, heatRGB } from '../../lib/risk.js'
import { TIMELINE_YEARS } from '../../lib/years.js'
import { simulateWard, INTERVENTIONS, formatINR } from '../../lib/planner.js'

const DIMS = [
  { id: 'heat', label: 'Heat' }, { id: 'flood', label: 'Flood' }, { id: 'veg', label: 'Veg' },
  { id: 'lake', label: 'Lake' }, { id: 'urban', label: 'Urban' }, { id: 'water', label: 'Water' },
]
const WHATIF = [
  { id: 'tree_cover', label: 'Trees', icon: TreePine },
  { id: 'cool_roof', label: 'Cool roofs', icon: Building2 },
  { id: 'drain_desilt', label: 'Drains', icon: Waves },
  { id: 'lake_restore', label: 'Lakes', icon: Droplets },
]

// Radar polygon points for 6 dims (0-100) around a center.
function radarPoints(values, cx, cy, r) {
  return values
    .map((v, i) => {
      const a = (Math.PI * 2 * i) / values.length - Math.PI / 2
      const rad = (Math.max(0, Math.min(100, v)) / 100) * r
      return `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`
    })
    .join(' ')
}

// Ward drill-down = a mini digital twin: 6-dim radar + trend + drivers + an interactive WHAT-IF
// (pick an intervention → the radar morphs to the projected state, with per-layer deltas).
export default function WardDetail() {
  const wards = useDashboard((s) => s.wards)
  const year = useDashboard((s) => s.year)
  const activeLayer = useDashboard((s) => s.activeLayer)
  const selectedWard = useDashboard((s) => s.selectedWard)
  const setSelectedWard = useDashboard((s) => s.setSelectedWard)
  const [whatif, setWhatif] = useState(null)

  // reset the scenario whenever a different ward is opened
  useEffect(() => setWhatif(null), [selectedWard])

  const feat = useMemo(
    () => (wards?.features || []).find((f) => f.properties.name === selectedWard),
    [wards, selectedWard]
  )

  if (!feat) return null
  const p = feat.properties
  const sc = p.scores?.[year] || {}
  const sim = whatif ? simulateWard(sc, whatif) : null

  const current = DIMS.map((d) => sc[d.id] ?? 0)
  const projected = DIMS.map((d) => sim?.changes?.[d.id]?.after ?? sc[d.id] ?? 0)
  const worst = DIMS.reduce((a, d) => ((sc[d.id] ?? 0) > (sc[a.id] ?? 0) ? d : a), DIMS[0])
  const drivers = p.drivers || {}

  const trend = TIMELINE_YEARS.map((y) => p.scores?.[y]?.[activeLayer] ?? null).filter((v) => v != null)
  const tMin = Math.min(...trend, 0)
  const tMax = Math.max(...trend, 100)
  const spark = trend
    .map((v, i) => `${(i / (trend.length - 1)) * 100},${30 - ((v - tMin) / (tMax - tMin || 1)) * 28}`)
    .join(' ')

  const [rr, gg, bb] = heatRGB(current[0])

  return (
    <AnimatePresence>
      <motion.div
        key={selectedWard}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        className="glass absolute bottom-3 left-75 z-30 flex max-h-[calc(100vh-96px)] w-64 flex-col overflow-y-auto p-3"
      >
        <div className="mb-2 flex items-start justify-between">
          <div>
            <span className="rounded-full bg-neon/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-neon-deep">
              Ward · digital twin
            </span>
            <div className="mt-1 flex items-center gap-1 text-sm font-bold text-ink">
              <MapPin size={13} className="text-neon-deep" /> {p.name}
            </div>
            <div className="text-[10px] text-ink-dim">Ward {p.ward_no} · {year}</div>
          </div>
          <button onClick={() => setSelectedWard(null)} className="text-ink-dim transition hover:text-ink">
            <X size={15} />
          </button>
        </div>

        {/* radar: current (filled heat) + what-if projection (cyan outline) */}
        <svg viewBox="0 0 140 120" className="mx-auto block h-28 w-full">
          {[0.33, 0.66, 1].map((g) => (
            <polygon key={g} points={radarPoints([100, 100, 100, 100, 100, 100], 70, 58, 44 * g)}
              fill="none" stroke="rgba(0,0,0,0.07)" />
          ))}
          <polygon points={radarPoints(current, 70, 58, 44)}
            fill={`rgba(${rr},${gg},${bb},0.28)`} stroke={`rgb(${rr},${gg},${bb})`} strokeWidth="1.5" />
          {sim && (
            <polygon points={radarPoints(projected, 70, 58, 44)}
              fill="rgba(95,130,148,0.12)" stroke="#2bbf8f" strokeWidth="1.5" strokeDasharray="3 2" />
          )}
          {DIMS.map((d, i) => {
            const a = (Math.PI * 2 * i) / DIMS.length - Math.PI / 2
            return (
              <text key={d.id} x={70 + 56 * Math.cos(a)} y={58 + 56 * Math.sin(a)}
                textAnchor="middle" dominantBaseline="middle" className="fill-ink-dim" fontSize="7">
                {d.label}
              </text>
            )
          })}
        </svg>

        {/* WHAT-IF scenario — pick an intervention, the radar morphs + projected detail below */}
        <div className="mt-1 rounded-lg bg-bg-soft p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
              <Sparkles size={11} className="text-cyan" /> What-if scenario
            </span>
            {sim && (
              <button onClick={() => setWhatif(null)} className="flex items-center gap-0.5 text-[9px] text-ink-dim hover:text-ink">
                <RotateCcw size={10} /> reset
              </button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {WHATIF.map((w) => {
              const Icon = w.icon
              const on = whatif === w.id
              return (
                <button
                  key={w.id}
                  onClick={() => setWhatif(on ? null : w.id)}
                  title={INTERVENTIONS[w.id]?.label}
                  className={`flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[9px] font-semibold transition ${
                    on ? 'bg-neon-deep text-white shadow-sm' : 'bg-panel text-ink-dim hover:bg-hover'
                  }`}
                >
                  <Icon size={14} />
                  {w.label}
                </button>
              )
            })}
          </div>

          {sim && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
              {/* headline: what it costs + what it buys */}
              <div className="mb-1.5 flex items-center justify-between rounded-md bg-neon/10 px-2 py-1">
                <span className="text-[10px] font-semibold text-ink">{sim.label}</span>
                <span className="text-[10px] font-bold text-amber">~{formatINR(INTERVENTIONS[whatif]?.cost || 0)}</span>
              </div>
              {/* aligned before → after per affected dimension */}
              <div className="space-y-1">
                {Object.entries(sim.changes).map(([layer, c]) => (
                  <div key={layer} className="grid grid-cols-[1fr_auto] items-center gap-2 text-[11px]">
                    <span className="capitalize text-ink-dim">{layer}</span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <span className="text-ink">{c.before}</span>
                      <span className="text-neon-deep">→</span>
                      <span className="font-bold text-eucalyptus">{c.after}</span>
                      <span className="ml-0.5 rounded bg-neon/15 px-1 text-[9px] font-semibold text-neon-deep">
                        {c.delta}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 text-[9px] text-ink-dim">First-order estimate · 15% intervention magnitude</div>
            </motion.div>
          )}
        </div>

        {/* active-layer trend */}
        <div className="mt-2">
          <div className="mb-0.5 text-[9px] uppercase tracking-wide text-ink-dim">
            {activeLayer} trend {TIMELINE_YEARS[0]}–{TIMELINE_YEARS[TIMELINE_YEARS.length - 1]}
          </div>
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full">
            <polyline points={spark} fill="none" stroke={heatColor(sc[activeLayer] ?? 0)} strokeWidth="2" />
          </svg>
        </div>

        {/* drivers */}
        <div className="mt-1 space-y-0.5">
          {[['Built-up', drivers.density], ['Green', drivers.green], ['Low-lying', drivers.low_lying]].map(
            ([label, v]) => (
              <div key={label} className="flex items-center gap-2 text-[10px]">
                <span className="w-14 text-ink-dim">{label}</span>
                <div className="h-1 flex-1 rounded-full bg-black/10">
                  <div className="h-full rounded-full bg-neon-deep" style={{ width: `${Math.round((v ?? 0) * 100)}%` }} />
                </div>
              </div>
            )
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
