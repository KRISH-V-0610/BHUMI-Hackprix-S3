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


@app.get("/scorecards")
def scorecards(year: int = 2026):
    return store.scorecards(year)


@app.get("/timeseries")
def timeseries(metric: str = "rainfall"):
    return store.timeseries(metric)


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
