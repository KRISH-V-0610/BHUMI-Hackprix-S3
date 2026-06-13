# Bhumi API Contract (frozen v1)

> Shared source of truth between the **AI/backend** half and the **dashboard/frontend** half.
> The dashboard builds against `data/*.sample.json` until the live backend is ready — every
> endpoint below returns the same shape as its sample fixture. **Do not change a field name
> without updating this file + both halves.**

Base URL (dev): `http://localhost:8000`
All responses are JSON unless noted. All endpoints send `Access-Control-Allow-Origin` for the dev frontend.

---

# 👋 Frontend teammate — start here

You own everything in `frontend/`. You can build the **entire UI without the backend running**
by reading the `data/*.sample.json` fixtures, then flip a flag to use the live API later.

### 1. Prerequisites
- Node 18+ and npm. A free **Mapbox token** (https://account.mapbox.com → create token).

### 2. Scaffold + install the recommended stack
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install mapbox-gl @deck.gl/core @deck.gl/layers @deck.gl/mapbox echarts echarts-for-react framer-motion
npm run dev          # http://localhost:5173  (already allowed by backend CORS)
```

### 3. Configure environment (`frontend/.env`)
```
VITE_API_BASE=http://localhost:8000      # the backend
VITE_MAPBOX_TOKEN=pk.your_mapbox_token
VITE_OFFLINE=false                        # true = read the bundled /data snapshot instead of the API
```

### 4. One API helper (`src/api.ts`) — live API with an offline data snapshot fallback
The live API is primary. The bundled `data/*.sample.json` snapshot lets you build/demo without
the backend running, and is also a safety net if a request fails (set `VITE_OFFLINE=true`, or
the helper below auto-falls-back on error). Same shapes either way.
```ts
const BASE = import.meta.env.VITE_API_BASE;
const OFFLINE = import.meta.env.VITE_OFFLINE === 'true' || !BASE;

const j = (r: Response) => r.json();
const snapshot = (f: string) => fetch(`/data/${f}.sample.json`).then(j);  // bundled in public/data
// try the live API, fall back to the bundled snapshot on any error
const get = (path: string, file: string) =>
  OFFLINE ? snapshot(file) : fetch(`${BASE}/${path}`).then(j).catch(() => snapshot(file));

export const getWards      = () => get('wards', 'wards');
export const getLayers     = () => get('layers', 'layers');
export const getPoints     = () => get('points', 'points');
export const getScorecards = (y=2026) => get(`scorecards?year=${y}`, 'scorecards');
export const getTimeseries = (m='rainfall') => get(`timeseries?metric=${m}`, 'timeseries');

export const ask = (text: string, lang='en-IN') =>
  fetch(`${BASE}/ask`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text, lang})}).then(j);

export const tts = (text: string, lang='en-IN') =>
  fetch(`${BASE}/tts`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text, lang})}).then(j);
```

### 5. Voice in, voice out
```ts
// MIC -> /voice : record with MediaRecorder, POST as multipart, then call ask()
const fd = new FormData();
fd.append('audio', blob, 'q.wav');                 // blob from MediaRecorder
const { text, lang } = await fetch(`${BASE}/voice`, {method:'POST', body: fd}).then(j);
const result = await ask(text, lang);              // drives the map (see choreography below)

// TTS base64 -> play
const { audio_base64 } = await tts(result.answer_text, result.lang);
new Audio(`data:audio/wav;base64,${audio_base64}`).play();
```

### 6. Bundle the offline data snapshot
Copy `data/*.sample.json` into `frontend/public/data/` (so they're served at `/data/...`).
They are byte-for-byte the same shape the live API returns, so they double as your offline
fallback for development and as demo insurance.

### 7. Build order (suggested)
1. Map + ward choropleth from `getWards()` (2D) → add the 2.5D deck.gl extrusion.
2. Scorecards + rainfall ECharts panel.
3. Risk dots from `getPoints()`; Time-Machine slider (2016→2028).
4. Ask Bhumi panel (mic/chat) → wire the `/ask` choreography (§ "query → choreography").
5. Report button (`POST /report` → download blob), proactive alert banner (`POST /simulate-alert`).

> Full panel-by-panel mapping, deck.gl/ECharts recipes, the query→reaction choreography, and
> animation ideas are in the **Dashboard Visualization Guide** at the bottom of this file.

---

## Layer IDs (canonical)

| id      | label          | built for real? | risk = high when |
|---------|----------------|-----------------|------------------|
| `flood` | Flood Risk     | ✅ live GEE      | more standing/surface water |
| `heat`  | Heat Stress    | ✅ live GEE      | higher land-surface temp |
| `veg`   | Vegetation     | ✅ live GEE      | **less** vegetation (inverted) |
| `lake`  | Lake Health    | precomputed      | worse water quality/shrinkage |
| `urban` | Urban Growth   | precomputed      | more built-up / impervious |
| `water` | Waterlogging   | precomputed      | more monsoon ponding |

Years available: `2016`, `2026`. All scores are normalized **0–100 (higher = worse risk)**.

---

## `GET /layers`
Tile URLs + legends for every layer/year. Drives the basemap raster overlay.

```jsonc
{
  "layers": [
    {
      "id": "heat",
      "year": 2026,
      "label": "Heat Stress",
      "tileUrl": "https://earthengine.googleapis.com/v1alpha/projects/.../tiles/{z}/{x}/{y}",
      "opacity": 0.75,
      "legend": [
        { "color": "#2b83ba", "label": "Low" },
        { "color": "#ffffbf", "label": "Moderate" },
        { "color": "#d7191c", "label": "Severe" }
      ]
    }
    // ... one entry per (layer × year)
  ]
}
```

## `GET /wards`
GeoJSON `FeatureCollection` of GHMC wards. **This is the heart of the dashboard** — choropleth,
2.5D extrusion height, 3D bars, top-N ranking, and scorecards all read from `properties`.

```jsonc
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [ /* ... */ ] },
      "properties": {
        "name": "Kukatpally",
        "ward_no": 124,
        "centroid": [78.4006, 17.4849],     // [lng, lat] — for 3D ColumnLayer + camera
        "forecast_years": [2027, 2028],      // which year keys below are projections
        "scores": {                          // per layer, per year, 0–100
          "2016": { "flood": 61, "heat": 79, "veg": 44, "lake": 55, "urban": 70, "water": 58 },
          "2026": { "flood": 71, "heat": 88, "veg": 34, "lake": 58, "urban": 80, "water": 66 },
          "2027": { "flood": 72, "heat": 89, "veg": 33, "lake": 59, "urban": 81, "water": 67 },
          "2028": { "flood": 73, "heat": 90, "veg": 32, "lake": 60, "urban": 82, "water": 68 }
        }
      }
    }
  ]
}
```
Frontend tip: `getElevation = props.scores[year][activeLayer] * 30` for 2.5D blocks.

## `GET /points`
Geotagged **risk dots** (the glowing speckle in the concept art) — 400+ points, each carrying
all-6-layer intensities so you colour by the active layer. Render with a deck.gl
`ScatterplotLayer` (or a heatmap). Point density is higher in higher-risk wards.
```jsonc
{
  "year": 2026,
  "points": [
    { "lng": 78.4746, "lat": 17.3629, "ward": "Charminar",
      "scores": { "flood": 58, "heat": 90, "veg": 80, "lake": 66, "urban": 92, "water": 61 } }
  ]
}
```

## `GET /scorecards?year=2026`
City-wide aggregate per layer (the glowing tiles top-right of the concept art).
`year` accepts **2016, 2026 (observed) and 2027, 2028 (forecast)**; forecast years carry
`"forecast": true` so you can badge them "projected".

```jsonc
{
  "year": 2026,
  "forecast": false,                  // true for 2027 / 2028
  "cards": [
    { "id": "flood", "label": "Flood Risk",  "score": 82, "level": "Very High", "delta_since_2016": 9 },
    { "id": "heat",  "label": "Heat Stress", "score": 76, "level": "High",      "delta_since_2016": 7 }
  ]
}
```

> **Time Machine & forecast:** the slider runs **2016 → 2026 → 2027 → 2028**. Render 2016/2026
> solid and 2027/2028 as a dashed/ghosted "forecast" style. A forecast `line` chart from `/ask`
> includes `forecast_from` (first projected year) and marks forecast x-labels with a trailing `*`.

## `GET /timeseries?metric=rainfall`
Chart-ready series. `metric` ∈ `rainfall` (more later).

```jsonc
{
  "metric": "rainfall",
  "unit": "mm",
  "labels": ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
  "series": [
    { "name": "2016", "data": [8, 10, 14, 24, 39, 110, 165, 150, 168, 96, 22, 5] },
    { "name": "2026", "data": [6, 9, 12, 30, 52, 138, 190, 176, 181, 120, 28, 7] }
  ]
}
```

---

## `POST /voice`  (multipart/form-data)
Speech → text + detected language. Frontend records mic audio and posts it; then calls `/ask`.

Request: form field `audio` = WAV/MP3 blob (≤30s, 16 kHz mono preferred).
```jsonc
{ "text": "ఈ సంవత్సరం వేడిమి ఎక్కడ ఎక్కువ?", "lang": "te-IN" }
```

## `POST /ask`   ← **the important one**
The agent reasons over the question and returns an **action object**. Every field maps to a visual.
Send `text` (required) and optional `lang` (BCP-47; if omitted, auto-detected/echoed back).

Request:
```jsonc
{ "text": "Which areas have the worst urban heat and what should we do?", "lang": "en-IN" }
```
Response:
```jsonc
{
  "answer_text": "Kukatpally and Charminar wards show the highest land-surface temperature in 2026, driven by dense built-up cover and low vegetation. I recommend a cool-roof subsidy and a ward tree-cover target.",
  "lang": "en-IN",
  "set_layer": "heat",                 // switch active map layer to this id
  "set_view": "2.5d",                  // "2d" | "2.5d"
  "year": 2026,                        // which Time-Machine year to show
  "highlight_wards": ["Kukatpally", "Charminar"],   // glow + rank in side rail
  "focus": { "center": [78.45, 17.45], "zoom": 11, "pitch": 50, "bearing": 20 },  // camera target (nullable)
  "charts": [
    { "type": "bar",   "title": "Heat score — top wards", "x": ["Kukatpally","Charminar","..."], "y": [88, 85, 81] },
    { "type": "radar", "title": "Risk profile — Kukatpally", "axes": ["flood","heat","veg","lake","urban","water"], "values": [71,88,34,58,80,66] }
  ],
  "actions": [
    "Launch a cool-roof subsidy for the top-5 heat wards",
    "Set a +15% ward tree-cover target by 2028",
    "Convert 3 vacant plots per ward into micro-parks"
  ],
  "reasoning": [                        // the visible "thinking" trace (ordered)
    "Detected intent: heat hotspots + mitigation",
    "tool get_ward_stats(heat, 2026)",
    "tool top_risk_wards(heat, 5)",
    "tool recommend_actions(heat, [Kukatpally, Charminar])"
  ]
}
```
Notes for frontend:
- `charts[].type` ∈ `bar` | `line` | `radar`. Single-series `bar`/`line` use `x`/`y`; a
  **grouped** bar (e.g. what-if before/after) uses `x` + `series:[{name,data},…]`; `radar`
  uses `axes`/`values`.
- Any field except `answer_text`/`lang` may be omitted/null — render defensively.
- **Casual/greeting turns** ("hi", "thanks", off-topic) return `answer_text` only; `set_layer`,
  `set_view`, `year`, `focus` are `null` and `highlight_wards`/`charts`/`actions` are empty —
  meaning **don't change the map**, just show the reply (+ optional TTS). The agent decides this.
- **What-if turns** ("what if we add 20% tree cover to Charminar?") include a before/after
  grouped-bar chart first and focus the named ward.
- Drive `answer_text` straight into `/tts` to speak it back.

## `POST /simulate-alert`
Proactive monitoring — Bhumi issues a spoken early-warning for the highest-risk wards (turns
the app from reactive dashboard into an autonomous agent). Great "ambient mode" demo moment.
Request:
```jsonc
{ "layer": "flood", "lang": "en-IN", "year": 2026, "n": 4, "speak": true }
```
Response (contract-style, so the map reacts, PLUS audio to auto-play):
```jsonc
{
  "alert_text": "Urgent flood warning. Gachibowli, Malkajgiri and Musheerabad are highest-risk. Move to higher ground...",
  "lang": "en-IN",
  "set_layer": "flood",
  "set_view": "2.5d",
  "year": 2026,
  "severity": "severe",                 // "severe" | "high" | "moderate"
  "highlight_wards": ["Gachibowli", "Malkajgiri", "Musheerabad", "Charminar"],
  "focus": { "center": [78.34, 17.44], "zoom": 12, "pitch": 50, "bearing": 20 },
  "charts": [ { "type": "bar", "title": "Flood — alert wards (2026)", "x": [...], "y": [...] } ],
  "audio_base64": "UklGRi..."           // null if speak=false or TTS fails
}
```
Frontend: flash a red banner sized by `severity`, run the highlight choreography, auto-play audio.

## `POST /tts`
Text → spoken audio in the given language.
Request: `{ "text": "...", "lang": "te-IN" }`
```jsonc
{ "audio_base64": "UklGRiQAAABXQVZF...", "format": "wav", "sample_rate": 22050 }
```

## `POST /report`   → `application/pdf`
Ward-level climate action plan as a downloadable PDF (binary).
Request:
```jsonc
{ "lang": "en-IN", "year": 2026, "wards": ["Kukatpally", "Charminar"], "layer": "heat" }
```
Response headers: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="bhumi-action-report.pdf"`.

