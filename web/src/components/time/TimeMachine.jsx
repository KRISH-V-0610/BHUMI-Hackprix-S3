import { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'
import { TIMELINE_YEARS } from '../../lib/years.js'

// Time Machine — steps through 2016 → 2026 in 2-year stops (2018/2020/2022/2024 are interpolated
// client-side). The ▶ play auto-advances through the timeline so the wards visibly morph; deck.gl
// transitions tween the colors/heights between each stop — that sweep is the hero "time-lapse".
export default function TimeMachine() {
  const year = useDashboard((s) => s.year)
  const setYear = useDashboard((s) => s.setYear)
  const [playing, setPlaying] = useState(false)
  const timer = useRef(null)

  const idx = Math.max(0, TIMELINE_YEARS.indexOf(Number(year)))

  useEffect(() => {
    if (!playing) return
    timer.current = setInterval(() => {
      const cur = TIMELINE_YEARS.indexOf(Number(useDashboard.getState().year))
      const next = (cur + 1) % TIMELINE_YEARS.length
      setYear(TIMELINE_YEARS[next])
    }, 1300)
    return () => clearInterval(timer.current)
  }, [playing, setYear])

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-dim">Year</span>
      <span className="w-10 text-center font-serif text-base font-bold tabular-nums text-cyan">
        {Number(year)}
      </span>
      <input
        type="range"
        min={0}
        max={TIMELINE_YEARS.length - 1}
        step={1}
        value={idx}
        onChange={(e) => {
          setPlaying(false)
          setYear(TIMELINE_YEARS[Number(e.target.value)])
        }}
        className="h-1 w-28 cursor-pointer accent-cyan"
        title={`${TIMELINE_YEARS[0]} – ${TIMELINE_YEARS[TIMELINE_YEARS.length - 1]}`}
      />
      <button
        onClick={() => setPlaying((p) => !p)}
        className="flex items-center gap-1 rounded-full bg-neon-deep px-2.5 py-1 text-xs font-bold text-white shadow-glow transition hover:brightness-110"
        title="Play the time-lapse 2016 → 2026"
      >
        {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
      </button>
    </div>
  )
}
