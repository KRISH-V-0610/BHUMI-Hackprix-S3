import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Satellite } from 'lucide-react'
import { useDashboard } from '../../store/useDashboard.js'
import { cityAverage } from '../../lib/risk.js'
import { TIMELINE_YEARS } from '../../lib/years.js'

// Real cached satellite frames in /public/satellite — these swap as the Time Machine plays,
// producing the "gif" time-lapse of how Hyderabad's spectral bands change year to year.
const BANDS = [
  { id: 'truecolor', label: 'True Color', ext: 'jpg' },
  { id: 'ndvi',      label: 'NDVI',       ext: 'png' },
  { id: 'lst',       label: 'LST',        ext: 'png' },
]
const frame = (band, year) => `/satellite/${band.id}_${year}.${band.ext}`

// Spectral indices (real ward-data, not mocked) shown as live readout cards.
const INDICES = [
  { id: 'veg',   abbr: 'NDVI', name: 'Vegetation',    good: true  },
  { id: 'heat',  abbr: 'LST',  name: 'Surface Temp',  good: false },
  { id: 'flood', abbr: 'NDWI', name: 'Water / Flood', good: false },
  { id: 'urban', abbr: 'NDBI', name: 'Built-up',      good: false },
  { id: 'lake',  abbr: 'LHI',  name: 'Lake Health',   good: true  },
  { id: 'water', abbr: 'SWI',  name: 'Surface Water', good: true  },
]

export default function SpectralPanel() {
  const tmPlaying = useDashboard((s) => s.tmPlaying)
  const wards     = useDashboard((s) => s.wards)
  const year      = useDashboard((s) => s.year)
  const features  = wards?.features ?? []
  const baseline  = TIMELINE_YEARS[0]

  const [band, setBand] = useState(BANDS[0])

  // preload every frame of the active band so the time-lapse never flickers
  useEffect(() => {
    TIMELINE_YEARS.forEach((y) => { const im = new Image(); im.src = frame(band, y) })
  }, [band])

  // snap the (possibly interpolated) time-machine year to the nearest frame year
  const frameYear = useMemo(() => {
    return TIMELINE_YEARS.reduce((best, y) =>
      Math.abs(y - Number(year)) < Math.abs(best - Number(year)) ? y : best, TIMELINE_YEARS[0])
  }, [year])

  const values = useMemo(() => {
    const obj = {}
    for (const idx of INDICES) {
      const cur  = cityAverage(features, year,     idx.id)
      const base = cityAverage(features, baseline, idx.id)
      obj[idx.id] = { cur, delta: Math.round(cur - base) }
    }
    return obj
  }, [features, year, baseline])

  return (
    <AnimatePresence>
      {tmPlaying && (
        <motion.div
          key="spectral-panel"
          initial={{ opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -28 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
          className="pointer-events-auto flex w-85 flex-col overflow-hidden rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.74)',
            backdropFilter: 'blur(26px) saturate(180%)',
            WebkitBackdropFilter: 'blur(26px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.55)',
            boxShadow: '0 10px 38px rgba(31,41,55,0.16), inset 0 1px 0 rgba(255,255,255,0.92)',
          }}
        >
          {/* ── header ── */}
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
            <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-dim">
              <Satellite size={14} className="text-cyan" /> Spectral Analysis
            </span>
            <span className="rounded-full bg-cyan/15 px-2.5 py-0.5 font-serif text-base font-extrabold text-cyan">
              {frameYear}
            </span>
          </div>

          {/* ── band switcher ── */}
          <div className="flex gap-1 px-4 pb-2.5">
            {BANDS.map((b) => (
              <button
                key={b.id}
                onClick={() => setBand(b)}
                className={`flex-1 rounded-lg py-1 text-[10px] font-bold transition ${
                  band.id === b.id ? 'bg-neon-deep text-white' : 'bg-black/5 text-ink-dim hover:bg-black/10'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* ── live satellite time-lapse frame ── */}
          <div className="relative mx-4 mb-3 overflow-hidden rounded-xl bg-black" style={{ height: 168 }}>
            <AnimatePresence mode="popLayout">
              <motion.img
                key={`${band.id}-${frameYear}`}
                src={frame(band, frameYear)}
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeInOut' }}
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
                alt={`${band.label} ${frameYear}`}
              />
            </AnimatePresence>

            {/* scanline texture */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,1) 4px)' }} />

            {/* gradient floor for label legibility */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-black/70 to-transparent" />

            {/* band label + LIVE pill */}
            <div className="absolute bottom-2 left-2.5 flex items-center gap-2">
              <span className="text-[11px] font-bold text-white drop-shadow">{band.label}</span>
            </div>
            <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-red-500/80 px-2 py-0.5">
              <motion.span className="h-1.5 w-1.5 rounded-full bg-white"
                animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.1, repeat: Infinity }} />
              <span className="text-[8px] font-bold uppercase tracking-wide text-white">Live</span>
            </div>

            {/* big year watermark */}
            <div className="absolute bottom-1.5 right-2.5 font-serif text-3xl font-black tabular-nums leading-none text-white/25 select-none">
              {frameYear}
            </div>
          </div>

          {/* ── spectral index cards ── */}
          <div className="grid grid-cols-2 gap-2.5 px-4 pb-2">
            {INDICES.map((idx) => {
              const { cur, delta } = values[idx.id] ?? { cur: 0, delta: 0 }
              const improved  = idx.good ? delta > 0 : delta < 0
              const deltaStr  = delta > 0 ? `+${delta}` : `${delta}`
              return (
                <div key={idx.id} className="rounded-xl border border-mist bg-bg-soft p-2.5">
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="text-[12px] font-extrabold text-neon-deep">{idx.abbr}</span>
                    {delta !== 0 && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${improved ? 'bg-neon/15 text-neon-deep' : 'bg-risk-high/15 text-risk-high'}`}>
                        {deltaStr}
                      </span>
                    )}
                  </div>
                  <div className="mb-2 text-[8px] leading-none text-ink-dim">{idx.name}</div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-black/10">
                    <motion.div className="h-full rounded-full bg-neon-deep"
                      animate={{ width: `${cur}%` }} transition={{ duration: 0.95, ease: 'easeOut' }} />
                  </div>
                  <div className="mt-1 text-right">
                    <span className="text-[12px] font-bold tabular-nums text-ink">{cur}</span>
                    <span className="text-[8px] text-ink-dim">/100</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── footer ── */}
          <div className="px-4 py-2.5 text-center text-[9px] text-ink-dim">
            Δ vs {baseline} baseline · city-average · cached MODIS frames
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
