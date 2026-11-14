"""C1: real MODIS Terra MOD13Q1 v061 250 m 16-day NDVI per farm via the ORNL DAAC subset REST API.

For each farm and year 2001-2025 the 250 m pixel at the farm coordinate is requested for the
growing-season composites (DOY 113..257, 10 dates, 23 Apr - 14 Sep) in one request, together with the
``250m_16_days_pixel_reliability`` band. Pixels flagged snow/ice or cloudy (reliability >= 2) or fill
are written as ``null``. Raw responses are cached under ``pipeline/cache/ndvi/`` (gitignored).
There is NO synthetic fallback: failed requests raise.

Run:  python -m pipeline.ndvi.fetch_ndvi [--farm ID] [--workers 6]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import requests

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pipeline.common import LAYERS_DIR, REPO_ROOT, atomic_write_json, load_farms

ORNL = "https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset"
CACHE_DIR = REPO_ROOT / "pipeline" / "cache" / "ndvi"
WINDOWS = ((113, 257),)  # 10 composite dates (16-day step): the ORNL limit per request
START_YEAR, END_YEAR = 2001, 2025
_session = requests.Session()


def _request(lat: float, lon: float, band: str, year: int, d0: int, d1: int) -> list[dict[str, Any]]:
    params = {
        "latitude": f"{lat:.4f}", "longitude": f"{lon:.4f}", "band": band,
        "startDate": f"A{year}{d0:03d}", "endDate": f"A{year}{d1:03d}",
        "kmAboveBelow": 0, "kmLeftRight": 0,
    }
    last: Exception | None = None
    for attempt in range(8):
        try:
            resp = _session.get(ORNL, params=params, timeout=90, headers={"Accept": "application/json"})
            resp.raise_for_status()
            return resp.json().get("subset", [])
        except (requests.RequestException, ValueError) as exc:
            last = exc
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"ORNL request failed ({band} {year} {d0}-{d1}): {last}")


def fetch_window(farm_id: str, lat: float, lon: float, year: int, d0: int, d1: int) -> list[list[Any]]:
    cache = CACHE_DIR / farm_id / f"{year}_{d0}_{d1}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    ndvi = _request(lat, lon, "250m_16_days_NDVI", year, d0, d1)
    rel = _request(lat, lon, "250m_16_days_pixel_reliability", year, d0, d1)
    rel_by_date = {r["modis_date"]: (r["data"][0] if r.get("data") else -1) for r in rel}
    out: list[list[Any]] = []
    for item in ndvi:
        doy = int(item["modis_date"][5:])
        raw = item["data"][0] if item.get("data") else -3000
        reliability = rel_by_date.get(item["modis_date"], -1)
        bad = raw <= -2000 or reliability < 0 or reliability >= 2
        out.append([doy, None if bad else round(raw * 0.0001, 3)])
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(out))
    return out


def build_farm(farm: dict[str, Any], workers: int = 6, partial: bool = False) -> Path:
    lat, lon = float(farm["lat"]), float(farm["lon"])
    result: dict[str, list[list[Any]]] = {str(y): [] for y in range(START_YEAR, END_YEAR + 1)}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {
            pool.submit(fetch_window, farm["id"], lat, lon, y, d0, d1): y
            for y in range(START_YEAR, END_YEAR + 1)
            for d0, d1 in WINDOWS
        }
        for fut in as_completed(futs):
            try:
                result[str(futs[fut])].extend(fut.result())
            except RuntimeError as exc:
                if not partial:
                    raise
                print(f"[ndvi] {farm['id']} {futs[fut]}: skipped ({str(exc)[:60]})", file=sys.stderr)
    result = {y: sorted(v, key=lambda p: p[0]) for y, v in result.items() if v}
    path = LAYERS_DIR / farm["id"] / "ndvi.json"
    atomic_write_json(path, result)
    peaks = [max((v for _, v in s if v is not None), default=0) for s in result.values()]
    print(f"[ndvi] {farm['id']}: {len(result)} seasons, mean peak {sum(peaks) / len(peaks):.2f}, min peak {min(peaks):.2f}")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch real MODIS MOD13Q1 NDVI (ORNL DAAC).")
    parser.add_argument("--farm")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--partial", action="store_true", help="write the seasons that could be fetched; skip failures")
    args = parser.parse_args(argv)
    for farm in load_farms():
        if args.farm and farm["id"] != args.farm:
            continue
        build_farm(farm, workers=args.workers, partial=args.partial)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
