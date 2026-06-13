import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PlayCircle, Eye, EyeOff, Satellite } from 'lucide-react'
import Logo from './components/common/Logo.jsx'
import { useDashboard } from './store/useDashboard.js'
import { useStory } from './store/useStory.js'
import { useWorkspace } from './store/useWorkspace.js'
import { getLayers, getWards, getScorecards, getTimeseries } from './api/bhumi.js'
import { enrichWards, cardsForYear, BASE_FROM, BASE_TO } from './lib/years.js'

import ClimateMap from './components/map/ClimateMap.jsx'
import LayerTabs from './components/layers/LayerTabs.jsx'
import TimeMachine from './components/time/TimeMachine.jsx'
import Scorecards from './components/panels/Scorecards.jsx'
import TopWards from './components/panels/TopWards.jsx'
import AskBhumi from './components/panels/AskBhumi.jsx'
import Recommendations from './components/panels/Recommendations.jsx'
import LangSwitch from './components/common/LangSwitch.jsx'
import StoryMode from './components/story/StoryMode.jsx'
import ModeSwitch from './components/workspace/ModeSwitch.jsx'
import MetricStrip from './components/workspace/MetricStrip.jsx'
import PlannerPanel from './components/workspace/PlannerPanel.jsx'
import WardDetail from './components/workspace/WardDetail.jsx'
import SatelliteTimelapse from './components/workspace/SatelliteTimelapse.jsx'

// Left-rail content reconfigures per workspace mode — one question's worth of UI at a time.
function LeftRail() {
  const mode = useWorkspace((s) => s.mode)
  const compareYear = useWorkspace((s) => s.compareYear)
  const year = useDashboard((s) => s.year)

  if (mode === 'plan') return <div className="min-h-0 flex-1"><PlannerPanel /></div>

  return (
    <>
      <LayerTabs />
      <MetricStrip />
      {mode === 'explore' ? (
        <TopWards />
      ) : (
        <>
          <div className="glass p-2.5 text-[11px] text-ink-dim">
            <div className="mb-1.5 font-semibold uppercase tracking-wide">
              Change · {compareYear} → {year}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#22a05a]">improved</span>
              <div
                className="h-1.5 flex-1 rounded-full"
                style={{ background: 'linear-gradient(90deg,#22a05a,#b4b9b2,#e0383b)' }}
              />
              <span className="text-[10px] text-[#e0383b]">worsened</span>
            </div>
            <p className="mt-1.5 leading-snug">
              Each ward is colored by its change in the active layer. Move the Time Machine year to
              compare against {compareYear}.
            </p>
          </div>
          <Scorecards />
        </>
      )}
    </>
  )
}

