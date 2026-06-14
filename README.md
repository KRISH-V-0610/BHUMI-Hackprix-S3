# 🌍 Bhumi — Agentic Climate Digital Twin for Hyderabad

> **The decision-support twin for a city's Climate Action Cell.** Bhumi turns years of satellite
> climate data into a **budget-aware, ward-ranked intervention plan** — queryable in plain
> Telugu / Hindi / Gujarati / English, by voice or text.

Bhumi answers the question a climate officer actually has: **"I have a limited budget and 50 wards —
where do I act to cut the most risk per rupee?"** It tells you, shows you on a live map, costs it,
and proves it — following one arc:

> ### See → Ask → Plan → Justify

| | |
|---|---|
| **See** | A living map of ward-level climate risk (heat, flood, vegetation, lake, urban, waterlogging) over **2016 → 2026**, with a real NASA satellite time-lapse. |
| **Ask** | Ask in plain language (voice or text). The agent reasons over the twin and **projects the answer onto the map** — flies the camera, highlights wards with value badges. |
| **Plan** | Set a ₹ budget + intervention → Bhumi ranks wards by **impact-per-rupee**, paints the plan, and estimates *"~14k residents moved out of severe heat."* |
| **Justify** | One click exports a **costed action-plan PDF** for council approval. |

---

## ✨ Key features

- **First-run onboarding** — a one-time Welcome that explains the See → Ask → Plan → Justify arc in 4 cards, then offers a guided tour, a seeded first question, or free exploration — so a first-time visitor is never lost.
- **Guided tour (Story Mode)** — a one-click cinematic walkthrough of the whole arc (▶ in the navbar): switches layers, runs the flood scenario, asks a real question, opens the planner — the reliable 90-second pitch on rails.
- **Agentic chat (Sarvam AI)** — multilingual voice + text; answers are grounded in real tools and **drive the map live**. Persistent across reloads. Context-aware sample prompts adapt to the active layer / selected ward.
- **Deep-search "why" with citations** — ask *"why is Malakpet flood-prone?"* and the agent cross-references a **sourced** evidence base (GHMC SNDP, NRSC UHI studies, Telangana flood maps, HMDA lake reports…) against the ward's own data → an **Evidence card** with ranked, cited causes and a confidence level.
- **Action Planner** — budget slider + intervention → ranked, costed, mapped plan with aggregate impact (avg risk drop, people moved out of "severe"). Backend `POST /plan` + the agent both use the same logic.
- **Ward digital twin** — click or **search any ward** → a drill-down card with a 6-dimension radar, trend, drivers, and an **interactive what-if** (pick *trees / cool roofs / drains / lakes* → animated before→after bars + headline impact).
- **Live Google Earth Engine overlay** — toggle the **real Sentinel-2 / MODIS tiles** (NDVI / NDWI / NDBI / LST) for the active layer right on the map (Map Lab → *Live satellite layer*) — see that the data is genuinely satellite-derived.
- **Real NASA satellite time-lapse** — cached MODIS True-Color / NDVI / LST frames play across the years (the Spectral panel), fully offline-safe.
- **Real data where it counts** — **vegetation is satellite-measured (Sentinel-2 NDVI via Google Earth Engine)**; other indices use a physically-grounded model calibrated to documented Hyderabad reality. Everything honestly labelled *measured* vs *modeled*.

---

## 🏗️ Architecture

Detailed multi-agent, database, tool, XGBoost, diffusion, and caching diagrams are in
[`docs/agentic-system-architecture.md`](docs/agentic-system-architecture.md).

```
┌─────────────────────────  web/  (Vite + React + Tailwind v4)  ─────────────────────────┐
│  MapLibre GL + deck.gl   ·   mode shell (Explore/Change/Plan)   ·   Ask Bhumi chat       │
│  Risk Pyramid · Action Planner · Ward what-if twin · Satellite time-lapse · Story mode   │
└───────────────────────────────────────────────┬──────────────────────────────────────────┘
                                                 │  /layers /wards /scorecards /ask /plan /voice /tts /report
                                                 ▼
┌──────────────────────────  backend/  (FastAPI)  ──────────────────────────┐
│  agent.py  sarvam-30b ReAct loop ──tools──▶ plan_interventions, top_risk,   │
│            voice (Sarvam STT) · tts (Sarvam TTS) · report (PDF)             │
│  gee.py    Google Earth Engine → real NDVI/NDWI/LST + zonal means           │
│  db.py     MongoDB Atlas  ──(graceful fallback)──▶  data/*.json             │
│  mcp_server.py  same tools exposed over the Model Context Protocol          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Token-free / demo-safe by design:** OpenFreeMap basemap (no key), NASA GIBS imagery (no key),
MapLibre + deck.gl (no Mapbox token), and every result cached (see *Reliability*).

---

## 🧰 Tech stack

| Layer | Tech |
|------|------|
| Frontend | Vite · React 18 · Tailwind v4 · **MapLibre GL** + **deck.gl** · Framer Motion · Zustand · ECharts |
| Maps / data | OpenFreeMap (basemap) · NASA GIBS (satellite imagery) · OSM (water bodies) |
| Backend | FastAPI · Uvicorn · ReportLab (PDF) |
| AI | **Sarvam AI** — `sarvam-30b` (agent) · `saarika:v2.5` (STT) · `bulbul:v2` (TTS) |
| Geospatial | **Google Earth Engine** (Sentinel-2 / MODIS) |
| Data store | MongoDB Atlas → JSON fallback |
| Interop | **MCP** (FastMCP) — tools usable by any MCP client |

---

## 🚀 Quick start

### 1. Backend (FastAPI · port 8000)
```bash
python -m pip install -r backend/requirements.txt
python -m pip install earthengine-api          # for real satellite data (optional)

