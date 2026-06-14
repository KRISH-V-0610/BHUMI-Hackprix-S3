import { create } from 'zustand'

// Small cross-component UI state (drawers/overlays) shared outside the dashboard data store.
export const useUI = create((set) => ({
  plannerOpen: false,
  setPlannerOpen: (plannerOpen) => set({ plannerOpen }),
  togglePlanner: () => set((s) => ({ plannerOpen: !s.plannerOpen })),
}))
