"""Thin wrappers over the Sarvam AI API — STT, chat (tool-calling), translate, TTS.

All four endpoints were verified live against api.sarvam.ai (2026-06):
  • chat    POST /v1/chat/completions   model=sarvam-30b (reasoning model; supports tools)
  • STT     POST /speech-to-text        model=saaras:v2.5 (multipart audio)
  • TTS     POST /text-to-speech        -> {"audios": [base64 wav]}
  • trans   POST /translate             -> {"translated_text": ...}

Auth header is `api-subscription-key` (Sarvam-native). The chat endpoint also accepts
`Authorization: Bearer` for OpenAI-compatibility, but we use the native header everywhere.
"""
from __future__ import annotations

import base64
from typing import Any

import httpx

import config

_JSON_HEADERS = {
    "api-subscription-key": config.SARVAM_API_KEY,
    "Content-Type": "application/json",
}
_AUTH_HEADER = {"api-subscription-key": config.SARVAM_API_KEY}

# sarvam-30b is a reasoning model: it spends ~1500 tokens "thinking" (reasoning_content)
# before emitting the final answer (content). Always give it generous headroom or `content`
# comes back empty with finish_reason="length".
_DEFAULT_MAX_TOKENS = 3000


def chat(
    messages: list[dict[str, Any]],
    tools: list[dict] | None = None,
    tool_choice: str = "auto",
    max_tokens: int = _DEFAULT_MAX_TOKENS,
    reasoning_effort: str = "low",
    temperature: float = 0.3,
    timeout: float = 120.0,
    model: str | None = None,
) -> dict[str, Any]:
    """Call Sarvam chat completions. Returns the raw `choices[0]` dict.

    The returned dict has `message.content` (final answer), `message.reasoning_content`
    (the visible thinking trace), `message.tool_calls`, and `finish_reason`. `model` overrides
    the default chat model (must be a valid Sarvam model id).
    """
    chosen = model if model in config.SARVAM_MODEL_IDS else config.SARVAM_CHAT_MODEL
    body: dict[str, Any] = {
        "model": chosen,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "reasoning_effort": reasoning_effort,
    }
    if tools:
        body["tools"] = tools
        body["tool_choice"] = tool_choice
    r = httpx.post(
        f"{config.SARVAM_BASE_URL}/v1/chat/completions",
        headers=_JSON_HEADERS,
        json=body,
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()["choices"][0]


def speech_to_text(
    audio_bytes: bytes,
    filename: str = "audio.wav",
    language_code: str | None = None,
    timeout: float = 120.0,
) -> dict[str, str]:
    """Transcribe speech. Returns {'text': transcript, 'lang': bcp47_code}.

    `language_code=None` lets Saaras auto-detect the spoken language.
    """
    data: dict[str, str] = {"model": "saarika:v2.5"}
    if language_code:
        data["language_code"] = language_code
    files = {"file": (filename, audio_bytes, "audio/wav")}
    r = httpx.post(
        f"{config.SARVAM_BASE_URL}/speech-to-text",
        headers=_AUTH_HEADER,
        data=data,
        files=files,
        timeout=timeout,
    )
    r.raise_for_status()
    j = r.json()
    return {
        "text": j.get("transcript", ""),
        "lang": j.get("language_code") or language_code or "en-IN",
    }


def text_to_speech(
    text: str,
    language_code: str = "en-IN",
    speaker: str = "anushka",
    timeout: float = 60.0,
) -> dict[str, Any]:
    """Synthesize speech. Returns {'audio_base64', 'format', 'sample_rate'}.

    Sarvam TTS caps input at ~1500 chars per call; long answers are chunked and the
    decoded WAV bytes are concatenated, then re-encoded to one base64 string.
    """
    chunks = _split_for_tts(text)
    audio_segments: list[bytes] = []
    for chunk in chunks:
        body = {
            "text": chunk,
            "target_language_code": language_code,
            "speaker": speaker,
            "model": "bulbul:v2",
        }
        r = httpx.post(
            f"{config.SARVAM_BASE_URL}/text-to-speech",
            headers=_JSON_HEADERS,
            json=body,
            timeout=timeout,
        )
        r.raise_for_status()
        for b64 in r.json().get("audios", []):
            audio_segments.append(base64.b64decode(b64))

    merged = _concat_wav(audio_segments) if audio_segments else b""
    return {
        "audio_base64": base64.b64encode(merged).decode("ascii"),
        "format": "wav",
        "sample_rate": 22050,
    }


def translate(
    text: str,
    target_language_code: str,
    source_language_code: str = "auto",
    timeout: float = 60.0,
) -> str:
    """Translate text via Mayura. Returns the translated string."""
    body = {
        "input": text,
        "source_language_code": source_language_code,
        "target_language_code": target_language_code,
    }
    r = httpx.post(
        f"{config.SARVAM_BASE_URL}/translate",
        headers=_JSON_HEADERS,
        json=body,
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json().get("translated_text", text)


# ── helpers ───────────────────────────────────────────────────

def _split_for_tts(text: str, limit: int = 1400) -> list[str]:
    """Split text into <=limit-char chunks on sentence boundaries."""
    text = text.strip()
    if len(text) <= limit:
        return [text] if text else []
    chunks, current = [], ""
    for sentence in text.replace("। ", "।|").replace(". ", ".|").split("|"):
        if len(current) + len(sentence) > limit and current:
            chunks.append(current.strip())
            current = ""
        current += sentence + " "
    if current.strip():
        chunks.append(current.strip())
    return chunks


def _concat_wav(segments: list[bytes]) -> bytes:
    """Concatenate multiple WAV byte-strings into one (re-using the first header)."""
    if len(segments) == 1:
        return segments[0]
    import io
    import wave

    out_buf = io.BytesIO()
    writer: wave.Wave_write | None = None
    try:
        for seg in segments:
            with wave.open(io.BytesIO(seg), "rb") as w:
                if writer is None:
                    writer = wave.open(out_buf, "wb")
                    writer.setnchannels(w.getnchannels())
                    writer.setsampwidth(w.getsampwidth())
                    writer.setframerate(w.getframerate())
                writer.writeframes(w.readframes(w.getnframes()))
    finally:
        if writer is not None:
            writer.close()
    return out_buf.getvalue()
