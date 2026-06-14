# Bhumi Multi-Agentic System Architecture

This diagram shows the target system structure for Bhumi: a climate digital twin where multiple agents share one tool registry, one data layer, model outputs, and cached artifacts.

## 1. Multi-Agent System

```mermaid
flowchart TB
  User["User\nVoice / Text / Dashboard Click"] --> Web["React Web App\nMapLibre + deck.gl + ECharts"]
  Web --> API["FastAPI Gateway\n/contracts.md response shape"]

  API --> Orchestrator["Bhumi Orchestrator Agent\nSarvam-30B ReAct / planner loop"]

  Orchestrator --> Intent["Intent + Context Router\nsmall talk / map query / plan / forecast / what-if / report"]
  Intent --> Memory["Conversation Memory Agent\nsession history + follow-up resolution"]
  Intent --> DataAgent["Climate Data Agent\nward/layer/scorecard retrieval"]
  Intent --> GeoAgent["Geospatial Agent\nGEE + satellite layers + zonal stats"]
  Intent --> AnalyticsAgent["Trend Analytics Agent\nXGBoost forecast + feature importance"]
  Intent --> ScenarioAgent["What-If Scenario Agent\nDiffusion scenario generator"]
  Intent --> PlannerAgent["Intervention Planner Agent\nbudget + impact-per-rupee"]
  Intent --> ReportAgent["Report Agent\nPDF action plan"]
  Intent --> VoiceAgent["Voice Agent\nSarvam STT + TTS"]

  Memory --> DB[(MongoDB Atlas / JSON fallback\nconversation + app data)]
  DataAgent --> Store["Data Store Interface\nbackend/db.py"]
  GeoAgent --> GEE["Google Earth Engine\nSentinel-2 / MODIS / zonal means"]
  AnalyticsAgent --> ModelCache[(Model + Forecast Cache\nmodels/*.pkl + forecast CSV)]
  ScenarioAgent --> ScenarioCache[(Scenario Cache\nsampled what-if outputs)]
  PlannerAgent --> Tools["Shared Tool Registry\nbackend/tools.py"]
  ReportAgent --> Files[(Report Cache\nPDF exports)]
  VoiceAgent --> Sarvam["Sarvam APIs\nsaarika:v2.5 / sarvam-30b / bulbul"]

  Store --> DB
  Store --> JSON[(data/*.json\nlayers / wards / points / scorecards / timeseries)]
  GEE --> Cache[(Offline Cache\nweb/public/satellite + data/*.json)]
  Tools --> Store
  Tools --> ModelCache
  Tools --> ScenarioCache

  Orchestrator --> Contract["Deterministic Dashboard Contract\nanswer_text, set_layer, highlight_wards, charts, actions, focus"]
  Contract --> API
  API --> Web
```

## 2. Database And Cache Layers

```mermaid
flowchart LR
  subgraph OnlineStores["Online Stores"]
    Mongo[(MongoDB Atlas\nprimary app data)]
    GEE[(Google Earth Engine\nsatellite-derived features)]
    Sarvam[(Sarvam AI\nLLM/STT/TTS)]
  end

  subgraph LocalCaches["Local / Demo-Safe Caches"]
    JSON[(data/*.json\nward risk, layers, scorecards)]
    Satellite[(web/public/satellite\ncached NASA frames)]
    ModelArtifacts[(backend/outputs/models\nXGBoost + diffusion weights)]
    Forecasts[(backend/outputs/*.csv\nforecast + scenario samples)]
    AskCache[(ask_cache.json\noptional prompt cache)]
    Reports[(PDF report cache)]
    Memory[(conversation cache\nsession turns)]
  end

  Mongo --> JSON
  GEE --> JSON
  GEE --> Satellite
  JSON --> ModelArtifacts
  ModelArtifacts --> Forecasts
  Forecasts --> JSON
  Sarvam --> AskCache
  Memory --> Mongo
```

Caching rule: every expensive or failure-prone path should write a local artifact. The dashboard should still run from `data/*.json`, `web/public/satellite/`, cached model outputs, and JSON fallback when network services are unavailable.

## 3. Tool Structure

```mermaid
flowchart TB
  Tools["backend/tools.py\nOpenAI-style function tools + MCP tools"]

  Tools --> ReadTools["Read Tools"]
  ReadTools --> GetLayer["get_layer(layer, year)"]
  ReadTools --> WardStats["get_ward_stats(layer, year)"]
  ReadTools --> TopRisk["top_risk_wards(layer, n, year)"]
  ReadTools --> Scorecards["get_scorecards(year)"]
  ReadTools --> Compare["compare_years(layer, y1, y2)"]
  ReadTools --> Trend["risk_trend(layer)"]
  ReadTools --> Explain["explain_risk(layer)"]

  Tools --> ActionTools["Action Tools"]
  ActionTools --> Recommend["recommend_actions(layer, wards)"]
  ActionTools --> Simulate["simulate_intervention(ward, intervention, magnitude, year)"]
  ActionTools --> Plan["plan_interventions(layer, intervention, budget, year)"]
  ActionTools --> Population["ward_population(name)"]

  Tools --> ExternalTools["External / Interface Tools"]
  ExternalTools --> MCP["backend/mcp_server.py\nsame tools for MCP clients"]
  ExternalTools --> GEE["backend/gee.py\nsatellite feature extraction"]
  ExternalTools --> Sarvam["backend/sarvam.py\nchat/STT/TTS"]
  ExternalTools --> Report["backend/report.py\nPDF generation"]
```

## 4. XGBoost Trend Analytics Pipeline

