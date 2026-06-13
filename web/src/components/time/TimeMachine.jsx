import { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'

const YEARS = [2016, 2026]

// Time Machine 2016 <-> 2026. The ▶ play auto-tweens between years so the wards visibly
// rise/green-out — that morph is the hero GIF moment (contracts.md).
export default function TimeMachine() {
  const year = useDashboard((s) => s.year)
  const setYear = useDashboard((s) => s.setYear)
  const [playing, setPlaying] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    if (!playing) return
    // Toggle the year on an interval; deck.gl transitions tween the elevations/colors.
    timer.current = setInterval(() => {
      const cur = useDashboard.getState().year
      setYear(cur === 2016 ? 2026 : 2016)
    }, 1600)
    return () => clearInterval(timer.current)
  }, [playing, setYear])

  return (
    <div className="glass flex items-center gap-3 px-4 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-dim">
        Time Machine
      </span>
      <div className="flex gap-1">
        {YEARS.map((y) => (
          <button
            key={y}
            onClick={() => {
              setPlaying(false)
              setYear(y)
            }}
            className={`rounded-lg px-3 py-1 text-sm font-semibold transition ${
              year === y ? 'bg-cyan/20 text-cyan shadow-glow' : 'text-ink-dim hover:text-ink'
            }`}
          >
            {y}
          </button>
        ))}
      </div>
      <button
        onClick={() => setPlaying((p) => !p)}
        className="flex items-center gap-1 rounded-full bg-neon-deep px-3 py-1 text-xs font-bold text-white shadow-glow transition hover:brightness-110"
        title="Auto-tween 2016 ↔ 2026"
      >
        {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        {playing ? 'Pause' : 'Play'}
      </button>
    </div>
  )
}
