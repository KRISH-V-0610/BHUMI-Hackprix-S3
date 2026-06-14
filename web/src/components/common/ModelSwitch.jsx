import { useEffect, useRef, useState } from 'react'
import { Cpu, Check, ChevronDown } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'
import { getModels } from '../../api/bhumi.js'

// Sarvam model picker — choose which chat model drives the agent (30B fast / 105B deeper).
// Opens UPWARD (used inside the bottom Ask bar). Compact pill styled to match the input.
export default function ModelSwitch() {
  const model = useDashboard((s) => s.model)
  const setModel = useDashboard((s) => s.setModel)
  const [models, setModels] = useState([
    { id: 'sarvam-30b', label: 'Sarvam 30B', desc: 'Fast · tool-calling' },
    { id: 'sarvam-105b', label: 'Sarvam 105B', desc: 'Deeper reasoning' },
  ])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    getModels().then((d) => d?.models?.length && setModels(d.models)).catch(() => {})
  }, [])

  useEffect(() => {
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const active = models.find((m) => m.id === model) || models[0]

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full bg-bg-soft px-2.5 py-1.5 text-[11px] font-semibold text-ink-dim transition hover:bg-hover hover:text-ink"
        title="Sarvam model"
      >
        <Cpu size={13} className="text-neon-deep" />
        <span className="hidden whitespace-nowrap sm:inline">{active?.label || model}</span>
        <ChevronDown size={11} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-52 rounded-xl bg-panel p-1 shadow-lg ring-1 ring-black/10">
          <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-ink-dim">
            Sarvam model
          </div>
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setModel(m.id)
                setOpen(false)
              }}
              className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-hover ${
                m.id === model ? 'bg-neon/10' : ''
              }`}
            >
              <Cpu size={14} className="mt-0.5 shrink-0 text-neon-deep" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-ink">{m.label}</span>
                {m.desc && <span className="block text-[10px] text-ink-dim">{m.desc}</span>}
              </span>
              {m.id === model && <Check size={14} className="mt-0.5 shrink-0 text-neon-deep" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
