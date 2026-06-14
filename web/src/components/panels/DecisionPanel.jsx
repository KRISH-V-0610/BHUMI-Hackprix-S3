import { useMemo } from 'react'
import { Gauge, MapPin, AlertTriangle, Lightbulb } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'
import { cityAverage, rankWards, levelOf, heatColor, heatGradient } from '../../lib/risk.js'
import { layerMeta } from '../../lib/insights.js'

// The "See" summary: one glance tells the officer overall risk, the 3 worst zones, why, and
// the first thing to do. Clicking a zone flies the map there and opens its twin card.
export default function DecisionPanel() {
  const wards = useDashboard((s) => s.wards)
  const year = useDashboard((s) => s.year)
  const activeLayer = useDashboard((s) => s.activeLayer)

  const meta = layerMeta(activeLayer)
  const features = wards?.features ?? []

  const score = useMemo(() => cityAverage(features, year, activeLayer), [features, year, activeLayer])
  const top3 = useMemo(() => rankWards(wards, year, activeLayer, 3), [wards, year, activeLayer])
  const level = levelOf(score)

  const focusZone = (z) => {
    const st = useDashboard.getState()
    st.setSelectedWard(z.name)
    st.setHighlightWards(top3.map((t) => t.name))
    st.flyTo?.({ center: z.centroid, zoom: 12.2, pitch: 52, bearing: 16 })
  }

  return (
    <div className="glass flex flex-col gap-3 p-3">
      {/* Overall Risk Score */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl text-white shadow-sm"
          style={{ background: heatColor(score) }}
        >
          <span className="text-xl font-extrabold leading-none tabular-nums">{score}</span>
          <span className="text-[8px] font-semibold uppercase opacity-90">/100</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            <Gauge size={12} /> Overall {meta.label}
          </div>
          <div className="text-lg font-bold leading-tight" style={{ color: level.color }}>
            {level.label}
          </div>
          <div className="text-[10px] text-ink-dim">City average · {year} · modeled</div>
        </div>
      </div>

      {/* Top 3 Risk Zones */}
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
          <MapPin size={12} /> Top 3 risk zones
        </div>
        <div className="flex flex-col gap-1">
          {top3.map((z, i) => (
            <button
              key={z.name}
              onClick={() => focusZone(z)}
              className="flex items-center gap-2 rounded-lg bg-bg-soft px-2 py-1.5 text-left transition hover:bg-hover"
            >
              <span className="w-3 text-[10px] font-bold text-ink-dim">{i + 1}</span>
              <span className="flex-1 truncate text-xs font-medium text-ink">{z.name}</span>
              <span
                className="h-1.5 w-14 rounded-full"
                style={{ background: heatGradient(z.score) }}
              />
              <span className="w-6 text-right text-xs font-bold tabular-nums" style={{ color: heatColor(z.score) }}>
                {z.score}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main cause */}
      <div className="rounded-lg bg-amber/10 p-2 ring-1 ring-amber/20">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber">
          <AlertTriangle size={11} /> Main cause
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-ink">{meta.cause}</p>
      </div>

      {/* Recommended first action */}
      <div className="rounded-lg bg-neon/10 p-2 ring-1 ring-neon/20">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-neon-deep">
          <Lightbulb size={11} /> Recommended first action
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-ink">{meta.firstAction}</p>
      </div>
    </div>
  )
}
