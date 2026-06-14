import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ClipboardList, RotateCcw, PlayCircle } from 'lucide-react'
import Logo from './components/common/Logo.jsx'
import { useDashboard } from './store/useDashboard.js'
import { useUI } from './store/useUI.js'
import { useFloodScenario } from './store/useFloodScenario.js'
import { useStory } from './store/useStory.js'
import { getLayers, getWards, getScorecards, getTimeseries } from './api/bhumi.js'
import { enrichWards, cardsForYear, BASE_FROM, BASE_TO } from './lib/years.js'

import ClimateMap from './components/map/ClimateMap.jsx'
import TrendMiniChart from './components/time/TrendMiniChart.jsx'
import SpectralPanel from './components/time/SpectralPanel.jsx'
import WardPopups from './components/map/WardPopups.jsx'
import LayerTabs from './components/layers/LayerTabs.jsx'
import TimeMachine from './components/time/TimeMachine.jsx'
import DecisionPanel from './components/panels/DecisionPanel.jsx'
import AgentConsole from './components/panels/AgentConsole.jsx'
import ReportButton from './components/panels/ReportButton.jsx'
import MapSettings from './components/map/MapSettings.jsx'
import PlannerPanel from './components/workspace/PlannerPanel.jsx'
import WardDetail from './components/workspace/WardDetail.jsx'
import StoryMode from './components/story/StoryMode.jsx'
import Welcome from './components/onboarding/Welcome.jsx'
import { FloodScenarioButton, FloodScenarioHud } from './components/map/FloodScenario.jsx'

// Bhumi — one clean decision screen: See (map + summary) · Ask (agent console) · Plan · Justify.
export default function App() {
  const setData = useDashboard((s) => s.setData)
  const year = useDashboard((s) => s.year)
  const loading = useDashboard((s) => s.loading)
  const highlightWards = useDashboard((s) => s.highlightWards)
  const selectedWard = useDashboard((s) => s.selectedWard)
  const scnActive = useFloodScenario((s) => s.active)
  const startStory = useStory((s) => s.start)
  const planOpen = useUI((s) => s.plannerOpen)
  const togglePlan = useUI((s) => s.togglePlanner)
  const setPlanOpen = useUI((s) => s.setPlannerOpen)

  // A focused/highlighted map can be reset back to the normal city-wide view.
  const hasFocus = !scnActive && (highlightWards.length > 0 || !!selectedWard)
  const resetView = () => {
    const st = useDashboard.getState()
    st.setHighlightWards([])
    st.setSelectedWard(null)
    st.setFocus(null)
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
      {/* ---- full-bleed map (+ ward popups projected onto it) ---- */}
      <div className="absolute inset-2">
        {loading ? (
          <div className="glass flex h-full items-center justify-center text-ink-dim">
            <span className="animate-pulse-glow">Loading climate twin…</span>
          </div>
        ) : (
          <ClimateMap />
        )}
      </div>
      {!loading && (
        <div className="pointer-events-none absolute inset-2 z-35">
          <WardPopups />
        </div>
      )}

      {/* ---- top bar: brand · layers + year · actions (reference layout) ---- */}
      <header className="pointer-events-none absolute inset-x-2 top-3 z-40 flex items-center justify-between gap-3">
        {/* brand — left (same height as every other navbar section) */}
        <div className="glass pointer-events-auto flex h-10 shrink-0 items-center gap-2 rounded-2xl px-3">
          <Logo size={28} className="drop-shadow-sm" />
          <div className="leading-none">
            <h1 className="font-serif text-base font-bold leading-none tracking-tight text-neon-deep">
              Bhumi
              <span className="ml-1.5 text-[10px] font-normal italic text-ink-dim">Climate Digital Twin</span>
            </h1>
            <div className="mt-0.5 flex items-center gap-1 text-[9px] leading-none">
              <span className="text-ink-dim">Powered by</span>
              <span className="font-bold text-cyan">Sarvam.AI</span>
            </div>
          </div>
        </div>

        {/* centre — layer tabs + year machine */}
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <LayerTabs />
          <div className="glass flex h-10 items-center px-3">
            <TimeMachine />
          </div>
        </div>

        {/* right — primary actions (Action Plan · Council Report) + tools */}
        <div className="glass pointer-events-auto flex h-10 shrink-0 items-center gap-1 px-1.5">
          <button
            onClick={togglePlan}
            className={`flex h-8 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition ${
              planOpen ? 'bg-neon text-white' : 'text-ink-dim hover:bg-hover hover:text-ink'
            }`}
          >
            <ClipboardList size={15} /> Action Plan
          </button>
          <ReportButton />
          <span className="mx-0.5 h-5 w-px bg-mist" />
          <button
            onClick={startStory}
            title="Guided tour"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-dim transition hover:bg-hover hover:text-ink"
          >
            <PlayCircle size={17} />
          </button>
          <FloodScenarioButton />
          <MapSettings />
        </div>
      </header>

      {/* ---- right: the "See" summary — inset from edge so it floats ---- */}
      <aside className="absolute right-6 top-20 z-20 w-80">
        <DecisionPanel />
      </aside>

      {/* ---- left: spectral analysis panel (Time Machine only) — clears the brand card ---- */}
      {!loading && (
        <div className="pointer-events-none absolute left-6 top-28 z-30 flex max-h-[calc(100vh-9rem)] flex-col justify-start overflow-y-auto">
          <SpectralPanel />
        </div>
      )}

      {/* ---- Action Planner drawer (Plan step) ---- */}
      <AnimatePresence>
        {planOpen && (
          <motion.aside
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="absolute bottom-24 left-2 top-20 z-40 flex w-80 flex-col"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-dim">
                Budget-aware planner
              </span>
              <button
                onClick={() => setPlanOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-panel text-ink-dim shadow-sm transition hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <PlannerPanel />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* trend mini-chart — docked bottom-right, always visible */}
      {!loading && (
        <div className="pointer-events-none absolute bottom-28 right-6 z-30">
          <TrendMiniChart />
        </div>
      )}

      {/* ward digital-twin card (floats over the map on click) */}
      <WardDetail />

      {/* reset focus → back to the normal city-wide view */}
      <AnimatePresence>
        {hasFocus && (
          <motion.button
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onClick={resetView}
            className="glass absolute left-1/2 top-16 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-dim shadow-md ring-1 ring-mist transition hover:bg-hover hover:text-ink"
            title="Clear highlights and return to the full city view"
          >
            <RotateCcw size={13} /> Reset view
          </motion.button>
        )}
      </AnimatePresence>

      {/* flood-scenario HUD */}
      <FloodScenarioHud />

      {/* agentic console: bottom command bar + immersive answer/visuals overlay + audio orb */}
      <AgentConsole />

      {/* guided demo (Story Mode) cinematic chrome */}
      <StoryMode />

      {/* first-run onboarding (shows once) */}
      <Welcome />
    </div>
  )
}
