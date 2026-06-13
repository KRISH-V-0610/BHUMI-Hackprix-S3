import { useDashboard } from '../../store/useDashboard.js'

// Left "Layer Viewer" — lists the raster layers available for the current year and lets you
// jump to one. (Raster tileUrl overlay toggling can be added once GEE tiles are live; for now
// this drives activeLayer + shows whether a real tile exists.)
export default function LayerViewer() {
  const layers = useDashboard((s) => s.layers)
  const year = useDashboard((s) => s.year)
  const activeLayer = useDashboard((s) => s.activeLayer)
  const setActiveLayer = useDashboard((s) => s.setActiveLayer)

  const forYear = layers.filter((l) => Number(l.year) === Number(year))

  return (
    <div className="glass flex flex-col gap-1 p-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">
        Layer Viewer · {year}
      </div>
      {forYear.length === 0 && <div className="text-xs text-ink-dim">No layers loaded.</div>}
      {forYear.map((l) => (
        <button
          key={l.id}
          onClick={() => setActiveLayer(l.id)}
          className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition ${
            activeLayer === l.id ? 'bg-hover text-ink' : 'text-ink-dim hover:bg-hover'
          }`}
        >
          <span>{l.label}</span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${l.tileUrl ? 'bg-neon' : 'bg-ink-dim/40'}`}
            title={l.tileUrl ? 'live satellite tile' : 'precomputed / synthetic'}
          />
        </button>
      ))}
    </div>
  )
}
