#!/usr/bin/env python3
"""
M1 / M3 (C8 -> C1): Reads pipeline/presets.json and writes each farm's
apps/web/public/data/layers/<farmId>/meta.json atomically.
"""

import json
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRESETS_PATH = ROOT / "pipeline" / "presets.json"
LAYERS_DIR = ROOT / "apps" / "web" / "public" / "data" / "layers"


def write_json_atomic(target: Path, data: dict) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=str(target.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, target)
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


def main() -> None:
    with open(PRESETS_PATH, "r", encoding="utf-8") as f:
        presets = json.load(f)

    for farm in presets:
        farm_id = farm["id"]
        meta = {
            "id": farm["id"],
            "name": farm["name"],
            "country": farm.get("country", ""),
            "region": farm.get("region", ""),
            "lat": farm["lat"],
            "lon": farm["lon"],
            "elev": farm["elev"],
            "slope": farm["slope"],
            "rotation": farm["rotation"],
            "note": farm["note"],
            "droughtYears": farm.get("droughtYears", []),
            "sowingMonths": farm.get("sowingMonths", {}),
            "cropPool": farm["cropPool"],
            "defaultEquipment": farm.get("defaultEquipment", []),
            "costs": farm["costs"],
            "prices": farm["prices"],
            "calib": farm.get("calib", {}),
            "sources": farm["sources"],
        }
        out_path = LAYERS_DIR / farm_id / "meta.json"
        write_json_atomic(out_path, meta)
        print(f"[M3] Wrote {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
