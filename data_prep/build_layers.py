"""Build Bhumi's climate datasets -> data/*.json (+ *.sample.json) and seed MongoDB.

Hybrid by design:
  • If Google Earth Engine is reachable, hero layers (veg/flood/heat) use REAL satellite
    imagery: tile URLs from getMapId and per-ward zonal means from reduceRegions.
  • If GEE is unavailable (no access / offline), we synthesise realistic Hyderabad values
    so the entire stack still runs and demos. Re-run this script after fixing GEE to swap
    in real data — the output schema is identical either way.

Outputs (match contracts.md exactly):
  data/wards.json        GeoJSON FeatureCollection, properties.scores[year][layer] 0-100
  data/layers.json       {layers:[{id,year,label,tileUrl,opacity,legend}]}
  data/scorecards.json   [{year, cards:[...]}]
  data/timeseries.json   [{metric:'rainfall', ...}]
  *.sample.json copies    for the frontend's mock mode

Run:  python data_prep/build_layers.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import config  # noqa: E402
import gee  # noqa: E402

# ── Curated GHMC areas (name, lng, lat, urbanization 0..1) ────
# urbanization drives the synthetic risk profile (dense core = hotter, less green).
WARDS = [
    ("Kukatpally", 78.4006, 17.4849, 0.85),
    ("Charminar", 78.4747, 17.3616, 0.95),
    ("Secunderabad", 78.4983, 17.4399, 0.88),
    ("Begumpet", 78.4636, 17.4439, 0.80),
    ("Gachibowli", 78.3489, 17.4401, 0.55),
    ("Madhapur", 78.3915, 17.4483, 0.70),
    ("LB Nagar", 78.5526, 17.3463, 0.78),
    ("Uppal", 78.5591, 17.4058, 0.72),
    ("Serilingampally", 78.3000, 17.4800, 0.50),
    ("Khairatabad", 78.4610, 17.4150, 0.82),
    ("Jubilee Hills", 78.4090, 17.4310, 0.45),
    ("Banjara Hills", 78.4360, 17.4140, 0.48),
    ("Malkajgiri", 78.5300, 17.4480, 0.83),
    ("Hayathnagar", 78.6010, 17.3270, 0.60),
    ("Musheerabad", 78.5000, 17.4200, 0.90),
    ("Amberpet", 78.5240, 17.3920, 0.86),
]

LAYER_IDS = ["flood", "heat", "veg", "lake", "urban", "water"]


def _poly(lng: float, lat: float, r: float = 0.018):
    """Square polygon ring around a centroid (GeoJSON coords)."""
    return [[
        [lng - r, lat - r], [lng + r, lat - r],
        [lng + r, lat + r], [lng - r, lat + r], [lng - r, lat - r],
    ]]


def _synth_scores(name: str, urban: float, year: int) -> dict:
    """Deterministic, plausible 0-100 risk scores per layer for a year."""
    # stable per-ward jitter from the name
    seed = sum(ord(c) for c in name)
    j = ((seed % 17) - 8) / 8.0  # -1..1
    drift = 0 if year == 2016 else 1  # 2026 is worse for most risks

    heat = 55 + 35 * urban + 4 * j + 6 * drift
    flood = 45 + 25 * (1 - urban) + 30 * (0.5 + 0.5 * j) * 0.6 + 5 * drift
    veg_cover = 75 - 45 * urban + 6 * j - 8 * drift          # actual greenness
    veg = 100 - veg_cover                                     # risk = lack of veg
    urban_risk = 45 + 45 * urban + 3 * j + 7 * drift
    water = 40 + 28 * (1 - urban) + 18 * (0.5 + 0.5 * j) + 6 * drift
    lake = 50 + 20 * urban + 8 * j + 5 * drift

    raw = {"heat": heat, "flood": flood, "veg": veg,
           "urban": urban_risk, "water": water, "lake": lake}
    return {k: max(5, min(98, round(v))) for k, v in raw.items()}


def build_wards(use_gee: bool) -> dict:
    features = []
    for i, (name, lng, lat, urban) in enumerate(WARDS):
        scores = {str(y): _synth_scores(name, urban, y) for y in config.YEARS}
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": _poly(lng, lat)},
            "properties": {
                "name": name,
                "ward_no": 100 + i,
                "centroid": [lng, lat],
                "scores": scores,
            },
        })
    fc = {"type": "FeatureCollection", "features": features}

    if use_gee:
        _overlay_real_ward_means(fc)
    return fc


def _overlay_real_ward_means(fc: dict) -> None:
    """Replace synthetic hero-layer scores with real GEE zonal means where possible."""
    import ee

    ee_fc = ee.FeatureCollection([
        ee.Feature(ee.Geometry.Polygon(f["geometry"]["coordinates"]),
                   {"name": f["properties"]["name"]})
        for f in fc["features"]
    ])
    # raw value ranges -> 0-100 risk (invert veg)
    ranges = {"veg": (-0.1, 0.8, True), "flood": (-0.3, 0.5, False), "heat": (25, 45, False)}
    for layer, (lo, hi, invert) in ranges.items():
        for year in config.YEARS:
            try:
                means = {d["name"]: d["value"] for d in gee.ward_mean(layer, year, ee_fc)}
            except Exception as exc:
                print(f"[gee] ward_mean {layer} {year} failed: {exc}")
                continue
            for f in fc["features"]:
                v = means.get(f["properties"]["name"])
                if v is None:
                    continue
                norm = (v - lo) / (hi - lo)
                if invert:
                    norm = 1 - norm
                f["properties"]["scores"][str(year)][layer] = max(5, min(98, round(norm * 100)))
        print(f"[gee] overlaid real {layer} means")


def build_layers(use_gee: bool) -> dict:
    out = []
    for lid in LAYER_IDS:
        for year in config.YEARS:
            entry = {
                "id": lid,
                "year": year,
                "label": config.LAYERS[lid]["label"],
                "tileUrl": None,
                "opacity": 0.75,
                "legend": gee.LEGENDS.get(lid, []),
            }
            if use_gee and lid in ("veg", "flood", "heat", "urban", "water", "lake"):
                try:
                    entry["tileUrl"] = gee.layer_tiles(lid, year)["tileUrl"]
                except Exception as exc:
                    print(f"[gee] tile {lid} {year} failed: {exc}")
            out.append(entry)
    return {"layers": out}


def build_scorecards(wards: dict) -> list:
    levels = [(85, "Very High"), (70, "High"), (55, "Moderate"), (0, "Low")]

    def level_of(score):
        return next(lbl for thr, lbl in levels if score >= thr)

    cards_by_year = []
    feats = wards["features"]
    for year in config.YEARS:
        cards = []
        for lid in LAYER_IDS:
            vals = [f["properties"]["scores"][str(year)][lid] for f in feats]
            avg = round(sum(vals) / len(vals))
            prev = round(sum(f["properties"]["scores"][str(config.YEARS[0])][lid] for f in feats) / len(feats))
            cards.append({
                "id": lid, "label": config.LAYERS[lid]["label"],
                "score": avg, "level": level_of(avg),
                "delta_since_2016": avg - prev,
            })
        cards_by_year.append({"year": year, "cards": cards})
    return cards_by_year


def build_timeseries(use_gee: bool) -> list:
    base = [8, 10, 14, 24, 39, 110, 165, 150, 168, 96, 22, 5]
    s2026 = [round(v * 1.12 + (3 if 5 <= i <= 9 else 0)) for i, v in enumerate(base)]
    return [{
        "metric": "rainfall", "unit": "mm",
        "labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        "series": [
            {"name": "2016", "data": base},
            {"name": "2026", "data": s2026},
        ],
    }]


def _write(name: str, data) -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    for fname in (f"{name}.json", f"{name}.sample.json"):
        (config.DATA_DIR / fname).write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )


def main() -> None:
    use_gee = gee.init_ee()
    print(f"[build] Earth Engine: {'LIVE' if use_gee else 'UNAVAILABLE -> synthetic fallback'}")

    wards = build_wards(use_gee)
    layers = build_layers(use_gee)
    scorecards = build_scorecards(wards)
    timeseries = build_timeseries(use_gee)

    _write("wards", wards)
    _write("layers", layers)
    _write("scorecards", scorecards)
    _write("timeseries", timeseries)
    print(f"[build] wrote {len(wards['features'])} wards, {len(layers['layers'])} layer tiles")

    # Seed Mongo if reachable
    from db import store
    if store.mode == "mongo":
        store.seed("wards", wards)
        store.seed("layers", layers["layers"])
        store.seed("scorecards", scorecards)
        store.seed("timeseries", timeseries)
        print("[build] seeded MongoDB")
    else:
        print("[build] MongoDB unavailable -> serving JSON fixtures (fine for demo)")


if __name__ == "__main__":
    main()
