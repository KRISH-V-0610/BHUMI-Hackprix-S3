"""Data store for Bhumi: MongoDB-backed, with automatic fallback to data/*.json.

Why the fallback: a hackathon demo must never die on a missing/unreachable database.
If MongoDB is reachable we read/write it (and `data_prep` seeds it); otherwise we serve
the precomputed JSON fixtures. Either way the API responses are identical.

Collections / files (one per logical dataset):
  layers      -> data/layers.json      / layers.sample.json
  wards       -> data/wards.json       / wards.sample.json   (GeoJSON FeatureCollection)
  timeseries  -> data/timeseries.json  / timeseries.sample.json
  scorecards  -> data/scorecards.json  / scorecards.sample.json
  conversations (Mongo only) -> chat history / query log
"""
from __future__ import annotations

import json
from typing import Any

import config

try:
    from pymongo import MongoClient
    from pymongo.errors import PyMongoError
except Exception:  # pragma: no cover - driver optional
    MongoClient = None  # type: ignore
    PyMongoError = Exception  # type: ignore


class Store:
    """Unified read/write over Mongo or JSON files."""

    def __init__(self) -> None:
        self._db = None
        self._mode = "json"
        self._connect()

    def _connect(self) -> None:
        if MongoClient is None:
            return
        try:
            client = MongoClient(config.MONGODB_URI, serverSelectionTimeoutMS=1500)
            client.admin.command("ping")
            self._db = client[config.MONGODB_DB]
            self._mode = "mongo"
        except Exception:
            self._db = None
            self._mode = "json"

    @property
    def mode(self) -> str:
        return self._mode

    # ── JSON fallback helpers ─────────────────────────────────
    @staticmethod
    def _read_json(name: str) -> Any:
        for candidate in (f"{name}.json", f"{name}.sample.json"):
            path = config.DATA_DIR / candidate
            if path.exists():
                return json.loads(path.read_text(encoding="utf-8"))
        return None

    # ── reads (used by the API) ───────────────────────────────
    def layers(self) -> dict:
        if self._mode == "mongo":
            docs = list(self._db["layers"].find({}, {"_id": 0}))
            if docs:
                return {"layers": docs}
        return self._read_json("layers") or {"layers": []}

    def wards(self) -> dict:
        if self._mode == "mongo":
            doc = self._db["wards"].find_one({}, {"_id": 0})
            if doc:
                return doc
        return self._read_json("wards") or {"type": "FeatureCollection", "features": []}

    def timeseries(self, metric: str = "rainfall") -> dict:
        if self._mode == "mongo":
            doc = self._db["timeseries"].find_one({"metric": metric}, {"_id": 0})
            if doc:
                return doc
        data = self._read_json("timeseries")
        if isinstance(data, list):
            return next((d for d in data if d.get("metric") == metric), data[0] if data else {})
        return data or {}

    def scorecards(self, year: int) -> dict:
        if self._mode == "mongo":
            doc = self._db["scorecards"].find_one({"year": year}, {"_id": 0})
            if doc:
                return doc
        data = self._read_json("scorecards")
        if isinstance(data, list):
            return next((d for d in data if d.get("year") == year), data[0] if data else {})
        return data or {"year": year, "cards": []}

    # ── writes ────────────────────────────────────────────────
    def seed(self, name: str, data: Any) -> None:
        """Replace a collection's contents (used by data_prep). No-op without Mongo."""
        if self._mode != "mongo":
            return
        coll = self._db[name]
        coll.delete_many({})
        if isinstance(data, list):
            if data:
                coll.insert_many(data)
        else:
            coll.insert_one(data)

    def save_conversation(self, doc: dict) -> None:
        """Append a chat turn to the conversation log (Mongo only; silent otherwise)."""
        if self._mode != "mongo":
            return
        try:
            self._db["conversations"].insert_one(doc)
        except PyMongoError:
            pass


# Single shared instance for the app
store = Store()
