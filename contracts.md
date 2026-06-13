# Bhumi API Contract (frozen v1)

> Shared source of truth between the **AI/backend** half and the **dashboard/frontend** half.
> The dashboard builds against `data/*.sample.json` until the live backend is ready — every
> endpoint below returns the same shape as its sample fixture. **Do not change a field name
> without updating this file + both halves.**

Base URL (dev): `http://localhost:8000`
All responses are JSON unless noted. All endpoints send `Access-Control-Allow-Origin` for the dev frontend.

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
        "scores": {                          // per layer, per year, 0–100
          "2016": { "flood": 61, "heat": 79, "veg": 44, "lake": 55, "urban": 70, "water": 58 },
          "2026": { "flood": 71, "heat": 88, "veg": 34, "lake": 58, "urban": 80, "water": 66 }
        }
      }
    }
  ]
}
```
Frontend tip: `getElevation = props.scores[year][activeLayer] * 30` for 2.5D blocks.

## `GET /scorecards?year=2026`
City-wide aggregate per layer (the glowing tiles top-right of the concept art).

```jsonc
{
  "year": 2026,
  "cards": [
    { "id": "flood", "label": "Flood Risk",  "score": 82, "level": "Very High", "delta_since_2016": 9 },
    { "id": "heat",  "label": "Heat Stress", "score": 76, "level": "High",      "delta_since_2016": 7 }
  ]
}
```

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
- `charts[].type` ∈ `bar` | `line` | `radar`. `bar`/`line` use `x`/`y`; `radar` uses `axes`/`values`.
- Any field except `answer_text`/`lang` may be omitted/null — render defensively.
- Drive `answer_text` straight into `/tts` to speak it back.

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
HTTP 4xx/5xx with this body. Frontend should fall back to sample data on any error during the demo.

---

## Mock mode
Until the backend is live, the frontend reads these files directly (served from `/data` or imported):
`data/layers.sample.json`, `data/wards.sample.json`, `data/scorecards.sample.json`,
`data/timeseries.sample.json`, `data/ask.sample.json`. They match the shapes above exactly.

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
