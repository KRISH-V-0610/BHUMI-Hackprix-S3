// "Island" mask: a big polygon covering the region with a Hyderabad-shaped HOLE cut out, so a
// dark curtain hides everything outside the city — the floating-island look from the concept art.
// The hole is the convex hull of every ward vertex (Andrew's monotone chain), nudged outward a
// touch so it doesn't clip ward borders. No external geometry library needed.

function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

// The city outline (closed ring), expanded ~`expand` fraction outward from its centroid.
export function cityHull(wards, expand = 0.05) {
  const pts = []
  for (const f of wards?.features || []) {
    for (const ring of f.geometry?.coordinates || []) {
      for (const p of ring) pts.push(p)
    }
  }
  if (pts.length < 3) return []
  const h = convexHull(pts)
  const c = h.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]).map((v) => v / h.length)
  const ring = h.map((p) => [c[0] + (p[0] - c[0]) * (1 + expand), c[1] + (p[1] - c[1]) * (1 + expand)])
  ring.push(ring[0]) // close
  return ring
}

// Polygon-with-hole: [ outerRegionRing, cityHoleRing ]. Fill it dark to mask outside the city.
export function cityMaskPolygon(wards, expand = 0.14) {
  const hole = cityHull(wards, expand)
  if (!hole.length) return null
  // A region box large enough to cover the viewport at any city-level zoom.
  const outer = [
    [70, 12],
    [86, 12],
    [86, 22],
    [70, 22],
    [70, 12],
  ]
  return [outer, hole]
}
