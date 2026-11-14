"""ESA WorldCereal 2021 (Zenodo 7875105, CC-BY-4.0) 10 m masks for a farm block, read WITHOUT downloading the 15-25 GB zips.

Each product is one huge zip (15-25 GB) of per-AEZ COGs, deflate-compressed. We only need the one entry of the farm's
agro-ecological zone (AEZ), ~80-100 MB: read the zip directory and that entry with HTTP range requests, inflate it into
pipeline/cache/ (gitignored) and window-read it from there.
"""
from __future__ import annotations

import io
import json
import re
import zipfile
from pathlib import Path

import numpy as np
import rasterio
import requests
from rasterio.enums import Resampling
from rasterio.transform import Affine
from rasterio.vrt import WarpedVRT

from .common import CACHE

ZENODO = "https://zenodo.org/api/records/7875105/files/{name}/content"
PRODUCTS = {
    "maize": "WorldCereal_2021_tc-maize-main_maize_classification.zip",
    "winter_cereal": "WorldCereal_2021_tc-wintercereals_wintercereals_classification.zip",
}
AEZ = {"baragan": 6136}  # from WorldCereal_AEZ.geojson (point-in-polygon at 44.55, 27.45)


class HttpRangeFile(io.RawIOBase):
    """Seekable read-only file over HTTP range requests (enough for zipfile to read the central directory)."""

    def __init__(self, url: str):
        self.url, self.pos = url, 0
        r = requests.head(url, allow_redirects=True, timeout=30)
        self.size = int(r.headers["content-length"])
        self.url = r.url

    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def read(self, n=-1):
        if n < 0:
            n = self.size - self.pos
        n = min(n, self.size - self.pos)
        if n <= 0:
            return b""
        r = requests.get(self.url, headers={"Range": f"bytes={self.pos}-{self.pos + n - 1}"}, timeout=120)
        r.raise_for_status()
        self.pos += len(r.content)
        return r.content


def list_entries(zip_name: str) -> list[zipfile.ZipInfo]:
    cache = CACHE / (zip_name + ".entries.json")
    if cache.exists():
        return [json.loads(l) for l in cache.read_text().splitlines()]
    with zipfile.ZipFile(HttpRangeFile(ZENODO.format(name=zip_name))) as z:
        rows = [{"name": i.filename, "stored": i.compress_type == 0, "size": i.file_size} for i in z.infolist()]
    cache.write_text("\n".join(json.dumps(r) for r in rows))
    return rows


def download_entry(zip_name: str, entry: str) -> Path:
    """Range-download one zip member and inflate it (zlib raw deflate) to the cache; skip if already there."""
    import struct
    import zlib

    out = CACHE / Path(entry).name
    if out.exists():
        return out
    f = HttpRangeFile(ZENODO.format(name=zip_name))
    with zipfile.ZipFile(f) as z:
        zi = z.getinfo(entry)
    f.seek(zi.header_offset)
    hdr = f.read(30)
    n, m = struct.unpack("<HH", hdr[26:30])
    f.seek(zi.header_offset + 30 + n + m)
    d = zlib.decompressobj(-15) if zi.compress_type == 8 else None
    remaining = zi.compress_size
    tmp = out.with_suffix(".part")
    with open(tmp, "wb") as fh:
        while remaining > 0:
            chunk = f.read(min(8 << 20, remaining))
            remaining -= len(chunk)
            fh.write(d.decompress(chunk) if d else chunk)
        if d:
            fh.write(d.flush())
    tmp.rename(out)
    return out


def read_masks(farm: str, transform: Affine, crs: str, shape):
    """Returns (pix, has): pix int16 on the HLS grid with 0 other / 1 maize / 2 winter cereal, has = inside a mapped crop zone."""
    aez = AEZ[farm]
    pix = np.zeros(shape, "int16")
    for cls, (key, zip_name) in enumerate(PRODUCTS.items(), start=1):
        ents = [e for e in list_entries(zip_name) if re.search(rf"/{aez}_", e["name"]) and e["name"].endswith(".tif")]
        if not ents:
            raise SystemExit(f"no WorldCereal entries for AEZ {aez} in {zip_name}")
        for e in ents:
            local = download_entry(zip_name, e["name"])
            with rasterio.open(local) as src, \
                    WarpedVRT(src, crs=crs, transform=transform, width=shape[1], height=shape[0],
                              resampling=Resampling.nearest) as vrt:
                a = vrt.read(1)
            hit = a == 100  # 100 = class present, 0 = other crop, 254 = not cropland, 255 = nodata
            pix[hit & (pix == 0)] = cls
    # WorldCereal masks only cropland; everything else is "other" (labelled, since we are inside the AEZ extent)
    return pix, np.ones(shape, bool)
