import { motion, AnimatePresence } from 'framer-motion'
import { Settings2, X, RotateCcw, Satellite } from 'lucide-react'
import { useMapSettings, MAP_STYLES, GIBS_LAYERS } from '../../store/useMapSettings.js'

// TEMPORARY map "lab" panel — explore basemaps + render knobs, then we lock in the winner.
function Row({ label, children }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-[11px] text-ink-dim">{label}</span>
      {children}
    </label>
  )
}

function Slider({ value, min, max, step = 1, onChange, suffix = '' }) {
  return (
    <span className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-28 cursor-pointer accent-[var(--color-neon-deep)]"
      />
      <span className="w-10 text-right text-[11px] tabular-nums text-ink">
        {value}
        {suffix}
      </span>
    </span>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`h-5 w-9 rounded-full p-0.5 transition ${value ? 'bg-neon-deep' : 'bg-mist'}`}
    >
      <span
        className={`block h-4 w-4 rounded-full bg-white shadow transition ${value ? 'translate-x-4' : ''}`}
      />
    </button>
  )
}

export default function MapSettings() {
  const s = useMapSettings()

  return (
    <div className="relative">
      {/* gear button — sits in the map's bottom-centre dock */}
      <button
        onClick={s.toggleOpen}
        className="glass flex h-9 w-9 items-center justify-center text-ink-dim transition hover:text-ink"
        title="Map lab (temporary)"
      >
        <Settings2 size={16} />
      </button>

      <AnimatePresence>
        {s.open && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="glass absolute bottom-full right-0 z-20 mb-2 max-h-[70vh] w-72 overflow-y-auto p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                <Settings2 size={14} /> Map Lab
              </span>
              <div className="flex gap-1">
                <button onClick={s.reset} className="text-ink-dim hover:text-ink" title="Reset">
                  <RotateCcw size={14} />
                </button>
                <button onClick={s.toggleOpen} className="text-ink-dim hover:text-ink">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* basemap picker */}
            <div className="mb-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
                Basemap
              </div>
              <div className="grid grid-cols-2 gap-1">
                {MAP_STYLES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => s.set({ styleId: m.id })}
                    className={`rounded-md px-2 py-1 text-left text-[11px] transition ${
                      s.styleId === m.id
                        ? 'bg-neon-deep text-white'
                        : 'bg-bg-soft text-ink-dim hover:bg-hover'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="my-2 h-px bg-mist" />

            {/* camera */}
            <Row label="Pitch">
              <Slider value={s.pitch} min={0} max={85} onChange={(v) => s.set({ pitch: v })} suffix="°" />
            </Row>
            <Row label="Bearing">
              <Slider value={s.bearing} min={0} max={359} onChange={(v) => s.set({ bearing: v })} suffix="°" />
            </Row>

            <div className="my-2 h-px bg-mist" />

            {/* ward layer */}
            <Row label="Extrusion height">
              <Slider value={s.elevationMul} min={0} max={120} onChange={(v) => s.set({ elevationMul: v })} />
            </Row>
            <Row label="Fill opacity">
              <Slider value={s.fillAlpha} min={40} max={255} onChange={(v) => s.set({ fillAlpha: v })} />
            </Row>
            <Row label="Border width">
              <Slider value={s.lineWidth} min={0} max={5} step={0.5} onChange={(v) => s.set({ lineWidth: v })} suffix="px" />
            </Row>
            <Row label="Show borders">
              <Toggle value={s.borders} onChange={(v) => s.set({ borders: v })} />
            </Row>
            <Row label="Wireframe edges">
              <Toggle value={s.wireframe} onChange={(v) => s.set({ wireframe: v })} />
            </Row>

            <div className="my-2 h-px bg-mist" />

            {/* experimental */}
            <Row label="3D terrain (DEM)">
              <Toggle value={s.terrain} onChange={(v) => s.set({ terrain: v })} />
            </Row>
            {s.terrain && (
              <Row label="Terrain exaggeration">
                <Slider
                  value={s.terrainExaggeration}
                  min={0.5}
                  max={3}
                  step={0.1}
                  onChange={(v) => s.set({ terrainExaggeration: v })}
                  suffix="×"
                />
              </Row>
            )}
            <Row label="Hillshade relief">
              <Toggle value={s.hillshade} onChange={(v) => s.set({ hillshade: v })} />
            </Row>
            <Row label="3D buildings">
              <Toggle value={s.buildings3d} onChange={(v) => s.set({ buildings3d: v })} />
            </Row>
            <Row label="Water bodies (lakes & Musi)">
              <Toggle value={s.waterBodies} onChange={(v) => s.set({ waterBodies: v })} />
            </Row>

            <div className="my-2 h-px bg-mist" />

            {/* NASA GIBS satellite time-lapse */}
            <Row label={
              <span className="flex items-center gap-1">
                <Satellite size={12} /> Satellite (NASA)
              </span>
            }>
              <Toggle value={s.satellite} onChange={(v) => s.set({ satellite: v })} />
            </Row>
            {s.satellite && (
              <>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {Object.entries(GIBS_LAYERS).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => s.set({ satelliteIndex: key })}
                      className={`rounded-md px-1.5 py-1 text-[10px] font-semibold transition ${
                        s.satelliteIndex === key
                          ? 'bg-neon-deep text-white'
                          : 'bg-bg-soft text-ink-dim hover:bg-hover'
                      }`}
                    >
                      {cfg.label.split(' · ')[0]}
                    </button>
                  ))}
                </div>
                <Row label="Imagery opacity">
                  <Slider
                    value={Math.round(s.satelliteOpacity * 100)}
                    min={20}
                    max={100}
                    onChange={(v) => s.set({ satelliteOpacity: v / 100 })}
                    suffix="%"
                  />
                </Row>
                <p className="mt-1 text-[10px] leading-snug text-ink-dim">
                  Real MODIS imagery · press <span className="font-semibold text-cyan">▶ Play</span> on the
                  Time Machine to time-lapse {GIBS_LAYERS[s.satelliteIndex]?.label} across the years.
                </p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
