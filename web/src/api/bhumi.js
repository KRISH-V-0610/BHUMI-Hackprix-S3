// One function per Bhumi endpoint (contracts.md frozen v1).
// Each maps a live API call to the sample fixture that satisfies it in mock/fallback mode.
import { getJSON, postJSON, postForm, postBlob, USE_MOCK } from './client.js'

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

// POST /ask -> the action object (the important one)
export function postAsk(text, lang) {
  return postJSON('/ask', lang ? { text, lang } : { text }, { mock: 'ask.sample.json' })
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
