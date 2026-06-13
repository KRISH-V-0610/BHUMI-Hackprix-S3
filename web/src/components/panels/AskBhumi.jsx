import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDashboard } from '../../store/useDashboard.js'
import { postAsk, postVoice } from '../../api/bhumi.js'
import { runChoreography } from '../../lib/choreography.js'
import { useMicRecorder } from '../../hooks/useMicRecorder.js'
import { useTts } from '../../hooks/useTts.js'
import AskCharts from './AskCharts.jsx'

// Ask Bhumi — text + mic input, live "thinking" reasoning trace, typed-on answer.
// On /ask resolve it runs the full dashboard choreography (map morph, flyTo, highlights, charts).
export default function AskBhumi() {
  const [text, setText] = useState('')
  const [typed, setTyped] = useState('')
  const lang = useDashboard((s) => s.lang)
  const asking = useDashboard((s) => s.asking)
  const answerText = useDashboard((s) => s.answerText)
  const reasoning = useDashboard((s) => s.reasoning)
  const { recording, amplitude, start, stop } = useMicRecorder()
  const { speak } = useTts()
  const typingRef = useRef(null)

  // Type-on the answer text as it arrives.
  useEffect(() => {
    clearInterval(typingRef.current)
    if (!answerText) {
      setTyped('')
      return
    }
    let i = 0
    typingRef.current = setInterval(() => {
      i += 2
      setTyped(answerText.slice(0, i))
      if (i >= answerText.length) clearInterval(typingRef.current)
    }, 18)
    return () => clearInterval(typingRef.current)
  }, [answerText])

  const fireAsk = async (q, askLang) => {
    if (!q?.trim()) return
    useDashboard.getState().setData({ asking: true })
    const res = await postAsk(q, askLang || lang)
    const flyTo = useDashboard.getState().flyTo
    await runChoreography(res, { flyTo, speak })
  }

  const onSubmit = (e) => {
    e.preventDefault()
    const q = text
    setText('')
    fireAsk(q)
  }

  const onMic = async () => {
    if (recording) {
      const blob = await stop()
      if (!blob) return
      useDashboard.getState().setData({ asking: true })
      const v = await postVoice(blob) // { text, lang }
      setText(v.text || '')
      await fireAsk(v.text, v.lang)
    } else {
      await start()
    }
  }

  return (
    <div className="glass flex h-full flex-col p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-neon">🌏 Ask Bhumi</span>
        {asking && <span className="text-[10px] text-cyan animate-pulse-glow">thinking…</span>}
      </div>

      {/* reasoning trace */}
      <AnimatePresence>
        {reasoning.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-2 rounded-lg bg-bg-soft p-2 text-[11px] text-ink-dim ring-1 ring-black/5"
          >
            {reasoning.map((r, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className="font-mono"
              >
                🧠 {r}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* answer bubble */}
      {typed && (
        <div className="mb-2 rounded-xl rounded-tl-sm bg-neon/10 p-2.5 text-sm leading-relaxed text-ink ring-1 ring-neon/20">
          {typed}
          <span className="animate-pulse-glow">▍</span>
        </div>
      )}

      {/* charts from /ask */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AskCharts />
      </div>

      {/* input row */}
      <form onSubmit={onSubmit} className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onMic}
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
            recording ? 'bg-risk-high text-white' : 'bg-neon-deep text-white hover:brightness-110'
          }`}
          title={recording ? 'Stop & ask' : 'Record a question'}
        >
          {recording ? '■' : '🎤'}
          {recording && (
            <span
              className="absolute inset-0 rounded-full ring-2 ring-risk-high"
              style={{ transform: `scale(${1 + amplitude})`, opacity: 1 - amplitude }}
            />
          )}
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about heat, floods, a ward…"
          className="flex-1 rounded-lg border border-black/10 bg-bg-soft px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-dim/60 focus:border-cyan/50"
        />
        <button
          type="submit"
          className="rounded-lg bg-cyan/20 px-3 py-2 text-sm font-semibold text-cyan transition hover:bg-cyan/30"
        >
          Ask
        </button>
      </form>
    </div>
  )
}
