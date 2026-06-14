import { Droplets, Sun, Waves, Leaf } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'

// The 4 decision layers (See step). Labels match the reference dashboard.
const LAYERS = [
  { id: 'flood', label: 'Flood Risk', Icon: Droplets },
  { id: 'heat', label: 'Heat Stress', Icon: Sun },
  { id: 'lake', label: 'Lake & Water', Icon: Waves },
  { id: 'veg', label: 'Green Cover', Icon: Leaf },
]

export default function LayerTabs() {
  const activeLayer = useDashboard((s) => s.activeLayer)
  const setActiveLayer = useDashboard((s) => s.setActiveLayer)

  return (
    <div className="glass flex h-10 items-center gap-0.5 px-1">
      {LAYERS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => setActiveLayer(id)}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition ${
            activeLayer === id
              ? 'bg-neon-deep text-white'
              : 'text-ink-dim hover:bg-hover hover:text-ink'
          }`}
        >
          <Icon size={15} className="shrink-0" />
          {label}
        </button>
      ))}
    </div>
  )
}
