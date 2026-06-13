"""Bhumi agent — sarvam-30b drives the climate tools and returns the API contract object.

Flow (a hand-rolled ReAct loop; robust against LangGraph/Sarvam schema quirks):
  1. System prompt frames Bhumi as a Hyderabad climate-resilience advisor.
  2. sarvam-30b is given the tool registry and decides which tools to call.
  3. We execute each tool, feed results back, and loop until the model stops calling tools.
  4. The final assistant `content` becomes `answer_text`; every other contract field
     (set_layer, highlight_wards, charts, actions, focus, reasoning) is assembled
     DETERMINISTICALLY from the tool outputs — never parsed out of free-form LLM text.

The model is multilingual (Indic), so it answers in the user's language directly; we pass
the requested `lang` and instruct it accordingly.
"""
from __future__ import annotations

import json
from typing import Any

import config
import sarvam
import tools as toolkit

_MAX_ITERS = 4

_SYSTEM = """You are Bhumi, an agentic climate digital twin and resilience advisor for \
Hyderabad, India. You can analyse satellite-derived climate risk (flood, heat, vegetation, \
urban growth, waterlogging, lake health) at the ward level.

How to respond:
- Greetings, thanks, small talk, or questions unrelated to Hyderabad climate: just reply \
naturally and briefly (one or two sentences). Do NOT call any tools and do NOT recite ward \
data. For a bare "hi", a warm one-line greeting is enough — you may add that you can help \
explore Hyderabad's climate risks if they'd like, but keep it short.
- Only when the user actually asks about climate/risk (heat, flood, vegetation, urban growth, \
waterlogging, lakes, a specific ward, a what-if, or a year comparison): use the tools to ground \
your answer, name specific wards, and give 2-3 concrete actions.
- Match the user's language — reply in whatever major Indian language they use (English, Hindi, \
Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi or Odia) and stay \
conversational. Analysis answers: 3-5 sentences. Chit-chat: shorter. No markdown.

Tool notes:
- Layer ids: flood, heat, veg (vegetation), urban, water (waterlogging), lake.
- Years: 2016 and 2026 are observed; 2027 and 2028 are FORECAST (projected). Treat 2027-2028 \
as predictions and say so.
- "urban heat" / "heat island" / "temperature" = the `heat` layer. `urban` is ONLY built-up \
growth/construction. "Greenery"/"trees" = `veg`.
- "What if we..." questions -> use simulate_intervention for the named ward.
- "trend" / "forecast" / "next year" / "by 2028" / "future" -> use risk_trend.
"""

# Keyword -> layer fallback if the model answers without calling a layer tool.
_KEYWORDS = {
    "heat": ["heat", "hot", "temperature", "warm", "गर्मी", "వేడి", "ગરમી", "lst"],
    "flood": ["flood", "वरद", "వరద", "પૂર", "inundation"],
    "veg": ["veg", "green", "tree", "हरियाली", "పచ్చ", "લીલોતરી", "ndvi"],
    "urban": ["urban", "built", "construction", "शहरी", "నగర", "concrete"],
    "water": ["waterlog", "ponding", "जलभराव", "నీటి"],
    "lake": ["lake", "झील", "చెరువు", "તળાવ", "water body"],
}


def _infer_layer(text: str) -> str:
    t = (text or "").lower()
    for layer, kws in _KEYWORDS.items():
        if any(k in t for k in kws):
            return layer
    return "heat"


def run(text: str, lang: str = "en-IN", session_id: str | None = None) -> dict[str, Any]:
    """Run the agent on a question; return the full contract action object."""
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": f"[reply in {lang}] {text}"},
    ]
    tool_log: list[str] = []
    collected: dict[str, Any] = {}   # tool name -> last result
    used_layer: str | None = None
    used_year: int = 2026
    reasoning_trace = ""

    for _ in range(_MAX_ITERS):
        choice = sarvam.chat(messages, tools=toolkit.openai_tools(), tool_choice="auto")
        msg = choice["message"]
        reasoning_trace = msg.get("reasoning_content") or reasoning_trace
        calls = msg.get("tool_calls")

        if not calls:
            answer = (msg.get("content") or "").strip()
            messages.append({"role": "assistant", "content": answer})
            break

        # record assistant turn with its tool calls, then execute each
        messages.append({"role": "assistant", "content": msg.get("content"), "tool_calls": calls})
        for tc in calls:
            fn = tc["function"]["name"]
            try:
                args = json.loads(tc["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            result = toolkit.call(fn, args)
            collected[fn] = result
            if "layer" in args:
                used_layer = args["layer"]
            if "year" in args:
                used_year = int(args["year"])
            tool_log.append(f"{fn}({', '.join(f'{k}={v}' for k, v in args.items())})")
            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(result, ensure_ascii=False),
            })
    else:
        answer = "I analysed the available climate layers for Hyderabad."

    # No tools used -> casual/conversational turn: reply without driving the dashboard.
    if not tool_log:
        return _casual(answer, lang)

    layer = used_layer or _infer_layer(text)
    return _assemble(answer, lang, layer, used_year, collected, tool_log, reasoning_trace)


def _casual(answer: str, lang: str) -> dict[str, Any]:
    """Lightweight response for greetings / small talk — leaves the map untouched."""
    return {
        "answer_text": answer or "Hello! I'm Bhumi. Ask me about Hyderabad's climate risks.",
        "lang": lang,
        "set_layer": None,
        "set_view": None,
        "year": None,
        "highlight_wards": [],
        "focus": None,
        "charts": [],
        "actions": [],
        "reasoning": [],
    }


