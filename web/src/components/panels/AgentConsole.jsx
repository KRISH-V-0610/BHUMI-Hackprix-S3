import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sprout, BrainCircuit, Mic, Square, Volume2, Loader2, Sparkles, X, BarChart3, Trash2, ArrowUp, HelpCircle, TrendingUp, Target, ListOrdered, ArrowLeftRight, MessagesSquare, BookOpen } from 'lucide-react'
import LangSwitch from '../common/LangSwitch.jsx'
import { useDashboard } from '../../store/useDashboard.js'
import { postAsk, postVoice, clearSession, resetSessionId } from '../../api/bhumi.js'
import { runChoreography } from '../../lib/choreography.js'
import { useMicRecorder } from '../../hooks/useMicRecorder.js'
import { useTts } from '../../hooks/useTts.js'
import Markdown, { stripMd } from '../common/Markdown.jsx'
import AskCharts from './AskCharts.jsx'
import AudioOrb from './AudioOrb.jsx'
import ModelSwitch from '../common/ModelSwitch.jsx'
import { suggestPrompts } from '../../lib/wardAnalysis.js'
import { cityAverage, wardScore, levelOf } from '../../lib/risk.js'
import { layerMeta } from '../../lib/insights.js'
import { useUI } from '../../store/useUI.js'

// Risk-level distribution across wards (for the doughnut), with band colours.
const BANDS = [
  { name: 'Very High', min: 85, color: '#d7191c' },
  { name: 'High', min: 70, color: '#ff7f0e' },
  { name: 'Moderate', min: 50, color: '#ffb300' },
  { name: 'Low', min: 0, color: '#74add1' },
]
function levelDoughnut(features, year, layer) {
  const counts = BANDS.map((b) => ({ ...b, value: 0 }))
  for (const f of features) {
    const s = wardScore(f.properties, year, layer)
    for (const b of counts) {
      if (s >= b.min) {
        b.value++
        break
      }
    }
  }
  return { type: 'doughnut', title: 'Wards by risk band', data: counts.filter((b) => b.value > 0) }
}

// Suggestion kind -> icon (matches suggestPrompts in wardAnalysis.js).
const SUGGEST_ICONS = {
  why: HelpCircle,
  sim: Sparkles,
  trend: TrendingUp,
  plan: Target,
  rank: ListOrdered,
  compare: ArrowLeftRight,
}

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

