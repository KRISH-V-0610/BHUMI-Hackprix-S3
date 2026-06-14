import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Target, TreePine, Building2, Droplets, Waves, Download, Loader2, Info } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'
import { useWorkspace } from '../../store/useWorkspace.js'
import { postPlan, postReport } from '../../api/bhumi.js'
import { planLocally, INTERVENTIONS, formatINR } from '../../lib/planner.js'
import { heatColor } from '../../lib/risk.js'

const ICONS = {
  tree_cover: TreePine, cool_roof: Building2, permeable_surface: Droplets,
  drain_desilt: Waves, lake_restore: Waves,
}

// Action Planner (Plan mode): pick an intervention + budget → ranked, costed plan painted on the
// map, with an aggregate impact card and a one-click PDF. The product's core "what do I do?" view.
export default function PlannerPanel() {
  const wards = useDashboard((s) => s.wards)
  const year = useDashboard((s) => s.year)
  const lang = useDashboard((s) => s.lang)
  const setActiveLayer = useDashboard((s) => s.setActiveLayer)
  const setHighlightWards = useDashboard((s) => s.setHighlightWards)
  const setPlan = useDashboard((s) => s.setPlan)
  // intervention lives in the workspace store so the flood scenario can seed it (e.g. drainage).
  const intervention = useWorkspace((s) => s.plannerIntervention)
  const setIntervention = useWorkspace((s) => s.setPlannerIntervention)

  const [budgetCr, setBudgetCr] = useState(10) // ₹ crore
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const debounce = useRef(null)

  // Recompute the plan (live) when the intervention or budget changes — API with a GUARANTEED
  // local fallback. Bulletproof: a bad/empty API response OR any error falls to planLocally, and
  // the panel never ends up blank as long as ward data exists.
  useEffect(() => {
    if (!wards?.features?.length) return
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      const body = { budget: budgetCr * 1e7, intervention, year }
      setBusy(true)
      let res = null
      try {
        res = await postPlan(body)
        if (!res || !Array.isArray(res.picked)) throw new Error('invalid plan response')
      } catch {
        try { res = planLocally(wards, body) } catch { res = null }
      }
      setBusy(false)
      if (!res || !Array.isArray(res.picked)) return
      setResult(res)
      // project the plan onto the map
      setActiveLayer(res.layer || 'flood')
      setHighlightWards(res.picked.map((p) => p.ward))
      setPlan?.(res)
      const first = res.picked[0]
      if (first?.centroid) useDashboard.getState().flyTo?.({ center: first.centroid, zoom: 11.2, pitch: 50, bearing: 12 })
    }, 250)
    return () => clearTimeout(debounce.current)
  }, [intervention, budgetCr, wards, year, setActiveLayer, setHighlightWards, setPlan])

  const downloadPdf = async () => {
    setPdfBusy(true)
    try {
      const blob = await postReport({ lang, year, layer: result?.layer, wards: (result?.picked || []).map((p) => p.ward) })
      if (!blob) {
        alert('Action-plan PDF needs the live backend (set VITE_USE_MOCK=false and run the API).')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'bhumi-action-plan.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Report failed: ${e.message}`)
    } finally {
      setPdfBusy(false)
    }
  }

  const picked = result?.picked || []

  return (
    <div className="glass flex min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center gap-1.5 text-sm font-bold text-neon">
        <Target size={16} /> Action Planner
      </div>

      {/* intervention picker */}
      <div className="grid grid-cols-2 gap-1.5">
        {Object.entries(INTERVENTIONS).map(([key, spec]) => {
          const Icon = ICONS[key] || Target
          const on = intervention === key
          return (
            <button
              key={key}
              onClick={() => setIntervention(key)}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold transition ${
                on ? 'bg-neon-deep text-white shadow-sm' : 'bg-bg-soft text-ink-dim hover:bg-hover'
              }`}
            >
              <Icon size={13} className="shrink-0" />
              <span className="leading-tight">{spec.label.replace(/^(Increase|De-silt &|Cool|Permeable|Restore)/, '').trim() || spec.label}</span>
            </button>
          )
        })}
      </div>

      {/* budget slider */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="font-semibold uppercase tracking-wide text-ink-dim">Budget</span>
          <span className="font-bold tabular-nums text-cyan">{formatINR(budgetCr * 1e7)}</span>
        </div>
        <input
          type="range" min={1} max={50} step={1} value={budgetCr}
          onChange={(e) => setBudgetCr(Number(e.target.value))}
          className="h-1 w-full cursor-pointer accent-neon-deep"
        />
      </div>

      {/* impact card */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-neon/10 p-2.5 ring-1 ring-neon/20"
        >
          <div className="grid grid-cols-3 gap-1 text-center">
            <div>
              <div className="text-lg font-extrabold tabular-nums text-neon-deep">{result.wards_funded}</div>
              <div className="text-[9px] text-ink-dim">wards funded</div>
            </div>
            <div>
              <div className="text-lg font-extrabold tabular-nums text-cyan">−{result.avg_risk_drop}</div>
              <div className="text-[9px] text-ink-dim">avg risk drop</div>
            </div>
            <div>
              <div className="text-lg font-extrabold tabular-nums text-eucalyptus">
                {result.people_out_of_severe >= 1000 ? `${Math.round(result.people_out_of_severe / 1000)}k` : result.people_out_of_severe}
              </div>
              <div className="text-[9px] text-ink-dim">out of severe</div>
            </div>
          </div>
          <div className="mt-1.5 text-center text-[10px] text-ink-dim">
            {formatINR(result.total_cost)} of {formatINR(budgetCr * 1e7)} · targets <span className="font-semibold capitalize">{result.layer}</span>
          </div>
        </motion.div>
      )}

      {/* ranked funded wards */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {!result && (
          <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-ink-dim">
            <Loader2 size={13} className="animate-spin" /> Calculating the best plan…
          </div>
        )}
        {picked.map((p, i) => (
          <div key={p.ward} className="flex items-center gap-2 border-b border-mist/60 py-1 text-xs">
            <span className="w-4 text-[10px] font-bold text-ink-dim">{i + 1}</span>
            <span className="flex-1 truncate text-ink">{p.ward}</span>
            <span className="tabular-nums text-ink-dim">{p.before}→<span style={{ color: heatColor(p.after) }}>{p.after}</span></span>
            <span className="w-12 text-right text-[10px] font-semibold text-cyan">{formatINR(p.cost)}</span>
          </div>
        ))}
        {result && picked.length === 0 && (
          <div className="py-3 text-center text-[11px] text-ink-dim">Budget too small to fund a ward — raise it.</div>
        )}
      </div>

      {/* honest label + PDF */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[9px] leading-tight text-ink-dim" title={result?.note}>
          <Info size={10} className="shrink-0" /> First-order estimate
        </span>
        <button
          onClick={downloadPdf}
          disabled={pdfBusy || !picked.length}
          className="flex items-center gap-1 rounded-lg bg-amber/20 px-3 py-1.5 text-xs font-semibold text-amber transition hover:bg-amber/30 disabled:opacity-50"
        >
          {pdfBusy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Action Plan PDF
        </button>
      </div>
    </div>
  )
}