export default function App() {
  const setData = useDashboard((s) => s.setData)
  const year = useDashboard((s) => s.year)
  const loading = useDashboard((s) => s.loading)

  const [showInsights, setShowInsights] = useState(true)
  const [showChat, setShowChat] = useState(true)
  const [tlOpen, setTlOpen] = useState(false)
  const anyOpen = showInsights || showChat
  const toggleFocus = () => {
    const next = !anyOpen
    setShowInsights(next)
    setShowChat(next)
  }

  // Story Mode dimming.
  const storyActive = useStory((s) => s.active)
  const storyFocus = useStory((s) => s.focus)
  const startStory = useStory((s) => s.start)
  const storyCls = (key) => {
    if (!storyActive) return ''
    return storyFocus === key
      ? 'ring-2 ring-neon/50 rounded-2xl transition-all duration-700'
      : 'opacity-30 saturate-50 transition-all duration-700'
  }

  const baseCards = useRef({ lo: [], hi: [] })

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [layers, wards, timeseries, lo, hi] = await Promise.all([
        getLayers().then((d) => d.layers ?? d),
        getWards(),
        getTimeseries('rainfall'),
        getScorecards(BASE_FROM),
        getScorecards(BASE_TO),
      ])
      if (!alive) return
      enrichWards(wards)
      baseCards.current = { lo: lo.cards ?? [], hi: hi.cards ?? [] }
      setData({
        layers,
        wards,
        timeseries,
        scorecards: cardsForYear(useDashboard.getState().year, lo.cards ?? [], hi.cards ?? []),
        loading: false,
      })
    })()
    return () => {
      alive = false
    }
  }, [setData])

  useEffect(() => {
    if (loading) return
    const { lo, hi } = baseCards.current
    setData({ scorecards: cardsForYear(year, lo, hi) })
  }, [year, loading, setData])

  return (
    <div className="relative h-screen w-screen overflow-hidden p-2">
      {/* ---- full-bleed map canvas ---- */}
      <div className="absolute inset-2">
        {loading ? (
          <div className="glass flex h-full items-center justify-center text-ink-dim">
            <span className="animate-pulse-glow">Loading climate twin…</span>
          </div>
        ) : (
          <ClimateMap />
        )}
      </div>

      {/* ---- floating top bar ---- */}
      <header
        className={`pointer-events-none absolute inset-x-2 top-2 z-30 flex items-start justify-between gap-3 ${
          storyActive ? 'opacity-30 saturate-50 transition-all duration-700' : ''
        }`}
      >
        <div className="glass pointer-events-auto flex items-center gap-2.5 rounded-2xl px-3 py-1.5">
          <Logo size={30} className="drop-shadow-sm" />
          <div className="leading-tight">
            <h1 className="font-serif text-lg font-semibold tracking-tight">
              <span className="font-bold text-neon-deep">Bhumi</span>{' '}
              <span className="hidden text-xs italic text-ink-dim sm:inline">· Climate Action Twin</span>
            </h1>
            <div className="hidden items-center gap-1 text-[9px] text-ink-dim lg:flex">
              <span>Powered by</span>
              <span className="font-semibold text-neon-deep">Sarvam AI</span>
              <span className="text-mist">·</span>
              <span className="font-semibold text-cyan">Google Earth Engine</span>
            </div>
          </div>
        </div>

        <div className="pointer-events-auto">
          <ModeSwitch />
        </div>

        <div className="glass pointer-events-auto flex items-center gap-2 rounded-2xl px-2 py-1.5">
          <TimeMachine />
          <LangSwitch />
          <button
            onClick={() => setTlOpen(true)}
            title="Satellite time-lapse (2016 → 2026)"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-dim transition hover:bg-hover hover:text-ink"
          >
            <Satellite size={16} />
          </button>
          <button
            onClick={toggleFocus}
            title={anyOpen ? 'Focus mode — hide panels' : 'Show panels'}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-dim transition hover:bg-hover hover:text-ink"
          >
            {anyOpen ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            onClick={startStory}
            title="Play the guided walkthrough"
            className="flex items-center gap-1.5 rounded-full bg-neon-deep px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            <PlayCircle size={15} /> Present
          </button>
        </div>
      </header>

      {/* ---- left rail (mode-driven) ---- */}
      <AnimatePresence>
        {showInsights && (
          <motion.aside
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className={`absolute bottom-3 left-2 top-17 z-20 flex w-72 flex-col gap-2 overflow-y-auto pr-0.5 ${storyCls('wards')}`}
          >
            <LeftRail />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ---- right rail: Ask Bhumi + recommendations ---- */}
      <AnimatePresence>
        {showChat && (
          <motion.aside
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className="absolute bottom-3 right-2 top-17 z-20 flex w-92.5 flex-col gap-2"
          >
            <div className={`min-h-0 flex-1 ${storyCls('chat')}`}>
              <AskBhumi />
            </div>
            <div className={storyCls('recs')}>
              <Recommendations />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ward drill-down (floats over the map on click) */}
      <WardDetail />

      <SatelliteTimelapse open={tlOpen} onClose={() => setTlOpen(false)} />
      <StoryMode />
    </div>
  )
}
