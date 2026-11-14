"""LU3: Fetch SoilGrids 2.0 250 m properties via WCS first, REST fallback second.

Properties: sand, clay, silt, soc, bdod, phh2o
Depths: 0-5cm, 5-15cm, 15-30cm, 30-60cm, 60-100cm
Conversion factors (d_factor):
- sand, clay, silt: / 10 -> %
- soc: / 10 -> g/kg
- phh2o: / 10 -> pH
- bdod: / 100 -> g/cm3 (kg/dm3)

Writes `apps/web/public/data/layers/<farm_id>/soil.json` atomically.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import numpy as np
import requests
import tifffile

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pipeline.common import LAYERS_DIR, MOCK_DIR, atomic_write_json, load_farms

WCS_ENDPOINT = "https://maps.isric.org/mapserv"
REST_ENDPOINT = "https://rest.isric.org/soilgrids/v2.0/properties/query"

SOIL_PROPS: dict[str, tuple[float, int]] = {
    "sand": (10.0, 1),
    "clay": (10.0, 1),
    "silt": (10.0, 1),
    "soc": (10.0, 1),
    "bdod": (100.0, 2),
    "phh2o": (10.0, 1),
}

SOIL_DEPTHS: tuple[str, ...] = (
    "0-5cm",
    "5-15cm",
    "15-30cm",
    "30-60cm",
    "60-100cm",
)


def fetch_wcs_cell(
    prop: str,
    depth: str,
    lat: float,
    lon: float,
    half_deg: float = 0.01,
    timeout: int = 15,
) -> float | None:
    """Fetch a tiny GeoTIFF around (lat, lon) from ISRIC WCS and return scaled median."""
    d_factor, decimals = SOIL_PROPS[prop]
    coverage_id = f"{prop}_{depth}_mean"
    url = (
        f"{WCS_ENDPOINT}?map=/map/{prop}.map"
        f"&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage"
        f"&COVERAGEID={coverage_id}&FORMAT=image/tiff"
        f"&SUBSET=long({lon - half_deg:.4f},{lon + half_deg:.4f})"
        f"&SUBSET=lat({lat - half_deg:.4f},{lat + half_deg:.4f})"
        f"&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326"
        f"&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326"
    )
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    arr = tifffile.imread(io.BytesIO(resp.content))
    valid = arr[(arr > 0) & (arr < 30000)]
    if valid.size == 0:
        return None
    val = float(np.median(valid)) / d_factor
    return round(val, decimals)


def fetch_soil_wcs(
    lat: float,
    lon: float,
    max_workers: int = 8,
) -> dict[str, dict[str, dict[str, float]]]:
    """Fetch all 6 properties x 5 depths via WCS in parallel."""
    results: dict[str, dict[str, dict[str, float]]] = {p: {} for p in SOIL_PROPS}
    tasks = [(p, d) for p in SOIL_PROPS for d in SOIL_DEPTHS]

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_map = {
            pool.submit(fetch_wcs_cell, prop, depth, lat, lon): (prop, depth)
            for prop, depth in tasks
        }
        for fut in as_completed(future_map):
            prop, depth = future_map[fut]
            val = fut.result()
            if val is not None:
                results[prop][depth] = {"mean": val}

    # Ensure deterministic depth ordering
    ordered: dict[str, dict[str, dict[str, float]]] = {}
    for prop in SOIL_PROPS:
        ordered[prop] = {
            d: results[prop][d] for d in SOIL_DEPTHS if d in results[prop]
        }
    return ordered


def fetch_soil_rest(lat: float, lon: float, timeout: int = 20) -> dict[str, dict[str, dict[str, float]]]:
    """Fallback: query SoilGrids v2.0 REST API."""
    params: list[tuple[str, str | float]] = [("lon", lon), ("lat", lat), ("value", "mean")]
    for prop in SOIL_PROPS:
        params.append(("property", prop))
    for depth in SOIL_DEPTHS:
        params.append(("depth", depth))

    resp = requests.get(REST_ENDPOINT, params=params, timeout=timeout)
    resp.raise_for_status()
    payload = resp.json()

    results: dict[str, dict[str, dict[str, float]]] = {p: {} for p in SOIL_PROPS}
    layers = payload.get("properties", {}).get("layers", [])
    for layer in layers:
        prop = layer.get("name")
        if prop not in SOIL_PROPS:
            continue
        d_factor, decimals = SOIL_PROPS[prop]
        unit_measure = layer.get("unit_measure", {})
        factor = float(unit_measure.get("d_factor", d_factor))
        for d_obj in layer.get("depths", []):
            label = d_obj.get("label")
            raw_mean = d_obj.get("values", {}).get("mean")
            if label in SOIL_DEPTHS and raw_mean is not None:
                results[prop][label] = {"mean": round(float(raw_mean) / factor, decimals)}
    return results


def update_farm_soil_layer(
    farm: dict[str, Any],
    *,
    layers_dir: Path = LAYERS_DIR,
    offline_fallback: bool = True,
) -> Path | None:
    """Fetch SoilGrids data for `farm` and write `layers/<id>/soil.json` atomically."""
    farm_id = farm["id"]
    lat = float(farm["lat"])
    lon = float(farm["lon"])
    soil_path = layers_dir / farm_id / "soil.json"

    soil_data: dict[str, Any] | None = None
    try:
        soil_data = fetch_soil_wcs(lat, lon)
        # Verify at least sand and clay were populated
        if not soil_data.get("sand") or not soil_data.get("clay"):
            raise ValueError("Incomplete WCS soil response")
    except (OSError, ValueError, KeyError, requests.RequestException) as wcs_err:
        print(f"[soil] WCS warning for {farm_id} ({wcs_err}); trying REST fallback...", file=sys.stderr)
        try:
            soil_data = fetch_soil_rest(lat, lon)
        except (OSError, ValueError, KeyError, requests.RequestException) as rest_err:
            print(f"[soil] REST warning for {farm_id} ({rest_err})", file=sys.stderr)
            mock_farm_path = MOCK_DIR / "farms" / f"{farm_id}.json"
            if offline_fallback and mock_farm_path.exists():
                with open(mock_farm_path, encoding="utf-8") as handle:
                    cached = json.load(handle)
                raw_soil = cached.get("soil", {})
                soil_data = {
                    prop: {
                        d: {"mean": raw_soil[prop][d]["mean"]}
                        for d in SOIL_DEPTHS
                        if d in raw_soil.get(prop, {}) and "mean" in raw_soil[prop][d]
                    }
                    for prop in SOIL_PROPS
                    if prop in raw_soil
                }

    if not soil_data:
        print(
            f"[soil] Both WCS and REST down for {farm_id}; omitting soil layer (engine uses default loam).",
            file=sys.stderr,
        )
        return None

    atomic_write_json(soil_path, soil_data, indent=2)
    return soil_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch SoilGrids 2.0 soil layers (WCS first).")
    parser.add_argument("--farm", help="Optional single farm id to fetch.")
    args = parser.parse_args(argv)

    farms = load_farms()
    if args.farm:
        farms = [f for f in farms if f.get("id") == args.farm]
        if not farms:
            print(f"Unknown farm id: {args.farm}", file=sys.stderr)
            return 1

    for farm in farms:
        out = update_farm_soil_layer(farm)
        if out is not None:
            print(f"[soil] wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
