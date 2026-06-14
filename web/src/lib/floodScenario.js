// Monsoon flood SCENARIO (not a hydraulic sim) — grounded in the real Musi river geometry (OSM)
// + real ward flood scores + the low-lying driver. Traces the river downstream, floods the
// low-lying bank wards in order, and marks wards whose flood risk RISES by the forecast year.
import { wardScore } from './risk.js'

let _river = null
async function loadRiver() {
  if (_river) return _river
  try {
    const fc = await (await fetch('/data/water_bodies.geojson')).json()
    const rivers = (fc.features || []).filter(
      (f) => f.properties?.kind === 'river' && f.geometry?.type === 'LineString'
    )
    rivers.sort((a, b) => b.geometry.coordinates.length - a.geometry.coordinates.length)
    _river = rivers[0]?.geometry?.coordinates || []
  } catch {
    _river = []
  }
  return _river
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
function nearestIndex(pt, path) {
  let best = 0
  let bd = Infinity
  for (let i = 0; i < path.length; i++) {
    const d = dist2(pt, path[i])
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return best
}

export async function buildFloodScenario(wards, year = 2026, futureYear = 2028) {
  const river = await loadRiver()
  const feats = wards?.features || []
  if (feats.length < 2 || river.length < 2) return null

  // Wards near the river or high-flood, ranked by flood × low-lying, ordered DOWNSTREAM by river index.
  const near = feats.map((f) => {
    const p = f.properties
    const idx = nearestIndex(p.centroid, river)
    return {
      name: p.name,
      centroid: p.centroid,
      idx,
      d: Math.sqrt(dist2(p.centroid, river[idx])),
      flood: wardScore(p, year, 'flood'),
      priority: wardScore(p, year, 'flood') * 0.65 + (p.drivers?.low_lying || 0) * 100 * 0.35,
    }
  })
  const floodWards = near
    .filter((w) => w.d < 0.06 || w.flood >= 70)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 14)
    .sort((a, b) => a.idx - b.idx) // downstream order
  floodWards.forEach((w, i) => (w.t = floodWards.length > 1 ? (i / (floodWards.length - 1)) * 100 : 0))

  // Future potential flood POINTS: wards whose flood risk rises by the forecast year (not already
  // flooding now). Returned with centroids so the map can drop pulsing "potential" markers.
  const flooding = new Set(floodWards.map((w) => w.name))
  const future = feats
    .map((f) => ({
      name: f.properties.name,
      centroid: f.properties.centroid,
      rise: wardScore(f.properties, futureYear, 'flood') - wardScore(f.properties, year, 'flood'),
      fut: wardScore(f.properties, futureYear, 'flood'),
    }))
    // forecast high-risk = risk climbs by 2028, OR already projected high and not flooding yet
    .filter((w) => !flooding.has(w.name) && (w.rise >= 2 || w.fut >= 72))
    .sort((a, b) => b.fut + b.rise * 2 - (a.fut + a.rise * 2))
    .slice(0, 9)

  return { river, floodWards, future, futureYear, duration: 120 }
}
