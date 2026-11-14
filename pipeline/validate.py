"""C6: observation-only validation summary (no crop model in Python).

For every farm and crop with >= 8 years of observed county yields (C5, 2001-2025) this relates the
*detrended relative yield anomaly* to measured drivers:

* ``ndvi``   - growing-season peak MODIS NDVI (``layers/<id>/ndvi.json``)
* ``rain``   - NASA POWER rainfall total over the crop's critical window
* ``tmax``   - NASA POWER mean Tmax over the same window

Only Pearson r and n are reported, together with yield statistics. The modelled-vs-observed skill of
the Rust engine is computed elsewhere and NOT faked here (``engine`` is null until it exists).
Writes ``apps/web/public/data/validation/summary.json``.

Run:  python -m pipeline.validate
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.common import LAYERS_DIR, VALIDATION_DIR, atomic_write_json, load_farms

# critical window as (first day-of-year, last day-of-year)
WINDOWS: dict[str, tuple[int, int]] = {
    "wheat": (91, 181), "barley": (91, 181), "pea": (91, 181),
    "maize": (152, 243), "sunflower": (152, 243), "soybean": (152, 243), "sorghum": (152, 243),
}
START_YEAR = 2001


def _detrended_anomaly(years: list[int], values: list[float]) -> np.ndarray:
    x = np.array(years, dtype=float)
    y = np.array(values, dtype=float)
    fit = np.polyval(np.polyfit(x, y, 1), x)
    return (y - fit) / fit


def _r(a: list[float], b: np.ndarray) -> float | None:
    if len(a) < 8 or np.std(a) < 1e-9 or np.std(b) < 1e-9:
        return None
    return round(float(np.corrcoef(a, b)[0, 1]), 2)


def summarise_farm(farm_id: str) -> dict[str, Any]:
    val_path = VALIDATION_DIR / f"{farm_id}.json"
    weather_path = LAYERS_DIR / farm_id / "weather.json"
    if not val_path.exists():
        return {}
    val = json.loads(val_path.read_text(encoding="utf-8"))
    weather = json.loads(weather_path.read_text(encoding="utf-8")) if weather_path.exists() else {}
    ndvi_path = LAYERS_DIR / farm_id / "ndvi.json"
    ndvi = json.loads(ndvi_path.read_text(encoding="utf-8")) if ndvi_path.exists() else {}
    out: dict[str, Any] = {"verified": val.get("verified", False)}
    for crop, cobj in val.get("crops", {}).items():
        obs = {int(y): v for y, v in cobj["years"].items() if int(y) >= START_YEAR}
        years = sorted(obs)
        if len(years) < 8:
            continue
        anomaly = _detrended_anomaly(years, [obs[y] for y in years])
        d0, d1 = WINDOWS.get(crop, (152, 243))
        peak, rain, tmax = [], [], []
        keep_n, keep_w = [], []
        for i, y in enumerate(years):
            w = weather.get(str(y))
            if w:
                keep_w.append(i)
                rain.append(sum(w["prcp"][d0 - 1 : d1]))
                tmax.append(float(np.mean(w["tmax"][d0 - 1 : d1])))
            season = [v for _, v in ndvi.get(str(y), []) if v is not None]
            if season:
                keep_n.append(i)
                peak.append(max(season))
        entry: dict[str, Any] = {
            "n": len(years),
            "mean": round(float(np.mean(list(obs.values()))), 2),
            "cv": round(float(np.std(list(obs.values())) / np.mean(list(obs.values()))), 2),
            "worstYear": cobj.get("worstYear"),
            "bestYear": cobj.get("bestYear"),
            "window": f"DOY {d0}-{d1}",
            "rain": {"n": len(rain), "r": _r(rain, anomaly[keep_w]) if rain else None},
            "tmax": {"n": len(tmax), "r": _r(tmax, anomaly[keep_w]) if tmax else None},
        }
        if peak:
            entry["ndvi"] = {"n": len(peak), "r": _r(peak, anomaly[keep_n])}
        out[crop] = entry
    return out


def main() -> int:
    summary: dict[str, Any] = {
        "_note": (
            "Correlations of detrended relative county-yield anomalies with measured NASA POWER rainfall/Tmax "
            "and MODIS peak NDVI. Engine skill (modelled vs observed) is reported separately once the Rust "
            "engine is wired in; no modelled numbers appear here."
        ),
        "engine": None,
    }
    for farm in load_farms():
        s = summarise_farm(farm["id"])
        if s:
            summary[farm["id"]] = s
            line = ", ".join(
                f"{c}: n={v['n']} ndvi_r={v.get('ndvi', {}).get('r')} rain_r={v['rain']['r']}"
                for c, v in s.items()
                if isinstance(v, dict) and "n" in v
            )
            print(f"[validate] {farm['id']}: {line}")
    atomic_write_json(VALIDATION_DIR / "summary.json", summary, indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
