import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Single source of truth for cross-panel dashboard state. Map, tabs, time machine, scorecards,
// top-wards and the Ask choreography all read/write here so the dashboard reacts as one piece.
// The chat thread (`messages`) is persisted to localStorage so history survives a reload.
export const useDashboard = create(persist((set, get) => ({
  // ---- data loaded from the API/mocks ----
  layers: [], // GET /layers -> layers[]
  wards: null, // GET /wards -> FeatureCollection
  scorecards: [], // GET /scorecards cards[]
  timeseries: null, // GET /timeseries
  loading: true,
  liveError: null,

  // ---- view state (what the dashboard is currently showing) ----
  activeLayer: 'flood', // one of flood|heat|veg|lake|urban|water (4 shown: flood/heat/lake/veg)
  year: 2026, // 2016 | 2026
  view: '2.5d', // '2d' | '2.5d' | '3d'
  lang: 'en-IN', // en-IN | hi-IN | te-IN | gu-IN
  model: 'sarvam-30b', // selected Sarvam chat model

  // ---- selection / reaction state ----
  highlightWards: [], // ward names to glow + rank
  selectedWard: null, // clicked ward (locks the radar panel)
  focus: null, // camera target { center, zoom, pitch, bearing }
  plan: null, // latest Action Planner result (drives map ₹/impact badges)
  map: null, // MapLibre instance (set on load) — used to project ward popups to screen

  // ---- Ask Bhumi conversation state ----
  asking: false,
  messages: [], // full chat thread: { id, role: 'user'|'assistant', text, reasoning[], charts[], actions[], status }
  actions: [], // latest answer's actions — mirrored here so the Recommendations panel can read them
  charts: [], // (legacy) latest charts; the thread now keeps charts per-message

  // Append a message and return its id. Assistant turns start as a 'thinking' placeholder.
  // id = max existing id + 1, so it never collides with ids restored from localStorage.
  addMessage: (msg) => {
    const id = get().messages.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1
    set((s) => ({
      messages: [
        ...s.messages,
        { id, text: '', reasoning: [], charts: [], actions: [], evidence: null, status: 'done', ...msg },
      ],
    }))
    return id
  },
  // Patch a single message in place (used by the choreography to stream an answer in).
  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  clearChat: () => set({ messages: [], actions: [], charts: [] }),

  // ---- setters ----
  // time-machine play state (drives SpectralPanel visibility)
  tmPlaying: false,
  setTmPlaying: (tmPlaying) => set({ tmPlaying }),

  setActiveLayer: (activeLayer) => set({ activeLayer }),
  setYear: (year) => set({ year: Number(year) }),
  setView: (view) => set({ view }),
  setLang: (lang) => set({ lang }),
  setModel: (model) => set({ model }),
  setHighlightWards: (highlightWards) => set({ highlightWards }),
  setSelectedWard: (selectedWard) => set({ selectedWard }),
  setFocus: (focus) => set({ focus }),
  setPlan: (plan) => set({ plan }),

  setData: (patch) => set(patch),

  // Convenience: the legend of the currently active layer/year (for the map color ramp).
  activeLegend: () => {
    const { layers, activeLayer, year } = get()
    const match =
      layers.find((l) => l.id === activeLayer && Number(l.year) === Number(year)) ||
      layers.find((l) => l.id === activeLayer)
    return match?.legend ?? null
  },

  // Apply a /ask action object's view fields (used by the choreography).
  // View is locked to 2.5D (2D/3D removed), so set_view from the agent is intentionally ignored.
  applyAskView: ({ set_layer, set_view, year, highlight_wards, focus }) =>
    set((s) => ({
      activeLayer: set_layer ?? s.activeLayer,
      view: '2.5d',
      year: year != null ? Number(year) : s.year,
      highlightWards: highlight_wards ?? s.highlightWards,
      focus: focus ?? s.focus,
    })),
}), {
  name: 'bhumi-chat',
  storage: createJSONStorage(() => localStorage),
  // Persist ONLY the chat thread (drop in-flight 'thinking' placeholders so a reload mid-answer
  // doesn't restore a stuck spinner). Map instance, layers, etc. are intentionally not persisted.
  partialize: (s) => ({
    messages: s.messages.filter((m) => m.status !== 'thinking'),
  }),
}))
