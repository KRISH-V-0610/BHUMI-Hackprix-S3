import { create } from 'zustand'

// Drives "Story Mode" — the guided, cinematic walkthrough for judges. While active, the dashboard
// reveals itself one beat at a time: every beat sets a `focus` region (the rest dims) and a caption.
// The beat runner (lib/storyScript.js) awaits `waitDwell()` between beats so Next / Esc can skip.
export const useStory = create((set, get) => ({
  active: false,
  step: 0,
  total: 8, // number of beats (see storyScript.js)
  focus: null, // 'map' | 'wards' | 'chat' | 'recs' | null
  caption: '',
  title: null, // { head, sub } for full-screen title cards, else null
  _resolveDwell: null, // resolver for the current beat's dwell promise

  start: () => set({ active: true, step: 0, focus: null, caption: '', title: null }),

  exit: () => {
    const r = get()._resolveDwell
    set({ active: false, focus: null, caption: '', title: null, _resolveDwell: null })
    if (r) r('abort')
  },

  // Skip the current beat's remaining dwell time and advance.
  next: () => {
    const r = get()._resolveDwell
    if (r) {
      set({ _resolveDwell: null })
      r('next')
    }
  },

  setBeat: (patch) => set(patch),

  // Resolve after `ms`, OR early when next()/exit() is called. Returns the reason.
  waitDwell: (ms) =>
    new Promise((resolve) => {
      set({ _resolveDwell: resolve })
      setTimeout(() => {
        if (get()._resolveDwell === resolve) {
          set({ _resolveDwell: null })
          resolve('timeout')
        }
      }, ms)
    }),
}))