cp .env.example .env                            # then fill in your keys (never commit .env)

python data_prep/build_layers.py               # builds data/*.json (real GEE if available, else grounded model)

cd backend && python -m uvicorn main:app --port 8000
#   → http://localhost:8000/docs  (Swagger)   ·   GET /health shows data_source + model
```

### 2. Web dashboard (Vite · port 5173)
```bash
cd web
npm install
npm run dev                                     # → http://localhost:5173
```
The web app talks to the API on `:8000` and **falls back to bundled sample data** if it's down,
so the dashboard always renders.

---

## 🛰️ Real satellite data (Google Earth Engine)

Vegetation (NDVI) is **satellite-measured** when GEE is connected. To enable it on a fresh,
**free (noncommercial)** account:

1. Register a Cloud project for Earth Engine — **https://code.earthengine.google.com/register** → choose **Unpaid / Noncommercial** (Community tier — *no billing account required*).
2. Enable the **Earth Engine API** for the project.
3. Create a **service account** → grant **Earth Engine Resource Writer** + **Service Usage Consumer** → create a **JSON key** → drop it in `backend/`.
4. Set in `.env`: `E_ACCOUNT`, `E_PRIVATE_KEY_FILE`, `EE_PROJECT`.
5. `python data_prep/build_layers.py` → prints `Earth Engine: LIVE` and overlays real NDVI.

> No GEE? No problem — the build falls back to a grounded synthetic model and the dashboard still
> shows **real NASA GIBS imagery**. Nothing blocks the demo.

---

## 📊 Data & honesty

- **Vegetation** → real Sentinel-2 **NDVI** zonal means per ward (when GEE is live).
- **Heat / flood / lake / urban / waterlogging** → a **physically-grounded model** (per-ward density / green / low-lying drivers), calibrated to documented Hyderabad reality: 2020/2025 Musi & monsoon floods, GHMC urban-heat-island studies, ~90% lake degradation, real rainfall normals.
- **Population** is *modeled* (area × density, calibrated to ~10.5M); planner outputs are labelled **"first-order estimate."**
- Years **2018–2024** are interpolated client-side from the 2016 ↔ 2026 anchors; **2027–2028** are damped-trend forecasts, flagged as projected.

We label everything **measured** vs **modeled** — credibility over false precision.

---

## 🔒 Reliability (demo insurance)

Every result is cached so flaky conference wifi can't break the demo:
- **GEE / climate data** → baked into static `data/*.json`.
- **Satellite imagery** → 18 MODIS frames pre-downloaded to `web/public/satellite/`.
- **Agent answers** → key demo prompts pre-captured in `ask_cache.json` (instant, offline).
- **MongoDB down** → API serves identical `data/*.json`.
- **Backend down** → web app serves bundled sample data + a client-side planner.

---

## 📁 Project structure

```
backend/        FastAPI app — agent.py, tools.py, gee.py, sarvam.py, report.py, mcp_server.py
data_prep/      build_layers.py — computes climate data (GEE → grounded fallback)
data/           generated datasets (wards, layers, scorecards, timeseries, points)
web/            Vite + React dashboard
  src/components/  map/ · workspace/ (modes, planner, ward twin, time-lapse) · panels/ · story/
  src/lib/         risk.js · planner.js · wardAnalysis.js · years.js · choreography.js
  public/satellite/  cached NASA time-lapse frames
contracts.md    the frozen API contract (request/response shapes)
```

## 🔌 API (see [`contracts.md`](contracts.md))

`GET /layers · /wards · /scorecards · /timeseries` · `POST /ask · /plan · /voice · /tts · /report` · `GET /health`

The same tools power an **MCP server**: `python backend/mcp_server.py`.

---

## 🌐 Languages (all major Indian languages via Sarvam AI)
English · हिन्दी Hindi · বাংলা Bengali · தமிழ் Tamil · తెలుగు Telugu · मराठी Marathi ·
ગુજરાતી Gujarati · ಕನ್ನಡ Kannada · മലയാളം Malayalam · ਪੰਜਾਬੀ Punjabi · ଓଡ଼ିଆ Odia

---

*Built for Hackprix S3 — a climate digital twin that doesn't just visualise the problem, it tells a city what to do about it.*