```mermaid
flowchart LR
  Raw["Actual or generated monthly data\nNDVI, NDWI, NDBI, LST, rainfall,\nelevation, distance_to_water, target risk"] --> Prep["Feature Engineering\nmonth_sin, month_cos, region grouping"]
  Prep --> Split["Train / validation split"]
  Split --> XGB["XGBoost Regressor\nfallback: HistGradientBoostingRegressor"]
  XGB --> Metrics["MAE / RMSE / R2"]
  XGB --> FeatureImportance["Feature Importance\nxgb_feature_importance.csv"]
  XGB --> Future["Next 12 month forecast\nforecast_next_12_months.csv"]
  Future --> Dashboard["Dashboard charts\ntrend line + zone risk ranking"]
  FeatureImportance --> Agent["Analytics Agent explanation\nwhich drivers matter most"]
```

Recommended production role:
- `risk_trend(layer)` should first read cached XGBoost forecasts if present.
- If cache is stale or missing, run `backend/train_bhumi_models.py` on the latest actual feature CSV.
- Store model artifact, metrics, feature importance, and forecast CSV.
- Return city-level trend plus ward/zone-level ranking to the agent.

## 5. Diffusion What-If Scenario Pipeline

```mermaid
flowchart LR
  ActualData["Actual feature history\nsatellite + rainfall + ward attributes"] --> TrainDiff["Tiny diffusion denoiser\nlearns risk distribution conditioned on features"]
  Intervention["User what-if\nmore trees / drains / lake restore / cool roofs"] --> FeatureShift["Counterfactual feature shift\nNDVI up, runoff down, LST down, etc."]
  FeatureShift --> Sample["Diffusion sampling\nN plausible futures"]
  TrainDiff --> Sample
  Sample --> ScenarioStats["Scenario statistics\nmean, p10, p90, uncertainty band"]
  ScenarioStats --> Cache[(Scenario cache\nkeyed by ward + intervention + magnitude + year)]
  Cache --> Agent["What-If Scenario Agent\nanswer + chart + map highlight"]
  Cache --> Dashboard["Before/after + uncertainty charts"]
```

Recommended production role:
- Use XGBoost for calibrated point forecasts.
- Use diffusion for plausible distributions and uncertainty under interventions.
- Cache scenario outputs because diffusion sampling is slower and repeated demos ask the same what-if questions.

## 6. Actual Data Generation And Refresh

```mermaid
sequenceDiagram
  participant Cron as Refresh Job / CLI
  participant GEE as Google Earth Engine
  participant Prep as data_prep/build_layers.py
  participant DB as MongoDB / JSON Store
  participant Train as backend/train_bhumi_models.py
  participant Cache as Forecast + Scenario Cache
  participant API as FastAPI
  participant Web as Dashboard

  Cron->>GEE: Pull Sentinel-2/MODIS features and zonal means
  GEE-->>Prep: NDVI, NDWI, LST, rainfall-derived features
  Prep->>Prep: Build ward scores, layers, scorecards, points
  Prep->>DB: Write data/*.json and/or Mongo collections
  Cron->>Train: Train/update XGBoost and diffusion models
  Train->>Cache: Save model artifacts, forecasts, scenario samples, plots
  API->>DB: Serve live data or JSON fallback
  API->>Cache: Serve forecasts and what-if outputs
  Web->>API: Ask, plan, trend, what-if, report
```

## 7. Agent Responsibilities

| Agent | Responsibility | Primary Tools / Data |
|---|---|---|
| Orchestrator Agent | Decides whether to answer casually, call tools, plan, forecast, simulate, or report | `backend/agent.py`, Sarvam `sarvam-30b` |
| Memory Agent | Keeps follow-up context and active ward/layer/session state | `backend/conversation.py`, Mongo/JSON fallback |
| Climate Data Agent | Reads current and historical risk layers | `get_layer`, `get_ward_stats`, `top_risk_wards`, `get_scorecards` |
| Geospatial Agent | Builds satellite-derived features and map layers | `backend/gee.py`, `data_prep/build_layers.py` |
| Trend Analytics Agent | Forecasts future risk and explains drivers | XGBoost model, `risk_trend`, feature importance |
| Scenario Agent | Generates plausible intervention futures | diffusion denoiser, `simulate_intervention`, scenario cache |
| Planner Agent | Optimizes intervention budget by impact-per-rupee | `plan_interventions`, `ward_population` |
| Voice Agent | Handles multilingual STT/TTS | Sarvam `saarika:v2.5`, `bulbul` |
| Report Agent | Produces council-ready action reports | `backend/report.py` |
| MCP Agent Interface | Exposes the same tools to external agents | `backend/mcp_server.py` |

## 8. Implementation Hooks To Add Next

The repo already has `backend/train_bhumi_models.py` and plot outputs. To wire the ML stack into the live agent, add:

1. `backend/ml_cache.py`
   - Reads/writes forecast CSVs, feature importance, diffusion samples, model metadata.
   - Cache key: `dataset_hash + target + layer + ward + intervention + magnitude`.

2. `backend/analytics.py`
   - `forecast_trend(layer, horizon_months=12)`.
   - Uses cached XGBoost forecast or triggers retraining.

3. `backend/scenarios.py`
   - `generate_what_if(ward, intervention, magnitude, n_samples=50)`.
   - Uses diffusion cache first, then samples and saves.

4. Tool registry additions in `backend/tools.py`
   - `xgboost_trend(layer, horizon_months)`.
   - `diffusion_what_if(ward, intervention, magnitude)`.
   - Keep existing `risk_trend` and `simulate_intervention` as fast fallbacks.

5. API endpoints in `backend/main.py`
   - `GET /analytics/trend?layer=flood`.
   - `POST /scenario/what-if`.
   - `GET /analytics/cache/status`.