---

## Error shape (all endpoints)
```jsonc
{ "error": { "code": "string", "message": "human readable" } }
```
HTTP 4xx/5xx with this body. Frontend should fall back to the bundled `/data` snapshot on any error during the demo.

---

## Offline data snapshot
The bundled `data/*.sample.json` files (`wards`, `layers`, `points`, `scorecards`, `timeseries`)
match the live API shapes byte-for-byte. Serve them from `public/data/` so the dashboard works
without the backend running and as a safety net if a request fails (see the `get()` helper above).

---

# Dashboard Visualization Guide (for the frontend half)

This is how to turn the JSON above into the immersive dark dashboard from the concept art
(`ADT.png`). **Recommended stack:** React + Vite, **Mapbox GL JS** (2D basemap + raster tiles),
**deck.gl** (2.5D extrusion + 3D bars, overlaid on Mapbox), **Apache ECharts** (line/bar/radar
panels), **Framer Motion** (panel slide-ins, number count-ups, glow pulses).

## Panel → data → library map (every box in ADT.png)

| Concept-art panel | Data source | Render with |
|-------------------|-------------|-------------|
| Top layer tabs (Flood/Heat/Lake/Veg/Urban/Musi/Waterlog) | `GET /layers` ids | tab bar; selected id = `activeLayer` |
| Center **2.5D climate map** | `GET /wards` `properties.scores[year][activeLayer]` | **deck.gl GeoJsonLayer, `extruded:true`** over Mapbox dark |
| **2D / 2.5D / 3D toggle** | same | switch deck.gl `getElevation` + map `pitch` (0 / 50 / 60) |
| **Risk Intensity** legend | `layers[].legend` (colors) | static legend keyed to active layer |
| Left **Layer Viewer** (NDVI/NDWI/NDBI/LST…) | `GET /layers` `tileUrl` per id | Mapbox raster source, toggle visibility/opacity |
| **Time Machine 2016 ↔ 2026** | `year` switch on `/wards` scores + `/layers` | slider; re-run deck.gl elevation transition |
| **Overall Risk Summary** scorecards | `GET /scorecards?year=` `cards[]` | glowing tiles, `score` count-up + `delta_since_2016` arrow |
| **Top-5 High Risk Wards** | `GET /ask` `highlight_wards` **or** sort `/wards` by activeLayer | ranked list + horizontal bars |
| **Rainfall Trend** chart | `GET /timeseries?metric=rainfall` | ECharts line (2016 vs 2026 series) |
| **AI Insights / Ask Bhumi** | `POST /ask` `answer_text` + `reasoning` | chat bubble + live "thinking" list; mic waveform |
| **Recommended Actions** | `POST /ask` `actions[]` | checklist with icons |
| **Generate Action Report (PDF)** | `POST /report` → blob | download button |
| Footer badges (GEE · LangGraph · MCP) | static | the `/health` `data_source` can show a live dot |

