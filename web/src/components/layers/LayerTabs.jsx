import { useDashboard } from '../../store/useDashboard.js'

// Canonical layer ids + labels (contracts.md). The selected id = activeLayer.
const LAYERS = [
  { id: 'flood', label: 'Flood' },
  { id: 'heat', label: 'Heat' },
  { id: 'veg', label: 'Vegetation' },
  { id: 'lake', label: 'Lake' },
  { id: 'urban', label: 'Urban' },
  { id: 'water', label: 'Waterlog' },
]

// Top layer tab bar.
export default function LayerTabs() {
  const activeLayer = useDashboard((s) => s.activeLayer)
  const setActiveLayer = useDashboard((s) => s.setActiveLayer)

  return (
    <div className="glass flex gap-1 p-1">
      {LAYERS.map((l) => (
        <button
          key={l.id}
          onClick={() => setActiveLayer(l.id)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            activeLayer === l.id
              ? 'bg-neon-deep text-white shadow-glow'
              : 'text-ink-dim hover:bg-hover hover:text-ink'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
