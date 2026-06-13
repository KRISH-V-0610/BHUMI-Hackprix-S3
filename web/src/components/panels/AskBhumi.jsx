import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sprout, BrainCircuit, Mic, Square, Trash2, Volume2, Loader2 } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'
import { postAsk, postVoice } from '../../api/bhumi.js'
import { runChoreography } from '../../lib/choreography.js'
import { useMicRecorder } from '../../hooks/useMicRecorder.js'
import { useTts } from '../../hooks/useTts.js'
import Markdown, { stripMd } from '../common/Markdown.jsx'
import AskCharts from './AskCharts.jsx'

// Animated "thinking…" dots shown before the answer streams in.
function ThinkingDots() {
  return (
    <span className="inline-flex gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-cyan"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </span>
  )
}

// One user turn — right-aligned sage bubble.
function UserBubble({ text }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-neon-deep px-3 py-2 text-sm text-white shadow-sm">
        {text}
      </div>
    </div>
  )
}

// One assistant turn — reasoning trace + typed-on markdown answer + charts + a speaker button.
function AssistantBubble({ message, isLast, onSpeak, ttsState }) {
  const { text, reasoning, charts, status } = message
  const [typed, setTyped] = useState(isLast ? '' : text)
  const plain = stripMd(text)
  const typingDone = typed.length >= plain.length

  // Type the answer on (only for the newest bubble; older ones render fully).
  useEffect(() => {
    if (!isLast) {
      setTyped(text)
      return
    }
    if (!plain) {
      setTyped('')
      return
    }
    let i = 0
    const t = setInterval(() => {
      i += 2
      setTyped(plain.slice(0, i))
      if (i >= plain.length) clearInterval(t)
    }, 16)
    return () => clearInterval(t)
  }, [text, isLast]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-2">
      {/* reasoning trace */}
      <AnimatePresence>
        {reasoning?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="rounded-lg bg-bg-soft p-2 text-[11px] text-ink-dim ring-1 ring-black/5"
          >
            {reasoning.map((r, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-1.5 font-mono leading-relaxed"
              >
                <BrainCircuit size={12} className="mt-0.5 shrink-0 text-cyan" /> <span>{r}</span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* answer bubble */}
      <div className="flex flex-col items-start gap-1">
        <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-neon/10 px-3 py-2.5 text-sm leading-relaxed text-ink ring-1 ring-neon/20">
          {status === 'thinking' && !text ? (
            <ThinkingDots />
          ) : typingDone ? (
            <Markdown text={text} />
          ) : (
            <span className="whitespace-pre-wrap">
              {typed}
              <span className="ml-0.5 inline-block h-3.5 w-0.5 -translate-y-px animate-pulse-glow bg-neon align-middle" />
            </span>
          )}
        </div>

        {/* speaker button — TTS plays only when the user clicks it */}
        {text && status !== 'thinking' && (
          <button
            onClick={onSpeak}
            title={ttsState === 'playing' ? 'Stop' : 'Listen'}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition ${
              ttsState === 'idle'
                ? 'text-ink-dim hover:bg-hover hover:text-ink'
                : 'bg-neon/15 text-neon-deep'
            }`}
          >
            {ttsState === 'loading' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Volume2 size={13} className={ttsState === 'playing' ? 'animate-pulse-glow' : ''} />
            )}
            {ttsState === 'playing' ? 'Playing…' : ttsState === 'loading' ? 'Loading…' : 'Listen'}
          </button>
        )}
      </div>

      {/* charts attached to this answer */}
      {charts?.length > 0 && <AskCharts charts={charts} />}
    </div>
  )
}

// Ask Bhumi — a persistent chat thread. Text + mic input; each answer streams in with its
// reasoning trace, markdown body, and charts, and drives the full dashboard choreography.
export default function AskBhumi() {
  const [text, setText] = useState('')
  const lang = useDashboard((s) => s.lang)
  const asking = useDashboard((s) => s.asking)
  const messages = useDashboard((s) => s.messages)
  const addMessage = useDashboard((s) => s.addMessage)
  const clearChat = useDashboard((s) => s.clearChat)
  const { recording, amplitude, start, stop } = useMicRecorder()
  const { speak, stop: stopTts } = useTts()
  const scrollRef = useRef(null)
  // id of the message whose audio is currently loading/playing (null = nothing playing)
  const [ttsMsgId, setTtsMsgId] = useState(null)
  const [ttsPhase, setTtsPhase] = useState('idle') // 'idle' | 'loading' | 'playing'

  // Keep the thread pinned to the latest message as it streams in.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Speak (or stop) one answer on demand — TTS is never auto-played.
  const handleSpeak = async (m) => {
    if (ttsMsgId === m.id) {
      // toggle off the message that's currently playing
      stopTts()
      setTtsMsgId(null)
      setTtsPhase('idle')
      return
    }
    stopTts()
    setTtsMsgId(m.id)
    setTtsPhase('loading')
    // strip markdown so TTS doesn't read "asterisk asterisk"
    await speak(stripMd(m.text), m.lang || lang, {
      onEnd: () => {
        setTtsMsgId(null)
        setTtsPhase('idle')
      },
    })
    // if we get here without onEnd having fired, audio is now playing
    setTtsPhase((p) => (p === 'loading' ? 'playing' : p))
  }

  const fireAsk = async (q, askLang) => {
    if (!q?.trim()) return
    addMessage({ role: 'user', text: q.trim() })
    const id = addMessage({ role: 'assistant', status: 'thinking' })
    useDashboard.getState().setData({ asking: true })
    try {
      const res = await postAsk(q, askLang || lang)
      const flyTo = useDashboard.getState().flyTo
      await runChoreography(res, { flyTo, messageId: id })
    } catch {
      useDashboard.getState().updateMessage(id, {
        status: 'done',
        text: 'Something went wrong reaching the climate engine. Please try again.',
      })
      useDashboard.getState().setData({ asking: false })
    }
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
      try {
        const v = await postVoice(blob) // { text, lang }
        if (!v?.text?.trim()) {
          addMessage({
            role: 'assistant',
            status: 'done',
            text: "I couldn't catch that — please try again.",
          })
          useDashboard.getState().setData({ asking: false })
          return
        }
        await fireAsk(v.text, v.lang)
      } catch {
        addMessage({
          role: 'assistant',
          status: 'done',
          text: 'Voice transcription failed. Please try again.',
        })
        useDashboard.getState().setData({ asking: false })
      }
    } else {
      await start()
    }
  }

  return (
    <div className="glass flex h-full flex-col p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold text-neon">
          <Sprout size={16} /> Ask Bhumi
        </span>
        <div className="flex items-center gap-2">
          {asking && <span className="text-[10px] text-cyan animate-pulse-glow">thinking…</span>}
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              title="Clear conversation"
              className="text-ink-dim transition hover:text-ink"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* chat thread */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center text-ink-dim">
            <Sprout size={28} className="mb-2 text-eucalyptus" />
            <p className="text-sm font-medium text-ink">Ask Bhumi about Hyderabad's climate</p>
            <p className="mt-1 text-xs">
              Try “Which wards have the worst heat?” or “What if we add 20% tree cover to Charminar?”
            </p>
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === 'user' ? (
              <UserBubble key={m.id} text={m.text} />
            ) : (
              <AssistantBubble
                key={m.id}
                message={m}
                isLast={i === messages.length - 1}
                onSpeak={() => handleSpeak(m)}
                ttsState={ttsMsgId === m.id ? ttsPhase : 'idle'}
              />
            )
          )
        )}
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
          {recording ? <Square size={16} fill="currentColor" /> : <Mic size={16} />}
          {recording && (
            <span
              className="absolute inset-0 rounded-full ring-2 ring-risk-high"
              style={{ transform: `scale(${1 + amplitude})`, opacity: 1 - amplitude }}
            />
          )}
        </button>
        <input
          value={recording ? '' : text}
          onChange={(e) => setText(e.target.value)}
          disabled={recording}
          placeholder={recording ? 'Listening…' : 'Ask about heat, floods, a ward…'}
          className="flex-1 rounded-lg border border-black/10 bg-bg-soft px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-dim/60 focus:border-cyan/50 disabled:opacity-70"
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
