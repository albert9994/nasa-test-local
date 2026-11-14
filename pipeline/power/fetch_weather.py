"""LU1: Fetch daily weather from NASA POWER (2001-2025, community=AG) per farm.

Writes `apps/web/public/data/layers/<farm_id>/weather.json` atomically.
Missing values (-999) are replaced by carrying the previous valid day forward.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import requests

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pipeline.common import LAYERS_DIR, atomic_write_json, load_farms

POWER_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAM_MAP: dict[str, tuple[str, int]] = {
    "T2M_MAX": ("tmax", 1),
    "T2M_MIN": ("tmin", 1),
    "PRECTOTCORR": ("prcp", 1),
    "GWETROOT": ("gwet", 2),
    "ALLSKY_SFC_SW_DWN": ("rad", 1),
    "RH2M": ("rh", 1),
    "WS2M": ("wind", 1),
}
FALLBACK_DEFAULTS: dict[str, float] = {
    "tmax": 20.0,
    "tmin": 10.0,
    "prcp": 0.0,
    "gwet": 0.5,
    "rad": 15.0,
    "rh": 65.0,
    "wind": 3.0,
}


def clean_series(raw_values: list[float], decimals: int, default_val: float) -> list[float]:
    """Replace NASA POWER missing values (<= -900) by carrying forward previous day."""
    cleaned: list[float] = []
    first_valid: float | None = None
    for val in raw_values:
        if val is not None and val > -900.0:
            first_valid = float(val)
            break
    prev = first_valid if first_valid is not None else default_val

    for val in raw_values:
        if val is None or val <= -900.0:
            current = prev
        else:
            current = float(val)
            prev = current
        cleaned.append(round(current, decimals))
    return cleaned


def parse_power_response(
    payload: dict[str, Any],
    start_year: int = 2001,
    end_year: int = 2025,
) -> tuple[dict[str, dict[str, list[float]]], float | None]:
    """Transform NASA POWER JSON payload into C1 `weather` year-keyed structure."""
    params = payload.get("properties", {}).get("parameter", {})
    coords = payload.get("geometry", {}).get("coordinates", [])
    elev = round(float(coords[2]), 2) if len(coords) >= 3 and coords[2] is not None else None

    sample_param = next(iter(params.values()), {})
    sorted_dates = sorted(sample_param.keys())

    cleaned_by_key: dict[str, list[float]] = {}
    for power_key, (out_key, decimals) in PARAM_MAP.items():
        series_dict = params.get(power_key, {})
        raw_list = [float(series_dict.get(d, -999.0)) for d in sorted_dates]
        cleaned_list = clean_series(raw_list, decimals, FALLBACK_DEFAULTS[out_key])
        if out_key == "prcp":
            cleaned_list = [max(0.0, v) for v in cleaned_list]
        elif out_key == "gwet":
            cleaned_list = [min(1.0, max(0.0, v)) for v in cleaned_list]
        cleaned_by_key[out_key] = cleaned_list

    weather_by_year: dict[str, dict[str, list[float]]] = {}
    for year in range(start_year, end_year + 1):
        y_str = str(year)
        indices = [i for i, d in enumerate(sorted_dates) if d.startswith(y_str)]
        if not indices:
            continue
        weather_by_year[y_str] = {
            out_key: [cleaned_by_key[out_key][i] for i in indices]
            for _, (out_key, _) in PARAM_MAP.items()
        }

    return weather_by_year, elev


def fetch_farm_weather(
    lat: float,
    lon: float,
    start_year: int = 2001,
    end_year: int = 2025,
    timeout: int = 45,
) -> tuple[dict[str, dict[str, list[float]]], float | None]:
    """Query NASA POWER daily point API for a single coordinate."""
    query = {
        "parameters": ",".join(PARAM_MAP.keys()),
        "community": "AG",
        "longitude": lon,
        "latitude": lat,
        "start": f"{start_year}0101",
        "end": f"{end_year}1231",
        "format": "JSON",
    }
    resp = requests.get(POWER_ENDPOINT, params=query, timeout=timeout)
    resp.raise_for_status()
    return parse_power_response(resp.json(), start_year=start_year, end_year=end_year)


def update_farm_layer(
    farm: dict[str, Any],
    *,
    layers_dir: Path = LAYERS_DIR,
    start_year: int = 2001,
    end_year: int = 2025,
) -> Path:
    """Fetch NASA POWER weather for a farm and write layers/<id>/weather.json.

    There is no offline/mock fallback: if POWER is unreachable the call fails loudly.
    ``meta.json`` is NOT written here (it comes from presets via generate_meta.py).
    """
    weather_path = layers_dir / farm["id"] / "weather.json"
    try:
        weather, _elev = fetch_farm_weather(
            lat=float(farm["lat"]),
            lon=float(farm["lon"]),
            start_year=start_year,
            end_year=end_year,
        )
    except Exception as exc:
        raise RuntimeError(f"Failed to fetch NASA POWER for {farm['id']}: {exc}") from exc
    atomic_write_json(weather_path, weather)
    return weather_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch NASA POWER daily weather layers.")
    parser.add_argument(
        "--farm",
        help="Optional single farm id to fetch (e.g. iowa). Defaults to all farms (Iowa first).",
    )
    parser.add_argument("--start-year", type=int, default=2001)
    parser.add_argument("--end-year", type=int, default=2025)
    args = parser.parse_args(argv)

    farms = load_farms()
    # Ensure Iowa is processed first per LU1
    farms.sort(key=lambda f: (0 if f.get("id") == "iowa" else 1))
    if args.farm:
        farms = [f for f in farms if f.get("id") == args.farm]
        if not farms:
            print(f"Unknown farm id: {args.farm}", file=sys.stderr)
            return 1

    for farm in farms:
        out = update_farm_layer(
            farm,
            start_year=args.start_year,
            end_year=args.end_year,
        )
        print(f"[power] wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
