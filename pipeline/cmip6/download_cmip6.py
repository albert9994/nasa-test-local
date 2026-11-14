"""LU5: CMIP6 setup + point/S3 downloads for NEX-GDDP-CMIP6.

Supports:
1. Listing & testing files on public S3 (`s3://nex-gddp-cmip6/NEX-GDDP-CMIP6/<MODEL>/<scenario>/<variant>/<var>/`)
   without credentials (`--no-sign-request` / anonymous HTTPS).
2. Extracting the nearest 0.25 deg grid cell per farm for `tasmax`, `tasmin`, `pr` across
   `historical`, `ssp245`, `ssp585` using the NASA NCCS THREDDS NetCDF Subset Service (NCSS)
   or cached S3 NetCDF subsets into `pipeline/cache/cmip6/`.
"""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import requests

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pipeline.common import REPO_ROOT, atomic_write_json, load_farms

S3_BUCKET_URL = "https://nex-gddp-cmip6.s3.us-west-2.amazonaws.com"
THREDDS_NCSS_BASE = "https://ds.nccs.nasa.gov/thredds/ncss/grid/AMES/NEX/GDDP-CMIP6"
CACHE_DIR = REPO_ROOT / "pipeline" / "cache" / "cmip6"

# 6-model ensemble across Variant/Grid conventions in NEX-GDDP-CMIP6 v2.0
CMIP6_MODELS: list[tuple[str, str, str]] = [
    ("ACCESS-CM2", "r1i1p1f1", "gn"),
    ("CNRM-ESM2-1", "r1i1p1f2", "gr"),
    ("GFDL-ESM4", "r1i1p1f1", "gr1"),
    ("MPI-ESM1-2-HR", "r1i1p1f1", "gn"),
    ("MRI-ESM2-0", "r1i1p1f1", "gn"),
    ("EC-Earth3", "r1i1p1f1", "gr"),
]

VARIABLES = ("tasmax", "tasmin", "pr")
SCENARIOS = ("historical", "ssp245", "ssp585")


def nearest_quarter_degree_cell(lat: float, lon: float) -> tuple[float, float]:
    """Return the center of the nearest 0.25 deg NEX-GDDP-CMIP6 grid cell (0.125 offset)."""
    cell_lat = round((lat - 0.125) * 4.0) / 4.0 + 0.125
    cell_lon = round((lon - 0.125) * 4.0) / 4.0 + 0.125
    return round(cell_lat, 3), round(cell_lon, 3)


def list_s3_files(
    model: str = "ACCESS-CM2",
    scenario: str = "ssp245",
    variant: str = "r1i1p1f1",
    variable: str = "tasmax",
    max_keys: int = 5,
    timeout: int = 15,
) -> list[str]:
    """List NetCDF keys in public S3 bucket `s3://nex-gddp-cmip6` (no credentials required)."""
    prefix = f"NEX-GDDP-CMIP6/{model}/{scenario}/{variant}/{variable}/"
    resp = requests.get(
        S3_BUCKET_URL,
        params={"list-type": "2", "prefix": prefix, "max-keys": str(max_keys)},
        timeout=timeout,
    )
    resp.raise_for_status()
    root = ET.fromstring(resp.text)
    ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
    return [
        elem.text
        for elem in root.findall("s3:Contents/s3:Key", ns)
        if elem.text is not None
    ]


def fetch_thredds_growing_season(
    model: str,
    variant: str,
    grid: str,
    scenario: str,
    variable: str,
    year: int,
    lat: float,
    lon: float,
    timeout: int = 25,
) -> float | None:
    """Fetch Apr-Sep growing-season mean for one (model, scenario, var, year, farm) from NCCS THREDDS."""
    lon_360 = lon if lon >= 0 else lon + 360.0
    filename = f"{variable}_day_{model}_{scenario}_{variant}_{grid}_{year}_v2.0.nc"
    url = f"{THREDDS_NCSS_BASE}/{model}/{scenario}/{variant}/{variable}/{filename}"
    params = {
        "var": variable,
        "latitude": f"{lat:.4f}",
        "longitude": f"{lon_360:.4f}",
        "time_start": f"{year}-04-01T00:00:00Z",
        "time_end": f"{year}-09-30T23:59:59Z",
        "accept": "csv",
    }
    resp = requests.get(url, params=params, timeout=timeout)
    resp.raise_for_status()
    lines = [line.strip() for line in resp.text.splitlines() if line.strip()]
    if len(lines) <= 1:
        return None

    values: list[float] = []
    for row in lines[1:]:
        parts = row.split(",")
        try:
            val = float(parts[-1])
        except ValueError:
            continue
        if variable in ("tasmax", "tasmin"):
            val -= 273.15  # K -> degC
        elif variable == "pr":
            val *= 86400.0  # kg m-2 s-1 -> mm/day
        values.append(val)

    if not values:
        return None
    return round(sum(values) / len(values), 4)


