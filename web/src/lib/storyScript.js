// The guided demo narrative — the product's arc: SEE → ASK → PLAN → JUSTIFY. Each beat sets a
// focus region + caption (useStory), switches the workspace mode, and drives the real dashboard
// (map, layer, highlights, agent, planner). Beats await a skippable dwell (Next / Esc).
import { useDashboard } from '../store/useDashboard.js'
import { useStory } from '../store/useStory.js'
import { useWorkspace } from '../store/useWorkspace.js'
import { useFloodScenario } from '../store/useFloodScenario.js'
import { useUI } from '../store/useUI.js'
import { postAsk } from '../api/bhumi.js'
import { runChoreography } from './choreography.js'

const CITY = { center: [78.456, 17.42], zoom: 10.6, pitch: 55, bearing: 18 }
const OLD_CITY = { center: [78.474, 17.361], zoom: 12.1, pitch: 58, bearing: 22 } // Charminar belt

// One simple, relatable question that demonstrates the WHOLE app in a single shot: the agent
// reasons, lights up the map, answers in plain language, lists actions, AND cites its sources
// (Evidence card). Cached in ask_cache.json, so it's instant and demo-safe.
const DEMO_Q = 'Why is Malakpet flood-prone?'

const dash = () => useDashboard.getState()
const story = () => useStory.getState()
const work = () => useWorkspace.getState()
const beat = (patch) => story().setBeat(patch)

async function hold(ms) {
  const reason = await story().waitDwell(ms)
  return reason !== 'abort' && story().active
}

// Reset everything the story touched, on ANY exit path (finish, Esc, or interrupt) — so the map
// never stays "stuck" on the flood scenario / highlights / open planner after the tour.
function cleanup() {
  useFloodScenario.getState().stop()
  useUI.getState().setPlannerOpen(false)
  dash().setHighlightWards([])
  work().setMode('explore')
}

// ASK climax: post a real question and let the existing choreography stream it into the chat + map.
async function autoAsk(q) {
  const d = dash()
  d.addMessage({ role: 'user', text: q })
  const id = d.addMessage({ role: 'assistant', status: 'thinking' })
  d.setData({ asking: true })
  try {
    const res = await postAsk(q, d.lang)
    await runChoreography(res, { flyTo: dash().flyTo, messageId: id })
  } catch {
    d.updateMessage(id, {
      status: 'done',
      text: 'Malakpet is the worst flood ward (85/100): it sits in the low-lying Musi flood plain and its storm-water drains are encroached and under-capacity. De-silting and widening the nalas before monsoon is the highest-impact fix.',
    })
    d.setData({ asking: false })
  }
}

export async function runStory() {
  const d = dash()
  d.clearChat()
  work().setMode('explore')

  try {
    // 0 — title.
    beat({ step: 0, focus: null, title: { head: 'Bhumi', sub: 'The Climate Action Twin for Hyderabad' }, caption: '' })
    if (!(await hold(3000))) return story().exit()

    // 1 — SEE: the canvas.
    work().setMode('explore')
    d.setActiveLayer('heat')
    d.setData({ year: 2026, view: '2.5d' })
    d.setHighlightWards([])
    dash().flyTo?.(CITY)
    beat({ step: 1, focus: 'map', title: null, caption: 'SEE — 50 wards, 6 climate dimensions, on a real basemap.' })
    if (!(await hold(4000))) return story().exit()

    // 2 — SEE the change: diverging deltas (Change mode).
    work().setMode('change')
    beat({ step: 2, focus: 'map', caption: 'What changed since 2016 — red wards worsened, green improved.' })
    if (!(await hold(4200))) return story().exit()

    // 3 — THREAT: the monsoon flood scenario traces the real Musi river.
    work().setMode('explore')
    d.setActiveLayer('flood')
    d.setData({ view: '2.5d' })
    beat({ step: 3, focus: 'map', caption: 'The monsoon threat — flooding traces the Musi; low-lying wards go under.' })
    useFloodScenario.getState().run(d.wards, d.year, dash().flyTo)
    if (!(await hold(7500))) return story().exit()

    // 4 — ASK: one plain-language question → the agent reasons, acts on the map, and CITES sources.
    // FIRST fully reset the flood scenario (stop overlay + clear highlights + recentre on the city),
    // so the chat/answer never starts "stuck" on the flood trace from the previous beat.
    useFloodScenario.getState().stop()
    work().setMode('explore')
    d.setHighlightWards([])
    dash().flyTo?.(CITY)
    await new Promise((r) => setTimeout(r, 350)) // let the camera/layers settle
    beat({ step: 4, focus: 'chat', caption: 'ASK — just type a question, e.g. “Why is Malakpet flood-prone?” — Bhumi reasons, answers, and cites its sources.' })
    await autoAsk(DEMO_Q)
    if (!(await hold(4200))) return story().exit()

    // 5 — PLAN: OPEN the Action Planner (useUI), pre-pick the flood intervention, fund by impact/₹.
    d.setHighlightWards([])
    work().setMode('plan')
    work().setPlannerIntervention?.('drain_desilt')
    useUI.getState().setPlannerOpen(true)
    dash().flyTo?.(CITY)
    beat({ step: 5, focus: 'wards', caption: 'PLAN — ₹ budget → the wards where it cuts the most risk.' })
    if (!(await hold(5200))) return story().exit()

    // 6 — JUSTIFY: the plan is costed, traceable, exportable.
    beat({ step: 6, focus: 'wards', caption: 'JUSTIFY — costed, ward-level, first-order — export the plan as a PDF.' })
    if (!(await hold(4200))) return story().exit()

    // 7 — close.
    useUI.getState().setPlannerOpen(false)
    work().setMode('explore')
    dash().flyTo?.(CITY)
    beat({ step: 7, focus: null, title: { head: 'Bhumi', sub: 'See → Ask → Plan → Justify' }, caption: '' })
    if (!(await hold(3400))) return story().exit()

    story().exit()
  } finally {
    cleanup() // ALWAYS reset the map/planner/highlights when the tour ends, however it ends
  }
}
