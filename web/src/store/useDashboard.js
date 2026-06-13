import { create } from 'zustand'

// Monotonic id for chat messages (module-scoped so it survives re-renders).
let _msgSeq = 0

// Single source of truth for cross-panel dashboard state. Map, tabs, time machine, scorecards,
// top-wards and the Ask choreography all read/write here so the dashboard reacts as one piece.
export const useDashboard = create((set, get) => ({
  // ---- data loaded from the API/mocks ----
  layers: [], // GET /layers -> layers[]
  wards: null, // GET /wards -> FeatureCollection
  scorecards: [], // GET /scorecards cards[]
  timeseries: null, // GET /timeseries
  loading: true,
  liveError: null,

  // ---- view state (what the dashboard is currently showing) ----
  activeLayer: 'heat', // one of flood|heat|veg|lake|urban|water
  year: 2026, // 2016 | 2026
  view: '2.5d', // '2d' | '2.5d' | '3d'
  lang: 'en-IN', // en-IN | hi-IN | te-IN | gu-IN

  // ---- selection / reaction state ----
  highlightWards: [], // ward names to glow + rank
  selectedWard: null, // clicked ward (locks the radar panel)
  focus: null, // camera target { center, zoom, pitch, bearing }

  // ---- Ask Bhumi conversation state ----
  asking: false,
  messages: [], // full chat thread: { id, role: 'user'|'assistant', text, reasoning[], charts[], actions[], status }
  actions: [], // latest answer's actions — mirrored here so the Recommendations panel can read them
  charts: [], // (legacy) latest charts; the thread now keeps charts per-message

  // Append a message and return its id. Assistant turns start as a 'thinking' placeholder.
  addMessage: (msg) => {
    const id = ++_msgSeq
    set((s) => ({
      messages: [
        ...s.messages,
        { id, text: '', reasoning: [], charts: [], actions: [], status: 'done', ...msg },
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
  setActiveLayer: (activeLayer) => set({ activeLayer }),
  setYear: (year) => set({ year: Number(year) }),
  setView: (view) => set({ view }),
  setLang: (lang) => set({ lang }),
  setHighlightWards: (highlightWards) => set({ highlightWards }),
  setSelectedWard: (selectedWard) => set({ selectedWard }),
  setFocus: (focus) => set({ focus }),

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
  applyAskView: ({ set_layer, set_view, year, highlight_wards, focus }) =>
    set((s) => ({
      activeLayer: set_layer ?? s.activeLayer,
      view: set_view ?? s.view,
      year: year != null ? Number(year) : s.year,
      highlightWards: highlight_wards ?? s.highlightWards,
      focus: focus ?? s.focus,
    })),
}))
