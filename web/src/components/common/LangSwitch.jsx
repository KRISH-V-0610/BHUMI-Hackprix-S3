import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Languages, Check } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'

// All major Indian languages Sarvam AI supports (STT + chat + TTS). Passed as `lang` to
// /ask, /voice, /tts. Compact dropdown so it scales to 11 languages in the header.
export const LANGS = [
  { id: 'en-IN', short: 'EN', name: 'English' },
  { id: 'hi-IN', short: 'हि', name: 'हिन्दी · Hindi' },
  { id: 'bn-IN', short: 'বা', name: 'বাংলা · Bengali' },
  { id: 'ta-IN', short: 'த', name: 'தமிழ் · Tamil' },
  { id: 'te-IN', short: 'తె', name: 'తెలుగు · Telugu' },
  { id: 'mr-IN', short: 'म', name: 'मराठी · Marathi' },
  { id: 'gu-IN', short: 'ગુ', name: 'ગુજરાતી · Gujarati' },
  { id: 'kn-IN', short: 'ಕ', name: 'ಕನ್ನಡ · Kannada' },
  { id: 'ml-IN', short: 'മ', name: 'മലയാളം · Malayalam' },
  { id: 'pa-IN', short: 'ਪੰ', name: 'ਪੰਜਾਬੀ · Punjabi' },
  { id: 'od-IN', short: 'ଓ', name: 'ଓଡ଼ିଆ · Odia' },
]

export default function LangSwitch({ openUp = false, variant = 'bar' }) {
  const lang = useDashboard((s) => s.lang)
  const setLang = useDashboard((s) => s.setLang)
  const [open, setOpen] = useState(false)
  const current = LANGS.find((l) => l.id === lang) || LANGS[0]

  const btnClass =
    variant === 'chat'
      ? 'flex items-center gap-1 rounded-full bg-bg-soft px-2.5 py-1.5 text-[11px] font-semibold text-ink-dim transition hover:bg-hover hover:text-ink'
      : 'glass flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold text-ink-dim transition hover:text-ink'

  const menuClass = openUp
    ? 'glass absolute bottom-full right-0 z-40 mb-2 max-h-72 w-44 overflow-y-auto p-1'
    : 'glass absolute right-0 z-40 mt-1 max-h-72 w-44 overflow-y-auto p-1'

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} title="Language" className={btnClass}>
        <Languages size={14} />
        <span className="text-cyan">{current.short}</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: openUp ? 6 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: openUp ? 6 : -6 }}
              className={menuClass}
            >
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    setLang(l.id)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                    lang === l.id ? 'bg-cyan/15 text-cyan' : 'text-ink hover:bg-hover'
                  }`}
                >
                  <span>
                    <span className="mr-1.5 font-bold">{l.short}</span>
                    {l.name}
                  </span>
                  {lang === l.id && <Check size={13} className="shrink-0" />}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
