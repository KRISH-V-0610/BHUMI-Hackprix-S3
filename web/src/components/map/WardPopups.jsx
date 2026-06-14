import { useEffect, useReducer } from 'react'
import { useDashboard } from '../../store/useDashboard.js'
import { heatColor, wardScore } from '../../lib/risk.js'
import { layerMeta } from '../../lib/insights.js'
import { formatINR } from '../../lib/planner.js'

const DIMS = ['flood', 'heat', 'veg', 'lake', 'urban', 'water']

// Floating metric callouts anchored to the highlighted (area-of-interest) wards. They project
// ward centroids to screen space via the live map, so they track pan/zoom/pitch. Each shows the
// active-layer score, a tiny 6-dimension heat-strip, and — if a plan is active — before→after + ₹.
export default function WardPopups() {
  const map = useDashboard((s) => s.map)
  const wards = useDashboard((s) => s.wards)
  const highlight = useDashboard((s) => s.highlightWards)
  const activeLayer = useDashboard((s) => s.activeLayer)
  const year = useDashboard((s) => s.year)
  const plan = useDashboard((s) => s.plan)
  const setSelectedWard = useDashboard((s) => s.setSelectedWard)
  const [, force] = useReducer((n) => n + 1, 0)

  // Re-project whenever the camera moves.
  useEffect(() => {
    if (!map) return
    const onMove = () => force()
    map.on('move', onMove)
    map.on('zoom', onMove)
    map.on('pitch', onMove)
    map.on('rotate', onMove)
    force()
    return () => {
      map.off('move', onMove)
      map.off('zoom', onMove)
      map.off('pitch', onMove)
      map.off('rotate', onMove)
    }
  }, [map])

  if (!map || !wards || !highlight?.length) return null
  const meta = layerMeta(activeLayer)
  const picked = plan?.picked || []

  const items = highlight
    .slice(0, 5)
    .map((name) => {
      const feat = (wards.features || []).find((f) => f.properties.name === name)
      if (!feat) return null
      const pt = map.project(feat.properties.centroid)
      const p = feat.properties
      const planRow = picked.find((q) => q.ward === name)
      return { name, x: pt.x, y: pt.y, props: p, planRow }
    })
    .filter(Boolean)

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((it) => {
        const score = wardScore(it.props, year, activeLayer)
        const sc = it.props.scores?.[year] || {}
        return (
          <div
            key={it.name}
            className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full"
            style={{ left: it.x, top: it.y - 12 }}
          >
            <button
              onClick={() => setSelectedWard(it.name)}
              className="glass block w-44 rounded-xl p-2 text-left shadow-lg ring-1 ring-black/5 transition hover:ring-neon/40"
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-xs font-bold text-ink">{it.name}</span>
                <span
                  className="rounded-md px-1.5 text-sm font-extrabold tabular-nums text-white"
                  style={{ background: heatColor(score) }}
                >
                  {score}
                </span>
              </div>
              <div className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-dim">
                {meta.label} · {year}
              </div>

              {/* mini 6-dimension heat strip */}
              <div className="mt-1.5 flex h-2 overflow-hidden rounded">
                {DIMS.map((d) => (
                  <span key={d} className="flex-1" style={{ background: heatColor(sc[d] ?? 0) }} title={`${d}: ${sc[d] ?? 0}`} />
                ))}
              </div>

              {/* plan impact (if this ward is funded) */}
              {it.planRow && (
                <div className="mt-1.5 flex items-center justify-between rounded-md bg-neon/10 px-1.5 py-0.5 text-[10px]">
                  <span className="tabular-nums text-ink-dim">
                    {it.planRow.before}
                    <span className="px-0.5 text-neon-deep">→</span>
                    <span className="font-bold" style={{ color: heatColor(it.planRow.after) }}>
                      {it.planRow.after}
                    </span>
                  </span>
                  <span className="font-semibold text-cyan">{formatINR(it.planRow.cost)}</span>
                </div>
              )}
            </button>
            {/* pointer */}
            <div className="mx-auto h-2 w-2 -translate-y-1 rotate-45 bg-panel shadow ring-1 ring-black/5" />
          </div>
        )
      })}
    </div>
  )
}
