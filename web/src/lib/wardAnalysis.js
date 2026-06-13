// Client-side dynamic ward analysis — turns a ward's data into a rich markdown briefing for the
// chat (instant, offline-safe). Plus contextual prompt suggestions per ward / layer.
import { wardScore } from './risk.js'

const LABELS = {
  heat: 'Heat stress', flood: 'Flood risk', veg: 'Vegetation loss',
  lake: 'Lake health', urban: 'Urban growth', water: 'Waterlogging',
}
const ACTIONS = {
  heat: 'cool roofs + arterial tree planting',
  flood: 'de-silt drains & clear nala encroachment',
  veg: 'protect green cover & mandate tree planting in approvals',
  lake: 'restore & fence the lake, stop sewage inflow',
  urban: 'enforce permeable-surface norms in new construction',
  water: 'build recharge pits in the ponding hotspots',
}
const DIMS = ['heat', 'flood', 'veg', 'lake', 'urban', 'water']

const levelOf = (s) => (s >= 85 ? 'very high' : s >= 70 ? 'high' : s >= 55 ? 'moderate' : s >= 30 ? 'low' : 'very low')

// A markdown briefing (heading + table + drivers + recommendation) for one ward.
export function analyzeWardMarkdown(feature, year = 2026, baseYear = 2016) {
  const p = feature.properties
  const sc = p.scores?.[year] || {}
  const base = p.scores?.[baseYear] || {}
  const ranked = DIMS.map((d) => ({ d, v: sc[d] ?? 0 })).sort((a, b) => b.v - a.v)
  const worst = ranked[0]
  const delta = worst.v - (base[worst.d] ?? worst.v)
  const dr = p.drivers || {}
  const rows = ranked.map((r) => `| ${LABELS[r.d]} | ${r.v} | ${levelOf(r.v)} |`).join('\n')

  return `## ${p.name} — Ward ${p.ward_no}
**${LABELS[worst.d]} is the top concern — ${worst.v}/100 (${levelOf(worst.v)})**, ${
    delta >= 0 ? `up +${delta}` : `down ${delta}`
  } since ${baseYear}.

| Dimension | Score | Level |
|---|---|---|
${rows}

**Drivers:** built-up ${Math.round((dr.density ?? 0) * 100)}% · green ${Math.round((dr.green ?? 0) * 100)}% · low-lying ${Math.round((dr.low_lying ?? 0) * 100)}%

**Recommended first move:** ${ACTIONS[worst.d]}.`
}

// The worst dimension of a ward (used to switch the map layer on analysis).
export function worstLayer(feature, year = 2026) {
  const sc = feature.properties.scores?.[year] || {}
  return DIMS.map((d) => ({ d, v: sc[d] ?? 0 })).sort((a, b) => b.v - a.v)[0].d
}

// Contextual prompt chips. When a ward is selected → ward-specific; else → layer-specific.
export function suggestPrompts({ ward, layer = 'heat' } = {}) {
  if (ward) {
    return [
      `Why is ${ward} at risk?`,
      `What if we add 20% tree cover to ${ward}?`,
      `How has ${ward} changed since 2016?`,
    ]
  }
  const L = LABELS[layer]?.toLowerCase() || 'heat'
  return [
    `Which wards have the worst ${layer}?`,
    `Where should I spend ₹5 crore on tree cover?`,
    `How has ${layer} changed since 2016?`,
  ]
}
