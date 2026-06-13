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

// Risk -> extruded height (meters) for the 2.5D hero. Matches contracts.md (~ score * 40).
export function getElevation(score, multiplier = 40) {
  return (score ?? 0) * multiplier
}

// Score band -> { label, color } for scorecards/badges.
export function levelOf(score) {
  if (score >= 85) return { label: 'Very High', color: '#d7191c' }
  if (score >= 70) return { label: 'High', color: '#ff7f0e' }
  if (score >= 50) return { label: 'Moderate', color: '#ffb300' }
  if (score >= 30) return { label: 'Low', color: '#74add1' }
  return { label: 'Very Low', color: '#2b83ba' }
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
