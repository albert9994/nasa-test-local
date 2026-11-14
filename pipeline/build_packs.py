"""LU1: Merge per-farm data layers into `apps/web/public/data/farms/<id>.json` and `index.json`.

Contract C1 rules:
- Each producer writes one layer file per farm in `apps/web/public/data/layers/<farmId>/`:
  `meta.json` (ONLY from presets via generate_meta.py), `weather.json`, `soil.json`, `ndvi.json`,
  `scenarios.json` (incl. optional `monthly`), plus `terrain.json` (folded into meta by generate_meta).
- `build_packs.py` never fails on a missing layer; it simply omits the absent key.
- Real data only: mock seeding is OFF unless `--seed-mock` is passed explicitly (never for publishing).
- Writes files atomically (write to temp file, then rename).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.common import (
    FARMS_DIR,
    LAYERS_DIR,
    MOCK_DIR,
    atomic_write_json,
    load_farms,
)
from pipeline.generate_meta import main as generate_meta_main

INDEX_FIELDS = ("id", "name", "nameRo", "country", "lat", "lon", "slope", "rotation", "note")


def _read_optional_json(path: Path) -> Any | None:
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError, TypeError) as exc:
        print(f"[build_packs] warning: could not read {path}: {exc}", file=sys.stderr)
        return None


def seed_missing_layers_from_mock(
    farm_id: str,
    layer_dir: Path,
    mock_dir: Path = MOCK_DIR,
) -> None:
    """Seed missing meta/ndvi layers from cached mock packs if available."""
    mock_farm_path = mock_dir / "farms" / f"{farm_id}.json"
    if not mock_farm_path.exists():
        return
    cached = _read_optional_json(mock_farm_path)
    if not isinstance(cached, dict):
        return
    ndvi_path = layer_dir / "ndvi.json"
    if not ndvi_path.exists() and "ndvi" in cached:
        atomic_write_json(ndvi_path, cached["ndvi"])


def build_single_pack(
    farm_id: str,
    *,
    layers_dir: Path = LAYERS_DIR,
    farms_dir: Path = FARMS_DIR,
    default_meta: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Merge available layers for `farm_id` and write `farms_dir/<farm_id>.json`."""
    farm_layer_dir = layers_dir / farm_id
    meta = _read_optional_json(farm_layer_dir / "meta.json")
    if meta is None and default_meta is not None:
        meta = dict(default_meta)
    if meta is None:
        return None

    pack: dict[str, Any] = {"meta": dict(meta)}

    for layer_key in ("weather", "soil", "ndvi", "scenarios"):
        layer_data = _read_optional_json(farm_layer_dir / f"{layer_key}.json")
        if layer_data is not None:
            pack[layer_key] = layer_data

    out_path = farms_dir / f"{farm_id}.json"
    atomic_write_json(out_path, pack)
    return pack


def build_all_packs(
    *,
    layers_dir: Path = LAYERS_DIR,
    farms_dir: Path = FARMS_DIR,
    seed_mock: bool = False,
) -> list[dict[str, Any]]:
    """Build all farm packs in demo order and write `index.json`."""
    preset_farms = load_farms()
    preset_by_id = {f["id"]: f for f in preset_farms if "id" in f}
    ordered_ids = [f["id"] for f in preset_farms if "id" in f]

    if layers_dir.exists():
        for child in sorted(layers_dir.iterdir()):
            if child.is_dir() and child.name not in ordered_ids:
                ordered_ids.append(child.name)

    index_entries: list[dict[str, Any]] = []
    for farm_id in ordered_ids:
        if seed_mock:
            seed_missing_layers_from_mock(farm_id, layers_dir / farm_id)

        default_meta = preset_by_id.get(farm_id)
        # Only build a farm if it has a directory in layers_dir or if layers_dir is the default
        if not (layers_dir / farm_id).exists() and layers_dir != LAYERS_DIR:
            continue

        pack = build_single_pack(
            farm_id,
            layers_dir=layers_dir,
            farms_dir=farms_dir,
            default_meta=default_meta,
        )
        if pack is None:
            continue

        meta = pack["meta"]
        entry = {k: meta.get(k) for k in INDEX_FIELDS if k in meta}
        entry.setdefault("note", "")
        index_entries.append(entry)

    atomic_write_json(farms_dir / "index.json", index_entries, indent=2)
    return index_entries


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Merge farm layers into C1 farm packs.")
    parser.add_argument(
        "--layers-dir",
        type=Path,
        default=LAYERS_DIR,
        help="Directory containing per-farm layer folders.",
    )
    parser.add_argument(
        "--farms-dir",
        type=Path,
        default=FARMS_DIR,
        help="Output directory for merged farm packs and index.json.",
    )
    parser.add_argument(
        "--no-meta",
        action="store_true",
        help="Do not regenerate layers/<id>/meta.json from presets first.",
    )
    parser.add_argument(
        "--seed-mock",
        action="store_true",
        default=False,
        help="DEV ONLY: seed a missing ndvi layer from the mock packs (never use for published data).",
    )
    args = parser.parse_args(argv)

    if not args.no_meta and args.layers_dir == LAYERS_DIR:
        generate_meta_main()

    entries = build_all_packs(
        layers_dir=args.layers_dir,
        farms_dir=args.farms_dir,
        seed_mock=args.seed_mock,
    )
    print(f"[build_packs] built {len(entries)} farm pack(s) in {args.farms_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
