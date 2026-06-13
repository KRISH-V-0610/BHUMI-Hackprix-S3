import { useEffect } from 'react'
import { useDashboard } from './store/useDashboard.js'
import { getLayers, getWards, getScorecards, getTimeseries } from './api/bhumi.js'
import { USE_MOCK } from './api/client.js'

import ClimateMap from './components/map/ClimateMap.jsx'
import LayerTabs from './components/layers/LayerTabs.jsx'
import LayerViewer from './components/layers/LayerViewer.jsx'
import TimeMachine from './components/time/TimeMachine.jsx'
import Scorecards from './components/panels/Scorecards.jsx'
import TopWards from './components/panels/TopWards.jsx'
import RainfallChart from './components/panels/RainfallChart.jsx'
import AskBhumi from './components/panels/AskBhumi.jsx'
import Recommendations from './components/panels/Recommendations.jsx'
import LangSwitch from './components/common/LangSwitch.jsx'

export default function App() {
  const setData = useDashboard((s) => s.setData)
  const year = useDashboard((s) => s.year)
  const loading = useDashboard((s) => s.loading)

  // Initial load: layers, wards, timeseries (year-independent) + first scorecards.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [layers, wards, timeseries, scorecards] = await Promise.all([
        getLayers().then((d) => d.layers ?? d),
        getWards(),
        getTimeseries('rainfall'),
        getScorecards(useDashboard.getState().year),
      ])
      if (!alive) return
      setData({
        layers,
        wards,
        timeseries,
        scorecards: scorecards.cards ?? [],
        loading: false,
      })
    })()
    return () => {
      alive = false
    }
  }, [setData])

  // Refetch scorecards when the year changes (they're year-specific aggregates).
  useEffect(() => {
    if (loading) return
    let alive = true
    getScorecards(year).then((sc) => alive && setData({ scorecards: sc.cards ?? [] }))
    return () => {
      alive = false
    }
  }, [year, loading, setData])

  return (
    <div className="flex h-screen w-screen flex-col gap-2 p-2">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-extrabold tracking-tight">
            <span className="text-neon">Bhumi</span>{' '}
            <span className="text-ink-dim">· Climate Digital Twin</span>
          </h1>
          {/* {USE_MOCK && (
            <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold text-amber">
              MOCK DATA
            </span>
          )} */}
        </div>
        <LayerTabs />
        <div className="flex items-center gap-2">
          <TimeMachine />
          <LangSwitch />
        </div>
      </header>

      {/* Body: 3-column dashboard */}
      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_360px] gap-2">
        {/* Left rail */}
        <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          <LayerViewer />
          <Scorecards />
          <RainfallChart />
        </aside>

        {/* Center: hero map */}
        <main className="min-h-0">
          {loading ? (
            <div className="glass flex h-full items-center justify-center text-ink-dim">
              <span className="animate-pulse-glow">Loading climate twin…</span>
            </div>
          ) : (
            <ClimateMap />
          )}
        </main>

        {/* Right rail */}
        <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          <div className="min-h-[320px] flex-1">
            <AskBhumi />
          </div>
          <TopWards />
          <Recommendations />
        </aside>
      </div>
    </div>
  )
}
