"""Shared utilities, paths, default farm presets, and atomic JSON writing."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DATA_DIR = REPO_ROOT / "apps" / "web" / "public" / "data"
LAYERS_DIR = PUBLIC_DATA_DIR / "layers"
FARMS_DIR = PUBLIC_DATA_DIR / "farms"
MOCK_DIR = PUBLIC_DATA_DIR / "mock"
VALIDATION_DIR = PUBLIC_DATA_DIR / "validation"
PRESETS_PATH = REPO_ROOT / "pipeline" / "presets.json"

DEFAULT_FARMS: list[dict[str, Any]] = [
    {
        "id": "iowa",
        "name": "Story County, Iowa (USA)",
        "lat": 42.03,
        "lon": -93.62,
        "elev": 310.22,
        "slope": 2.0,
        "rotation": ["maize", "soybean"],
        "note": "Corn Belt. 2012 flash drought + heat.",
        "cropPool": [
            "maize",
            "soybean",
            "wheat",
            "sorghum",
            "sunflower",
            "pea",
            "barley",
            "fallow",
        ],
        "costs": {
            "maize": 950,
            "soybean": 620,
            "wheat": 700,
            "sorghum": 580,
            "sunflower": 540,
            "pea": 500,
            "barley": 600,
            "millet": 340,
            "fallow": 60,
        },
        "prices": {
            "maize": 190,
            "soybean": 420,
            "wheat": 230,
            "sorghum": 175,
            "sunflower": 430,
            "pea": 300,
            "barley": 200,
            "millet": 260,
        },
        "calib": {"maize": 1.09, "soybean": 1.05},
        "sources": {
            "weather": "NASA POWER daily, community=AG (MERRA-2 meteorology, CERES/MERRA-2 solar)",
            "ndvi": "MODIS MOD13Q1 v061 250 m 16-day NDVI via ORNL DAAC",
            "soil": "ISRIC SoilGrids 2.0 250 m (mean, Q0.05, Q0.95)",
            "scenarios": "NASA NEX-GDDP-CMIP6 v2.0 0.25 deg ensemble",
            "costs": "Iowa State University Extension Ag Decision Maker (File A1-20)",
            "prices": "USDA NASS / FAO GIEWS",
        },
    },
    {
        "id": "kansas",
        "name": "Finney County, Kansas (USA)",
        "lat": 37.95,
        "lon": -100.85,
        "elev": 858.35,
        "slope": 1.0,
        "rotation": ["wheat", "fallow"],
        "note": "Dryland High Plains. 2011/2022 droughts.",
        "cropPool": [
            "wheat",
            "sorghum",
            "sunflower",
            "pea",
            "millet",
            "barley",
            "maize",
            "soybean",
            "fallow",
        ],
        "costs": {
            "wheat": 300,
            "sorghum": 380,
            "maize": 520,
            "sunflower": 330,
            "soybean": 400,
            "pea": 300,
            "barley": 300,
            "millet": 250,
            "fallow": 50,
        },
        "prices": {
            "wheat": 230,
            "sorghum": 175,
            "maize": 190,
            "sunflower": 430,
            "soybean": 420,
            "pea": 300,
            "barley": 200,
            "millet": 260,
        },
        "calib": {"wheat": 0.94, "sorghum": 0.96},
        "sources": {
            "weather": "NASA POWER daily, community=AG (MERRA-2 meteorology, CERES/MERRA-2 solar)",
            "ndvi": "MODIS MOD13Q1 v061 250 m 16-day NDVI via ORNL DAAC",
            "soil": "ISRIC SoilGrids 2.0 250 m (mean, Q0.05, Q0.95)",
            "scenarios": "NASA NEX-GDDP-CMIP6 v2.0 0.25 deg ensemble",
            "costs": "K-State Research and Extension Western Kansas Dryland Crop Budgets",
            "prices": "USDA NASS / FAO GIEWS",
        },
    },
    {
        "id": "baragan",
        "name": "Baragan Plain (Romania)",
        "lat": 44.55,
        "lon": 27.45,
        "elev": 32.13,
        "slope": 1.5,
        "rotation": ["maize", "wheat"],
        "note": "Lower Danube. 2022/2024 extreme drought.",
        "cropPool": [
            "wheat",
            "maize",
            "sunflower",
            "barley",
            "sorghum",
            "pea",
            "soybean",
            "millet",
            "fallow",
        ],
        "costs": {
            "maize": 620,
            "wheat": 400,
            "sunflower": 400,
            "soybean": 450,
            "barley": 360,
            "sorghum": 450,
            "pea": 340,
            "millet": 280,
            "fallow": 50,
        },
        "prices": {
            "maize": 180,
            "wheat": 210,
            "sunflower": 420,
            "soybean": 400,
            "barley": 190,
            "sorghum": 170,
            "pea": 280,
            "millet": 240,
        },
        "calib": {"maize": 0.92, "wheat": 0.96},
        "sources": {
            "weather": "NASA POWER daily, community=AG (MERRA-2 meteorology, CERES/MERRA-2 solar)",
            "ndvi": "MODIS MOD13Q1 v061 250 m 16-day NDVI via ORNL DAAC",
            "soil": "ISRIC SoilGrids 2.0 250 m (mean, Q0.05, Q0.95)",
            "scenarios": "NASA NEX-GDDP-CMIP6 v2.0 0.25 deg ensemble",
            "costs": "MADR / ASAS Romania Crop Technology Budgets",
            "prices": "Euronext MATIF / INS TEMPO Romania",
        },
    },
]


def atomic_write_json(
    path: Path,
    data: Any,
    *,
    indent: int | None = None,
) -> None:
    """Write JSON atomically via a temporary file in the target directory."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        dir=str(path.parent),
        prefix=f".{path.name}.",
        suffix=".tmp",
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            if indent is None:
                json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
            else:
                json.dump(data, handle, ensure_ascii=False, indent=indent)
                handle.write("\n")
        os.chmod(tmp_name, 0o644)
        os.replace(tmp_name, path)
    except Exception:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise


def load_farms(presets_path: Path | None = None) -> list[dict[str, Any]]:
    """Load demo farm configurations from presets.json or fall back to DEFAULT_FARMS."""
    target = presets_path or PRESETS_PATH
    if target.exists():
        with open(target, encoding="utf-8") as handle:
            loaded = json.load(handle)
        if isinstance(loaded, list) and loaded:
            return loaded
    return [dict(farm) for farm in DEFAULT_FARMS]
