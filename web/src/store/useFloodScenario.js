import { create } from 'zustand'
import { buildFloodScenario } from '../lib/floodScenario.js'
import { useDashboard } from './useDashboard.js'

// Drives the Musi-river monsoon flood scenario: `time` advances via rAF (frame timestamp, so no
// Date.now needed); ClimateMap reads it to flow the river pulse + progressively flood bank wards,
// while the camera traces downstream and then pulls back to reveal the at-risk + future wards.
let raf = null
let timers = []

export const useFloodScenario = create((set, get) => ({
  active: false,
  time: 0,
  data: null,

  run: async (wards, year, flyTo) => {
    const data = await buildFloodScenario(wards, year)
    if (!data) return
    cancelAnimationFrame(raf)
    timers.forEach(clearTimeout)
    timers = []
    set({ active: true, time: 0, data })

    // Highlight the affected wards (glow ring + popups + side-rail ranking).
    useDashboard.getState().setHighlightWards(data.floodWards.map((w) => w.name))

    // City-constrained camera: trace through the affected WARD centroids (always inside the city),
    // then pull back to the whole city — so it never gets stuck on a river endpoint outside town.
    const cen = data.floodWards.map((w) => w.centroid)
    const pick = (f) => cen[Math.max(0, Math.min(cen.length - 1, Math.round(f * (cen.length - 1))))]
    const feats = wards?.features || []
    const cx = feats.reduce((s, f) => s + f.properties.centroid[0], 0) / (feats.length || 1)
    const cy = feats.reduce((s, f) => s + f.properties.centroid[1], 0) / (feats.length || 1)

    flyTo?.({ center: pick(0), zoom: 12.2, pitch: 56, bearing: 16 })
    timers.push(setTimeout(() => get().active && flyTo?.({ center: pick(0.4), zoom: 12.0, pitch: 54, bearing: 20 }), 2600))
    timers.push(setTimeout(() => get().active && flyTo?.({ center: pick(0.8), zoom: 11.8, pitch: 52, bearing: 14 }), 5200))
    timers.push(setTimeout(() => get().active && flyTo?.({ center: [cx, cy], zoom: 10.7, pitch: 46, bearing: 10 }), 7800))

    let last = null
    const step = (ts) => {
      if (!get().active) return
      if (last == null) last = ts
      const next = get().time + ((ts - last) / 1000) * 16 // ~7.5s for the full trace
      last = ts
      if (next >= get().data.duration) {
        set({ time: get().data.duration }) // hold the finished state
        return
      }
      set({ time: next })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  },

  stop: () => {
    cancelAnimationFrame(raf)
    timers.forEach(clearTimeout)
    timers = []
    useDashboard.getState().setHighlightWards([])
    set({ active: false, time: 0, data: null })
  },
}))