## The hero visual — 2.5D extruded wards (deck.gl)

```js
import { GeoJsonLayer } from '@deck.gl/layers';
// wards = GET /wards ; activeLayer e.g. 'heat' ; year e.g. 2026
new GeoJsonLayer({
  id: 'wards-25d',
  data: wards,
  extruded: true,
  getElevation: f => f.properties.scores[year][activeLayer] * 40,   // risk -> height
  getFillColor: f => riskToRGB(f.properties.scores[year][activeLayer]), // legend palette
  getLineColor: [255,255,255,40],
  pickable: true,            // hover -> tooltip with all 6 scores
  transitions: { getElevation: 600, getFillColor: 600 },  // smooth morph on year/layer change
});
```
- **2D mode:** `extruded:false`, flat choropleth fill (same color ramp), map `pitch:0`.
- **3D bars mode:** swap to deck.gl **`ColumnLayer`** at `properties.centroid`, `getElevation = score`.
- `riskToRGB`: interpolate the active layer's `legend` colors (low→severe). Keep ALL layers on the
  same 0–100 scale so heights are comparable across layers and years.

## Charts (ECharts)
`/ask` returns a `charts[]` array — render each by `type`:
- `bar` → `{ xAxis: c.x, series:[{type:'bar', data:c.y}] }`
- `line` → same with `type:'line'` (also used for `/timeseries`)
- `radar` → `{ radar:{ indicator: c.axes.map(a=>({name:a,max:100})) }, series:[{type:'radar', data:[{value:c.values}]}] }`

