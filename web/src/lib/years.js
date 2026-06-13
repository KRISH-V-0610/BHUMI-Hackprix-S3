// The backend only ships 2016 + 2026 (plus 2027/2028 forecasts). The Time Machine wants finer
// steps, so we synthesize the in-between years by linearly interpolating each ward's per-layer
// scores between 2016 and 2026. Frontend-only enrichment — works in both mock and live mode.

export const BASE_FROM = 2016
export const BASE_TO = 2026
export const INTERP_YEARS = [2018, 2020, 2022, 2024]
export const TIMELINE_YEARS = [2016, 2018, 2020, 2022, 2024, 2026]

const clamp01 = (t) => Math.max(0, Math.min(1, t))
const tFor = (year) => clamp01((Number(year) - BASE_FROM) / (BASE_TO - BASE_FROM))

// Interpolate every numeric field of two same-shaped score objects.
function lerpScores(a, b, t) {
  const out = {}
  for (const k of Object.keys(a)) {
    out[k] =
      typeof a[k] === 'number' && typeof b[k] === 'number'
        ? Math.round(a[k] + (b[k] - a[k]) * t)
        : a[k]
  }
  return out
}

// Add scores[2018..2024] to each ward feature (in place) if missing.
export function enrichWards(wards) {
  if (!wards?.features) return wards
  for (const f of wards.features) {
    const sc = f.properties?.scores
    const a = sc?.[BASE_FROM]
    const b = sc?.[BASE_TO]
    if (!a || !b) continue
    for (const y of INTERP_YEARS) {
      if (!sc[y]) sc[y] = lerpScores(a, b, tFor(y))
    }
  }
  return wards
}

// Interpolate the overall scorecards between the 2016 and 2026 sets for an in-between year.
export function interpCards(cards2016, cards2026, year) {
  const t = tFor(year)
  return (cards2016 || []).map((c) => {
    const hi = (cards2026 || []).find((h) => h.id === c.id) || c
    const score = Math.round(c.score + (hi.score - c.score) * t)
    // drop the baseline `level` so the panel recomputes it from the new score
    const { level, ...rest } = c // eslint-disable-line no-unused-vars
    return { ...rest, score, delta_since_2016: score - c.score }
  })
}

// Pick the right scorecards for any timeline year (exact endpoints, else interpolate).
export function cardsForYear(year, cards2016, cards2026) {
  const y = Number(year)
  if (y === BASE_FROM) return cards2016 || []
  if (y === BASE_TO) return cards2026 || []
  return interpCards(cards2016, cards2026, y)
}
