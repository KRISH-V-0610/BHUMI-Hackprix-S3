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
Hyderabad, India. You analyse satellite-derived climate risk (flood, heat, vegetation, \
urban growth, waterlogging, lake health) at the ward level.

Rules:
- ALWAYS use the tools to ground your answer in data. Typically: find the relevant layer, \
get the worst wards (top_risk_wards), then recommend_actions for them.
- Name specific wards and give 2-3 concrete municipal actions.
- Reply in the SAME language as the user (could be English, Hindi, Telugu or Gujarati).
- Keep the spoken answer to 3-5 sentences, clear enough for a city official. No markdown.
- Layer ids: flood, heat, veg (vegetation), urban, water (waterlogging), lake. Years: 2016, 2026.
- Disambiguation: "urban heat" / "heat island" / "temperature" = the `heat` layer. The `urban` \
layer is ONLY about built-up growth/construction. "Greenery"/"trees" = `veg`.
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

    layer = used_layer or _infer_layer(text)
    return _assemble(answer, lang, layer, used_year, collected, tool_log, reasoning_trace)


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

    # Charts: a bar of top wards + a radar of the worst ward's 6 risk dims.
    charts: list[dict] = []
    if ranked:
        charts.append({
            "type": "bar",
            "title": f"{config.LAYERS[layer]['label']} — top wards ({year})",
            "x": [w["name"] for w in ranked[:5]],
            "y": [w["score"] for w in ranked[:5]],
        })
        radar = _radar_for(ranked[0]["name"], year)
        if radar:
            charts.append(radar)

    # Actions from recommend_actions if the agent called it, else generate now.
    rec = collected.get("recommend_actions")
    if not isinstance(rec, dict) or "actions" not in rec:
        rec = toolkit.recommend_actions(layer, highlight)
    actions = rec.get("actions", [])

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