## The immersive part — query → choreography

When `POST /ask` resolves, run this sequence (≈2.5s, staggered) so the dashboard *reacts* to the
question. **Every field is a visual cue:**

```
1. set_view "2.5d" ........ animate map pitch 0→50, switch deck.gl to extruded
2. set_layer "heat" ....... cross-fade fill colors to the new layer's ramp + swap legend
3. year 2026 ............... tween elevations to that year's scores
4. focus {center,zoom,pitch} flyTo() camera glide to the worst ward (Mapbox easeTo, 1.5s)
5. highlight_wards ......... pulse glow on those polygons; populate Top-5 list with bars
6. charts[] ............... slide in bar + radar panels (Framer Motion, stagger 120ms)
7. answer_text ............ type-on into the Ask Bhumi bubble; play /tts audio in `lang`
8. reasoning[] ............ stream as a live "🧠 thinking…" list above the answer
9. actions[] .............. check-list animates in; Report button highlights
```

## Animation / GIF / "immersive" touches (match the concept art mood)
- **Time Machine morph:** animating `getElevation`/`getFillColor` between 2016↔2026 *is* the wow
  GIF — wards visibly rise (heat/urban) or green-out (veg). Add a "▶ play" that auto-tweens the
  slider 2016→2026 over 3s.