// One assistant answer — reasoning trace + typed-on markdown + a Listen button.
// `animate` is true only for a freshly generated answer; restored/reopened history renders
// instantly (no replayed typing). `onTyped` fires once when the animation completes.
function Answer({ message, animate, onTyped, onSpeak, ttsState }) {
  const { text, reasoning, status, evidence } = message
  const [typed, setTyped] = useState(animate ? '' : text)
  const plain = stripMd(text)
  const done = typed.length >= plain.length

  useEffect(() => {
    if (!animate) return setTyped(text)
    if (!plain) return setTyped('')
    let i = 0
    const t = setInterval(() => {
      i += 2
      setTyped(plain.slice(0, i))
      if (i >= plain.length) {
        clearInterval(t)
        onTyped?.()
      }
    }, 14)
    return () => clearInterval(t)
  }, [text, animate]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-2">
      {reasoning?.length > 0 && (
        <div className="rounded-lg bg-bg-soft/80 p-2 text-[11px] text-ink-dim ring-1 ring-black/5">
          {reasoning.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5 font-mono leading-relaxed">
              <BrainCircuit size={12} className="mt-0.5 shrink-0 text-cyan" /> <span>{r}</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-[15px] leading-relaxed text-ink">
        {status === 'thinking' && !text ? (
          <ThinkingDots />
        ) : done ? (
          <Markdown text={text} />
        ) : (
          <span className="whitespace-pre-wrap">
            {typed}
            <span className="ml-0.5 inline-block h-4 w-0.5 -translate-y-px animate-pulse-glow bg-neon align-middle" />
          </span>
        )}
      </div>

      {/* deep-search evidence — cited causal factors + sources (the credibility card) */}
      {evidence?.factors?.length > 0 && done && (
        <div className="rounded-xl border border-mist bg-bg-soft p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-dim">
              <BookOpen size={11} className="text-cyan" /> Evidence
            </span>
            {evidence.confidence && (
              <span className="rounded-full bg-neon/15 px-1.5 py-0.5 text-[9px] font-bold capitalize text-neon-deep">
                {evidence.confidence} confidence
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {evidence.factors.map((f, i) => (
              <div key={i} className="border-l-2 border-neon/40 pl-2">
                <div className="text-[11px] font-semibold leading-snug text-ink">{f.factor}</div>
                <div className="text-[9px] italic text-ink-dim">{f.source}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {text && status !== 'thinking' && (
        <button
          onClick={onSpeak}
          className={`flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition ${
            ttsState === 'idle' ? 'text-ink-dim hover:bg-hover hover:text-ink' : 'bg-neon/15 text-neon-deep'
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
  )
}

// The agentic console: a persistent bottom command bar + an immersive overlay that shows the
// markdown answer on one side, the analytical visuals on the other, and an audio-reactive orb
// at centre while the mic records or Bhumi speaks.
export default function AgentConsole() {
  const [text, setText] = useState('')
  const [dismissed, setDismissed] = useState(true)
  const lang = useDashboard((s) => s.lang)
  const asking = useDashboard((s) => s.asking)
  const messages = useDashboard((s) => s.messages)
  const addMessage = useDashboard((s) => s.addMessage)
  const clearChat = useDashboard((s) => s.clearChat)
  const selectedWard = useDashboard((s) => s.selectedWard)
  const activeLayer = useDashboard((s) => s.activeLayer)
  const wards = useDashboard((s) => s.wards)
  const year = useDashboard((s) => s.year)
  const plannerOpen = useUI((s) => s.plannerOpen)

  const { recording, amplitude, start, stop } = useMicRecorder()
  const { speak, stop: stopTts, level: ttsLevel, playing: ttsPlaying } = useTts()
  const [ttsMsgId, setTtsMsgId] = useState(null)
  const [ttsPhase, setTtsPhase] = useState('idle') // idle | loading | playing
  const threadRef = useRef(null)
  const inputRef = useRef(null)
  // Ids of answers generated LIVE this session — only these get the typing animation. Restored
  // history (reload) or a reopened thread renders instantly. An id is dropped once it finishes
  // typing, so closing/reopening the overlay won't replay the animation.
  const liveIds = useRef(new Set())

  // "Ask Bhumi" / Welcome buttons → reveal the console, focus the input, or fire a seeded question.
  useEffect(() => {
    const onFocusAsk = () => {
      setDismissed(false)
      inputRef.current?.focus()
    }
    const onSeedAsk = (e) => {
      const q = e?.detail
      if (q) fireAsk(q)
    }
    window.addEventListener('bhumi:focus-ask', onFocusAsk)
    window.addEventListener('bhumi:ask', onSeedAsk)
    return () => {
      window.removeEventListener('bhumi:focus-ask', onFocusAsk)
      window.removeEventListener('bhumi:ask', onSeedAsk)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant'),
    [messages]
  )

  // Analysis panel only appears for ANALYTICAL answers (ones that returned charts). Greetings /
  // small talk show just the chat reply — no map, no gauges. When analytical, we enrich the
  // answer's charts with a live overall-risk gauge + a ward risk-band doughnut.
  const answerCharts = lastAssistant?.charts || []
  const isAnalytical = answerCharts.length > 0
  const analysisCharts = useMemo(() => {
    const features = wards?.features || []
    if (!isAnalytical || !features.length) return []
    const meta = layerMeta(activeLayer)
    const gauge = {
      type: 'gauge',
      title: `Overall ${meta.label} (${year})`,
      value: cityAverage(features, year, activeLayer),
      max: 100,
    }
    return [gauge, ...answerCharts, levelDoughnut(features, year, activeLayer)]
  }, [wards, year, activeLayer, lastAssistant, isAnalytical]) // eslint-disable-line react-hooks/exhaustive-deps
  const open = !dismissed && (recording || ttsPlaying || asking || messages.length > 0)

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open])

  const handleSpeak = async (m) => {
    if (ttsMsgId === m.id) {
      stopTts()
      setTtsMsgId(null)
      setTtsPhase('idle')
      return
    }
    stopTts()
    setTtsMsgId(m.id)
    setTtsPhase('loading')
    await speak(stripMd(m.text), m.lang || lang, {
      onEnd: () => {
        setTtsMsgId(null)
        setTtsPhase('idle')
      },
    })
    setTtsPhase((p) => (p === 'loading' ? 'playing' : p))
  }

  const fireAsk = async (q, askLang) => {
    if (!q?.trim()) return
    setDismissed(false)
    addMessage({ role: 'user', text: q.trim() })
    const id = addMessage({ role: 'assistant', status: 'thinking' })
    liveIds.current.add(id) // this answer is live → animate it once
    useDashboard.getState().setData({ asking: true })
    try {
      const res = await postAsk(q, askLang || lang, useDashboard.getState().model)
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
        const v = await postVoice(blob)
        if (!v?.text?.trim()) {
          useDashboard.getState().setData({ asking: false })
          return
        }
        await fireAsk(v.text, v.lang)
      } catch {
        useDashboard.getState().setData({ asking: false })
      }
    } else {
      setDismissed(false)
      await start()
    }
  }

  const suggestions = useMemo(
    () => suggestPrompts({ ward: selectedWard, layer: activeLayer }),
    [selectedWard, activeLayer]
  )

  // Orb only while recording voice input — no full-screen orb during TTS playback (the Listen
  // button itself shows the "Playing…" state, so the big "Bhumi speaking" overlay isn't needed).
  const orbMode = recording ? 'mic' : null
  const orbLevel = amplitude

  return (
    <>
      {/* ---- immersive overlay ---- */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="agent-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30"
          >
            {/* 0.3 dimmed backdrop — map + AOI glow stay faintly visible behind */}
            <div
              onClick={() => setDismissed(true)}
              className="absolute inset-0 bg-[#06120d]/15"
            />

            {/* close */}
            <button
              onClick={() => setDismissed(true)}
              className="absolute right-4 top-4 z-50 flex h-8 w-8 items-center justify-center rounded-full bg-panel text-ink-dim shadow-md transition hover:text-ink"
            >
              <X size={16} />
            </button>

            {/* LEFT — answer / conversation (markdown) */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              className={`glass absolute bottom-28 top-20 z-40 flex w-[min(34vw,420px)] flex-col p-4 transition-[left] ${
                plannerOpen ? 'left-[21.5rem]' : 'left-4'
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-ink">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-neon to-cyan text-white shadow-[0_0_14px_rgba(14,165,183,0.5)]">
                    <Sprout size={15} />
                  </span>
                  Bhumi
                </span>
                {messages.length > 0 && (
                  <button
                    onClick={() => { clearSession(); resetSessionId(); clearChat() }}
                    title="Clear conversation"
                    className="text-ink-dim hover:text-ink"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div ref={threadRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
                {messages.map((m, i) =>
                  m.role === 'user' ? (
                    <div key={m.id} className="self-end rounded-2xl rounded-tr-sm bg-neon-deep px-3 py-2 text-sm text-white">
                      {m.text}
                    </div>
                  ) : (
                    <Answer
                      key={m.id}
                      message={m}
                      animate={liveIds.current.has(m.id)}
                      onTyped={() => liveIds.current.delete(m.id)}
                      onSpeak={() => handleSpeak(m)}
                      ttsState={ttsMsgId === m.id ? ttsPhase : 'idle'}
                    />
                  )
                )}
              </div>
            </motion.div>

            {/* RIGHT — analytical visuals (only for analytical answers, not greetings) */}
            {analysisCharts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                className="glass absolute bottom-28 right-4 top-20 z-40 flex w-[min(34vw,420px)] flex-col p-4"
              >
                <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-cyan">
                  <BarChart3 size={16} /> Analysis
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <AskCharts charts={analysisCharts} />
                </div>
              </motion.div>
            )}

            {/* CENTER — audio-reactive orb (mic / tts) */}
            {orbMode && (
              <div className="absolute inset-0 z-40 flex items-center justify-center">
                <AudioOrb level={orbLevel} mode={orbMode} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- persistent bottom command bar (reference chat layout) ---- */}
      <div className="absolute bottom-4 left-1/2 z-50 w-[min(760px,calc(100vw-2rem))] -translate-x-1/2">
        {/* suggested questions — context-aware, icon-tagged, wrap so none get clipped.
            Hidden while the ward digital-twin modal is open, so they don't collide with it. */}
        {!selectedWard && (
          <div className="mb-2 flex flex-col items-center gap-1.5">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {suggestions.map((s, i) => {
                const Icon = SUGGEST_ICONS[s.kind] || Sparkles
                return (
                  <button
                    key={i}
                    onClick={() => fireAsk(s.text)}
                    className="group flex items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 text-[12px] font-medium text-ink-dim shadow-sm ring-1 ring-mist transition hover:bg-neon-deep hover:text-white hover:ring-neon-deep"
                  >
                    <Icon size={13} className="text-cyan transition group-hover:text-white" />
                    {s.text}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Gemini-style capsule: input on top, controls beneath */}
        <div className="rounded-[28px] bg-panel/95 shadow-[0_10px_34px_rgba(20,67,46,0.12)] ring-1 ring-mist backdrop-blur-xl transition focus-within:ring-2 focus-within:ring-neon/45">
          <form onSubmit={onSubmit} className="flex flex-col gap-1 px-4 pb-2.5 pt-3.5">
            {/* row 1 — the prompt field */}
            <input
              ref={inputRef}
              value={recording ? '' : text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setDismissed(false)}
              disabled={recording}
              placeholder={recording ? 'Listening…' : 'Ask Bhumi anything about Hyderabad…'}
              className="w-full bg-transparent px-1 text-[15px] leading-6 text-ink outline-none placeholder:text-ink-dim/55"
            />

            {/* row 2 — tools left · model + send right */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onMic}
                  title={recording ? 'Stop & ask' : 'Ask by voice'}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full transition ${
                    recording ? 'bg-risk-high text-white' : 'text-ink-dim hover:bg-hover hover:text-ink'
                  }`}
                >
                  {recording ? <Square size={15} fill="currentColor" /> : <Mic size={17} />}
                  {recording && (
                    <span
                      className="absolute inset-0 rounded-full ring-2 ring-risk-high"
                      style={{ transform: `scale(${1 + amplitude})`, opacity: 1 - amplitude }}
                    />
                  )}
                </button>
                {/* open / hide the conversation thread on the left — always available here,
                    beside the language picker (history survives reload) */}
                <button
                  type="button"
                  onClick={() => {
                    if (messages.length === 0) {
                      setDismissed(false)
                      inputRef.current?.focus()
                    } else {
                      setDismissed((d) => !d)
                    }
                  }}
                  title={open ? 'Hide conversation' : 'Open chat'}
                  className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition ${
                    open ? 'bg-neon/15 text-neon-deep' : 'text-ink-dim hover:bg-hover hover:text-ink'
                  }`}
                >
                  <MessagesSquare size={15} /> Chat
                </button>
                {/* in-chat language picker — opens upward, sets the answer + voice language */}
                <LangSwitch openUp variant="chat" />
              </div>

              <div className="flex items-center gap-2">
                {asking && <span className="text-[11px] text-cyan animate-pulse-glow">thinking…</span>}
                {/* Sarvam model picker — opens upward */}
                <ModelSwitch />
                <button
                  type="submit"
                  disabled={!text.trim() || recording}
                  title="Send"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-neon-deep text-white shadow-glow transition hover:brightness-110 disabled:bg-mist disabled:text-ink-dim/50 disabled:shadow-none"
                >
                  <ArrowUp size={18} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
