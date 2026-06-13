import { create } from 'zustand'

// The mode-driven workspace: one question's worth of UI at a time.
//   explore — "what's the state?"  (pyramid + metric strip; absolute risk colors)
//   change  — "what changed where?" (diverging delta colors + swipe/compare)
//   plan    — "what do I do?"        (budget-aware Action Planner)
export const useWorkspace = create((set) => ({
  mode: 'explore', // 'explore' | 'change' | 'plan'
  compareYear: 2016, // the "before" year used by Change mode
  plannerIntervention: 'tree_cover', // seeded intervention for the Action Planner (e.g. from the flood scenario)
  setMode: (mode) => set({ mode }),
  setCompareYear: (compareYear) => set({ compareYear: Number(compareYear) }),
  setPlannerIntervention: (plannerIntervention) => set({ plannerIntervention }),
}))
