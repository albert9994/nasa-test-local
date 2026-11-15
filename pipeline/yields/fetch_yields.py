"""C5: county yields -> apps/web/public/data/validation/<farm>.json.

* Romania: INS TEMPO-Online, matrix AGR110A (average yield, kg/ha, by county) and AGR108A
  (cultivated area, ha), 1990-2025, fetched live from the TEMPO ``pivot`` endpoint.
* USA: USDA NASS Quick Stats when ``NASS_API_KEY`` is set (live), otherwise the curated table in
  ``us_curated.py`` flagged ``"verified": false``.

Run:  python -m pipeline.yields.fetch_yields [--farm ID]
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import sys
from pathlib import Path
from typing import Any

import requests

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pipeline.common import VALIDATION_DIR, atomic_write_json, load_farms
from pipeline.yields.us_curated import US_CURATED, US_REGIONS

TEMPO_PIVOT = "http://statistici.insse.ro:8077/tempo-ins/pivot"
TEMPO_MATRIX = "http://statistici.insse.ro:8077/tempo-ins/matrix"
TEMPO_URL = "http://statistici.insse.ro:8077/tempo-online/#/pages/tables/insse-table"

# Hotar crop id -> TEMPO crop name (accent-free, as TEMPO labels them)
RO_CROPS: dict[str, str] = {
    "wheat": "Grau si secara",
    "barley": "Orz si orzoaica",
    "maize": "Porumb boabe",
    "sunflower": "Floarea soarelui",
    "soybean": "Soia boabe",
    "pea": "Mazare boabe",
    "sorghum": "Sorg",
}
# Hotar farm id -> (TEMPO county label, display name)
RO_COUNTIES: dict[str, tuple[str, str]] = {
    "baragan": ("Ialomita", "Județul Ialomița"),
    "vaslui": ("Vaslui", "Județul Vaslui"),
    "dolj": ("Dolj", "Județul Dolj"),
    "teleorman": ("Teleorman", "Județul Teleorman"),
}
MIN_AREA_HA = 300  # drop county-years where the crop is too marginal to be meaningful


def _matrix(code: str) -> dict[str, Any]:
    resp = requests.get(f"{TEMPO_MATRIX}/{code}", timeout=60)
    resp.raise_for_status()
    return resp.json()


def _option_ids(meta: dict[str, Any], dim: int) -> dict[str, int]:
    dm = next(d for d in meta["dimensionsMap"] if d["dimCode"] == dim)
    return {o["label"].strip(): o["nomItemId"] for o in dm["options"]}


def _query(code: str, crop_ids: list[int], county_id: int, meta: dict[str, Any]) -> dict[tuple[str, int], float]:
    """Return {(crop label, year): value} for one county via the TEMPO pivot endpoint."""
    owner = _option_ids(meta, 2)["Total"]
    years = _option_ids(meta, 4)
    um = next(iter(_option_ids(meta, 5).values()))
    enc = ":".join([
        ",".join(map(str, crop_ids)), str(owner), str(county_id),
        ",".join(str(v) for v in years.values()), str(um),
    ])
    body = {
        "language": "ro", "encQuery": enc, "matCode": code, "matMaxDim": 5,
        "matRegJ": meta["details"].get("matRegJ", 3), "matUMSpec": 0, "matSiruta": 0,
        "matDownloadAge": None, "matUpdate": "", "itemsList": [],
    }
    resp = requests.post(TEMPO_PIVOT, json=body, timeout=120)
    resp.raise_for_status()
    out: dict[tuple[str, int], float] = {}
    for row in csv.reader(io.StringIO(resp.text)):
        row = [cell.strip() for cell in row]
        if len(row) < 6 or not row[3].startswith("Anul "):
            continue
        try:
            out[(row[0], int(row[3].split()[1]))] = float(row[-1])
        except ValueError:
            continue
    return out


def _summarise(years: dict[str, float]) -> dict[str, Any]:
    vals = list(years.values())
    mean = sum(vals) / len(vals)
    worst = min(years.items(), key=lambda kv: kv[1])
    best = max(years.items(), key=lambda kv: kv[1])
    return {
        "longTermMean": round(mean, 2),
        "worstYear": {"year": int(worst[0]), "yield": worst[1]},
        "bestYear": {"year": int(best[0]), "yield": best[1]},
    }


def build_romania(farm: dict[str, Any]) -> dict[str, Any]:
    county, display = RO_COUNTIES[farm["id"]]
    y_meta, a_meta = _matrix("AGR110A"), _matrix("AGR108A")
    county_id = _option_ids(y_meta, 3)[county]
    y_crops, a_crops = _option_ids(y_meta, 1), _option_ids(a_meta, 1)
    area_ids = [a_crops[RO_CROPS[c]] for c in RO_CROPS]
    area = _query("AGR108A", area_ids, _option_ids(a_meta, 3)[county], a_meta)
    yld = _query("AGR110A", [y_crops[RO_CROPS[c]] for c in RO_CROPS], county_id, y_meta)
    crops: dict[str, Any] = {}
    for crop, label in RO_CROPS.items():
        years: dict[str, float] = {}
        areas: dict[str, float] = {}
        for (name, year), kg in sorted(yld.items()):
            if name != label:
                continue
            ha = area.get((label, year), 0.0)
            if ha < MIN_AREA_HA or kg <= 0:
                continue
            years[str(year)] = round(kg / 1000.0, 2)
            areas[str(year)] = ha
        if len(years) >= 10:
            crops[crop] = {"unit": "t/ha", "years": years, "areaHa": areas, **_summarise(years)}
    return {
        "farm": farm["id"],
        "region": f"{display} (România)",
        "source": "INS TEMPO-Online, AGR110A (producția medie la hectar) & AGR108A (suprafața cultivată), all holdings",
        "url": TEMPO_URL,
        "verified": True,
        "retrieved": "live INS TEMPO pivot API; kg/ha / 1000 = t/ha; county-years with < "
        f"{MIN_AREA_HA} ha of the crop dropped",
        "crops": crops,
    }


def _nass_live(farm_id: str, key: str) -> dict[str, Any] | None:
    label, county, state, url = US_REGIONS[farm_id]
    nass = {"maize": ("CORN", "GRAIN", 0.0628), "soybean": ("SOYBEANS", None, 0.0673),
            "wheat": ("WHEAT", None, 0.0673), "sorghum": ("SORGHUM", "GRAIN", 0.0628)}
    crops: dict[str, Any] = {}
    for crop, (commodity, util, factor) in nass.items():
        if crop not in US_CURATED.get(farm_id, {}):
            continue
        params = {
            "key": key, "source_desc": "SURVEY", "sector_desc": "CROPS", "commodity_desc": commodity,
            "statisticcat_desc": "YIELD", "agg_level_desc": "COUNTY", "state_name": state,
            "county_name": county, "format": "JSON", "year__GE": 2001,
        }
        if util:
            params["util_practice_desc"] = util
        resp = requests.get("https://quickstats.nass.usda.gov/api/api_GET/", params=params, timeout=60)
        if resp.status_code != 200:
            return None
        years = {}
        for row in resp.json().get("data", []):
            if row.get("prodn_practice_desc", "ALL PRODUCTION PRACTICES") != "ALL PRODUCTION PRACTICES":
                continue
            try:
                years.setdefault(row["year"], round(float(row["Value"].replace(",", "")) * factor, 2))
            except ValueError:
                continue
        if years:
            crops[crop] = {"unit": "t/ha", "years": dict(sorted(years.items())), **_summarise(years)}
    if not crops:
        return None
    return {"farm": farm_id, "region": label, "source": "USDA NASS Quick Stats (survey, county yield)",
            "url": url, "verified": True, "crops": crops}


def build_us(farm: dict[str, Any]) -> dict[str, Any]:
    key = os.environ.get("NASS_API_KEY")
    if key:
        live = _nass_live(farm["id"], key)
        if live:
            return live
    label, _c, _s, url = US_REGIONS[farm["id"]]
    crops = {}
    for crop, series in US_CURATED[farm["id"]].items():
        years = {str(y): v for y, v in sorted(series.items())}
        crops[crop] = {"unit": "t/ha", "years": years, **_summarise(years)}
    return {
        "farm": farm["id"], "region": label,
        "source": "USDA NASS Quick Stats county yields (curated table, not machine-verified)",
        "url": url, "verified": False,
        "note": "Set NASS_API_KEY and rerun pipeline.yields.fetch_yields to replace with live values.",
        "crops": crops,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build county yield validation files (C5).")
    parser.add_argument("--farm")
    args = parser.parse_args(argv)
    for farm in load_farms():
        fid = farm["id"]
        if args.farm and fid != args.farm:
            continue
        if fid in RO_COUNTIES:
            data = build_romania(farm)
        elif fid in US_CURATED:
            data = build_us(farm)
        else:
            continue
        path = VALIDATION_DIR / f"{fid}.json"
        atomic_write_json(path, data, indent=1)
        summary = ", ".join(c + "(" + str(len(v["years"])) + "y)" for c, v in data["crops"].items())
        print(f"[yields] {fid}: {summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
