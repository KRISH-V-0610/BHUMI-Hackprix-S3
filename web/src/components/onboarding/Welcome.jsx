import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, MessageSquare, Target, FileCheck, Play, Sparkles, Mic, X, Compass } from 'lucide-react'
import Logo from '../common/Logo.jsx'
import { useStory } from '../../store/useStory.js'

// The 4-beat product arc, explained in one line each — this is what a first-time visitor needs
// to understand before any button makes sense.
const ARC = [
  { Icon: Eye,        title: 'See',     body: 'A live 3D map of Hyderabad’s climate risk — flood, heat, lakes, green cover — from 2016 to today.' },
  { Icon: MessageSquare, title: 'Ask',  body: 'Ask anything in your language, by voice or text. Bhumi reasons over the data and answers back.' },
  { Icon: Target,     title: 'Plan',    body: '“Where should ₹10 crore go?” — it funds the wards where each rupee cuts the most risk.' },
  { Icon: FileCheck,  title: 'Justify', body: 'Every answer is cited, and the plan exports as a council-ready PDF report.' },
]

// First-run welcome: explains the arc, then offers a guided tour, a seeded first question, or
// free exploration. Shows once (localStorage), with a persistent re-open via the navbar tour button.
export default function Welcome() {
  // Greets on every load/refresh — quick to dismiss with either choice.
  const [open, setOpen] = useState(true)
  const startStory = useStory((s) => s.start)

  const dismiss = () => setOpen(false)
  const takeTour = () => { dismiss(); startStory() }
  const trySeed = () => {
    dismiss()
    window.dispatchEvent(new CustomEvent('bhumi:ask', { detail: 'Why is Malakpet flood-prone?' }))
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-70 flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-[#06120d]/45 backdrop-blur-sm" onClick={dismiss} />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', damping: 22, stiffness: 240 }}
            className="glass relative z-10 w-full max-w-xl overflow-hidden p-6"
          >
            <button onClick={dismiss} className="absolute right-4 top-4 text-ink-dim transition hover:text-ink">
              <X size={18} />
            </button>

            {/* header */}
            <div className="flex items-center gap-3">
              <Logo size={46} className="drop-shadow-sm" />
              <div>
                <h1 className="font-serif text-3xl font-bold leading-none text-neon-deep">
                  Welcome to Bhumi
                </h1>
                <p className="mt-1 text-[13px] text-ink-dim">
                  Hyderabad’s climate co-pilot — <span className="font-semibold text-cyan">talk to the city.</span>
                </p>
              </div>
            </div>

            {/* the arc */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {ARC.map(({ Icon, title, body }, i) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.07 }}
                  className="rounded-xl border border-mist bg-bg-soft p-3"
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-neon-deep text-white">
                      <Icon size={13} />
                    </span>
                    <span className="text-[13px] font-bold text-ink">{title}</span>
                  </div>
                  <p className="text-[11px] leading-snug text-ink-dim">{body}</p>
                </motion.div>
              ))}
            </div>

            {/* CTAs — two clear choices to start: guided tour, or explore freely */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                onClick={takeTour}
                className="flex flex-col items-center gap-1 rounded-xl bg-neon-deep px-4 py-3 text-white shadow-glow transition hover:brightness-110"
              >
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  <Play size={15} fill="currentColor" /> Guided Tour
                </span>
                <span className="text-[10px] font-medium text-white/70">90-second walkthrough</span>
              </button>
              <button
                onClick={dismiss}
                className="flex flex-col items-center gap-1 rounded-xl border border-mist bg-bg-soft px-4 py-3 text-ink transition hover:bg-hover"
              >
                <span className="flex items-center gap-1.5 text-sm font-bold text-neon-deep">
                  <Compass size={15} /> Explore on my own
                </span>
                <span className="text-[10px] font-medium text-ink-dim">Jump straight in</span>
              </button>
            </div>

            {/* tiny secondary: seed a sample question */}
            <button
              onClick={trySeed}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-medium text-cyan transition hover:bg-cyan/10"
            >
              <Sparkles size={13} /> …or try a question: “Why is Malakpet flood-prone?”
            </button>

            {/* trust line */}
            <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-ink-dim">
              <Mic size={11} className="text-cyan" />
              <span>Voice + text in English · हिंदी · తెలుగు · اردو</span>
              <span>·</span>
              <span>Powered by <span className="font-semibold text-cyan">Sarvam AI</span> + <span className="font-semibold text-neon-deep">Google Earth Engine</span></span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
