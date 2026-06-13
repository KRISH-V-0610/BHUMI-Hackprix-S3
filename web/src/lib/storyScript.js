// The guided demo narrative — the product's arc: SEE → ASK → PLAN → JUSTIFY. Each beat sets a
// focus region + caption (useStory), switches the workspace mode, and drives the real dashboard
// (map, layer, highlights, agent, planner). Beats await a skippable dwell (Next / Esc).
import { useDashboard } from '../store/useDashboard.js'
import { useStory } from '../store/useStory.js'
import { useWorkspace } from '../store/useWorkspace.js'
import { useFloodScenario } from '../store/useFloodScenario.js'
import { postAsk } from '../api/bhumi.js'
import { runChoreography } from './choreography.js'

const CITY = { center: [78.456, 17.42], zoom: 10.6, pitch: 55, bearing: 18 }
const OLD_CITY = { center: [78.474, 17.361], zoom: 12.1, pitch: 58, bearing: 22 } // Charminar belt

const DEMO_Q = 'Which wards have the worst heat, and what can we do about it?'

const dash = () => useDashboard.getState()
const story = () => useStory.getState()
const work = () => useWorkspace.getState()
const beat = (patch) => story().setBeat(patch)

async function hold(ms) {
  const reason = await story().waitDwell(ms)
  return reason !== 'abort' && story().active
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
      text: 'Charminar, Yakutpura and Musheerabad carry the worst heat load — dense build-up, thin tree cover. Targeted canopy + cool roofs cut the peak.',
    })
    d.setData({ asking: false })
  }
}

export async function runStory() {
  const d = dash()
  d.clearChat()
  work().setMode('explore')

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
  if (!(await hold(8200))) {
    useFloodScenario.getState().stop()
    return story().exit()
  }
  useFloodScenario.getState().stop()

  // 4 — ASK: plain language → the agent reasons + projects onto the map (badges + banner).
  work().setMode('explore')
  beat({ step: 4, focus: 'chat', caption: 'ASK — in plain language; Bhumi reasons over the live twin.' })
  await autoAsk(DEMO_Q)
  if (!(await hold(2600))) return story().exit()

  // 5 — PLAN: switch to the Action Planner; it auto-funds wards by impact-per-rupee.
  work().setMode('plan')
  beat({ step: 5, focus: 'wards', caption: 'PLAN — ₹ budget → the wards where it cuts the most risk.' })
  if (!(await hold(4800))) return story().exit()

  // 6 — JUSTIFY: the plan is costed, traceable, exportable.
  beat({ step: 6, focus: 'wards', caption: 'JUSTIFY — costed, ward-level, first-order — export the plan as a PDF.' })
  if (!(await hold(4200))) return story().exit()

  // 7 — close.
  work().setMode('explore')
  beat({ step: 7, focus: null, title: { head: 'Bhumi', sub: 'See → Ask → Plan → Justify' }, caption: '' })
  if (!(await hold(3400))) return story().exit()

  story().exit()
}