def run_test_single_file(farm: dict[str, Any]) -> dict[str, Any]:
    """LU5 verification: list S3 keys and fetch 1 growing season file for the given farm."""
    s3_keys = list_s3_files()
    model, variant, grid = CMIP6_MODELS[0]
    lat, lon = float(farm["lat"]), float(farm["lon"])
    cell_lat, cell_lon = nearest_quarter_degree_cell(lat, lon)
    sample_val = fetch_thredds_growing_season(
        model=model,
        variant=variant,
        grid=grid,
        scenario="ssp245",
        variable="tasmax",
        year=2050,
        lat=lat,
        lon=lon,
    )
    summary = {
        "farm": farm["id"],
        "nearestCell": {"lat": cell_lat, "lon": cell_lon},
        "s3Bucket": "s3://nex-gddp-cmip6/NEX-GDDP-CMIP6/",
        "s3SampleKeys": s3_keys[:3],
        "testedModel": model,
        "testedScenario": "ssp245",
        "testedYear": 2050,
        "aprSepMeanTasmaxC": sample_val,
    }
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    atomic_write_json(CACHE_DIR / f"test_{farm['id']}.json", summary, indent=2)
    return summary


def download_farm_samples(
    farm: dict[str, Any],
    years_hist: tuple[int, ...] = (2005, 2014),
    years_proj: tuple[int, ...] = (2030, 2050, 2070, 2090),
    max_workers: int = 8,
) -> Path:
    """Download multi-model point summaries for `farm` into `pipeline/cache/cmip6/<id>.json`."""
    lat, lon = float(farm["lat"]), float(farm["lon"])
    cell_lat, cell_lon = nearest_quarter_degree_cell(lat, lon)
    tasks: list[tuple[str, str, str, str, str, int]] = []
    for model, variant, grid in CMIP6_MODELS:
        for var in ("tasmax", "pr"):
            for y in years_hist:
                tasks.append((model, variant, grid, "historical", var, y))
            for scen in ("ssp245", "ssp585"):
                for y in years_proj:
                    tasks.append((model, variant, grid, scen, var, y))

    records: dict[str, Any] = {
        "farm": farm["id"],
        "cell": {"lat": cell_lat, "lon": cell_lon},
        "models": [m[0] for m in CMIP6_MODELS],
        "data": {},
    }

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futs = {
            pool.submit(
                fetch_thredds_growing_season,
                m,
                v,
                g,
                sc,
                var,
                yr,
                lat,
                lon,
            ): (m, sc, var, yr)
            for m, v, g, sc, var, yr in tasks
        }
        for fut in as_completed(futs):
            m, sc, var, yr = futs[fut]
            try:
                val = fut.result()
            except (OSError, ValueError, requests.RequestException):
                val = None
            if val is not None:
                records["data"].setdefault(m, {}).setdefault(sc, {}).setdefault(var, {})[str(yr)] = val

    out_path = CACHE_DIR / f"{farm['id']}.json"
    atomic_write_json(out_path, records, indent=2)
    return out_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="LU5: Test and download NEX-GDDP-CMIP6 point data.")
    parser.add_argument("--farm", default="iowa", help="Farm id to test/download.")
    parser.add_argument(
        "--test-only",
        action="store_true",
        help="Run fast 1-file S3 + THREDDS verification test (LU5 gate).",
    )
    args = parser.parse_args(argv)

    farms = load_farms()
    selected = [f for f in farms if f.get("id") == args.farm]
    if not selected:
        print(f"Unknown farm id: {args.farm}", file=sys.stderr)
        return 1

    farm = selected[0]
    if args.test_only:
        res = run_test_single_file(farm)
        print(json.dumps(res, indent=2))
        return 0

    res = run_test_single_file(farm)
    print(f"[cmip6] verified S3 + THREDDS for {farm['id']}: 2050 Apr-Sep tasmax = {res['aprSepMeanTasmaxC']} C")
    out = download_farm_samples(farm)
    print(f"[cmip6] wrote point cache to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