- **Camera flythrough:** on each `/ask`, `map.flyTo(focus)` — feels alive.
- **Ward pulse:** animate `getLineColor` opacity sin-wave on `highlight_wards`.
- **Mic waveform:** animate bars from the live audio analyser while recording (the header viz).
- **"Generate Pulse" scan:** a sweeping radial gradient over the map on load / refresh.
- **Number count-ups + glow:** scorecards tween 0→score with a colored neon shadow (`level`).
- **Risk dots:** scatter glowing dots at ward centroids sized by score (the speckled look in the art).
- **Theme:** near-black bg `#06120d`, neon greens `#1a9641/#39ff14`, amber/red for risk; glassy
  panels (`backdrop-filter: blur`), thin cyan borders. Use the `legend` hex values for all ramps.

## Tooltips & interaction
- Hover a ward → glass tooltip with name + all 6 scores (radar mini).
- Click a ward → lock the radar panel to it; "Ask about this ward" prefill.
- Language switch (en/hi/te/gu from `GET /languages`) → pass `lang` to `/ask`, `/voice`, `/tts`.

## One worked example (end to end)
User taps mic, says (Telugu) *"ఈ సంవత్సరం వేడిమి ఎక్కడ ఎక్కువ?"*
→ `/voice` returns `{text, lang:"te-IN"}` → `/ask` returns `set_layer:"heat", set_view:"2.5d",
highlight_wards:["Charminar","Musheerabad",…], charts:[bar,radar], actions:[…]`.
Dashboard: map tilts to 2.5D, heat ramp fades in, camera flies to Charminar (now a tall red block),
Top-5 list fills, bar+radar slide in, Bhumi speaks the Telugu answer, actions check-list appears.
That single reaction is the demo.

