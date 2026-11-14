"""Shared helpers for the Prithvi / HLS pipeline: farm blocks, Planetary Computer STAC, windowed COG reads."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "pipeline" / "cache"
OUT = ROOT / "apps" / "web" / "public" / "data" / "layers"
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"

# Farm block centres (same coordinates as apps/web/public/data/mock/farms/index.json).
FARMS = {
    "iowa": {"lat": 42.03, "lon": -93.62, "name": "Story County, Iowa"},
    "baragan": {"lat": 44.55, "lon": 27.45, "name": "Baragan Plain, Romania"},
}

# Prithvi band order: Blue, Green, Red, NIR narrow, SWIR1, SWIR2 (HLS band names differ per sensor).
BANDS = {
    "hls2-s30": ["B02", "B03", "B04", "B8A", "B11", "B12"],
    "hls2-l30": ["B02", "B03", "B04", "B05", "B06", "B07"],
}
NIR = {"hls2-s30": "B8A", "hls2-l30": "B05"}
SWIR1 = {"hls2-s30": "B11", "hls2-l30": "B06"}
RED = "B04"
NODATA = -9999

GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.tiff",
    "GDAL_HTTP_MAX_RETRY": "4",
    "GDAL_HTTP_RETRY_DELAY": "2",
    "VSI_CACHE": "TRUE",
}


def catalog():
    import planetary_computer
    import pystac_client

    return pystac_client.Client.open(STAC, modifier=planetary_computer.sign_inplace)


def sign_href(href: str) -> str:
    import planetary_computer

    return planetary_computer.sign(href)


def block_window(src: rasterio.DatasetReader, lat: float, lon: float, n_px: int) -> Window:
    """n_px x n_px window centred on (lat, lon) in the raster's own grid (all HLS scenes of a tile share one grid)."""
    x, y = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True).transform(lon, lat)
    row, col = src.index(x, y)
    return Window(col - n_px // 2, row - n_px // 2, n_px, n_px)


def window_inside(src: rasterio.DatasetReader, w: Window) -> bool:
    return w.col_off >= 0 and w.row_off >= 0 and w.col_off + w.width <= src.width and w.row_off + w.height <= src.height


def read_band(href: str, lat: float, lon: float, n_px: int):
    """Read the block for one asset. Returns (array float32 with NaN for nodata, window transform, crs) or None if outside."""
    with rasterio.Env(**GDAL_ENV), rasterio.open(sign_href(href)) as src:
        w = block_window(src, lat, lon, n_px)
        if not window_inside(src, w):
            return None
        a = src.read(1, window=w).astype("float32")
        return a, src.window_transform(w), src.crs


def clear_mask(fmask: np.ndarray) -> np.ndarray:
    """HLS v2 Fmask: bit1 cloud, bit2 adjacent to cloud/shadow, bit3 cloud shadow, bit4 snow/ice. Cirrus (bit0) is ignored."""
    f = fmask.astype("uint8")
    return (f & 0b00011110) == 0


def load_json(p: Path):
    return json.loads(p.read_text())


def dump_json(p: Path, obj, compact: bool = True):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, separators=(",", ":") if compact else None, ensure_ascii=False))
