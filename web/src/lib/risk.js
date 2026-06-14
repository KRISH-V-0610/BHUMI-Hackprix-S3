// Risk -> color/elevation helpers. All layers share the 0-100 scale (higher = worse risk),
// so heights are comparable across layers and years (contracts.md).

// Parse "#rrggbb" -> [r,g,b].
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}

// Interpolate a legend's color stops (low -> severe) at a 0-100 score.
// legend = [{color,label}, ...] in increasing-severity order.
export function riskToRGB(score, legend, alpha = 200) {
  if (!legend || legend.length === 0) {
    // Fallback ramp: blue -> yellow -> red.
    legend = [
      { color: '#2b83ba' },
      { color: '#ffffbf' },
      { color: '#d7191c' },
    ]
  }
  const stops = legend.map((s) => hexToRgb(s.color))
  const t = Math.max(0, Math.min(1, (score ?? 0) / 100))
  const seg = t * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(seg))
  const f = seg - i
  const [r1, g1, b1] = stops[i]
  const [r2, g2, b2] = stops[i + 1]
  return [lerp(r1, r2, f), lerp(g1, g2, f), lerp(b1, b2, f), alpha]
}

// ---- Vivid shared "heat ramp" -------------------------------------------------------------
// One ramp the whole UI shares so color == severity at a glance: cool teal -> green -> amber
// -> orange -> hot red. Used by the risk pyramid, scorecards, gradient bars and the map fills.
const HEAT_STOPS = [
  { at: 0, color: '#7cb342' },  // green — low (0–40)
  { at: 40, color: '#c0ca33' }, // lime
  { at: 55, color: '#fdd835' }, // yellow — moderate (40–65)
  { at: 72, color: '#fb8c00' }, // orange — high (65–80)
  { at: 86, color: '#e53935' }, // red — severe (80–100)
  { at: 100, color: '#c62828' },// deep red
]

// Score (0-100) -> [r,g,b] on the heat ramp.
export function heatRGB(score) {
  const s = Math.max(0, Math.min(100, score ?? 0))
  let lo = HEAT_STOPS[0]
  let hi = HEAT_STOPS[HEAT_STOPS.length - 1]
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    if (s >= HEAT_STOPS[i].at && s <= HEAT_STOPS[i + 1].at) {
      lo = HEAT_STOPS[i]
      hi = HEAT_STOPS[i + 1]
      break
    }
  }
  const f = (s - lo.at) / (hi.at - lo.at || 1)
  const [r1, g1, b1] = hexToRgb(lo.color)
  const [r2, g2, b2] = hexToRgb(hi.color)
  return [lerp(r1, r2, f), lerp(g1, g2, f), lerp(b1, b2, f)]
}

// Score -> "rgb(...)" / "rgba(...)" string on the heat ramp.
export function heatColor(score, alpha = 1) {
  const [r, g, b] = heatRGB(score)
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// A left-to-right gradient fill for a bar/band of severity `score` (soft head -> full color).
export function heatGradient(score) {
  const [r, g, b] = heatRGB(score)
  return `linear-gradient(90deg, rgba(${r},${g},${b},0.78) 0%, rgb(${r},${g},${b}) 100%)`
}

// A CSS box-shadow "glow" matching a score's heat color (for the worst wards / active tile).
export function heatGlow(score, strength = 0.45) {
  const [r, g, b] = heatRGB(score)
  return `0 4px 18px rgba(${r}, ${g}, ${b}, ${strength})`
}

// ---- Diverging change ramp (Change mode) -------------------------------------------------
// delta = score(now) - score(then). Higher risk = worse, so delta>0 (worsened) -> red,
// delta<0 (improved) -> green, ~0 -> neutral grey. `span` caps the saturation point.
const IMPROVE = [34, 160, 90] // green
const NEUTRAL = [180, 185, 178] // muted grey
const WORSEN = [224, 56, 59] // red
export function divergingRGB(delta, span = 18) {
  const t = Math.max(-1, Math.min(1, (delta ?? 0) / span))
  const to = t >= 0 ? WORSEN : IMPROVE
  const f = Math.abs(t)
  return [lerp(NEUTRAL[0], to[0], f), lerp(NEUTRAL[1], to[1], f), lerp(NEUTRAL[2], to[2], f)]
}

// City-average score for a layer/year across all ward features.
export function cityAverage(features, year, layer) {
  const vals = (features || [])
    .map((f) => wardScore(f.properties, year, layer))
    .filter((v) => typeof v === 'number')
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
}

// The shared CSS gradient string for legends/strips (same stops as HEAT_STOPS).
export const HEAT_CSS = 'linear-gradient(90deg,#7cb342,#c0ca33,#fdd835,#fb8c00,#e53935)'

// Risk -> extruded height (meters) for the 2.5D hero. Matches contracts.md (~ score * 40).
export function getElevation(score, multiplier = 40) {
  return (score ?? 0) * multiplier
}

// Score band -> { label, color } for scorecards/badges.
export function levelOf(score) {
  if (score >= 86) return { label: 'Severe', color: '#c62828' }
  if (score >= 80) return { label: 'High', color: '#e53935' }
  if (score >= 65) return { label: 'High', color: '#fb8c00' }
  if (score >= 40) return { label: 'Moderate', color: '#f4b400' }
  return { label: 'Low', color: '#7cb342' }
}

// Pull a ward's score for the active layer/year out of a GeoJSON feature's properties.
export function wardScore(props, year, layer) {
  return props?.scores?.[year]?.[layer] ?? 0
}

// Rank wards (GeoJSON features) by a layer/year score, descending. Returns plain objects.
export function rankWards(featureCollection, year, layer, topN = 5) {
  const feats = featureCollection?.features ?? []
  return feats
    .map((f) => ({
      name: f.properties.name,
      ward_no: f.properties.ward_no,
      centroid: f.properties.centroid,
      score: wardScore(f.properties, year, layer),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}
