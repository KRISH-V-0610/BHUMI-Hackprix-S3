"""Central config + env loading for the Bhumi backend.

Tolerant of the slightly non-standard key names already present in the repo's
.env (E_ACCOUNT / E_PRIVATE_KEY_FILE) as well as the documented EE_* names.
"""
from __future__ import annotations

import os
from pathlib import Path

# Project root = parent of this backend/ folder
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader (no external dependency).

    Accepts `KEY = value` or `KEY=value`, ignores blank lines and `#` comments.
    Does not overwrite variables already set in the real environment.
    """
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv(ROOT / ".env")


def _first(*names: str, default: str | None = None) -> str | None:
    """Return the first non-empty env var among `names`."""
    for n in names:
        v = os.environ.get(n)
        if v:
            return v
    return default


# ── Sarvam ────────────────────────────────────────────────────
SARVAM_API_KEY = _first("SARVAM_API_KEY", default="")
SARVAM_BASE_URL = _first("SARVAM_BASE_URL", default="https://api.sarvam.ai")
SARVAM_CHAT_MODEL = _first("SARVAM_CHAT_MODEL", default="sarvam-30b")

# ── Google Earth Engine ───────────────────────────────────────
# Support both EE_* (documented) and E_* (already in this repo's .env).
EE_SERVICE_ACCOUNT = _first("EE_SERVICE_ACCOUNT", "EE_ACCOUNT", "E_ACCOUNT")
EE_PRIVATE_KEY_FILE = _first(
    "EE_PRIVATE_KEY_FILE", "E_PRIVATE_KEY_FILE", default="nrsc-476605-efe7177655bf.json"
)
EE_PROJECT = _first("EE_PROJECT", default="nrsc-476605")

# ── MongoDB ───────────────────────────────────────────────────
# Local default; point at MongoDB Atlas via MONGODB_URI for a hosted demo.
# The backend degrades gracefully to data/*.json if Mongo is unreachable.
MONGODB_URI = _first("MONGODB_URI", default="mongodb://localhost:27017")
MONGODB_DB = _first("MONGODB_DB", default="bhumi")

# ── Languages (Sarvam BCP-47 codes we officially support in the UI) ──
SUPPORTED_LANGUAGES = {
    "en-IN": "English",
    "hi-IN": "हिन्दी (Hindi)",
    "te-IN": "తెలుగు (Telugu)",
    "gu-IN": "ગુજરાતી (Gujarati)",
}
DEFAULT_LANGUAGE = "en-IN"

# ── Backend / CORS ────────────────────────────────────────────
APP_HOST = _first("APP_HOST", default="0.0.0.0")
APP_PORT = int(_first("APP_PORT", default="8000"))
APP_RELOAD = (_first("APP_RELOAD", default="0") or "0").lower() in ("1", "true", "yes")
CORS_ORIGINS = (
    _first("CORS_ORIGINS", default="http://localhost:5173,http://localhost:3000") or ""
).split(",")

# Hyderabad bounding box [minLon, minLat, maxLon, maxLat] (GHMC + buffer)
HYDERABAD_BBOX = [78.20, 17.20, 78.70, 17.60]
HYDERABAD_CENTER = [78.4747, 17.3850]

# Canonical layer registry — id -> display label + whether higher value = worse
LAYERS = {
    "flood": {"label": "Flood Risk", "invert": False},
    "heat": {"label": "Heat Stress", "invert": False},
    "veg": {"label": "Vegetation", "invert": True},   # less veg = worse
    "lake": {"label": "Lake Health", "invert": False},
    "urban": {"label": "Urban Growth", "invert": False},
    "water": {"label": "Waterlogging", "invert": False},
}
YEARS = [2016, 2026]                 # historical years with real GEE satellite tiles
FORECAST_YEARS = [2027, 2028]        # projected (damped trend extrapolation)
SCORE_YEARS = YEARS + FORECAST_YEARS  # all years present in ward scores / scorecards


def ee_key_path() -> Path:
    """Absolute path to the GEE service-account JSON key."""
    p = Path(EE_PRIVATE_KEY_FILE)
    return p if p.is_absolute() else (ROOT / p)
