"""Climate tool registry — the single source of truth for Bhumi's capabilities.

These pure functions read the data store (Mongo or JSON) and return structured results.
They are consumed by BOTH:
  • backend/agent.py    — exposed to sarvam-30b as OpenAI-style function tools
  • backend/mcp_server.py — exposed over the Model Context Protocol (FastMCP)

Each tool returns plain JSON-able dicts/lists so the agent can fold them straight into
the API contract object.
"""
from __future__ import annotations

from typing import Any

import config
from db import store

DEFAULT_YEAR = 2026

# Cause explanations + action templates per layer (used by recommend_actions / explain_risk).
_CAUSES = {
    "heat": "dense built-up cover, low vegetation and heat-trapping surfaces",
    "flood": "low-lying terrain, encroached drains and surface-water accumulation",
    "veg": "loss of tree cover and green space to construction",
    "urban": "rapid expansion of impervious built-up area",
    "water": "monsoon ponding where drainage capacity is exceeded",
    "lake": "shrinking and polluted water bodies under urban pressure",
}
_ACTIONS = {
    "heat": [
        "Launch a cool-roof (reflective paint) subsidy for the top heat wards",
        "Set a +15% ward tree-cover target and plant along arterial roads",
        "Create shaded micro-parks on vacant municipal plots",
    ],
    "flood": [
        "De-silt and widen primary storm-water drains before monsoon",
        "Remove encroachments on nala buffer zones",
        "Install ward-level early-warning water-level sensors",
    ],
    "veg": [
        "Protect remaining green cover with a no-build green register",
        "Mandate tree planting in all new building approvals",
        "Convert road medians and lake edges into green corridors",
    ],
    "urban": [
        "Enforce permeable-surface norms in new construction",
        "Cap impervious cover per plot and incentivise green roofs",
        "Direct growth toward planned, drainage-ready zones",
    ],
    "water": [
        "Build recharge pits and retention ponds in ponding hotspots",
        "Clear choke points in the secondary drain network",
        "Map and protect natural water channels from encroachment",
    ],
    "lake": [
        "Restore and fence priority lakes; stop sewage inflow",
        "Set up wetland buffers and de-weeding schedules",
        "Revive feeder channels between cascading lakes",
    ],
}


# What-if interventions: effect on 0-100 risk per 1% of magnitude (negative = lowers risk).
INTERVENTIONS = {
    "tree_cover": {"label": "Increase tree / green cover",
                   "effects": {"heat": -0.45, "veg": -0.70, "water": -0.10}},
    "cool_roof": {"label": "Cool reflective roofs",
                  "effects": {"heat": -0.55}},
    "permeable_surface": {"label": "Permeable surfaces & green roofs",
                          "effects": {"flood": -0.50, "water": -0.55, "urban": -0.20}},
    "drain_desilt": {"label": "De-silt & widen storm drains",
                     "effects": {"flood": -0.70, "water": -0.65}},
    "lake_restore": {"label": "Restore lakes & wetlands",
                     "effects": {"lake": -0.70, "water": -0.20}},
}


def _wards_features() -> list[dict]:
    return store.wards().get("features", [])


def _find_ward(name: str) -> dict | None:
    name = (name or "").strip().lower()
    feats = _wards_features()
    for f in feats:
        if f["properties"]["name"].lower() == name:
            return f
    for f in feats:                       # forgiving partial match
        if name and name in f["properties"]["name"].lower():
            return f
    return None


def _norm_layer(layer: str) -> str:
    layer = (layer or "").lower().strip()
    return layer if layer in config.LAYERS else "heat"


# ── Tools ─────────────────────────────────────────────────────

def get_layer(layer: str = "heat", year: int = DEFAULT_YEAR) -> dict[str, Any]:
    """Return the map layer (tile URL + legend) for a layer id and year."""
    layer = _norm_layer(layer)
    for entry in store.layers().get("layers", []):
        if entry["id"] == layer and int(entry["year"]) == int(year):
            return entry
    return {"id": layer, "year": year, "label": config.LAYERS[layer]["label"],
            "tileUrl": None, "legend": []}


def get_ward_stats(layer: str = "heat", year: int = DEFAULT_YEAR) -> list[dict]:
    """Per-ward 0-100 risk scores for a layer/year, sorted worst-first."""
    layer = _norm_layer(layer)
    rows = []
    for f in _wards_features():
        p = f["properties"]
        score = p["scores"].get(str(year), {}).get(layer)
        if score is not None:
            rows.append({"name": p["name"], "score": score, "centroid": p["centroid"]})
    rows.sort(key=lambda r: r["score"], reverse=True)
    return rows


