// The immersive "query -> choreography" sequence (contracts.md). When POST /ask resolves,
// we stagger view changes so the dashboard visibly *reacts* to the question (~2.5s total).
import { useDashboard } from '../store/useDashboard.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Run the staggered reaction.
//   res     : the /ask action object
//   flyTo   : (focus) => void   — camera glide (provided by ClimateMap)
//   speak   : (text, lang) => void — play /tts (provided by AskBhumi via useTts)
export async function runChoreography(res, { flyTo, speak } = {}) {
  const store = useDashboard.getState()
  if (!res) return

  // Reset the conversation surface for the new answer.
  store.setData({ asking: true, answerText: '', reasoning: [], actions: [], charts: [] })

  // 1-3. set_view -> set_layer -> year (the map morphs: pitch, color ramp, elevations).
  store.applyAskView({
    set_view: res.set_view,
    set_layer: res.set_layer,
    year: res.year,
  })
  await sleep(250)

  // 4. flyTo the worst ward.
  if (res.focus && flyTo) flyTo(res.focus)
  await sleep(400)

  // 5. highlight + rank wards (pulse glow + Top-N list).
  if (res.highlight_wards?.length) {
    store.setHighlightWards(res.highlight_wards)
  }
  await sleep(300)

  // 6. slide in charts (bar + radar panels).
  if (res.charts?.length) {
    store.setData({ charts: res.charts })
  }
  await sleep(300)

  // 7. answer text + speak it. (AskBhumi types `answerText` on; we just set it + trigger tts.)
  store.setData({ answerText: res.answer_text ?? '' })
  if (res.answer_text && speak) speak(res.answer_text, res.lang || store.lang)

  // 8. stream the reasoning trace one line at a time.
  const trace = res.reasoning ?? []
  for (let i = 0; i < trace.length; i++) {
    store.setData({ reasoning: trace.slice(0, i + 1) })
    await sleep(220)
  }

  // 9. actions checklist animates in.
  if (res.actions?.length) {
    store.setData({ actions: res.actions })
  }

  store.setData({ asking: false })
}
