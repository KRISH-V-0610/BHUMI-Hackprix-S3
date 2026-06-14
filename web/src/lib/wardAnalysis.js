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

// Context-aware prompt chips. Each is { kind, text } so the UI can show a matching icon.
// `kind` ∈ why | sim | trend | plan | rank | compare. When a ward is selected the chips become
// ward-specific; otherwise they adapt to the active layer (real Hyderabad framing).
const _PER_LAYER = {
  flood: [
    { kind: 'rank', text: 'Which wards have the worst flood risk?' },
    { kind: 'why',  text: 'Why is the Musi belt so flood-prone?' },
    { kind: 'plan', text: 'Where to spend ₹10 crore on drainage?' },
  ],
  heat: [
    { kind: 'rank', text: 'Which wards face the worst heat stress?' },
    { kind: 'why',  text: 'Why is the old city a heat island?' },
    { kind: 'plan', text: 'Where to spend ₹10 crore on cool roofs?' },
  ],
  veg: [
    { kind: 'rank', text: 'Which wards lost the most green cover?' },
    { kind: 'why',  text: 'Why is vegetation shrinking?' },
    { kind: 'plan', text: 'Where should we add tree cover first?' },
  ],
  lake: [
    { kind: 'rank', text: 'Which lakes are most degraded?' },
    { kind: 'why',  text: 'Why are Hyderabad’s lakes shrinking?' },
    { kind: 'plan', text: 'Where to invest in lake restoration?' },
  ],
  urban: [
    { kind: 'rank',    text: 'Where is built-up growth fastest?' },
    { kind: 'why',     text: 'Why is urban sprawl a climate risk?' },
    { kind: 'trend',   text: 'How much has the city built up since 2016?' },
  ],
  water: [
    { kind: 'rank', text: 'Worst waterlogging hotspots?' },
    { kind: 'why',  text: 'Why do these areas pond every monsoon?' },
    { kind: 'plan', text: 'Where should we build recharge pits?' },
  ],
}

export function suggestPrompts({ ward, layer = 'flood' } = {}) {
  if (ward) {
    return [
      { kind: 'why',   text: `Why is ${ward} at risk?` },
      { kind: 'sim',   text: `What if we add 20% tree cover to ${ward}?` },
      { kind: 'trend', text: `How has ${ward} changed since 2016?` },
      { kind: 'plan',  text: `Best first move for ${ward}?` },
    ]
  }
  const base = _PER_LAYER[layer] || _PER_LAYER.flood
  return [...base, { kind: 'compare', text: 'Compare 2016 vs 2026' }]
}
