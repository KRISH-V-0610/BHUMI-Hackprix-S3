// Thin fetch wrapper around the Bhumi Python API (contracts.md).
// Two modes, controlled by env:
//   VITE_USE_MOCK=true  -> never hit the network; read /public/data/*.sample.json
//   VITE_USE_MOCK=false -> hit VITE_API_BASE; on ANY error, fall back to the matching mock.
// The contract mandates the demo degrade to sample data on error, so live mode is mock-backed too.

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
export const USE_MOCK = String(import.meta.env.VITE_USE_MOCK ?? 'true') === 'true'

const MOCK_BASE = '/data'

async function readMock(name) {
  const res = await fetch(`${MOCK_BASE}/${name}`)
  if (!res.ok) throw new Error(`mock ${name} ${res.status}`)
  return res.json()
}

// GET JSON with mock fallback. `mock` is the sample filename that satisfies this call.
export async function getJSON(path, { mock } = {}) {
  if (USE_MOCK) return readMock(mock)
  try {
    const res = await fetch(`${API_BASE}${path}`)
    if (!res.ok) throw new Error(`${path} ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn(`[bhumi] GET ${path} failed, using mock ${mock}:`, err.message)
    if (mock) return readMock(mock)
    throw err
  }
}

// POST JSON with mock fallback.
export async function postJSON(path, body, { mock } = {}) {
  if (USE_MOCK) return readMock(mock)
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${path} ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn(`[bhumi] POST ${path} failed, using mock ${mock}:`, err.message)
    if (mock) return readMock(mock)
    throw err
  }
}

// POST multipart (used by /voice). Falls back to a mock JSON on failure.
export async function postForm(path, formData, { mock } = {}) {
  if (USE_MOCK) return readMock(mock)
  try {
    const res = await fetch(`${API_BASE}${path}`, { method: 'POST', body: formData })
    if (!res.ok) throw new Error(`${path} ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn(`[bhumi] POST(form) ${path} failed, using mock ${mock}:`, err.message)
    if (mock) return readMock(mock)
    throw err
  }
}

// POST returning a binary blob (used by /report). No mock fallback (returns null in mock mode).
export async function postBlob(path, body) {
  if (USE_MOCK) return null
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.blob()
}

export { API_BASE }
