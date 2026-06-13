// Client-side mirror of the backend `plan_interventions` (backend/tools.py) — used as a graceful
// fallback so the Action Planner works even when the Python API is down (demo-safe). Same shape.
import { wardScore } from './risk.js'

const CITY_POPULATION = 10_500_000
const SEVERE = 70
const MAG = 15 // default intervention magnitude (%)

// Effect coefficients + first-order ₹ unit costs — mirror of backend INTERVENTIONS.
export const INTERVENTIONS = {
  tree_cover: { label: 'Increase tree / green cover', cost: 25_000_000, effects: { heat: -0.45, veg: -0.7, water: -0.1 } },
  cool_roof: { label: 'Cool reflective roofs', cost: 15_000_000, effects: { heat: -0.55 } },
  permeable_surface: { label: 'Permeable surfaces & green roofs', cost: 30_000_000, effects: { flood: -0.5, water: -0.55, urban: -0.2 } },
  drain_desilt: { label: 'De-silt & widen storm drains', cost: 20_000_000, effects: { flood: -0.7, water: -0.65 } },
  lake_restore: { label: 'Restore lakes & wetlands', cost: 40_000_000, effects: { lake: -0.7, water: -0.2 } },
}

function polyAreaKm2(coordinates) {
  const ring = coordinates?.[0]
  if (!ring || ring.length < 4) return 0
  let s = 0
  for (let i = 0; i < ring.length - 1; i++) {
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  const areaDeg2 = Math.abs(s) / 2
  const lat = ring[0][1]
  return areaDeg2 * 110.574 * (111.32 * Math.cos((lat * Math.PI) / 180))
}

// name -> modeled population, density-weighted by area, calibrated to ~city total.
function populationIndex(features) {
  const raw = features.map((f) => {
    const d = f.properties?.drivers?.density ?? 0.6
    return { name: f.properties.name, w: polyAreaKm2(f.geometry?.coordinates) * (0.4 + d) }
  })
  const total = raw.reduce((a, r) => a + r.w, 0) || 1
  const idx = {}
  raw.forEach((r) => (idx[r.name] = Math.round((CITY_POPULATION * r.w) / total)))
  return idx
}

export function planLocally(wards, { budget = 50_000_000, intervention = 'tree_cover', layer = null, year = 2026 } = {}) {
  const spec = INTERVENTIONS[intervention]
  const feats = wards?.features || []
  if (!spec || !feats.length) return { error: 'no data', picked: [], wards_funded: 0, total_cost: 0 }

  const effects = spec.effects
  const primary = layer && effects[layer] ? layer : Object.keys(effects).reduce((a, b) => (Math.abs(effects[b]) > Math.abs(effects[a]) ? b : a))
  const perPct = effects[primary]
  const baseCost = spec.cost
  const pop = populationIndex(feats)
  const popVals = Object.values(pop)
  const avgPop = popVals.reduce((a, b) => a + b, 0) / (popVals.length || 1) || 1

  const ranked = feats
    .map((f) => {
      const name = f.properties.name
      const before = wardScore(f.properties, year, primary)
      // relative effect: cuts more where risk is higher (more headroom) -> worst wards prioritised
      const after = Math.max(5, Math.min(98, Math.round(before * (1 + (perPct * MAG) / 100))))
      const drop = before - after
      const population = pop[name] || 0
      // cost scales with population served
      const scale = Math.max(0.5, Math.min(2.0, population / avgPop))
      const cost = Math.round((baseCost * scale) / 1e5) * 1e5
      return { ward: name, before, after, delta: after - before, drop, population, cost, centroid: f.properties.centroid, ipr: cost ? (drop * population) / cost : 0 }
    })
    .sort((a, b) => b.ipr - a.ipr)

  const picked = []
  let spent = 0
  let peopleOut = 0
  for (const r of ranked) {
    if (spent + r.cost > budget) continue
    picked.push(r)
    spent += r.cost
    if (r.before >= SEVERE && r.after < SEVERE) peopleOut += r.population
  }
  const avgDrop = picked.length ? Math.round((picked.reduce((a, r) => a + r.drop, 0) / picked.length) * 10) / 10 : 0

  return {
    intervention, label: spec.label, layer: primary, budget, year, unit_cost: baseCost, magnitude: MAG,
    wards_funded: picked.length, total_cost: spent, avg_risk_drop: avgDrop, people_out_of_severe: peopleOut,
    picked: picked.map(({ ward, cost, before, after, delta, population, centroid }) => ({ ward, cost, before, after, delta, population, centroid })),
    note: 'First-order estimate: effect sizes from literature, cost scales with ward area, population modeled.',
    _local: true,
  }
}

// What-if for a single ward: apply an intervention's relative effect to its scores. Returns the
// per-layer before/after so the drill-down can morph the radar. Mirrors the planner's effect model.
export function simulateWard(scores, intervention, mag = 15) {
  const spec = INTERVENTIONS[intervention]
  if (!spec || !scores) return null
  const changes = {}
  for (const [layer, perPct] of Object.entries(spec.effects)) {
    const before = scores[layer]
    if (typeof before !== 'number') continue
    const after = Math.max(5, Math.min(98, Math.round(before * (1 + (perPct * mag) / 100))))
    changes[layer] = { before, after, delta: after - before }
  }
  return { intervention, label: spec.label, changes }
}

// ₹ formatter — Indian crore/lakh for readability.
export function formatINR(n) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n % 1e7 === 0 ? 0 : 1)} cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(0)} L`
  return `₹${n.toLocaleString('en-IN')}`
}
