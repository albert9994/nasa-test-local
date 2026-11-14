"""Fetch 4 low-cloud HLS v2 scenes (one per month, Jun-Sep) for a farm block and cache them as (T=4, C=6, H, W).

HLS v2 (Landsat 8/9 OLI + Sentinel-2 MSI harmonised, 30 m) comes from Microsoft Planetary Computer: no Earthdata login.
Reflectance is kept as HLS integers (reflectance x 10000), the unit Prithvi-EO-2.0 was trained on.

    python -m pipeline.prithvi.fetch_hls --farm iowa --year 2021
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import rasterio

from .common import BANDS, CACHE, FARMS, NODATA, catalog, clear_mask, read_band


def pick_scenes(farm: str, year: int, n_px: int, n: int = 4, max_cloud: float = 40.0, min_clear: float = 0.9):
    """4 clearest, season-spread scenes (May 15 - Sep 30) from both HLS sensors, verified on the Fmask of the block itself."""
    f = FARMS[farm]
    half = n_px * 30 / 2 / 111_000  # deg, generous
    bbox = [f["lon"] - half * 1.5, f["lat"] - half, f["lon"] + half * 1.5, f["lat"] + half]
    cat = catalog()
    items = []
    for coll in BANDS:
        items += list(cat.search(collections=[coll], bbox=bbox, datetime=f"{year}-05-15/{year}-09-30",
                                 query={"eo:cloud_cover": {"lt": max_cloud}}).items())
    items.sort(key=lambda i: i.properties["eo:cloud_cover"])

    def clear_frac(it):
        try:
            r = read_band(it.assets["Fmask"].href, f["lat"], f["lon"], n_px)
        except (rasterio.errors.RasterioIOError, OSError):
            return None
        return None if r is None else float(clear_mask(r[0]).mean())

    with ThreadPoolExecutor(8) as ex:
        fr = list(ex.map(clear_frac, items))
    cands = sorted(((c, it) for c, it in zip(fr, items) if c is not None and c >= min_clear), key=lambda t: -t[0])
    # greedy: clearest scenes first, but spread over the season (>= 20 days apart) so the crop calendar is covered
    chosen = []
    for c, it in cands:
        d = it.datetime.date()
        if all(abs((d - o.datetime.date()).days) >= 20 for o, _ in chosen):
            chosen.append((it, c))
        if len(chosen) == n:
            break
    chosen.sort(key=lambda t: t[0].datetime)
    return chosen


def fetch_scene(item, farm: str, n_px: int):
    f = FARMS[farm]
    coll = item.collection_id
    bands = BANDS[coll]
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda b: read_band(item.assets[b].href, f["lat"], f["lon"], n_px), bands))
    arrs = [r[0] for r in res]
    return np.stack(arrs), res[0][1], str(res[0][2])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--farm", required=True, choices=list(FARMS))
    ap.add_argument("--year", type=int, default=2021)
    ap.add_argument("--n-px", type=int, default=544, help="block edge in 30 m pixels (544 = 16.3 km, 34x34 patches of 480 m)")
    a = ap.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    chosen = pick_scenes(a.farm, a.year, a.n_px)
    if len(chosen) < 4:
        raise SystemExit(f"only {len(chosen)} clear scenes found for {a.farm} {a.year}")
    stack, meta = [], []
    transform = crs = None
    for it, clear in chosen:
        arr, transform, crs = fetch_scene(it, a.farm, a.n_px)
        arr[arr == NODATA] = np.nan
        stack.append(arr)
        meta.append({"id": it.id, "date": it.datetime.date().isoformat(), "collection": it.collection_id,
                     "cloud_cover_item": it.properties["eo:cloud_cover"], "clear_fraction_block": round(clear, 4),
                     "platform": it.properties.get("platform")})
        print("scene", meta[-1])
    x = np.stack(stack).astype("float32")  # (T, C, H, W), NaN = nodata/cloud-free check done at selection
    np.save(CACHE / f"hls_{a.farm}_{a.year}.npy", x)
    (CACHE / f"hls_{a.farm}_{a.year}.json").write_text(json.dumps({
        "farm": a.farm, "year": a.year, "n_px": a.n_px, "crs": crs, "transform": list(transform)[:6],
        "scenes": meta, "bands": ["blue", "green", "red", "nir_narrow", "swir1", "swir2"],
        "fetched": dt.datetime.now(dt.UTC).isoformat(timespec="seconds")}, indent=1))
    print("saved", x.shape)


if __name__ == "__main__":
    main()
