import { motion } from 'framer-motion'
import { Compass, GitCompareArrows, Target } from 'lucide-react'
import { useWorkspace } from '../../store/useWorkspace.js'

// The primary navigation: Explore / Change / Plan. Each mode reconfigures the left rail + map.
const MODES = [
  { id: 'explore', label: 'Explore', icon: Compass, hint: "What's the state?" },
  { id: 'change', label: 'Change', icon: GitCompareArrows, hint: 'What changed where?' },
  { id: 'plan', label: 'Plan', icon: Target, hint: 'What do I do?' },
]

export default function ModeSwitch() {
  const mode = useWorkspace((s) => s.mode)
  const setMode = useWorkspace((s) => s.setMode)

  return (
    <div className="glass flex items-center gap-1 rounded-2xl p-1">
      {MODES.map((m) => {
        const Icon = m.icon
        const active = mode === m.id
        return (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            title={m.hint}
            className={`relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              active ? 'text-white' : 'text-ink-dim hover:text-ink'
            }`}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 rounded-xl bg-neon-deep"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <Icon size={14} className="relative z-10" />
            <span className="relative z-10">{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}
