// The immersive "query -> choreography" sequence (contracts.md). When POST /ask resolves,
// we stagger view changes so the dashboard visibly *reacts* to the question (~2.5s total),
// while streaming the answer/reasoning/charts into one assistant message in the chat thread.
import { useDashboard } from '../store/useDashboard.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Run the staggered reaction.
//   res       : the /ask action object
//   flyTo     : (focus) => void           — camera glide (provided by ClimateMap)
//   messageId : id of the assistant message to stream the answer into (chat thread)
// Note: TTS is NOT auto-played — the user triggers it per-message via the speaker button.
export async function runChoreography(res, { flyTo, messageId } = {}) {
  const store = useDashboard.getState()
  const upd = (patch) => {
    if (messageId != null) store.updateMessage(messageId, patch)
  }

  if (!res) {
    upd({ status: 'done', text: 'Sorry, I could not reach the climate engine just now.' })
    store.setData({ asking: false })
    return
  }

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

  // 6. slide in charts (attached to this answer bubble).
  if (res.charts?.length) {
    upd({ charts: res.charts })
    store.setData({ charts: res.charts })
  }
  await sleep(300)

  // 6b. evidence — cited causal factors from deep_search (rendered as a Sources card).
  if (res.evidence) upd({ evidence: res.evidence })

  // 7. answer text — the bubble types it on, then renders it as markdown.
  // The answer's language is stored so the speaker button can read it back correctly.
  upd({ text: res.answer_text ?? '', status: 'done', lang: res.lang || store.lang })

  // 8. stream the reasoning trace one line at a time into the bubble.
  const trace = res.reasoning ?? []
  for (let i = 0; i < trace.length; i++) {
    upd({ reasoning: trace.slice(0, i + 1) })
    await sleep(220)
  }

  // 9. actions — keep on the bubble AND mirror to the Recommendations panel.
  if (res.actions?.length) {
    upd({ actions: res.actions })
    store.setData({ actions: res.actions })
  }

  store.setData({ asking: false })
}