def top_risk_wards(layer: str = "heat", n: int = 5, year: int = DEFAULT_YEAR) -> list[dict]:
    """The n highest-risk wards for a layer/year."""
    return get_ward_stats(layer, year)[: max(1, int(n))]


def compare_years(layer: str = "heat", y1: int = 2016, y2: int = 2026) -> dict:
    """City-wide and per-ward change in a layer between two years."""
    layer = _norm_layer(layer)
    feats = _wards_features()

    def avg(year):
        vals = [f["properties"]["scores"].get(str(year), {}).get(layer) for f in feats]
        vals = [v for v in vals if v is not None]
        return round(sum(vals) / len(vals)) if vals else 0

    a, b = avg(y1), avg(y2)
    movers = []
    for f in feats:
        p = f["properties"]
        s1 = p["scores"].get(str(y1), {}).get(layer)
        s2 = p["scores"].get(str(y2), {}).get(layer)
        if s1 is not None and s2 is not None:
            movers.append({"name": p["name"], "delta": s2 - s1})
    movers.sort(key=lambda m: m["delta"], reverse=True)
    return {
        "layer": layer, "y1": y1, "y2": y2,
        "city_avg_y1": a, "city_avg_y2": b, "city_delta": b - a,
        "biggest_increases": movers[:3],
    }


def recommend_actions(layer: str = "heat", wards: list[str] | None = None) -> dict:
    """Concrete interventions for a layer, optionally targeted at named wards."""
    layer = _norm_layer(layer)
    actions = list(_ACTIONS.get(layer, []))
    if wards:
        actions = [f"{a} (priority: {', '.join(wards[:3])})" if i == 0 else a
                   for i, a in enumerate(actions)]
    return {"layer": layer, "cause": _CAUSES.get(layer, ""), "actions": actions}


def explain_risk(layer: str = "heat") -> dict:
    """Short plain-language cause of a given risk layer."""
    layer = _norm_layer(layer)
    return {"layer": layer, "cause": _CAUSES.get(layer, "")}


def get_scorecards(year: int = DEFAULT_YEAR) -> dict:
    """City-wide aggregate risk scorecards for a year."""
    return store.scorecards(int(year))


def risk_trend(layer: str = "heat") -> dict:
    """Historical + forecast trajectory of a layer's city-average risk across all years.

    Years 2027-2028 are projected (forecast). Use for 'what's the trend / forecast / what will
    X be next year' questions, and to draw the forecast line chart.
    """
    layer = _norm_layer(layer)
    feats = _wards_features()
    series = []
    for year in config.SCORE_YEARS:
        vals = [f["properties"]["scores"].get(str(year), {}).get(layer) for f in feats]
        vals = [v for v in vals if v is not None]
        if vals:
            series.append({
                "year": year,
                "city_avg": round(sum(vals) / len(vals)),
                "forecast": year in config.FORECAST_YEARS,
            })
    last = config.SCORE_YEARS[-1]
    top = top_risk_wards(layer, 5, last)
    return {"layer": layer, "label": config.LAYERS[layer]["label"],
            "series": series, "forecast_top_wards": top, "forecast_year": last}


def simulate_intervention(
    ward: str,
    intervention: str = "tree_cover",
    magnitude: float = 15,
    year: int = DEFAULT_YEAR,
) -> dict:
    """Project the climate-risk impact of an intervention in a ward (what-if simulation).

    intervention: tree_cover | cool_roof | permeable_surface | drain_desilt | lake_restore.
    magnitude: percent / intensity of the action (default 15). Returns before/after per
    affected layer so the dashboard can show an impact bar.
    """
    spec = INTERVENTIONS.get(intervention)
    if spec is None:
        return {"error": f"unknown intervention {intervention!r}",
                "options": list(INTERVENTIONS.keys())}
    feat = _find_ward(ward)
    if feat is None:
        return {"error": f"unknown ward {ward!r}"}

    name = feat["properties"]["name"]
    scores = feat["properties"]["scores"].get(str(year), {})
    mag = max(0.0, float(magnitude))
    changes = []
    for layer, per_pct in spec["effects"].items():
        before = scores.get(layer)
        if before is None:
            continue
        after = max(5, min(98, round(before + per_pct * mag)))
        changes.append({
            "layer": layer, "label": config.LAYERS[layer]["label"],
            "before": before, "after": after, "delta": after - before,
        })
    primary = changes[0] if changes else None
    summary = (
        f"{spec['label']} (~{int(mag)}%) in {name} could cut "
        f"{primary['label'].lower()} risk from {primary['before']} to {primary['after']} "
        f"({primary['delta']:+d})." if primary else "No measurable effect."
    )
    return {
        "ward": name, "intervention": intervention, "label": spec["label"],
        "magnitude": mag, "year": year, "changes": changes, "summary": summary,
    }


