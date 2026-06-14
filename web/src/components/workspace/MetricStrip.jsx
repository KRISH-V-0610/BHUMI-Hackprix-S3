import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Flame, AlertTriangle } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'
import { useWorkspace } from '../../store/useWorkspace.js'
import { cityAverage, rankWards, heatColor, heatRGB } from '../../lib/risk.js'

const LABELS = {
  heat: 'Heat stress', flood: 'Flood risk', veg: 'Vegetation loss',
  lake: 'Lake health', urban: 'Urban growth', water: 'Waterlogging',
}

// Explore-mode headline: situational awareness for the active layer in one glance — current city
// average + change since the compare year, how many wards are severe, and the single worst ward.
export default function MetricStrip() {
  const wards = useDashboard((s) => s.wards)
  const year = useDashboard((s) => s.year)
  const activeLayer = useDashboard((s) => s.activeLayer)
  const setSelectedWard = useDashboard((s) => s.setSelectedWard)
  const compareYear = useWorkspace((s) => s.compareYear)

  const m = useMemo(() => {
    const feats = wards?.features || []
    const now = cityAverage(feats, year, activeLayer)
    const then = cityAverage(feats, compareYear, activeLayer)
    const ranked = rankWards(wards, year, activeLayer, 50)
    const severe = ranked.filter((w) => w.score >= 70).length
    return { now, delta: now - then, severe, worst: ranked[0] }
  }, [wards, year, activeLayer, compareYear])

  if (!wards) return null
  const worse = m.delta > 0
  const [r, g, b] = heatRGB(m.now)

  return (
    <div
      className="glass relative flex items-stretch gap-2 overflow-hidden p-2 pt-3.5 text-center"
      style={{ backgroundColor: '#ffffff', backgroundImage: `linear-gradient(180deg, rgba(${r},${g},${b},0.14), rgba(255,255,255,0))` }}
    >
      <span className="absolute left-2 top-1 text-[8px] font-bold uppercase tracking-wider text-ink-dim">
        City pulse
      </span>
      {/* current avg + delta */}
      <div className="min-w-0 flex-1 px-1">
        <div className="flex items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wide text-ink-dim">
          <Flame size={11} style={{ color: heatColor(m.now) }} /> {LABELS[activeLayer] || activeLayer}
        </div>
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-xl font-extrabold tabular-nums" style={{ color: heatColor(m.now) }}>
            {m.now}
          </span>
          <span
            className="flex items-center text-[11px] font-semibold"
            style={{ color: worse ? '#e0383b' : '#22a05a' }}
          >
            {worse ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(m.delta)}
          </span>
        </div>
        <div className="text-[9px] text-ink-dim">avg · since {compareYear}</div>
      </div>

      <div className="w-px bg-mist" />

      {/* severe wards */}
      <div className="min-w-0 flex-1 px-1">
        <div className="flex items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wide text-ink-dim">
          <AlertTriangle size={11} className="text-risk-high" /> Severe
        </div>
        <div className="text-xl font-extrabold tabular-nums text-risk-high">{m.severe}</div>
        <div className="text-[9px] text-ink-dim">wards ≥ 70</div>
      </div>

      <div className="w-px bg-mist" />

      {/* worst ward */}
      <button
        className="min-w-0 flex-1 px-1 transition hover:opacity-80"
        onClick={() => m.worst && setSelectedWard(m.worst.name)}
        title="Open ward detail"
      >
        <div className="text-[10px] font-medium uppercase tracking-wide text-ink-dim">Worst ward</div>
        <div className="truncate text-sm font-bold text-ink">{m.worst?.name || '—'}</div>
        <div className="text-[9px] font-semibold" style={{ color: heatColor(m.worst?.score ?? 0) }}>
          {m.worst?.score ?? '–'} / 100
        </div>
      </button>
    </div>
  )
}
