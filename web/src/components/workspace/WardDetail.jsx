import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MapPin, TreePine, Building2, Waves, Droplets, RotateCcw, Sparkles, TrendingDown, ArrowRight, Tag } from 'lucide-react'
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

function radarPoints(values, cx, cy, r) {
  return values
    .map((v, i) => {
      const a = (Math.PI * 2 * i) / values.length - Math.PI / 2
      const rad = (Math.max(0, Math.min(100, v)) / 100) * r
      return `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`
    })
    .join(' ')
}

// Ward digital twin — a centered, self-contained panel: 6-dim snapshot + radar + an interactive
// WHAT-IF (intervention + intensity → headline impact, animated before→after bars, cost).
export default function WardDetail() {
  const wards = useDashboard((s) => s.wards)
  const year = useDashboard((s) => s.year)
  const activeLayer = useDashboard((s) => s.activeLayer)
  const selectedWard = useDashboard((s) => s.selectedWard)
  const setSelectedWard = useDashboard((s) => s.setSelectedWard)
  const [whatif, setWhatif] = useState(null)
  const [mag, setMag] = useState(15)
  const [showLabels, setShowLabels] = useState(true)

  useEffect(() => setWhatif(null), [selectedWard])

  const feat = useMemo(
    () => (wards?.features || []).find((f) => f.properties.name === selectedWard),
    [wards, selectedWard]
  )
  if (!feat) return null

  const p = feat.properties
  const sc = p.scores?.[year] || {}
  const sim = whatif ? simulateWard(sc, whatif, mag) : null
  const drivers = p.drivers || {}

  const current = DIMS.map((d) => sc[d.id] ?? 0)
  const projected = DIMS.map((d) => sim?.changes?.[d.id]?.after ?? sc[d.id] ?? 0)

  // primary (biggest-impact) layer for the headline
  const primary = sim
    ? Object.entries(sim.changes).reduce((a, e) => (Math.abs(e[1].delta) > Math.abs(a[1].delta) ? e : a))
    : null
  const primaryPct = primary && primary[1].before ? Math.round((Math.abs(primary[1].delta) / primary[1].before) * 100) : 0

  const trend = TIMELINE_YEARS.map((y) => p.scores?.[y]?.[activeLayer] ?? null).filter((v) => v != null)
  const tMin = Math.min(...trend, 0)
  const tMax = Math.max(...trend, 100)
  const spark = trend
    .map((v, i) => `${(i / (trend.length - 1)) * 100},${30 - ((v - tMin) / (tMax - tMin || 1)) * 28}`)
    .join(' ')

  const [rr, gg, bb] = heatRGB(current[0])
  const close = () => setSelectedWard(null)

  return (
    <AnimatePresence>
      <motion.div
        key={selectedWard}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[55] flex items-center justify-center p-4"
      >
        <div className="absolute inset-0 bg-[#06120d]/30" onClick={close} />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="glass relative z-10 flex max-h-[86vh] w-80 flex-col overflow-y-auto p-4"
        >
          {/* header */}
          <div className="mb-3 flex items-start justify-between">
            <div>
              <span className="rounded-full bg-neon/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-neon-deep">
                Ward · digital twin
              </span>
              <div className="mt-1 flex items-center gap-1 text-base font-bold text-ink">
                <MapPin size={15} className="text-neon-deep" /> {p.name}
              </div>
              <div className="text-[10px] text-ink-dim">Ward {p.ward_no} · {year}</div>
            </div>
            <button onClick={close} className="text-ink-dim transition hover:text-ink">
              <X size={16} />
            </button>
          </div>

          {/* 6-dim snapshot strip */}
          <div className="mb-3 grid grid-cols-6 gap-1">
            {DIMS.map((d) => (
              <div key={d.id} className="text-center">
                <div className="mx-auto flex h-7 w-full items-center justify-center rounded-md text-[11px] font-bold text-white"
                  style={{ background: heatColor(sc[d.id] ?? 0) }}>
                  {sc[d.id] ?? 0}
                </div>
                <div className="mt-0.5 text-[8px] text-ink-dim">{d.label}</div>
              </div>
            ))}
          </div>

          {/* radar: current (filled) + projection (dashed) */}
          <svg viewBox="0 0 140 120" className="mx-auto block h-28 w-full">
            {[0.33, 0.66, 1].map((g) => (
              <polygon key={g} points={radarPoints([100, 100, 100, 100, 100, 100], 70, 58, 44 * g)}
                fill="none" stroke="rgba(0,0,0,0.07)" />
            ))}
            <polygon points={radarPoints(current, 70, 58, 44)}
              fill={`rgba(${rr},${gg},${bb},0.28)`} stroke={`rgb(${rr},${gg},${bb})`} strokeWidth="1.5" />
            {sim && (
              <polygon points={radarPoints(projected, 70, 58, 44)}
                fill="rgba(43,191,143,0.14)" stroke="#16a34a" strokeWidth="1.5" strokeDasharray="3 2" />
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

          {/* ── WHAT-IF SCENARIO ── */}
          <div className="mt-1 rounded-xl bg-bg-soft p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-ink-dim">
                <Sparkles size={11} className="text-cyan" /> What-if scenario
              </span>
              {whatif && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowLabels((v) => !v)}
                    title="Toggle bar labels"
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold transition ${showLabels ? 'bg-neon/15 text-neon-deep' : 'bg-panel text-ink-dim hover:bg-hover'}`}
                  >
                    <Tag size={9} /> Labels
                  </button>
                  <button
                    onClick={() => { setWhatif(null); setMag(15) }}
                    title="Reset bars to original state"
                    className="flex items-center gap-1 rounded-full bg-amber/15 px-2 py-0.5 text-[9px] font-bold text-amber transition hover:bg-amber/25"
                  >
                    <RotateCcw size={9} /> Reset
                  </button>
                </div>
              )}
            </div>

            {/* intervention picker */}
            <div className="grid grid-cols-4 gap-1.5">
              {WHATIF.map((w) => {
                const Icon = w.icon
                const on = whatif === w.id
                return (
                  <button
                    key={w.id}
                    onClick={() => setWhatif(on ? null : w.id)}
                    title={INTERVENTIONS[w.id]?.label}
                    className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[9px] font-semibold transition ${
                      on ? 'bg-neon-deep text-white shadow-glow' : 'bg-panel text-ink-dim hover:bg-hover'
                    }`}
                  >
                    <Icon size={15} />
                    {w.label}
                  </button>
                )
              })}
            </div>

            {!whatif && (
              <p className="mt-2 text-center text-[10px] text-ink-dim">
                Pick an intervention to simulate its impact on {p.name}.
              </p>
            )}

            {whatif && (
              <>
                {/* intensity */}
                <div className="mt-3 mb-1 flex items-center justify-between text-[10px]">
                  <span className="font-semibold uppercase tracking-wide text-ink-dim">Intensity</span>
                  <span className="font-bold tabular-nums text-cyan">{mag}%</span>
                </div>
                <input
                  type="range" min={5} max={40} step={5} value={mag}
                  onChange={(e) => setMag(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer accent-neon-deep"
                />
              </>
            )}

            {sim && primary && (
              <motion.div key={whatif + mag} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3">
                {/* HEADLINE impact */}
                <div className="flex items-stretch gap-2">
                  <div className="flex flex-1 flex-col justify-center rounded-xl bg-neon/10 px-3 py-2 ring-1 ring-neon/20">
                    <div className="flex items-center gap-1.5">
                      <TrendingDown size={18} className="text-neon-deep" />
                      <span className="text-2xl font-extrabold tabular-nums text-neon-deep">−{primaryPct}%</span>
                    </div>
                    <div className="text-[10px] font-medium capitalize text-ink-dim">
                      {primary[0]} risk · {primary[1].before}
                      <ArrowRight size={9} className="mx-0.5 inline -translate-y-px" />
                      <span className="font-bold" style={{ color: heatColor(primary[1].after) }}>{primary[1].after}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-xl bg-amber/10 px-3 ring-1 ring-amber/20">
                    <span className="text-sm font-extrabold text-amber">{formatINR((INTERVENTIONS[whatif]?.cost || 0) * (mag / 15))}</span>
                    <span className="text-[8px] uppercase tracking-wide text-ink-dim">est. cost</span>
                  </div>
                </div>

                {/* per-dimension before→after bars */}
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-dim">Impact by dimension</span>
                    <span className="text-[9px] text-ink-dim">before → after</span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(sim.changes).map(([layer, c]) => {
                      const pct = c.before ? Math.round((Math.abs(c.delta) / c.before) * 100) : 0
                      return (
                        <div key={layer}>
                          {/* row label */}
                          <div className="mb-0.5 flex items-center justify-between text-[10px]">
                            <span className="font-semibold capitalize text-ink">{layer}</span>
                            <span className="tabular-nums text-ink-dim">
                              {c.before}
                              <ArrowRight size={9} className="mx-0.5 inline -translate-y-px text-neon-deep" />
                              <span className="font-bold" style={{ color: heatColor(c.after) }}>{c.after}</span>
                              <span className="ml-1 rounded bg-neon/15 px-1 text-[9px] font-semibold text-neon-deep">−{pct}%</span>
                            </span>
                          </div>
                          {/* bar track — tall enough for inline labels */}
                          <div className="relative h-5 overflow-hidden rounded-full bg-black/10">
                            {/* ghost before */}
                            <div
                              className="absolute inset-y-0 left-0 rounded-full opacity-20"
                              style={{ width: `${c.before}%`, background: heatColor(c.before) }}
                            />
                            {/* animated after fill */}
                            <motion.div
                              className="absolute inset-y-0 left-0 rounded-full"
                              initial={{ width: `${c.before}%` }}
                              animate={{ width: `${c.after}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut' }}
                              style={{ background: heatColor(c.after) }}
                            />
                            {/* inline labels (toggleable) */}
                            {showLabels && (
                              <>
                                <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[9px] font-semibold capitalize text-white/80">
                                  {layer}
                                </span>
                                <motion.span
                                  className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[9px] font-bold tabular-nums text-white/90"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ delay: 0.5 }}
                                >
                                  {c.after}
                                </motion.span>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-1.5 text-[9px] text-ink-dim">First-order estimate · {mag}% intensity</div>
                </div>

                {/* ── Reset bars ── */}
                <button
                  onClick={() => { setWhatif(null); setMag(15) }}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-mist bg-panel py-2.5 text-[11px] font-semibold text-ink-dim shadow-sm transition hover:bg-hover hover:text-ink active:scale-95"
                >
                  <RotateCcw size={13} />
                  Reset bars
                </button>
              </motion.div>
            )}
          </div>

          {/* active-layer trend + drivers */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="mb-0.5 text-[9px] uppercase tracking-wide text-ink-dim">
                {activeLayer} trend
              </div>
              <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full">
                <polyline points={spark} fill="none" stroke={heatColor(sc[activeLayer] ?? 0)} strokeWidth="2.5" />
              </svg>
              <div className="text-[8px] text-ink-dim">{TIMELINE_YEARS[0]}–{TIMELINE_YEARS[TIMELINE_YEARS.length - 1]}</div>
            </div>
            <div className="space-y-1">
              {[['Built-up', drivers.density], ['Green', drivers.green], ['Low-lying', drivers.low_lying]].map(
                ([label, v]) => (
                  <div key={label} className="text-[9px]">
                    <div className="flex justify-between text-ink-dim"><span>{label}</span><span>{Math.round((v ?? 0) * 100)}%</span></div>
                    <div className="h-1 rounded-full bg-black/10">
                      <div className="h-full rounded-full bg-neon-deep" style={{ width: `${Math.round((v ?? 0) * 100)}%` }} />
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
