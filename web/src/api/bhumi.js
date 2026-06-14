// One function per Bhumi endpoint (contracts.md frozen v1).
// Each maps a live API call to the sample fixture that satisfies it in mock/fallback mode.
import { getJSON, postJSON, postForm, postBlob, USE_MOCK } from './client.js'

// Stable per-browser session id (persisted) so the backend recalls conversation context across
// reloads — follow-up questions like "and flooding there?" keep working after a refresh.
const SESSION_KEY = 'bhumi-session-id'
const _newSession = () => 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
export function getSessionId() {
  let id = null
  try {
    id = localStorage.getItem(SESSION_KEY)
    if (!id) localStorage.setItem(SESSION_KEY, (id = _newSession()))
  } catch {
    id = id || _newSession()
  }
  return id
}
export function resetSessionId() {
  const id = _newSession()
  try { localStorage.setItem(SESSION_KEY, id) } catch { /* private mode */ }
  return id
}
// POST /clear -> wipe the backend memory for the current session.
export function clearSession() {
  const session_id = getSessionId()
  return postJSON('/clear', { session_id }).catch(() => {})
}

// GET /layers -> { layers: [...] }
export function getLayers() {
  return getJSON('/layers', { mock: 'layers.sample.json' })
}

// GET /wards -> GeoJSON FeatureCollection
export function getWards() {
  return getJSON('/wards', { mock: 'wards.sample.json' })
}

// GET /scorecards?year= -> { year, cards: [...] }
// NOTE: the live API returns a single {year, cards}; the sample fixture is an ARRAY of both
// years, so in mock mode we pick the requested year ourselves.
export async function getScorecards(year = 2026) {
  const data = await getJSON(`/scorecards?year=${year}`, { mock: 'scorecards.sample.json' })
  if (Array.isArray(data)) {
    return data.find((d) => Number(d.year) === Number(year)) ?? data[data.length - 1]
  }
  return data
}

// GET /timeseries?metric= -> { metric, unit, labels, series }
// Sample fixture is an ARRAY of metric objects; pick the requested metric in mock mode.
export async function getTimeseries(metric = 'rainfall') {
  const data = await getJSON(`/timeseries?metric=${metric}`, { mock: 'timeseries.sample.json' })
  if (Array.isArray(data)) {
    return data.find((d) => d.metric === metric) ?? data[0]
  }
  return data
}

// POST /voice (multipart audio) -> { text, lang }. We record + upload 16 kHz mono WAV.
export function postVoice(audioBlob, filename = 'recording.wav') {
  const fd = new FormData()
  fd.append('audio', audioBlob, filename)
  return postForm('/voice', fd, { mock: 'voice.sample.json' })
}

// Demo-safe answer cache: pre-captured /ask responses for the known demo prompts, so the chat is
// instant and works even if Sarvam is slow/down at demo time. Falls through to live for anything else.
let _askCache = null
async function loadAskCache() {
  if (_askCache) return _askCache
  try {
    const res = await fetch('/data/ask_cache.json')
    _askCache = res.ok ? await res.json() : {}
  } catch {
    _askCache = {}
  }
  return _askCache
}
const _normQ = (s) =>
  (s || '').trim().toLowerCase().replace(/[?.!,]+$/, '').replace(/\s+/g, ' ').trim()

// GET /models -> { models: [{id,label,desc}], default }
export function getModels() {
  return getJSON('/models', { mock: 'models.sample.json' }).catch(() => ({
    models: [
      { id: 'sarvam-30b', label: 'Sarvam 30B', desc: 'Fast · tool-calling' },
      { id: 'sarvam-105b', label: 'Sarvam 105B', desc: 'Deeper reasoning' },
    ],
    default: 'sarvam-30b',
  }))
}

// POST /ask -> the action object (the important one). Cache hit → instant; else live; else mock.
// `model` overrides the Sarvam chat model (skips the cache so the chosen model is actually used).
export async function postAsk(text, lang, model) {
  if (!model) {
    const cache = await loadAskCache()
    const hit = cache[_normQ(text)]
    if (hit) return hit
  }
  const body = { text, session_id: getSessionId() }
  if (lang) body.lang = lang
  if (model) body.model = model
  return postJSON('/ask', body, { mock: 'ask.sample.json' })
}

// POST /plan -> budget-aware action plan. No static mock fits (it's parameterized), so callers
// fall back to the client-side planLocally() in lib/planner.js on failure / mock mode.
export function postPlan({ budget, intervention, layer = null, year = 2026 }) {
  return postJSON('/plan', { budget, intervention, layer, year })
}

// POST /tts -> { audio_base64, format, sample_rate }
export function postTts(text, lang = 'en-IN') {
  return postJSON('/tts', { text, lang }, { mock: 'tts.sample.json' })
}

// POST /report -> application/pdf blob (null in mock mode)
export function postReport({ lang = 'en-IN', year = 2026, wards = [], layer = 'heat' }) {
  return postBlob('/report', { lang, year, wards, layer })
}

export { USE_MOCK }
