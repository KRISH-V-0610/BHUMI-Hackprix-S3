"""Build Bhumi's climate datasets -> data/*.json (+ *.sample.json) and seed MongoDB.

Hybrid by design:
  • If Google Earth Engine is reachable, hero layers (veg/flood/heat) use REAL satellite
    imagery: tile URLs from getMapId and per-ward zonal means from reduceRegions.
  • If GEE is unavailable, we synthesise REALISTIC, geotagged Hyderabad values so the whole
    stack runs and demos. Re-run after fixing GEE to swap in real data — schema is identical.

Realism model: 50 real GHMC localities with accurate centroids, irregular (organic) ward
polygons, and per-layer 0-100 risk derived from three physical drivers per ward —
  d = built-up density, g = green cover, l = low-lying / flood propensity.
2016 vs 2026 differ per ward and per layer (most risks rise faster in dense developing wards;
some green wards actually improve), so deltas span a realistic range (≈ -8 .. +20).

Outputs (match contracts.md):
  data/wards.json       GeoJSON, properties.scores[year][layer] 0-100 + centroid
  data/layers.json      {layers:[{id,year,label,tileUrl,opacity,legend}]}
  data/points.json      {points:[{lng,lat,ward,scores{6 layers}}]}  (the glowing risk dots)
  data/scorecards.json  [{year, cards:[...]}]
  data/timeseries.json  [{metric:'rainfall', ...}]
  *.sample.json copies   bundled offline snapshot for the frontend

Run:  python data_prep/build_layers.py
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import config  # noqa: E402
import gee  # noqa: E402

# ── 50 real Hyderabad localities: (name, lng, lat, density, green, low_lying) ──
# Drivers calibrated to documented reality (sources in README): 2020/2025 Musi & monsoon
# flood reports (Malakpet, Saidabad/Moosarambagh, Charminar, Nampally, Nagole, Gachibowli/
# HITEC waterlogging), GHMC urban-heat-island studies (Gachibowli, Hayathnagar, Nagole hot;
# KBR/Jubilee Hills canopy ~5°C cooler), and lake-degradation reports (Hussain Sagar, Durgam
# Cheruvu, Saroornagar). low_lying encodes flood propensity; green encodes canopy/cooling.
WARDS = [
    # Old city — dense, low canopy, Musi flood belt
    ("Charminar", 78.4747, 17.3616, 0.95, 0.08, 0.72),
    ("Falaknuma", 78.4670, 17.3300, 0.85, 0.10, 0.66),
    ("Yakutpura", 78.4830, 17.3520, 0.88, 0.09, 0.62),
    ("Malakpet", 78.5010, 17.3730, 0.84, 0.12, 0.85),       # 10 colonies inundated, 2020
    ("Chandrayangutta", 78.4900, 17.3300, 0.86, 0.10, 0.50),
    ("Bahadurpura", 78.4540, 17.3520, 0.80, 0.20, 0.55),
    ("Santosh Nagar", 78.5050, 17.3520, 0.83, 0.11, 0.58),
    ("Saidabad", 78.5150, 17.3650, 0.84, 0.11, 0.80),       # Moosarambagh flood belt
    ("Amberpet", 78.5240, 17.3920, 0.86, 0.13, 0.74),       # Ramanthapur / Musi
    ("Musheerabad", 78.5000, 17.4200, 0.90, 0.11, 0.62),    # Bholakpur waterlogging
    # Central
    ("Khairatabad", 78.4610, 17.4150, 0.84, 0.22, 0.62),    # Hussain Sagar edge
    ("Ameerpet", 78.4480, 17.4375, 0.88, 0.14, 0.50),
    ("SR Nagar", 78.4430, 17.4420, 0.86, 0.14, 0.48),
    ("Punjagutta", 78.4530, 17.4270, 0.85, 0.18, 0.45),
    ("Somajiguda", 78.4600, 17.4250, 0.84, 0.20, 0.50),
    ("Banjara Hills", 78.4360, 17.4140, 0.55, 0.55, 0.32),  # KBR canopy — cool
    ("Jubilee Hills", 78.4090, 17.4310, 0.50, 0.60, 0.28),  # KBR canopy — cool
    # West IT corridor — fast urban growth + drainage waterlogging
    ("Madhapur", 78.3915, 17.4483, 0.74, 0.28, 0.55),       # Durgam Cheruvu
    ("HITEC City", 78.3800, 17.4450, 0.72, 0.30, 0.52),
    ("Gachibowli", 78.3489, 17.4401, 0.68, 0.28, 0.58),     # UHI hotspot + IT waterlog
    ("Kondapur", 78.3620, 17.4640, 0.68, 0.32, 0.52),
    ("Manikonda", 78.3850, 17.4030, 0.66, 0.30, 0.40),
    ("Nanakramguda", 78.3450, 17.4200, 0.58, 0.38, 0.30),
    ("Serilingampally", 78.3000, 17.4800, 0.55, 0.42, 0.35),
    ("Miyapur", 78.3540, 17.4960, 0.70, 0.28, 0.40),
    # Northwest
    ("Kukatpally", 78.4006, 17.4849, 0.86, 0.16, 0.50),     # nala overflow
    ("Nizampet", 78.3870, 17.5050, 0.68, 0.30, 0.40),
    ("Bachupally", 78.3650, 17.5250, 0.56, 0.42, 0.32),
    ("Quthbullapur", 78.4350, 17.5050, 0.72, 0.25, 0.42),
    # Secunderabad zone
    ("Secunderabad", 78.4983, 17.4399, 0.88, 0.20, 0.48),
    ("Begumpet", 78.4636, 17.4439, 0.80, 0.26, 0.48),       # Hussain Sagar
    ("Marredpally", 78.5040, 17.4480, 0.78, 0.30, 0.40),
    ("Trimulgherry", 78.5180, 17.4720, 0.72, 0.30, 0.40),
    ("Bowenpally", 78.4820, 17.4720, 0.74, 0.24, 0.46),
    ("Alwal", 78.5050, 17.5020, 0.66, 0.30, 0.40),
    ("Malkajgiri", 78.5300, 17.4480, 0.83, 0.18, 0.52),
    ("Kapra", 78.5650, 17.4830, 0.64, 0.32, 0.42),
    ("Neredmet", 78.5400, 17.4650, 0.70, 0.26, 0.46),
    # East — industrial + low-lying
    ("Uppal", 78.5591, 17.4058, 0.74, 0.24, 0.56),
    ("Nacharam", 78.5520, 17.4280, 0.76, 0.20, 0.52),       # industrial, polluted lakes
    ("Habsiguda", 78.5400, 17.4080, 0.76, 0.28, 0.46),
    ("LB Nagar", 78.5526, 17.3463, 0.80, 0.18, 0.70),
    ("Vanasthalipuram", 78.5650, 17.3300, 0.70, 0.24, 0.56),
    ("Nagole", 78.5580, 17.3700, 0.74, 0.20, 0.80),         # UHI hotspot + flood
    ("Hayathnagar", 78.6010, 17.3270, 0.62, 0.26, 0.55),    # UHI hotspot (suburb)
    ("Saroornagar", 78.5350, 17.3500, 0.74, 0.20, 0.72),    # Saroornagar lake
    # Southwest
    ("Mehdipatnam", 78.4350, 17.3950, 0.86, 0.14, 0.60),    # flood-prone junction
    ("Tolichowki", 78.4100, 17.3950, 0.82, 0.16, 0.45),
    ("Asifnagar", 78.4350, 17.3780, 0.84, 0.12, 0.48),
    ("Nampally", 78.4660, 17.3920, 0.88, 0.11, 0.66),       # central flood belt
]

# Wards adjoining badly-degraded lakes (Hussain Sagar, Durgam Cheruvu, Saroornagar,
# Ramanthapur, industrial tanks) — elevated lake-health risk. ~90% of city lakes are degraded.
_LAKE_STRESSED = {
    "Khairatabad", "Somajiguda", "Begumpet", "Madhapur", "HITEC City",
    "Saroornagar", "Nacharam", "Amberpet", "Habsiguda", "Uppal",
}

LAYER_IDS = ["flood", "heat", "veg", "lake", "urban", "water"]

# Average 2016 -> 2026 trend per layer (risk rises); scaled per-ward below.
_TREND = {"heat": 8, "flood": 6, "veg": 7, "urban": 13, "water": 6, "lake": 5}


def _rng(*parts) -> float:
    """Deterministic pseudo-random 0..1 from a label (stable across runs)."""
    h = hashlib.md5("|".join(map(str, parts)).encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def _poly(name: str, lng: float, lat: float, d: float):
    """Irregular organic ward polygon. Denser wards are smaller; vertices jittered."""
    base = 0.024 - 0.011 * d                      # denser -> tighter ward
    n = 9
    ring = []
    for i in range(n):
        ang = 2 * math.pi * i / n
        r = base * (0.65 + 0.7 * _rng(name, "v", i))
        ring.append([round(lng + r * math.cos(ang), 5), round(lat + r * math.sin(ang) * 0.92, 5)])
    ring.append(ring[0])                          # close the ring
    return [ring]


def _scores_2016(name, d, g, l) -> dict:
    """Physically-motivated 2016 baseline risk per layer (0-100)."""
    def n(layer):  # symmetric noise ±5
        return (_rng(name, layer, 2016) - 0.5) * 10

    # City-wide lake degradation is severe (~90% of lakes lost/polluted) -> high baseline,
    # with extra stress for wards adjoining documented bad lakes.
    lake_base = 52 + 22 * l + 14 * d * 0.4 + (12 if name in _LAKE_STRESSED else 0)
    raw = {
        "heat": 42 + 34 * d - 14 * g + n("heat"),
        "veg": 88 - 78 * g + 6 * d + n("veg"),            # less green = higher risk
        "flood": 28 + 50 * l + 6 * (1 - d) + n("flood"),
        "water": 25 + 52 * l + 6 * d * 0.3 + n("water"),
        "urban": 24 + 62 * d + n("urban"),
        "lake": lake_base + n("lake"),
    }
    return {k: max(5, min(96, round(v))) for k, v in raw.items()}


def _scores_2026(name, d, g, l, base) -> dict:
    """Evolve 2016 -> 2026 with varied, realistic per-ward deltas."""
    out = {}
    for layer, b in base.items():
        spread = 0.4 + 1.1 * _rng(name, layer, "delta")        # 0.4..1.5
        delta = _TREND[layer] * spread
        if layer in ("flood", "water"):
            delta *= 0.5 + l                                   # low-lying worsen faster
        if layer == "urban":
            delta *= 1.0 - 0.4 * d                             # dense wards near-saturated
        # Greener wards can actually improve heat/vegetation (new parks, canopy)
        if layer in ("heat", "veg") and g > 0.45:
            delta -= _TREND[layer] * (0.6 + 0.8 * _rng(name, layer, "improve"))
        out[layer] = max(5, min(98, round(b + delta)))
    return out


def _forecast(s2016: dict, s2026: dict, year: int) -> dict:
    """Project a future year by damped extrapolation of the 2016->2026 per-layer trend.

    Risk can't grow forever, so the annual rate is damped as a score approaches the ceiling
    (realistic saturation). Improving layers keep improving, gently.
    """
    out = {}
    for layer in LAYER_IDS:
        a, b = s2016[layer], s2026[layer]
        rate = (b - a) / 10.0                     # per-year change over the decade
        accel = 1.8                               # recent pace > decade mean (LST/UHI studies)
        damp = max(0.5, 1 - b / 140.0)            # gentle saturation near the ceiling
        proj = b + rate * (year - 2026) * accel * damp
        out[layer] = max(5, min(99, round(proj)))
    return out


def build_wards(use_gee: bool) -> dict:
    features = []
    for i, (name, lng, lat, d, g, l) in enumerate(WARDS):
        s2016 = _scores_2016(name, d, g, l)
        s2026 = _scores_2026(name, d, g, l, s2016)
        scores = {"2016": s2016, "2026": s2026}
        for fy in config.FORECAST_YEARS:
            scores[str(fy)] = _forecast(s2016, s2026, fy)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": _poly(name, lng, lat, d)},
            "properties": {
                "name": name,
                "ward_no": 100 + i,
                "centroid": [lng, lat],
                "drivers": {"density": d, "green": g, "low_lying": l},
                "forecast_years": config.FORECAST_YEARS,
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
    ranges = {"veg": (-0.1, 0.8, True), "flood": (-0.3, 0.5, False), "heat": (25, 45, False)}
    for layer, (lo, hi, invert) in ranges.items():
        for year in config.YEARS:
            try:
                means = {dct["name"]: dct["value"] for dct in gee.ward_mean(layer, year, ee_fc)}
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


def build_points(wards: dict, year: int = 2026) -> dict:
    """Scatter geotagged risk points inside each ward (the glowing dots from the art).

    Point count per ward scales with its overall risk; each point carries all-6-layer
    intensities so the frontend can colour by the active layer.
    """
    points = []
    for f in wards["features"]:
        p = f["properties"]
        name, (lng, lat) = p["name"], p["centroid"]
        sc = p["scores"][str(year)]
        overall = sum(sc.values()) / len(sc)
        n = 3 + round(overall / 12)                       # ~6..11 points per ward
        spread = (0.018 - 0.009 * p["drivers"]["density"]) * 0.8
        for k in range(n):
            ang = 2 * math.pi * _rng(name, "pt", k)
            rad = spread * math.sqrt(_rng(name, "pr", k))
            jitter = {lid: max(3, min(99, round(sc[lid] + (_rng(name, lid, k) - 0.5) * 14)))
                      for lid in LAYER_IDS}
            points.append({
                "lng": round(lng + rad * math.cos(ang), 5),
                "lat": round(lat + rad * math.sin(ang) * 0.92, 5),
                "ward": name,
                "scores": jitter,
            })
    return {"year": year, "points": points}


def build_layers(use_gee: bool) -> dict:
    out = []
    for lid in LAYER_IDS:
        for year in config.YEARS:
            entry = {
                "id": lid, "year": year, "label": config.LAYERS[lid]["label"],
                "tileUrl": None, "opacity": 0.75, "legend": gee.LEGENDS.get(lid, []),
            }
            if use_gee:
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

    feats = wards["features"]
    base_year = str(config.YEARS[0])
    cards_by_year = []
    for year in config.SCORE_YEARS:
        cards = []
        for lid in LAYER_IDS:
            vals = [f["properties"]["scores"][str(year)][lid] for f in feats]
            avg = round(sum(vals) / len(vals))
            prev = round(sum(f["properties"]["scores"][base_year][lid] for f in feats) / len(feats))
            cards.append({
                "id": lid, "label": config.LAYERS[lid]["label"],
                "score": avg, "level": level_of(avg), "delta_since_2016": avg - prev,
            })
        cards_by_year.append({
            "year": year, "forecast": year in config.FORECAST_YEARS, "cards": cards,
        })
    return cards_by_year


def build_timeseries(use_gee: bool) -> list:
    # Real Hyderabad monthly rainfall normals (mm), annual ~801; Jul-Sep wettest, Dec driest.
    base = [7, 9, 13, 24, 30, 107, 165, 147, 163, 96, 25, 5]   # sum ≈ 791
    # 2026 reflects the documented intensifying-monsoon / extreme-rain trend (heavier Jun-Oct).
    s2026 = [round(v * (1.18 if 5 <= i <= 9 else 1.04)) for i, v in enumerate(base)]
    return [{
        "metric": "rainfall", "unit": "mm",
        "labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        "series": [{"name": "2016", "data": base}, {"name": "2026", "data": s2026}],
    }]


def _write(name: str, data) -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    for fname in (f"{name}.json", f"{name}.sample.json"):
        (config.DATA_DIR / fname).write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _report_ranges(wards: dict) -> None:
    feats = wards["features"]
    print("[build] per-layer 2026 range & avg delta (2016->2026):")
    for lid in LAYER_IDS:
        v26 = [f["properties"]["scores"]["2026"][lid] for f in feats]
        deltas = [f["properties"]["scores"]["2026"][lid] - f["properties"]["scores"]["2016"][lid]
                  for f in feats]
        print(f"   {lid:6s} 2026 {min(v26):2d}-{max(v26):2d}  "
              f"delta {min(deltas):+d}..{max(deltas):+d} (avg {sum(deltas)/len(deltas):+.1f})")


def main() -> None:
    use_gee = gee.init_ee()
    print(f"[build] Earth Engine: {'LIVE' if use_gee else 'UNAVAILABLE -> synthetic fallback'}")

    wards = build_wards(use_gee)
    layers = build_layers(use_gee)
    points = build_points(wards)
    scorecards = build_scorecards(wards)
    timeseries = build_timeseries(use_gee)

    _write("wards", wards)
    _write("layers", layers)
    _write("points", points)
    _write("scorecards", scorecards)
    _write("timeseries", timeseries)
    print(f"[build] wrote {len(wards['features'])} wards, "
          f"{len(points['points'])} risk points, {len(layers['layers'])} layer tiles")
    _report_ranges(wards)

    from db import store
    if store.mode == "mongo":
        store.seed("wards", wards)
        store.seed("layers", layers["layers"])
        store.seed("points", points)
        store.seed("scorecards", scorecards)
        store.seed("timeseries", timeseries)
        print("[build] seeded MongoDB")
    else:
        print("[build] MongoDB unavailable -> serving JSON fixtures (fine for demo)")


if __name__ == "__main__":
    main()
