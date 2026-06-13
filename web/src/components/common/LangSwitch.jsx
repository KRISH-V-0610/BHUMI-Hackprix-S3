import { useDashboard } from '../../store/useDashboard.js'

// Language switch — passed as `lang` to /ask, /voice, /tts (contracts.md supported langs).
const LANGS = [
  { id: 'en-IN', label: 'EN' },
  { id: 'hi-IN', label: 'हि' },
  { id: 'te-IN', label: 'తె' },
  { id: 'gu-IN', label: 'ગુ' },
]

export default function LangSwitch() {
  const lang = useDashboard((s) => s.lang)
  const setLang = useDashboard((s) => s.setLang)

  return (
    <div className="glass flex gap-0.5 p-1">
      {LANGS.map((l) => (
        <button
          key={l.id}
          onClick={() => setLang(l.id)}
          className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
            lang === l.id ? 'bg-cyan/20 text-cyan' : 'text-ink-dim hover:text-ink'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
