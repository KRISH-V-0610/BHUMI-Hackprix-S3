import { useDashboard } from '../../store/useDashboard.js'

const MODES = [
  { id: '2d', label: '2D' },
  { id: '2.5d', label: '2.5D' },
  { id: '3d', label: '3D' },
]

// 2D / 2.5D / 3D switch — lives in the map's bottom-centre control dock.
export default function ViewToggle() {
  const view = useDashboard((s) => s.view)
  const setView = useDashboard((s) => s.setView)

  return (
    <div className="glass flex gap-1 p-1">
      {MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => setView(m.id)}
          className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
            view === m.id
              ? 'bg-neon-deep text-white shadow-glow'
              : 'text-ink-dim hover:text-ink'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
