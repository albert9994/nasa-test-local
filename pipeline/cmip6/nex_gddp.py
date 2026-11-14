"""C4: Real NASA NEX-GDDP-CMIP6 scenario deltas via the NCCS THREDDS NetCDF Subset Service.

Each farm is snapped to its nearest 0.25 deg NEX-GDDP-CMIP6 cell. Farms that are close together
share one NetCDF Subset request (a lat/lon bounding box returns every cell at once, which is far
cheaper than one request per farm because the server reads whole daily grids anyway). Daily
``tasmax`` (K) and ``pr`` (kg m-2 s-1) are downloaded for every model for the historical baseline
1995-2014 and ssp245 / ssp585 (headline 2041-2060, plus the series years). Per-cell yearly series are
cached under ``pipeline/cache/cmip6/`` (gitignored). Deltas are computed per model, then summarised
across the ensemble (mean + p10/p90 across models):

* growing season = Apr-Sep. dT = mean(tasmax) future window - baseline (degC);
  dP = total(pr) future window / baseline - 1 (fraction)
* headline window 2041-2060 ("2050", 20 years); series points use 10-year windows centred on
  2030..2090 (the 2050 point is the headline)
* ``monthly``: 12 monthly dT / dP values for the 2041-2060 window

Run:  python -m pipeline.cmip6.nex_gddp [--farm ID] [--phase headline|series|all] [--workers 6]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import threading
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import netCDF4
import numpy as np
import requests

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pipeline.common import LAYERS_DIR, REPO_ROOT, atomic_write_json, load_farms

CATALOG = "https://ds.nccs.nasa.gov/thredds/catalog/AMES/NEX/GDDP-CMIP6"
NCSS = "https://ds.nccs.nasa.gov/thredds/ncss/grid"
CACHE_DIR = REPO_ROOT / "pipeline" / "cache" / "cmip6"

MODELS = ["ACCESS-CM2", "GFDL-ESM4", "MPI-ESM1-2-HR", "MRI-ESM2-0", "UKESM1-0-LL"]
VARIABLES = ("tasmax", "pr")
SSPS = ("ssp245", "ssp585")
BASELINE = (1995, 2014)
HEADLINE = (2041, 2060)
SERIES_YEARS = (2030, 2040, 2050, 2060, 2070, 2080, 2090)
SEASON_MONTHS = (4, 5, 6, 7, 8, 9)
NS = {"t": "http://www.unidata.ucar.edu/namespaces/thredds/InvCatalog/v1.0"}
_NS_XLINK = "{http://www.w3.org/1999/xlink}"
_session = requests.Session()


def cell_center(lat: float, lon: float) -> tuple[float, float]:
    """Centre of the nearest 0.25 deg NEX-GDDP-CMIP6 grid cell (cells are centred on x.125)."""
    clat = round((lat - 0.125) * 4.0) / 4.0 + 0.125
    clon = round((lon - 0.125) * 4.0) / 4.0 + 0.125
    return round(clat, 3), round(clon, 3)


_pause_until = 0.0
_pause_lock = threading.Lock()


def _get(url: str, *, timeout: int = 150, tries: int = 6, **kw: Any) -> requests.Response:
    """GET with a shared back-off: 4xx fails fast; resets/5xx pause every worker (server rate limit)."""
    global _pause_until
    last: Exception | None = None
    for attempt in range(tries):
        wait = _pause_until - time.time()
        if wait > 0:
            time.sleep(wait)
        try:
            resp = _session.get(url, timeout=timeout, **kw)
            if 400 <= resp.status_code < 500:
                raise RuntimeError(f"HTTP {resp.status_code} (not retried): {resp.text[:200]} <- {url}")
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            last = exc
            print(f"[cmip6] retry {attempt + 1}/{tries}: {str(exc)[:120]}", file=sys.stderr)
            with _pause_lock:
                _pause_until = max(_pause_until, time.time() + 45.0 * (attempt + 1))
    raise RuntimeError(f"GET failed after {tries} tries: {url}: {last}")


def list_files(model: str, scenario: str, variable: str) -> dict[int, str]:
    """Map year -> THREDDS urlPath for one model/scenario/variable (any variant label)."""
    cache = CACHE_DIR / "catalog" / f"{model}_{scenario}_{variable}.json"
    if cache.exists():
        return {int(k): v for k, v in json.loads(cache.read_text()).items()}
    base = f"{CATALOG}/{model}/{scenario}"
    root = ET.fromstring(_get(f"{base}/catalog.xml").content)
    variants = [
        ref.get(f"{_NS_XLINK}href", "").split("/")[0]
        for ref in root.iter(f"{{{NS['t']}}}catalogRef")
    ]
    variants = [v for v in variants if re.match(r"r\d+i\d+p\d+f\d+$", v)]
    if not variants:
        raise RuntimeError(f"no ensemble member for {model}/{scenario}")
    out: dict[int, str] = {}
    variant = min(variants)
    cat = ET.fromstring(_get(f"{base}/{variant}/{variable}/catalog.xml").content)
    for ds in cat.iter(f"{{{NS['t']}}}dataset"):
        path = ds.get("urlPath")
        if path and path.endswith(".nc"):
            m = re.search(r"_(\d{4})(?:_v[\d.]+)?\.nc$", path)
            if m:
                out[int(m.group(1))] = path
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(out))
    return out


def _cache_file(model: str, scenario: str, variable: str, year: int, cell: tuple[float, float]) -> Path:
    return CACHE_DIR / "points" / f"{model}_{scenario}_{variable}_{year}_{cell[0]:.3f}_{cell[1]:.3f}.json"


def fetch_year(
    model: str, scenario: str, variable: str, year: int, cells: list[tuple[float, float]], path: str
) -> dict[tuple[float, float], dict[str, list[float]]]:
    """One bbox NCSS request for all `cells` of a cluster and one model/scenario/variable/year.

    Returns {cell: {'m': month per day, 'v': daily values (degC or mm/day)}} and caches each cell.
    """
    out: dict[tuple[float, float], dict[str, list[float]]] = {}
    missing = []
    for cell in cells:
        cache = _cache_file(model, scenario, variable, year, cell)
        if cache.exists():
            out[cell] = json.loads(cache.read_text())
        else:
            missing.append(cell)
    if not missing:
        return out
    lats = [c[0] for c in cells]
    lons = [c[1] for c in cells]
    params = {
        "var": variable, "north": max(lats) + 0.01, "south": min(lats) - 0.01,
        "east": max(lons) + 0.01, "west": min(lons) - 0.01,
        "temporal": "all", "accept": "netcdf3",
    }
    raw = _get(f"{NCSS}/{path}", params=params).content
    with netCDF4.Dataset("subset.nc", memory=raw) as ds:  # type: ignore[call-arg]
        tvar = ds.variables["time"]
        dates = netCDF4.num2date(tvar[:], tvar.units, getattr(tvar, "calendar", "standard"))
        months = [int(d.month) for d in dates]
        grid_lat = np.array(ds.variables["lat"][:])
        grid_lon = np.array(ds.variables["lon"][:])
        data = np.ma.filled(ds.variables[variable][:], np.nan)
        for cell in missing:
            i = int(np.argmin(np.abs(grid_lat - cell[0])))
            j = int(np.argmin(np.abs(grid_lon - cell[1])))
            series = data[:, i, j].astype(float)
            if len(series) < 300 or np.isnan(series).any():
                raise RuntimeError(f"bad series ({len(series)}) {model} {scenario} {variable} {year} {cell}")
            # tasmax: K -> degC ; pr: kg m-2 s-1 -> mm/day
            conv = series - 273.15 if variable == "tasmax" else series * 86400.0
            rec = {"m": months, "v": [round(float(v), 3) for v in conv]}
            _cache_file(model, scenario, variable, year, cell).parent.mkdir(parents=True, exist_ok=True)
            _cache_file(model, scenario, variable, year, cell).write_text(json.dumps(rec, separators=(",", ":")))
            out[cell] = rec
    return out


def cluster_cells(cells: list[tuple[float, float]], max_span: float = 5.0) -> list[list[tuple[float, float]]]:
    """Greedy grouping of nearby cells so each group fits in a small lat/lon box."""
    groups: list[list[tuple[float, float]]] = []
    for cell in sorted(cells):
        for g in groups:
            lats = [c[0] for c in g] + [cell[0]]
            lons = [c[1] for c in g] + [cell[1]]
            if max(lats) - min(lats) <= max_span and max(lons) - min(lons) <= max_span:
                g.append(cell)
                break
        else:
            groups.append([cell])
    return groups


def annual_stats(series: dict[str, list[float]], variable: str) -> dict[str, Any]:
    months = np.array(series["m"])
    vals = np.array(series["v"])
    season = np.isin(months, SEASON_MONTHS)
    if variable == "tasmax":
        monthly = [float(vals[months == m].mean()) for m in range(1, 13)]
        return {"gs": float(vals[season].mean()), "monthly": monthly}
    monthly = [float(vals[months == m].sum()) for m in range(1, 13)]
    return {"gs": float(vals[season].sum()), "monthly": monthly}


def window_mean(stats: dict[int, dict[str, Any]], y0: int, y1: int) -> dict[str, Any]:
    ys = [y for y in range(y0, y1 + 1) if y in stats]
    return {
        "gs": float(np.mean([stats[y]["gs"] for y in ys])),
        "monthly": np.mean([stats[y]["monthly"] for y in ys], axis=0).tolist(),
        "n": len(ys),
    }


def series_years() -> list[int]:
    """Years (besides the headline window) needed for the 10-year series windows."""
    need: set[int] = set()
    for year in SERIES_YEARS:
        need.update(range(year - 4, year + 6))
    return sorted(y for y in need if 2021 <= y <= 2100 and not HEADLINE[0] <= y <= HEADLINE[1])


def collect(farms: list[dict[str, Any]], workers: int = 6, phase: str = "all") -> dict[Any, Any]:
    """Download what is needed for the listed farms; returns {(cell, model, scenario, var): {year: stats}}."""
    cells = sorted({cell_center(float(f["lat"]), float(f["lon"])) for f in farms})
    clusters = cluster_cells(cells)
    fut_years: list[int] = []
    if phase in ("headline", "all"):
        fut_years += list(range(HEADLINE[0], HEADLINE[1] + 1))
    if phase in ("series", "all"):
        fut_years += series_years()
    jobs = []
    for model in MODELS:
        for var in VARIABLES:
            hist = list_files(model, "historical", var)
            for y in range(BASELINE[0], BASELINE[1] + 1):
                jobs.append((model, "historical", var, y, hist[y]))
            for ssp in SSPS:
                files = list_files(model, ssp, var)
                for y in fut_years:
                    jobs.append((model, ssp, var, y, files[y]))
    total = len(clusters) * len(jobs)
    print(f"[cmip6] {len(cells)} cell(s) in {len(clusters)} cluster(s); {total} bbox requests (phase={phase})", file=sys.stderr)
    stats: dict[Any, dict[int, Any]] = {}
    done = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {}
        for cluster in clusters:
            for model, scen, var, year, path in jobs:
                futs[pool.submit(fetch_year, model, scen, var, year, cluster, path)] = (model, scen, var, year)
        for fut in as_completed(futs):
            model, scen, var, year = futs[fut]
            for cell, rec in fut.result().items():
                stats.setdefault((cell, model, scen, var), {})[year] = annual_stats(rec, var)
            done += 1
            if done % 50 == 0:
                print(f"[cmip6] {done}/{total} ({time.time() - t0:.0f}s)", file=sys.stderr)
    return stats


def _pct(values: list[float], q: float) -> float:
    return float(np.percentile(values, q))


def _summ(values: list[float], nd: int) -> dict[str, float]:
    return {"mean": round(float(np.mean(values)), nd), "p10": round(_pct(values, 10), nd), "p90": round(_pct(values, 90), nd)}


def deltas(stats: dict[Any, Any], cell: tuple[float, float], model: str, ssp: str, y0: int, y1: int) -> dict[str, Any]:
    tb = window_mean(stats[(cell, model, "historical", "tasmax")], *BASELINE)
    pb = window_mean(stats[(cell, model, "historical", "pr")], *BASELINE)
    tf = window_mean(stats[(cell, model, ssp, "tasmax")], y0, y1)
    pf = window_mean(stats[(cell, model, ssp, "pr")], y0, y1)
    return {
        "dT": tf["gs"] - tb["gs"],
        "dP": pf["gs"] / pb["gs"] - 1.0,
        "dT_m": [a - b for a, b in zip(tf["monthly"], tb["monthly"])],
        "dP_m": [a / b - 1.0 if b > 0.05 else 0.0 for a, b in zip(pf["monthly"], pb["monthly"])],
    }


def build_scenarios(stats: dict[Any, Any], farm: dict[str, Any]) -> dict[str, Any]:
    cell = cell_center(float(farm["lat"]), float(farm["lon"]))
    out: dict[str, Any] = {
        "source": (
            "NASA NEX-GDDP-CMIP6 v2.0 (0.25 deg, BCSD-downscaled) via NCCS THREDDS NCSS, "
            f"{len(MODELS)}-model ensemble mean (p10/p90 across models), growing season Apr-Sep, "
            f"vs historical {BASELINE[0]}-{BASELINE[1]}; dT from daily tasmax, dP = relative change in seasonal pr total"
        ),
        "models": MODELS,
        "season": "Apr-Sep",
        "period": {"baseline": f"{BASELINE[0]}-{BASELINE[1]}", "headline": f"{HEADLINE[0]}-{HEADLINE[1]}"},
        "cell": {"lat": cell[0], "lon": cell[1]},
        "monthly": {},
    }
    for ssp in SSPS:
        per_model = [deltas(stats, cell, m, ssp, *HEADLINE) for m in MODELS]
        dts = _summ([d["dT"] for d in per_model], 2)
        dps = _summ([d["dP"] for d in per_model], 3)
        entry: dict[str, Any] = {
            "2050": {
                "dT": dts["mean"], "dT_p10": dts["p10"], "dT_p90": dts["p90"],
                "dP": dps["mean"], "dP_p10": dps["p10"], "dP_p90": dps["p90"],
            },
            "perModel": {m: {"dT": round(d["dT"], 2), "dP": round(d["dP"], 3)} for m, d in zip(MODELS, per_model)},
            "series": [],
        }
        for year in SERIES_YEARS:
            if year == 2050:  # the headline 20-year window
                entry["series"].append({"year": 2050, "dT": dts["mean"], "dP": dps["mean"]})
                continue
            y0, y1 = year - 4, min(2100, year + 5)
            have = min(
                len([y for y in range(y0, y1 + 1) if y in stats.get((cell, m, ssp, v), {})])
                for m in MODELS for v in VARIABLES
            )
            if have < y1 - y0 + 1:
                continue  # window not downloaded (run with --phase series)
            pm = [deltas(stats, cell, m, ssp, y0, y1) for m in MODELS]
            entry["series"].append({
                "year": year,
                "dT": round(float(np.mean([d["dT"] for d in pm])), 2),
                "dP": round(float(np.mean([d["dP"] for d in pm])), 3),
            })
        out[ssp] = entry
        out["monthly"][ssp] = {
            "2050": {
                "dT": [round(float(np.mean([d["dT_m"][i] for d in per_model])), 2) for i in range(12)],
                "dP": [round(float(np.mean([d["dP_m"][i] for d in per_model])), 3) for i in range(12)],
            }
        }
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build real CMIP6 scenario layers from NEX-GDDP-CMIP6.")
    parser.add_argument("--farm", help="single farm id")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--phase", choices=("headline", "series", "all"), default="all")
    args = parser.parse_args(argv)
    farms = load_farms()
    if args.farm:
        farms = [f for f in farms if f["id"] == args.farm]
    stats = collect(farms, workers=args.workers, phase=args.phase)
    for farm in farms:
        scen = build_scenarios(stats, farm)
        path = LAYERS_DIR / farm["id"] / "scenarios.json"
        atomic_write_json(path, scen, indent=2)
        s = scen["ssp245"]["2050"]
        print(f"[cmip6] {farm['id']}: ssp245 2050 dT={s['dT']} dP={s['dP']} -> {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
