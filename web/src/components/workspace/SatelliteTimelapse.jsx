import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Play, Pause, Satellite } from 'lucide-react'

// Offline-safe satellite time-lapse: real NASA MODIS frames (cached in /public/satellite) play
// across the years — the "gif" of how Hyderabad's spectral indices change. No live network needed.
const YEARS = [2016, 2018, 2020, 2022, 2024, 2026]
const INDICES = [
  { id: 'truecolor', label: 'True Color', ext: 'jpg', blurb: 'Natural-color surface — built-up vs green vs water.' },
  { id: 'ndvi', label: 'NDVI · Vegetation', ext: 'png', blurb: 'Greenness: bright = dense vegetation, pale = bare/built.' },
  { id: 'lst', label: 'Land Surface Temp', ext: 'png', blurb: 'Daytime surface heat: warmer tones = hotter ground.' },
]

export default function SatelliteTimelapse({ open, onClose }) {
  const [index, setIndex] = useState('ndvi')
  const [i, setI] = useState(0) // year index
  const [playing, setPlaying] = useState(true)
  const timer = useRef(null)

  const cfg = INDICES.find((x) => x.id === index)
  const year = YEARS[i]

  // preload all frames for the active index so playback never flickers
  useEffect(() => {
    if (!open) return
    YEARS.forEach((y) => {
      const img = new Image()
      img.src = `/satellite/${index}_${y}.${cfg.ext}`
    })
  }, [open, index, cfg.ext])

  // autoplay loop
  useEffect(() => {
    if (!open || !playing) return
    timer.current = setInterval(() => setI((p) => (p + 1) % YEARS.length), 1100)
    return () => clearInterval(timer.current)
  }, [open, playing])

  // reset on open
  useEffect(() => {
    if (open) {
      setI(0)
      setPlaying(true)
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-2xl overflow-hidden p-0"
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-mist px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-bold text-ink">
                <Satellite size={16} className="text-neon-deep" /> Satellite Time-Lapse · Hyderabad
              </span>
              <button onClick={onClose} className="text-ink-dim transition hover:text-ink">
                <X size={18} />
              </button>
            </div>

            {/* index tabs */}
            <div className="flex gap-1 px-4 pt-3">
              {INDICES.map((x) => (
                <button
                  key={x.id}
                  onClick={() => setIndex(x.id)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    index === x.id ? 'bg-neon-deep text-white shadow-sm' : 'bg-bg-soft text-ink-dim hover:bg-hover'
                  }`}
                >
                  {x.label}
                </button>
              ))}
            </div>

            {/* the frame */}
            <div className="relative m-4 overflow-hidden rounded-xl bg-black ring-1 ring-black/10">
              <AnimatePresence mode="popLayout">
                <motion.img
                  key={`${index}_${year}`}
                  src={`/satellite/${index}_${year}.${cfg.ext}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="aspect-[5/4] w-full object-cover"
                  alt={`${cfg.label} ${year}`}
                />
              </AnimatePresence>
              {/* big year stamp */}
              <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/55 px-2.5 py-1 font-serif text-2xl font-bold text-white tabular-nums">
                {year}
              </div>
              <div className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-white/70">
                NASA MODIS · cached
              </div>
            </div>

            {/* controls */}
            <div className="px-4 pb-4">
              <p className="mb-2 text-[11px] text-ink-dim">{cfg.blurb}</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neon-deep text-white transition hover:brightness-110"
                >
                  {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                </button>
                <span className="w-10 text-center font-serif text-base font-bold tabular-nums text-cyan">{year}</span>
                <input
                  type="range"
                  min={0}
                  max={YEARS.length - 1}
                  step={1}
                  value={i}
                  onChange={(e) => {
                    setPlaying(false)
                    setI(Number(e.target.value))
                  }}
                  className="h-1 flex-1 cursor-pointer accent-cyan"
                />
              </div>
              {/* year ticks */}
              <div className="mt-1 flex justify-between px-11 text-[9px] text-ink-dim">
                {YEARS.map((y) => (
                  <span key={y} className={y === year ? 'font-bold text-cyan' : ''}>{y}</span>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
