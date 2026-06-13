import { useDashboard } from '../../store/useDashboard.js'
import { HEAT_CSS } from '../../lib/risk.js'

// Risk Intensity legend — the shared heat ramp (teal -> red), matching the pyramid + scorecards
// + map fills so color reads as severity everywhere (bottom-left of the map).
export default function Legend() {
  const activeLayer = useDashboard((s) => s.activeLayer)

  return (
    <div className="glass absolute bottom-3 left-3 z-10 p-3 text-xs">
      <div className="mb-2 font-semibold uppercase tracking-wide text-ink-dim">
        Risk Intensity · {activeLayer}
      </div>
      <div className="h-2 w-36 rounded-full" style={{ background: HEAT_CSS }} />
      <div className="mt-1 flex justify-between text-[10px] text-ink-dim">
        <span>Low</span>
        <span>Moderate</span>
        <span>Severe</span>
      </div>
    </div>
  )
}
