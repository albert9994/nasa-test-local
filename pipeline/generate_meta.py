"""C8 -> C1: write each farm's ``layers/<farmId>/meta.json`` from ``pipeline/presets.json``.

This is the ONLY writer of meta.json (the data fetchers never touch it). Measured site facts
override the preset guesses when the matching layer exists:

* ``layers/<id>/terrain.json``  -> ``elev`` and ``slope`` (SRTM, see pipeline/terrain)
* ``data/quant_params.json`` is unrelated; ``calib`` comes from presets (empty until validated)

Run:  python -m pipeline.generate_meta
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.common import LAYERS_DIR, atomic_write_json, load_farms

META_KEYS = (
    "id", "name", "nameRo", "country", "region", "lat", "lon", "elev", "slope", "rotation", "note",
    "droughtYears", "sowingMonths", "cropPool", "defaultEquipment", "costs", "prices", "calib",
    "economics", "sources",
)


def build_meta(farm: dict[str, Any], layers_dir: Path = LAYERS_DIR) -> dict[str, Any]:
    meta = {k: farm[k] for k in META_KEYS if k in farm}
    meta.setdefault("nameRo", meta["name"])
    terrain_path = layers_dir / farm["id"] / "terrain.json"
    if terrain_path.exists():
        terrain = json.loads(terrain_path.read_text(encoding="utf-8"))
        meta["elev"] = terrain["elev"]
        meta["slope"] = terrain["slope"]
        meta["terrainSource"] = terrain.get("slopeSource", "SRTM")
    return meta


def main() -> int:
    for farm in load_farms():
        meta = build_meta(farm)
        path = LAYERS_DIR / farm["id"] / "meta.json"
        atomic_write_json(path, meta, indent=2)
        print(f"[meta] wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
