import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sprout, ChevronRight, X } from 'lucide-react'
import { useStory } from '../../store/useStory.js'
import { runStory } from '../../lib/storyScript.js'
import Logo from '../common/Logo.jsx'

// Story Mode chrome: a full-screen title card (between beats), a bottom caption bar with progress
// dots, and Next / Exit controls. The actual dimming/spotlight of panels lives in App.jsx via the
// per-region `storyCls()` classes — here we only render the cinematic overlay + controls.
export default function StoryMode() {
  const active = useStory((s) => s.active)
  const step = useStory((s) => s.step)
  const total = useStory((s) => s.total)
  const caption = useStory((s) => s.caption)
  const title = useStory((s) => s.title)
  const next = useStory((s) => s.next)
  const exit = useStory((s) => s.exit)
  const ranFor = useRef(false)

  // Kick off the beat runner once when Story Mode turns on.
  useEffect(() => {
    if (active && !ranFor.current) {
      ranFor.current = true
      runStory()
    }
    if (!active) ranFor.current = false
  }, [active])

  // Esc to exit, → / Space to advance.
  useEffect(() => {
    if (!active) return
    const onKey = (e) => {
      if (e.key === 'Escape') exit()
      else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, next, exit])

  if (!active) return null

  return (
    <>
      {/* Cinematic vignette so the spotlighted panel reads as the focus. */}
      <div
        className="pointer-events-none fixed inset-0 z-30"
        style={{ background: 'radial-gradient(120% 90% at 50% 45%, transparent 40%, rgba(4,12,8,0.55) 100%)' }}
      />

      {/* Full-screen title card (shown on intro / outro beats). */}
      <AnimatePresence>
        {title && (
          <motion.div
            key={title.head + title.sub}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="fixed inset-0 z-[55] flex flex-col items-center justify-center text-center"
            style={{ background: 'radial-gradient(60% 60% at 50% 45%, rgba(6,18,13,0.86), rgba(4,12,8,0.97))' }}
          >
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.7 }}
            >
              <Logo size={64} className="mx-auto mb-4 drop-shadow-lg" />
              <h1 className="font-serif text-6xl font-semibold tracking-tight text-white">{title.head}</h1>
              <p className="mt-3 font-serif text-xl italic text-neon/90">{title.sub}</p>
              <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-white/55">
                <span>Powered by</span>
                <span className="font-semibold text-white/80">Sarvam AI</span>
                <span>·</span>
                <span className="font-semibold text-white/80">Google Earth Engine</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom control bar: caption + progress + Next / Exit. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4">
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="glass pointer-events-auto flex items-center gap-4 rounded-full px-4 py-2.5 shadow-2xl ring-1 ring-neon/20"
        >
          <span className="flex items-center gap-1.5 text-xs font-bold text-neon">
            <Sprout size={14} /> Story
          </span>

          <AnimatePresence mode="wait">
            <motion.span
              key={caption || title?.sub}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="max-w-[46ch] text-sm text-ink"
            >
              {caption || (title ? title.sub : '')}
            </motion.span>
          </AnimatePresence>

          {/* progress dots */}
          <span className="flex items-center gap-1">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-4 bg-neon' : i < step ? 'w-1.5 bg-neon/50' : 'w-1.5 bg-mist'
                }`}
              />
            ))}
          </span>

          <button
            onClick={next}
            title="Next (→)"
            className="flex items-center gap-1 rounded-full bg-neon-deep px-3 py-1 text-xs font-semibold text-white transition hover:brightness-110"
          >
            Next <ChevronRight size={14} />
          </button>
          <button
            onClick={exit}
            title="Exit (Esc)"
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-dim transition hover:bg-hover hover:text-ink"
          >
            <X size={15} />
          </button>
        </motion.div>
      </div>
    </>
  )
}
