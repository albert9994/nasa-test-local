"""Data catalog: ``apps/web/public/data/catalog.json`` (what every dataset is and whether it is real).

The UI shows these entries in tooltips. ``farms.<id>.layers`` is derived from the files that actually
exist, so a missing layer is simply absent. Statuses:

* ``real``         - fetched programmatically from the named provider (rerunnable)
* ``illustrative`` - reference/literature value or curated table, not machine-verified

Run:  python -m pipeline.catalog
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.common import (
    LAYERS_DIR,
    PUBLIC_DATA_DIR,
    VALIDATION_DIR,
    atomic_write_json,
    load_farms,
)

DATASETS: list[dict[str, Any]] = [
    {
        "id": "power", "name": "NASA POWER daily weather", "nameRo": "Meteo zilnică NASA POWER",
        "provider": "NASA Langley Research Center (POWER, MERRA-2 / CERES)",
        "url": "https://power.larc.nasa.gov/", "resolution": "0.5 x 0.625 deg grid, daily",
        "period": "2001-2025", "usedFor": "Daily Tmax/Tmin, rain, root-zone wetness, radiation, humidity, wind for the crop-water simulation",
        "status": "real", "layer": "weather",
    },
    {
        "id": "modis_ndvi", "name": "MODIS Terra NDVI (MOD13Q1 v061)", "nameRo": "NDVI MODIS Terra (MOD13Q1 v061)",
        "provider": "NASA LP DAAC via ORNL DAAC MODIS subsets",
        "url": "https://modis.ornl.gov/data/modis_webservice.html", "resolution": "250 m pixel at the farm point, 16-day composite",
        "period": "2001-2025 (growing season, DOY 113-257)", "usedFor": "Satellite greenness in the drought replay and yield validation; cloudy/snow pixels masked",
        "status": "real", "layer": "ndvi",
    },
    {
        "id": "nex_gddp_cmip6", "name": "NEX-GDDP-CMIP6 climate projections", "nameRo": "Proiecții climatice NEX-GDDP-CMIP6",
        "provider": "NASA Earth Exchange (NCCS THREDDS)",
        "url": "https://www.nccs.nasa.gov/services/data-collections/land-based-products/nex-gddp-cmip6",
        "resolution": "0.25 deg (~25 km) cell, daily, 5-model ensemble",
        "period": "baseline 1995-2014; ssp245/ssp585 2021-2100 (headline 2041-2060)",
        "usedFor": "Growing-season (Apr-Sep) and monthly temperature / rainfall change for the climate-scenario sliders",
        "status": "real", "layer": "scenarios",
    },
    {
        "id": "soilgrids", "name": "SoilGrids 2.0 soil properties", "nameRo": "Proprietăți sol SoilGrids 2.0",
        "provider": "ISRIC - World Soil Information (not NASA)",
        "url": "https://soilgrids.org/", "resolution": "250 m, 5 depths to 1 m",
        "period": "static (modelled from 2020 observations)", "usedFor": "Water-holding capacity, runoff, erodibility, carbon, pH",
        "status": "real", "layer": "soil",
    },
    {
        "id": "srtm", "name": "SRTM elevation and slope", "nameRo": "Altitudine și pantă SRTM",
        "provider": "NASA/NGA SRTM 1 arc-sec via OpenTopoData",
        "url": "https://www.opentopodata.org/datasets/srtm/", "resolution": "30 m; slope from Horn 3x3 at ~90 m",
        "period": "2000 (static)", "usedFor": "Farm elevation and slope (runoff, erosion)",
        "status": "real", "layer": "terrain",
    },
    {
        "id": "ins_tempo", "name": "INS TEMPO county crop yields", "nameRo": "Producții județene INS TEMPO",
        "provider": "Institutul Național de Statistică (România), tables AGR110A / AGR108A",
        "url": "http://statistici.insse.ro:8077/tempo-online/", "resolution": "county, annual",
        "period": "1990-2025", "usedFor": "Observed average yield per crop to validate the model and show historical bad years",
        "status": "real", "layer": "validation",
    },
    {
        "id": "nass_curated", "name": "USDA NASS county yields (curated table)", "nameRo": "Producții județene USDA NASS (tabel curatat)",
        "provider": "USDA National Agricultural Statistics Service, Quick Stats",
        "url": "https://quickstats.nass.usda.gov/", "resolution": "county, annual",
        "period": "2001-2024", "usedFor": "US county yield history; typed in from Quick Stats, NOT machine-verified (needs NASS_API_KEY)",
        "status": "illustrative", "layer": "validation",
    },
    {
        "id": "economics", "name": "Crop costs and farm-gate prices", "nameRo": "Costuri și prețuri la poarta fermei",
        "provider": "Reference values rounded from university-extension budgets and market series (ISU, K-State, MADR/IEA)",
        "url": "https://www.extension.iastate.edu/agdm/crops/html/a1-20.html", "resolution": "per farm and crop",
        "period": "2024-2025 level", "usedFor": "Margin and risk calculation; editable by the farmer",
        "status": "illustrative", "layer": "meta",
    },
    {
        "id": "quant_params", "name": "Price and cost risk parameters", "nameRo": "Parametri de risc pentru prețuri și costuri",
        "provider": "Literature-style defaults (not fitted to downloaded price series)",
        "url": "https://www.worldbank.org/en/research/commodity-markets", "resolution": "per crop",
        "period": "n/a", "usedFor": "Monte Carlo of price volatility, mean reversion, cross-crop correlation, input-cost jumps",
        "status": "illustrative", "layer": "quant_params",
    },
    {
        "id": "gibs", "name": "NASA GIBS satellite imagery tiles", "nameRo": "Imagini satelit NASA GIBS",
        "provider": "NASA EOSDIS GIBS", "url": "https://gibs.earthdata.nasa.gov/", "resolution": "250 m - 500 m, daily",
        "period": "2000-present", "usedFor": "Map background / greenness overlay (display only, no numbers derived)",
        "status": "real", "layer": "map",
    },
]
LAYER_FILES = {"weather": "weather.json", "soil": "soil.json", "ndvi": "ndvi.json", "scenarios": "scenarios.json",
               "terrain": "terrain.json"}


def build_catalog() -> dict[str, Any]:
    by_layer: dict[str, list[dict[str, Any]]] = {}
    for d in DATASETS:
        by_layer.setdefault(d["layer"], []).append(d)
    farms: dict[str, Any] = {}
    for farm in load_farms():
        fid = farm["id"]
        ids = ["economics"]
        for layer, fname in LAYER_FILES.items():
            if (LAYERS_DIR / fid / fname).exists():
                ids += [d["id"] for d in by_layer[layer]]
        val_path = VALIDATION_DIR / f"{fid}.json"
        if val_path.exists():
            verified = json.loads(val_path.read_text(encoding="utf-8")).get("verified", False)
            ids.append("ins_tempo" if verified else "nass_curated")
        farms[fid] = {
            "name": farm["name"], "nameRo": farm.get("nameRo", farm["name"]), "country": farm.get("country", ""),
            "layers": ids,
            "layerStatus": {i: next(d["status"] for d in DATASETS if d["id"] == i) for i in ids},
        }
    return {"version": 1, "datasets": [{k: v for k, v in d.items() if k != "layer"} for d in DATASETS], "farms": farms}


def main() -> int:
    path = PUBLIC_DATA_DIR / "catalog.json"
    atomic_write_json(path, build_catalog(), indent=2)
    print(f"[catalog] wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