# ── Registry: name -> (callable, JSON-schema for tool-calling) ─

REGISTRY: dict[str, dict] = {
    "get_layer": {
        "func": get_layer,
        "description": "Get the map tile layer (tileUrl + legend) for a climate layer and year. "
                       "Call this to switch which layer the map shows.",
        "parameters": {
            "type": "object",
            "properties": {
                "layer": {"type": "string", "enum": list(config.LAYERS.keys())},
                "year": {"type": "integer", "enum": config.YEARS},
            },
            "required": ["layer"],
        },
    },
    "get_ward_stats": {
        "func": get_ward_stats,
        "description": "Get per-ward 0-100 risk scores for a layer/year, sorted worst first.",
        "parameters": {
            "type": "object",
            "properties": {
                "layer": {"type": "string", "enum": list(config.LAYERS.keys())},
                "year": {"type": "integer", "enum": config.SCORE_YEARS},
            },
            "required": ["layer"],
        },
    },
    "top_risk_wards": {
        "func": top_risk_wards,
        "description": "Get the N highest-risk wards for a layer/year. Use to find hotspots.",
        "parameters": {
            "type": "object",
            "properties": {
                "layer": {"type": "string", "enum": list(config.LAYERS.keys())},
                "n": {"type": "integer", "default": 5},
                "year": {"type": "integer", "enum": config.SCORE_YEARS},
            },
            "required": ["layer"],
        },
    },
    "compare_years": {
        "func": compare_years,
        "description": "Compare a layer between two years (Time Machine). Returns city + ward deltas.",
        "parameters": {
            "type": "object",
            "properties": {
                "layer": {"type": "string", "enum": list(config.LAYERS.keys())},
                "y1": {"type": "integer", "enum": config.SCORE_YEARS},
                "y2": {"type": "integer", "enum": config.SCORE_YEARS},
            },
            "required": ["layer"],
        },
    },
    "recommend_actions": {
        "func": recommend_actions,
        "description": "Get concrete municipal interventions for a layer, optionally targeting wards.",
        "parameters": {
            "type": "object",
            "properties": {
                "layer": {"type": "string", "enum": list(config.LAYERS.keys())},
                "wards": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["layer"],
        },
    },
    "explain_risk": {
        "func": explain_risk,
        "description": "Explain the main cause of a given climate risk layer in plain language.",
        "parameters": {
            "type": "object",
            "properties": {"layer": {"type": "string", "enum": list(config.LAYERS.keys())}},
            "required": ["layer"],
        },
    },
    "risk_trend": {
        "func": risk_trend,
        "description": "Get a layer's city-average risk across 2016, 2026 and the 2027-2028 "
                       "FORECAST, plus the projected worst wards. Use for trend / forecast / "
                       "'what will it be next year' questions.",
        "parameters": {
            "type": "object",
            "properties": {"layer": {"type": "string", "enum": list(config.LAYERS.keys())}},
            "required": ["layer"],
        },
    },
    "simulate_intervention": {
        "func": simulate_intervention,
        "description": "What-if simulation: project how a municipal intervention (more tree "
                       "cover, cool roofs, permeable surfaces, drain de-silting, lake restoration) "
                       "would change a ward's risk scores. Use for 'what if we...' questions.",
        "parameters": {
            "type": "object",
            "properties": {
                "ward": {"type": "string"},
                "intervention": {"type": "string", "enum": list(INTERVENTIONS.keys())},
                "magnitude": {"type": "number", "default": 15},
                "year": {"type": "integer", "enum": config.SCORE_YEARS},
            },
            "required": ["ward", "intervention"],
        },
    },
}


def openai_tools() -> list[dict]:
    """Return the registry as OpenAI/Sarvam `tools` definitions."""
    return [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": spec["description"],
                "parameters": spec["parameters"],
            },
        }
        for name, spec in REGISTRY.items()
    ]


def call(name: str, arguments: dict) -> Any:
    """Dispatch a tool by name with keyword arguments."""
    if name not in REGISTRY:
        return {"error": f"unknown tool {name}"}
    try:
        return REGISTRY[name]["func"](**(arguments or {}))
    except Exception as exc:  # defensive: never crash the agent loop
        return {"error": f"{name} failed: {exc}"}