---

## Reformation additions (v1.1 — Climate Action Cell)

These extend the frozen v1 contract; nothing above changed.

### `POST /plan` — budget-aware Action Planner (new)
Request: `{ budget: number(₹), intervention: "tree_cover"|"cool_roof"|"permeable_surface"|
"drain_desilt"|"lake_restore", layer?: string, year?: int }`
Response:
```json
{
  "intervention": "tree_cover", "label": "Increase tree / green cover", "layer": "veg",
  "budget": 50000000, "year": 2026, "unit_cost": 25000000, "magnitude": 15,
  "wards_funded": 2, "total_cost": 50000000, "avg_risk_drop": 11.0, "people_out_of_severe": 253773,
  "picked": [{ "ward": "...", "cost": 25000000, "before": 67, "after": 56, "delta": -11,
              "population": 255890, "centroid": [lng, lat] }],
  "note": "First-order estimate ..."
}
```
Ranks wards by impact-per-rupee `(risk_drop × population) / cost`, greedily fills the budget.
Also exposed to the agent as the `plan_interventions` tool — `/ask` now answers "where should I
spend ₹X on trees?" with a funded plan (folded into `highlight_wards` + a before/after chart).

### Ward `population` field (new, modeled)
Each ward now has a modeled `population` (area × density, calibrated to ~10.5M city total). Swaps
for WorldPop zonal stats when GEE is live. Surfaced via `get_ward_stats` / the planner.

### `water_bodies` dataset (new, frontend)
`web/public/data/water_bodies.geojson` — real OSM lakes + Musi river (186 features) bordered on the
map. To be upgraded to GEE-NDWI per-year water extent (visible lake shrinkage) when GEE is live.

### Score years
Frontend renders 2016/2018/2020/2022/2024/2026 — 2018–2024 are interpolated client-side from
2016↔2026 today; `backend/gee.py` has the acquisition windows ready to compute them for real.

### Map / data-source notes
- Aesthetic basemap default is OpenFreeMap "Liberty" (token-free); MapTiler "Dataviz" unlocks via
  `VITE_MAPTILER_KEY`. Ward fills + 3D risk-spikes use a shared heat ramp; Change mode uses a
  diverging (improved↔worsened) ramp. Real NASA GIBS imagery (NDVI/LST/true-color) is a toggle.
