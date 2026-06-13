import { motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'
import ReportButton from './ReportButton.jsx'

// Recommended Actions — checklist that animates in from POST /ask actions[].
export default function Recommendations() {
  const actions = useDashboard((s) => s.actions)
  if (!actions?.length) return null

  return (
    <div className="glass p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-dim">
          Recommended Actions
        </span>
        <ReportButton />
      </div>
      <ul className="flex flex-col gap-1.5">
        {actions.map((a, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-start gap-2 text-sm text-ink"
          >
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-neon" />
            <span>{a}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  )
}
