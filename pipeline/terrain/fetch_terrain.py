"""Terrain: elevation and slope from SRTM 1 arc-second (NASA/NGA) via the OpenTopoData API.

Slope (%) is Horn's 3x3 gradient on points spaced 3 arc-seconds (~90 m) around the farm
coordinate, which damps the +-16 m SRTM vertical noise. Writes ``layers/<id>/terrain.json``;
``generate_meta.py`` then overrides the preset ``elev`` / ``slope`` with these measured values.

Run:  python -m pipeline.terrain.fetch_terrain [--farm ID]
"""

from __future__ import annotations

import argparse
import math
import sys
import time
from pathlib import Path
from typing import Any

import requests

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pipeline.common import LAYERS_DIR, atomic_write_json, load_farms

ENDPOINT = "https://api.opentopodata.org/v1/srtm30m"
STEP_DEG = 3.0 / 3600.0  # 3 arc-seconds


def horn_slope_pct(z: list[list[float]], dx_m: float, dy_m: float) -> float:
    """Horn (1981) slope in percent from a 3x3 elevation grid (rows north->south)."""
    dzdx = ((z[0][2] + 2 * z[1][2] + z[2][2]) - (z[0][0] + 2 * z[1][0] + z[2][0])) / (8 * dx_m)
    dzdy = ((z[0][0] + 2 * z[0][1] + z[0][2]) - (z[2][0] + 2 * z[2][1] + z[2][2])) / (8 * dy_m)
    return 100.0 * math.hypot(dzdx, dzdy)


def fetch_terrain(lat: float, lon: float) -> dict[str, Any]:
    offsets = [(1, -1), (1, 0), (1, 1), (0, -1), (0, 0), (0, 1), (-1, -1), (-1, 0), (-1, 1)]
    locs = "|".join(f"{lat + a * STEP_DEG:.6f},{lon + b * STEP_DEG:.6f}" for a, b in offsets)
    for attempt in range(6):
        resp = requests.get(ENDPOINT, params={"locations": locs}, timeout=60)
        if resp.status_code != 429:
            break
        time.sleep(2.0 * (attempt + 1))  # public API: ~1 request / second
    resp.raise_for_status()
    vals = [float(r["elevation"]) for r in resp.json()["results"]]
    z = [vals[0:3], vals[3:6], vals[6:9]]
    dy = STEP_DEG * 111_320.0
    dx = dy * math.cos(math.radians(lat))
    return {
        "elev": round(z[1][1]),
        "slope": round(horn_slope_pct(z, dx, dy), 1),
        "slopeSource": "SRTM 1 arc-sec (OpenTopoData srtm30m), Horn 3x3 gradient at ~90 m spacing, percent",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch SRTM elevation + slope per farm.")
    parser.add_argument("--farm")
    args = parser.parse_args(argv)
    for farm in load_farms():
        if args.farm and farm["id"] != args.farm:
            continue
        data = fetch_terrain(float(farm["lat"]), float(farm["lon"]))
        atomic_write_json(LAYERS_DIR / farm["id"] / "terrain.json", data, indent=2)
        time.sleep(1.5)
        print(f"[terrain] {farm['id']}: elev {data['elev']} m, slope {data['slope']} %")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
