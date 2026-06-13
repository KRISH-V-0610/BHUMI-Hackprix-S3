import { useDashboard } from '../../store/useDashboard.js'

// Risk Intensity legend, keyed to the active layer's color ramp (bottom-left of the map).
export default function Legend() {
  const legend = useDashboard((s) => s.activeLegend())
  const activeLayer = useDashboard((s) => s.activeLayer)
  if (!legend) return null

  return (
    <div className="glass absolute bottom-3 left-3 z-10 p-3 text-xs">
      <div className="mb-2 font-semibold uppercase tracking-wide text-ink-dim">
        Risk Intensity · {activeLayer}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-2 w-32 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${legend.map((l) => l.color).join(', ')})`,
          }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-dim">
        {legend.map((l) => (
          <span key={l.label}>{l.label}</span>
        ))}
      </div>
    </div>
  )
}
