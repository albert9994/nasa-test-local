"""Median NDVI / NDMI of the farm block for every clear HLS v2 scene (2019-2025) -> hls_ndvi.json.

    python -m pipeline.prithvi.ndvi_series --farm iowa --start 2019 --end 2025

Per scene: read Red, NIR (narrow), SWIR1 and Fmask over an 8.2 km block (272 x 272 px, 30 m) from Planetary Computer COGs,
keep clear pixels (no cloud / adjacent / shadow / snow), require >= 50 % clear pixels, take the median.
  NDVI = (NIR - Red) / (NIR + Red)      NDMI = (NIR - SWIR1) / (NIR + SWIR1)
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import rasterio

from .common import (
    FARMS,
    NIR,
    NODATA,
    OUT,
    RED,
    SWIR1,
    catalog,
    clear_mask,
    dump_json,
    read_band,
)

N_PX = 272


def scene_stats(item, farm: str):
    f = FARMS[farm]
    coll = item.collection_id
    try:
        fm = read_band(item.assets["Fmask"].href, f["lat"], f["lon"], N_PX)
        if fm is None:
            return None
        ok = clear_mask(fm[0])
        if ok.mean() < 0.5:
            return None
        red = read_band(item.assets[RED].href, f["lat"], f["lon"], N_PX)[0]
        nir = read_band(item.assets[NIR[coll]].href, f["lat"], f["lon"], N_PX)[0]
        sw = read_band(item.assets[SWIR1[coll]].href, f["lat"], f["lon"], N_PX)[0]
    except (rasterio.errors.RasterioIOError, OSError, KeyError) as e:  # network hiccup on one scene must not kill the run
        print("skip", item.id, type(e).__name__, str(e)[:80])
        return None
    valid = ok & (red != NODATA) & (nir != NODATA) & (sw != NODATA) & (red + nir > 0) & (nir + sw > 0)
    if valid.mean() < 0.5:
        return None
    r, n, s = red[valid], nir[valid], sw[valid]
    ndvi = float(np.median((n - r) / (n + r)))
    ndmi = float(np.median((n - s) / (n + s)))
    return item.datetime.date().isoformat(), round(ndvi, 4), round(ndmi, 4), item.id


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--farm", required=True, choices=list(FARMS))
    ap.add_argument("--start", type=int, default=2019)
    ap.add_argument("--end", type=int, default=2025)
    ap.add_argument("--workers", type=int, default=8)
    a = ap.parse_args()
    f = FARMS[a.farm]
    d = 0.02
    bbox = [f["lon"] - d, f["lat"] - d, f["lon"] + d, f["lat"] + d]
    cat = catalog()
    items = []
    for coll in ("hls2-s30", "hls2-l30"):
        items += list(cat.search(collections=[coll], bbox=bbox, datetime=f"{a.start}-01-01/{a.end}-12-31",
                                 query={"eo:cloud_cover": {"lt": 70}}).items())
    print(len(items), "candidate scenes")
    with ThreadPoolExecutor(a.workers) as ex:
        rows = [r for r in ex.map(lambda it: scene_stats(it, a.farm), items) if r]
    # one value per date (adjacent MGRS tiles or both sensors on the same day): keep the first by id order
    byday = {}
    for r in sorted(rows, key=lambda r: (r[0], r[3])):
        byday.setdefault(r[0], r)
    rows = [byday[k] for k in sorted(byday)]
    dump_json(OUT / a.farm / "hls_ndvi.json", {
        "source": f"NASA/USGS HLS v2.0 (Landsat 8/9 + Sentinel-2), 30 m, median of clear pixels over the {N_PX * 30 / 1000:.1f} km farm block "
                  f"centred on {f['lat']}, {f['lon']}; via Microsoft Planetary Computer; cloud/shadow/snow masked with Fmask",
        "farm": a.farm,
        "block_km": round(N_PX * 30 / 1000, 1),
        "dates": [r[0] for r in rows], "ndvi": [r[1] for r in rows], "ndmi": [r[2] for r in rows],
    })
    print("wrote", len(rows), "scenes")


if __name__ == "__main__":
    main()