def _assemble(answer, lang, layer, year, collected, tool_log, reasoning_trace) -> dict[str, Any]:
    """Build the contract object from collected tool outputs (deterministic)."""
    layer = layer if layer in config.LAYERS else "heat"

    # Highlighted wards: prefer explicit top_risk_wards, else compute now.
    ranked = collected.get("top_risk_wards") or toolkit.top_risk_wards(layer, 5, year)
    if isinstance(ranked, dict):   # error fallback
        ranked = toolkit.top_risk_wards(layer, 5, year)
    highlight = [w["name"] for w in ranked[:5]]

    # Camera focus = centroid of worst ward.
    focus = None
    if ranked:
        c = ranked[0].get("centroid")
        if c:
            focus = {"center": c, "zoom": 12, "pitch": 50, "bearing": 20}

    # Charts: a DENSE bar of the worst wards (top 15) + a radar of the worst ward's 6 dims.
    charts: list[dict] = []
    if ranked:
        dense = toolkit.get_ward_stats(layer, year)[:15]   # full ranking, not just the 5 shown on map
        charts.append({
            "type": "bar",
            "title": f"{config.LAYERS[layer]['label']} — ward risk ranking ({year})",
            "x": [w["name"] for w in dense],
            "y": [w["score"] for w in dense],
        })
        radar = _radar_for(ranked[0]["name"], year)
        if radar:
            charts.append(radar)

    # Forecast: surface a multi-year trend line (history solid + forecast) when asked.
    trend = collected.get("risk_trend")
    if isinstance(trend, dict) and trend.get("series"):
        charts.insert(0, {
            "type": "line",
            "title": f"{trend['label']} — trend & forecast to {trend.get('forecast_year')}",
            "x": [str(s["year"]) + ("*" if s.get("forecast") else "") for s in trend["series"]],
            "y": [s["city_avg"] for s in trend["series"]],
            "forecast_from": next((s["year"] for s in trend["series"] if s.get("forecast")), None),
        })
        if not collected.get("top_risk_wards") and trend.get("forecast_top_wards"):
            highlight = [w["name"] for w in trend["forecast_top_wards"][:5]]
            year = trend.get("forecast_year", year)

    # What-if simulation: surface a before/after impact chart and focus the ward.
    sim = collected.get("simulate_intervention")
    if isinstance(sim, dict) and sim.get("changes"):
        charts.insert(0, {
            "type": "bar",
            "title": f"{sim['label']} — {sim['ward']}: before vs after",
            "x": [c["label"] for c in sim["changes"]],
            "series": [
                {"name": "Before", "data": [c["before"] for c in sim["changes"]]},
                {"name": "After", "data": [c["after"] for c in sim["changes"]]},
            ],
        })
        if sim["ward"] in highlight:
            highlight.remove(sim["ward"])
        highlight = [sim["ward"]] + highlight
        sw = toolkit._find_ward(sim["ward"])
        if sw:
            focus = {"center": sw["properties"]["centroid"], "zoom": 13, "pitch": 55, "bearing": 20}

    # Action planner: paint the funded wards on the map + a before/after chart + costed actions.
    plan_actions = None
    plan = collected.get("plan_interventions")
    if isinstance(plan, dict) and plan.get("picked"):
        picked = plan["picked"]
        layer = plan.get("layer", layer)
        highlight = [p["ward"] for p in picked[:8]] or highlight
        charts.insert(0, {
            "type": "bar",
            "title": f"{plan['label']} — {plan['wards_funded']} wards funded (₹{plan['total_cost']:,})",
            "x": [p["ward"] for p in picked],
            "series": [
                {"name": "Before", "data": [p["before"] for p in picked]},
                {"name": "After", "data": [p["after"] for p in picked]},
            ],
        })
        if picked and picked[0].get("centroid"):
            focus = {"center": picked[0]["centroid"], "zoom": 11.5, "pitch": 50, "bearing": 15}
        plan_actions = [
            f"Fund {plan['wards_funded']} wards with {plan['label'].lower()} — ₹{plan['total_cost']:,}",
            f"Projected impact: ~{plan['avg_risk_drop']} avg risk drop, "
            f"~{plan['people_out_of_severe']:,} residents out of severe risk",
            "Generate the costed action-plan report for council approval",
        ]

    # Actions: planner output wins; else recommend_actions (called or generated now).
    rec = collected.get("recommend_actions")
    if not isinstance(rec, dict) or "actions" not in rec:
        rec = toolkit.recommend_actions(layer, highlight)
    actions = plan_actions or rec.get("actions", [])

    reasoning = list(tool_log)
    if reasoning_trace:
        reasoning.insert(0, "🧠 " + reasoning_trace.strip()[:160])

    return {
        "answer_text": answer,
        "lang": lang,
        "set_layer": layer,
        "set_view": "2.5d" if highlight else "2d",
        "year": year,
        "highlight_wards": highlight,
        "focus": focus,
        "charts": charts,
        "actions": actions,
        "reasoning": reasoning,
    }


def _radar_for(ward_name: str, year: int) -> dict | None:
    """Radar chart of all 6 risk dimensions for one ward."""
    for f in toolkit.store.wards().get("features", []):
        if f["properties"]["name"] == ward_name:
            scores = f["properties"]["scores"].get(str(year), {})
            axes = list(config.LAYERS.keys())
            return {
                "type": "radar",
                "title": f"Risk profile — {ward_name} ({year})",
                "axes": axes,
                "values": [scores.get(a, 0) for a in axes],
            }
    return None
