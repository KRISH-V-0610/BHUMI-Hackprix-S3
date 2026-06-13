import { create } from 'zustand'
import { buildFloodScenario } from '../lib/floodScenario.js'

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

    // POV camera trace downstream along the real river, then pull back to show the whole spread.
    const r = data.river
    const at = (f) => r[Math.max(0, Math.min(r.length - 1, Math.floor(f * (r.length - 1))))]
    flyTo?.({ center: at(0), zoom: 12.6, pitch: 58, bearing: 16 })
    timers.push(setTimeout(() => get().active && flyTo?.({ center: at(0.35), zoom: 12.4, pitch: 56, bearing: 22 }), 2600))
    timers.push(setTimeout(() => get().active && flyTo?.({ center: at(0.7), zoom: 12.2, pitch: 54, bearing: 18 }), 5200))
    timers.push(setTimeout(() => get().active && flyTo?.({ center: at(0.5), zoom: 10.9, pitch: 46, bearing: 10 }), 7800))

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
    set({ active: false, time: 0, data: null })
  },
}))
