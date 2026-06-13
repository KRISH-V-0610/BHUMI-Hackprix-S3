"""Google Earth Engine helpers: auth, per-layer imagery, tile URLs, zonal stats.

Hero layers computed for real (Sentinel-2 / MODIS):
  veg   NDVI  = (B8 - B4) / (B8 + B4)            COPERNICUS/S2_SR_HARMONIZED
  flood NDWI  = (B3 - B8) / (B3 + B8)            COPERNICUS/S2_SR_HARMONIZED  (open water)
  heat  LST   = MOD11A1 LST_Day_1km*0.02-273.15  MODIS/061/MOD11A1            (°C)
Supporting layers derived from the same primitives:
  urban NDBI  = (B11 - B8) / (B11 + B8)
  water       = NDWI (monsoon ponding proxy)
  lake        = NDWI restricted to water bodies

All public functions are safe to import without EE installed/initialised; call
`init_ee()` once (returns False on failure) before using the compute helpers.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any

import config

try:
    import ee
except Exception:  # pragma: no cover
    ee = None  # type: ignore

_INITIALISED = False

# Per-year acquisition windows. 2026 is partial (today is mid-2026) so we widen it.
_WINDOWS = {
    2016: ("2016-01-01", "2016-12-31"),
    2026: ("2025-07-01", "2026-06-30"),
}
# Summer window for land-surface temperature (peak urban-heat signal).
_SUMMER = {2016: ("2016-03-01", "2016-05-31"), 2026: ("2026-03-01", "2026-05-31")}

# Visualisation palettes per layer id (low -> high risk).
VIZ = {
    "veg": {"min": -0.1, "max": 0.8, "palette": ["#d7191c", "#ffffbf", "#1a9641"]},
    "flood": {"min": -0.3, "max": 0.5, "palette": ["#f7f7f7", "#74add1", "#313695"]},
    "heat": {"min": 25, "max": 45, "palette": ["#2b83ba", "#ffffbf", "#d7191c"]},
    "urban": {"min": -0.3, "max": 0.4, "palette": ["#1a9641", "#ffffbf", "#7b3294"]},
    "water": {"min": -0.3, "max": 0.5, "palette": ["#f7f7f7", "#74add1", "#313695"]},
    "lake": {"min": -0.3, "max": 0.6, "palette": ["#d7191c", "#ffffbf", "#2c7bb6"]},
}

LEGENDS = {
    lid: [
        {"color": v["palette"][0], "label": "Low"},
        {"color": v["palette"][1], "label": "Moderate"},
        {"color": v["palette"][-1], "label": "Severe"},
    ]
    for lid, v in VIZ.items()
}


def init_ee() -> bool:
    """Initialise Earth Engine with the service account. Returns True on success."""
    global _INITIALISED
    if _INITIALISED:
        return True
    if ee is None:
        return False
    try:
        creds = ee.ServiceAccountCredentials(
            config.EE_SERVICE_ACCOUNT, str(config.ee_key_path())
        )
        ee.Initialize(creds, project=config.EE_PROJECT)
        _INITIALISED = True
    except Exception as exc:  # pragma: no cover
        print(f"[gee] init failed: {exc}")
        _INITIALISED = False
    return _INITIALISED


@lru_cache(maxsize=1)
def hyderabad_geom():
    """Rectangle covering GHMC + buffer."""
    return ee.Geometry.Rectangle(config.HYDERABAD_BBOX)


def _s2_composite(year: int):
    """Cloud-masked median Sentinel-2 surface-reflectance composite for a year."""
    start, end = _WINDOWS[year]

    def mask(img):
        scl = img.select("SCL")
        good = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10))
        return img.updateMask(good).divide(10000)

    return (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(hyderabad_geom())
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
        .map(mask)
        .median()
        .clip(hyderabad_geom())
    )


def layer_image(layer: str, year: int):
    """Return the single-band ee.Image for a layer id + year."""
    if layer == "heat":
        start, end = _SUMMER[year]
        lst = (
            ee.ImageCollection("MODIS/061/MOD11A1")
            .filterDate(start, end)
            .select("LST_Day_1km")
            .mean()
            .multiply(0.02)
            .subtract(273.15)
            .clip(hyderabad_geom())
        )
        return lst.rename("value")

    s2 = _s2_composite(year)
    if layer == "veg":
        img = s2.normalizedDifference(["B8", "B4"])
    elif layer in ("flood", "water", "lake"):
        img = s2.normalizedDifference(["B3", "B8"])  # NDWI (open water)
    elif layer == "urban":
        img = s2.normalizedDifference(["B11", "B8"])  # NDBI
    else:
        raise ValueError(f"unknown layer {layer!r}")
    return img.rename("value")


def tile_url(image, viz: dict) -> str:
    """Generate an XYZ tile-URL template from a computed image."""
    mapid = ee.Image(image).getMapId(viz)
    fetcher = mapid["tile_fetcher"]
    return fetcher.url_format


def layer_tiles(layer: str, year: int) -> dict:
    """Compute a layer and return the contract entry: id/year/label/tileUrl/legend."""
    img = layer_image(layer, year)
    return {
        "id": layer,
        "year": year,
        "label": config.LAYERS[layer]["label"],
        "tileUrl": tile_url(img, VIZ[layer]),
        "opacity": 0.75,
        "legend": LEGENDS[layer],
    }


def ward_mean(layer: str, year: int, wards_fc) -> Any:
    """reduceRegions: mean layer value per ward. Returns list of {name, value}."""
    img = layer_image(layer, year)
    scale = 1000 if layer == "heat" else 30
    reduced = img.reduceRegions(
        collection=wards_fc, reducer=ee.Reducer.mean(), scale=scale
    )
    feats = reduced.getInfo()["features"]
    out = []
    for f in feats:
        props = f["properties"]
        out.append({"name": props.get("name"), "value": props.get("mean")})
    return out
