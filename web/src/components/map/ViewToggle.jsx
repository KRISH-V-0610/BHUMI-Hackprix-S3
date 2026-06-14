import { useEffect } from 'react'
import { Box } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'

// View is locked to 2.5D (the digital-twin mode). 2D / 3D were removed — this is now a
// static mode badge that also guarantees the store view stays '2.5d'.
export default function ViewToggle() {
  const view = useDashboard((s) => s.view)
  const setView = useDashboard((s) => s.setView)

  useEffect(() => {
    if (view !== '2.5d') setView('2.5d')
  }, [view, setView])

  return (
    <div className="glass flex h-9 items-center px-1">
      <span className="flex items-center gap-1.5 rounded-lg bg-neon-deep px-3 py-1 text-xs font-semibold text-white shadow-glow">
        <Box size={13} /> 2.5D
      </span>
    </div>
  )
}
