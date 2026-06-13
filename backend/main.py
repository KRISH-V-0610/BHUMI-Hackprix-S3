"""Bhumi FastAPI backend — the AI half.

Endpoints (see contracts.md for exact shapes):
  GET  /health                      service + data-source status
  GET  /layers                      tile URLs + legends
  GET  /wards                       GeoJSON wards with per-layer 0-100 scores
  GET  /scorecards?year=2026        city-wide aggregate risk cards
  GET  /timeseries?metric=rainfall  chart series
  POST /voice   (multipart audio)   Sarvam STT -> {text, lang}
  POST /ask     {text, lang}        agentic answer (the contract action object)
  POST /tts     {text, lang}        Sarvam TTS -> {audio_base64}
  POST /report  {year,wards,layer}  PDF action plan
  GET  /languages                   supported UI languages

Run:  uvicorn main:app --reload --port 8000   (from the backend/ dir)
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

import agent
import config
import report as report_mod
import sarvam
import tools as toolkit
from db import store

app = FastAPI(title="Bhumi — Agentic Climate Digital Twin", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in config.CORS_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── request models ────────────────────────────────────────────
class AskBody(BaseModel):
    text: str
    lang: str | None = None
    session_id: str | None = None


class TTSBody(BaseModel):
    text: str
    lang: str = "en-IN"
    speaker: str = "anushka"


class ReportBody(BaseModel):
    lang: str = "en-IN"
    year: int = 2026
    wards: list[str] | None = None
    layer: str = "heat"


class AlertBody(BaseModel):
    layer: str = "flood"
    lang: str = "en-IN"
    year: int = 2026
    n: int = 4
    speak: bool = True


class PlanBody(BaseModel):
    budget: float = 50_000_000
    intervention: str = "tree_cover"
    layer: str | None = None
    year: int = 2026


def _err(message: str, code: str = "error", status: int = 500) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


# ── data endpoints (served from Mongo or JSON fixtures) ───────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "data_source": store.mode,                 # "mongo" | "json"
        "chat_model": config.SARVAM_CHAT_MODEL,
        "languages": list(config.SUPPORTED_LANGUAGES.keys()),
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/languages")
def languages():
    return {"languages": [{"code": k, "label": v} for k, v in config.SUPPORTED_LANGUAGES.items()]}


@app.get("/layers")
def layers():
    return store.layers()


@app.get("/wards")
def wards():
    return store.wards()


@app.get("/points")
def points():
    """Geotagged risk points (the glowing dots) with per-layer intensity. For a ScatterplotLayer."""
    return store.points()


@app.get("/scorecards")
def scorecards(year: int = 2026):
    return store.scorecards(year)


@app.get("/timeseries")
def timeseries(metric: str = "rainfall"):
    return store.timeseries(metric)


@app.post("/plan")
def plan(body: PlanBody):
    """Budget-aware action planner: rank wards by impact-per-rupee and fund within the budget."""
    try:
        return toolkit.plan_interventions(
            budget=body.budget, intervention=body.intervention, layer=body.layer, year=body.year
        )
    except Exception as exc:
        return _err(f"plan failed: {exc}", "plan_error")


# ── Sarvam-powered endpoints ──────────────────────────────────
@app.post("/voice")
async def voice(audio: UploadFile = File(...), lang: str | None = Form(None)):
    """Speech -> text + detected language. Frontend then calls /ask."""
    try:
        data = await audio.read()
        result = sarvam.speech_to_text(data, filename=audio.filename or "audio.wav",
                                       language_code=lang)
        return result
    except Exception as exc:
        return _err(f"STT failed: {exc}", "stt_error")


@app.post("/ask")
def ask(body: AskBody):
    """The agent: reason over climate data and return the contract action object."""
    try:
        lang = body.lang or config.DEFAULT_LANGUAGE
        result = agent.run(body.text, lang=lang, session_id=body.session_id)
        store.save_conversation({
            "session_id": body.session_id,
            "question": body.text,
            "lang": lang,
            "answer_text": result.get("answer_text"),
            "set_layer": result.get("set_layer"),
            "highlight_wards": result.get("highlight_wards"),
            "ts": datetime.now(timezone.utc),
        })
        return result
    except Exception as exc:
        return _err(f"agent failed: {exc}", "agent_error")


@app.post("/tts")
def tts(body: TTSBody):
    """Text -> spoken audio in the requested language."""
    try:
        return sarvam.text_to_speech(body.text, language_code=body.lang, speaker=body.speaker)
    except Exception as exc:
        return _err(f"TTS failed: {exc}", "tts_error")


@app.post("/simulate-alert")
def simulate_alert(body: AlertBody):
    """Proactive monitoring: Bhumi issues a spoken early-warning for the highest-risk wards.

    Returns a contract-style object (so the dashboard can react) PLUS spoken audio, turning
    Bhumi from a reactive dashboard into an autonomous agent.
    """
    try:
        layer = body.layer if body.layer in config.LAYERS else "flood"
        ranked = toolkit.top_risk_wards(layer, body.n, body.year)
        names = [w["name"] for w in ranked]
        worst = ranked[0] if ranked else None
        label = config.LAYERS[layer]["label"]

        prompt = (
            f"You are Bhumi issuing a SHORT urgent climate early-warning for Hyderabad. "
            f"Risk type: {label}. Highest-risk wards (score/100): "
            f"{', '.join(f'{w['name']} {w['score']}' for w in ranked)}. "
            f"Write a 2-3 sentence spoken alert naming the top wards and ONE immediate "
            f"precaution. Reply in {body.lang}. No markdown, no preamble."
        )
        choice = sarvam.chat(
            [{"role": "system", "content": "You are Bhumi, a civic climate early-warning agent."},
             {"role": "user", "content": prompt}],
            tool_choice="none",
        )
        alert_text = (choice["message"].get("content") or "").strip() or (
            f"Alert: {label} risk is highest in {', '.join(names[:3])}. Take precautions.")

        severity = "severe" if worst and worst["score"] >= 85 else (
            "high" if worst and worst["score"] >= 70 else "moderate")
        focus = None
        if worst and worst.get("centroid"):
            focus = {"center": worst["centroid"], "zoom": 12, "pitch": 50, "bearing": 20}

        dense = toolkit.get_ward_stats(layer, body.year)[:15]
        result = {
            "alert_text": alert_text,
            "lang": body.lang,
            "set_layer": layer,
            "set_view": "2.5d",
            "year": body.year,
            "severity": severity,
            "highlight_wards": names,
            "focus": focus,
            "charts": [{
                "type": "bar", "title": f"{label} — ward risk ranking ({body.year})",
                "x": [w["name"] for w in dense],
                "y": [w["score"] for w in dense],
            }],
        }
        if body.speak:
            try:
                result["audio_base64"] = sarvam.text_to_speech(
                    alert_text, language_code=body.lang)["audio_base64"]
            except Exception:
                result["audio_base64"] = None
        return result
    except Exception as exc:
        return _err(f"alert failed: {exc}", "alert_error")


@app.post("/report")
def report(body: ReportBody):
    """Ward-level climate action plan as a downloadable PDF."""
    try:
        pdf = report_mod.build_report(year=body.year, wards=body.wards,
                                      layer=body.layer, lang=body.lang)
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="bhumi-action-report.pdf"'},
        )
    except Exception as exc:
        return _err(f"report failed: {exc}", "report_error")


def main() -> None:
    """Run the Bhumi API server. Lets you start it with `python main.py`.

    Host/port/reload come from .env (APP_HOST, APP_PORT, APP_RELOAD) with sensible defaults.
    Set APP_RELOAD=1 for auto-reload during development.
    """
    import uvicorn

    print(f"[Bhumi] API starting on http://{config.APP_HOST}:{config.APP_PORT} "
          f"(data: {store.mode}, model: {config.SARVAM_CHAT_MODEL})")
    print(f"[Bhumi] Swagger UI: http://localhost:{config.APP_PORT}/docs")
    uvicorn.run(
        "main:app" if config.APP_RELOAD else app,
        host=config.APP_HOST,
        port=config.APP_PORT,
        reload=config.APP_RELOAD,
    )


if __name__ == "__main__":
    main()
