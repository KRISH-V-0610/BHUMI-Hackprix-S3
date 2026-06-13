# Bhumi — Agentic Climate Digital Twin (AI backend)

A voice-first, multilingual agent that turns satellite climate data into ward-level action
for Hyderabad. Built on **Sarvam AI** (speech + reasoning + translation + voice), **Google
Earth Engine** (satellite layers), **MongoDB** (data store), and **MCP** (tools exposed to
any agent). This repo is the **AI / backend half**; the dashboard half lives in `frontend/`
and talks to this API via the frozen [`contracts.md`](contracts.md).

```
Voice (any Indic lang) ─▶ Sarvam STT ─▶ sarvam-30b agent ──tools──▶ climate data (Mongo/GEE)
                                              │                        │
                          Sarvam TTS ◀── answer + map actions ◀────────┘
```

## Quick start

```bash
# 1. Python deps
python -m pip install -r backend/requirements.txt

# 2. Secrets — copy the example and fill in (NEVER commit .env)
cp .env.example .env        # then edit values

# 3. Build the climate data (uses GEE if available, else realistic synthetic fallback)
python data_prep/build_layers.py

# 4. Run the API  (either works)
cd backend && python main.py            # simplest — reads APP_HOST/APP_PORT from .env
#   or:  uvicorn main:app --reload --port 8000
#   open http://localhost:8000/docs for the live Swagger UI
```

Health check: `GET http://localhost:8000/health` → shows `data_source` (`mongo`/`json`) and model.

## What works (verified end-to-end)

| Endpoint | Powered by | Status |
|----------|-----------|--------|
| `GET /layers /wards /scorecards /timeseries` | Mongo → JSON fallback | ✅ |
| `POST /voice` | Sarvam STT (`saarika:v2.5`) | ✅ Telugu/Hindi/Gujarati/English |
| `POST /ask` | sarvam-30b agent + tools | ✅ returns the full contract action object |
| `POST /tts` | Sarvam TTS (`bulbul:v2`) | ✅ |
| `POST /report` | reportlab | ✅ PDF action plan |
| MCP server | FastMCP | ✅ `python backend/mcp_server.py` |

Languages: English `en-IN`, Hindi `hi-IN`, Telugu `te-IN`, Gujarati `gu-IN`.

## MCP server (the "MCP" pillar)

The same climate tools the agent uses are exposed over the Model Context Protocol, so any MCP
client (Claude Desktop, IDE agents) can drive Bhumi:

```bash
python backend/mcp_server.py        # stdio MCP server "bhumi-climate-twin"
```

Claude Desktop config:
```json
{ "mcpServers": { "bhumi": { "command": "python", "args": ["D:/Hackathon/ADT/backend/mcp_server.py"] } } }
```

## Data realism & forecast

The synthetic Hyderabad data is **calibrated to documented reality**, so the hotspots the agent
names match real life (good for the pitch — say "these are the actual flood wards"):
- **Flood/waterlog** worst wards (Malakpet, Saidabad/Moosarambagh, Charminar, Nampally, Nagole,
  Gachibowli/HITEC) ← 2020 Musi & 2025 monsoon flood reports.
- **Urban heat** hotspots (Gachibowli, Hayathnagar, Nagole, old city) and cool green wards
  (Jubilee/Banjara Hills near KBR, lake edges) ← GHMC/IIT urban-heat-island studies (LST +0.75 °C/decade).
- **Lake health** worst near Hussain Sagar, Durgam Cheruvu, Saroornagar ← lake-degradation reports
  (~90% of city lakes lost/polluted).
- **Rainfall** real normals (~801 mm/yr, Jul–Sep wettest) with an intensifying-monsoon 2026 trend.

**Forecast:** ward scores include **2027–2028 projections** (damped extrapolation of each ward's
2016→2026 trend, with mild acceleration per LST studies). The agent's `risk_trend` tool and the
Time-Machine slider expose them; forecast years are flagged so the UI can mark them "projected".

Sources: 2020/2025 Hyderabad flood coverage (The Federal, ETV Bharat, NewsOnAir); urban-heat-island
analyses (Siasat/GHMC, IJRIAS, ScienceDirect); lake-degradation reports (The News Minute, The Federal,
SANDRP); rainfall normals (weather-atlas / climate-data).

## Resilience (demo insurance)

Two independent fallbacks keep the demo alive even on flaky conference wifi:
- **Mongo unreachable** → API serves identical data from `data/*.json`.
- **GEE unavailable** → `data_prep` synthesises realistic Hyderabad layers; ward choropleth /
  2.5D extrusion (the hero visual) needs no live tiles.

---

## How to get the keys

### 1. Sarvam AI key (✅ already working)
1. Sign up at **https://dashboard.sarvam.ai**.
2. **API Keys** → **Create** → copy the `sk_...` string.
3. Put it in `.env` as `SARVAM_API_KEY=...`. You get ₹100 free credits (LLM is free per token).

### 2. Google Earth Engine service account (⚠️ needs a permission fix)
Both keys in this repo fail today:
- `nrsc-476605` → *"Caller does not have permission… grant `roles/serviceusage.serviceUsageConsumer`"*
- `autogeo-448807` → *"project is not registered to use Earth Engine"*

To get **real satellite tiles** (otherwise the synthetic fallback is used):
1. Go to **https://console.cloud.google.com** and pick the project you want to use.
2. **Register the project for Earth Engine**: visit
   `https://code.earthengine.google.com` (sign in) and/or
   `https://console.cloud.google.com/earth-engine` → **Register a non-commercial / commercial** project.
3. **Enable the API**: APIs & Services → enable **"Google Earth Engine API"**.
4. **Create / fix the service account**: IAM & Admin → Service Accounts → create one (or use existing).
   Grant it the roles: **`Earth Engine Resource Viewer`** and **`Service Usage Consumer`**.
5. **Create a JSON key** for that service account → download it.
6. Point `.env` at it:
   ```
   EE_SERVICE_ACCOUNT=<sa-name>@<project>.iam.gserviceaccount.com
   EE_PRIVATE_KEY_FILE=<downloaded-key>.json
   EE_PROJECT=<project-id>
   ```
7. Re-run `python data_prep/build_layers.py` — it will print `Earth Engine: LIVE` and fill in
   real `tileUrl`s + ward means. No other code changes needed.

> Tip: registration approval for a fresh EE project is sometimes instant, sometimes a few
> minutes. The synthetic fallback means you are never blocked while you wait.

### 3. MongoDB (✅ Atlas connected)
- **Atlas (hosted):** create a free cluster at **https://cloud.mongodb.com**, add a DB user,
  allow your IP (or `0.0.0.0/0` for the hackathon), copy the **SRV** connection string into
  `.env` as `MONGODB_URI`.
- **Local:** install MongoDB Community and use `mongodb://localhost:27017`.
- Either way, the backend auto-falls back to JSON if it can't connect.

> 🔐 **Security:** `.env`, `*.json` keys, and the Atlas string are real secrets — they're in
> `.gitignore`. Keep them out of `.env.example` and any public repo.
