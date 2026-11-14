"""Prithvi-EO-2.0-100M-TL as a frozen encoder -> 480 m patch embeddings -> crop map (GeoJSON) + honest metrics.

    python -m pipeline.prithvi.embed_and_classify --farm iowa --year 2021      # logistic-regression probe vs USDA CDL
    python -m pipeline.prithvi.embed_and_classify --farm baragan --year 2021   # k-means on embeddings, clusters named via WorldCereal

Steps: HLS cache (T=4, C=6, H, W) -> normalise with the model's own mean/std -> 224 x 224 tiles (stride <= 224, overlaps averaged)
-> ViT encoder last layer tokens, mean over the 4 dates -> one 768-d vector per 16 x 16 px patch (480 m) -> classifier.
Time and location coordinates are passed to the model like the official inference.py (year/day-of-year, lon/lat).
Outputs: apps/web/public/data/layers/<farm>/cropmap.json (+ cropmap_meta.json).
"""
from __future__ import annotations

import argparse
import json
import sys
import types
from pathlib import Path

import numpy as np
from pyproj import Transformer
from rasterio.transform import Affine
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.linear_model import LogisticRegressionCV
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from .common import CACHE, FARMS, OUT, dump_json

MODEL_ID = "ibm-nasa-geospatial/Prithvi-EO-2.0-100M-TL"
PATCH = 16
TILE = 224
CLASSES = {
    "iowa": ["other", "maize", "soybean"],
    "baragan": ["other", "maize", "winter_cereal"],
}


# ------------------------------------------------------------------ model
def load_model():
    import torch
    from huggingface_hub import hf_hub_download

    cfg_path = hf_hub_download(MODEL_ID, "config.json")
    code = hf_hub_download(MODEL_ID, "prithvi_mae.py")
    ckpt = hf_hub_download(MODEL_ID, "Prithvi_EO_V2_100M_TL.pt")
    # The model file annotates with `X | Y` (Python >= 3.10); the future import keeps it importable on 3.9 too.
    mod = types.ModuleType("prithvi_mae")
    mod.__file__ = code
    sys.modules["prithvi_mae"] = mod
    exec(compile("from __future__ import annotations\n" + Path(code).read_text(), code, "exec"), mod.__dict__)  # noqa: S102
    cfg = json.loads(Path(cfg_path).read_text())["pretrained_cfg"]
    mean, std = np.array(cfg["mean"], "float32"), np.array(cfg["std"], "float32")
    kw = {k: v for k, v in cfg.items() if k not in ("bands", "mean", "std", "origin_url", "paper_ids")}
    model = mod.PrithviMAE(**kw)
    sd = torch.load(ckpt, map_location="cpu", weights_only=True)
    for k in list(sd):  # fixed sin-cos position tables are re-generated, as in the official inference script
        if k == "encoder.pos_embed":
            sd[k] = model.encoder.pos_embed
        elif k == "decoder.decoder_pos_embed":
            sd[k] = model.decoder.decoder_pos_embed
    model.load_state_dict(sd, strict=True)
    model.eval()
    return model, mean, std


def tile_offsets(n: int) -> list[int]:
    offs = list(range(0, n - TILE + 1, TILE))
    if offs[-1] != n - TILE:
        offs.append(n - TILE)
    return offs


def embed_patches(model, x: np.ndarray, mean, std, temporal, loc, batch=4) -> np.ndarray:
    """x: (T, C, H, W) HLS integers (NaN = nodata). Returns (H/16, W/16, 768) patch embeddings."""
    import torch

    T, _, H, W = x.shape
    z = (x - mean[None, :, None, None]) / std[None, :, None, None]
    z = np.nan_to_num(z, nan=0.0).astype("float32")
    z = np.moveaxis(z, 0, 1)  # (C, T, H, W)
    oy, ox = tile_offsets(H), tile_offsets(W)
    acc = np.zeros((H // PATCH, W // PATCH, 768), "float32")
    cnt = np.zeros((H // PATCH, W // PATCH, 1), "float32")
    tiles = [(a, b) for a in oy for b in ox]
    tc = torch.tensor(temporal, dtype=torch.float32)
    lc = torch.tensor(loc, dtype=torch.float32)
    with torch.no_grad():
        for s in range(0, len(tiles), batch):
            chunk = tiles[s:s + batch]
            xb = torch.tensor(np.stack([z[:, :, a:a + TILE, b:b + TILE] for a, b in chunk]))
            n = len(chunk)
            feats = model.forward_features(xb, tc[None].repeat(n, 1, 1), lc[None].repeat(n, 1))[-1]
            tok = feats[:, 1:, :].reshape(n, T, TILE // PATCH, TILE // PATCH, 768).mean(1).numpy()
            for (a, b), t in zip(chunk, tok):
                acc[a // PATCH:(a + TILE) // PATCH, b // PATCH:(b + TILE) // PATCH] += t
                cnt[a // PATCH:(a + TILE) // PATCH, b // PATCH:(b + TILE) // PATCH] += 1
            print(f"  tiles {min(s + batch, len(tiles))}/{len(tiles)}", flush=True)
    return acc / cnt


# ------------------------------------------------------------------ labels
def patch_labels(pix: np.ndarray, valid: np.ndarray, n_classes: int) -> np.ndarray:
    """Majority class per 16 x 16 block; -1 when < 50 % of the block has a label."""
    H, W = pix.shape
    gh, gw = H // PATCH, W // PATCH
    out = np.full((gh, gw), -1, "int16")
    for i in range(gh):
        for j in range(gw):
            sl = (slice(i * PATCH, (i + 1) * PATCH), slice(j * PATCH, (j + 1) * PATCH))
            v = valid[sl]
            if v.mean() < 0.5:
                continue
            out[i, j] = np.bincount(pix[sl][v], minlength=n_classes).argmax()
    return out


def cdl_labels(farm: str, year: int, transform: Affine, crs: str, shape) -> tuple[np.ndarray, np.ndarray]:
    """USDA CDL (Planetary Computer, 30 m, EPSG:5070) warped onto the HLS grid. corn=1 -> maize(1), soybeans=5 -> soybean(2)."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT

    from .common import GDAL_ENV, catalog

    f = FARMS[farm]
    items = [i for i in catalog().search(collections=["usda-cdl"], bbox=[f["lon"], f["lat"], f["lon"], f["lat"]]).items()
             if "cropland" in i.assets and i.id.startswith(f"cropland_{year}")]
    if not items:
        raise SystemExit(f"no CDL {year} on Planetary Computer for {farm}")
    with rasterio.Env(**GDAL_ENV), rasterio.open(items[0].assets["cropland"].href) as src, \
            WarpedVRT(src, crs=crs, transform=transform, width=shape[1], height=shape[0],
                      resampling=Resampling.nearest, nodata=0) as vrt:
        cdl = vrt.read(1)
    pix = np.zeros(cdl.shape, "int16")
    pix[cdl == 1] = 1
    pix[cdl == 5] = 2
    return pix, cdl > 0


def worldcereal_labels(farm: str, transform: Affine, crs: str, shape) -> tuple[np.ndarray, np.ndarray]:
    from .worldcereal import read_masks

    return read_masks(farm, transform, crs, shape)


# ------------------------------------------------------------------ geometry
def patches_geojson(pred: np.ndarray, conf: np.ndarray, names: list[str], transform: Affine, crs: str) -> dict:
    tr = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    feats = []
    gh, gw = pred.shape
    for i in range(gh):
        for j in range(gw):
            x0, y0 = transform * (j * PATCH, i * PATCH)
            x1, y1 = transform * ((j + 1) * PATCH, (i + 1) * PATCH)
            ring = [tr.transform(x, y) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0))]
            feats.append({"type": "Feature",
                          "properties": {"class": names[int(pred[i, j])], "confidence": round(float(conf[i, j]), 2)},
                          "geometry": {"type": "Polygon", "coordinates": [[[round(a, 5), round(b, 5)] for a, b in ring]]}})
    return {"type": "FeatureCollection", "features": feats}


# ------------------------------------------------------------------ main
def macro(y, p, labels):
    return float(f1_score(y, p, labels=labels, average="macro", zero_division=0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--farm", required=True, choices=list(CLASSES))
    ap.add_argument("--year", type=int, default=2021)
    ap.add_argument("--train-fraction", type=float, default=0.1, help="share of labelled patches used to train the probe (mentor kit: ~10 %)")
    ap.add_argument("--reuse-embeddings", action="store_true")
    ap.add_argument("--k", type=int, default=8, help="k-means clusters (baragan)")
    a = ap.parse_args()

    names = CLASSES[a.farm]
    meta_h = json.loads((CACHE / f"hls_{a.farm}_{a.year}.json").read_text())
    x = np.load(CACHE / f"hls_{a.farm}_{a.year}.npy")
    transform = Affine(*meta_h["transform"])
    crs = meta_h["crs"]
    f = FARMS[a.farm]

    emb_path = CACHE / f"emb_{a.farm}_{a.year}.npy"
    if a.reuse_embeddings and emb_path.exists():
        emb = np.load(emb_path)
    else:
        import datetime as dt
        model, mean, std = load_model()
        temporal = [[int(s["date"][:4]), dt.date.fromisoformat(s["date"]).timetuple().tm_yday] for s in meta_h["scenes"]]
        emb = embed_patches(model, x, mean, std, temporal, [f["lon"], f["lat"]])
        np.save(emb_path, emb)
    gh, gw, D = emb.shape
    E = emb.reshape(-1, D)

    if a.farm == "iowa":
        pix, has = cdl_labels(a.farm, a.year, transform, crs, x.shape[2:])
        label_src = f"USDA NASS Cropland Data Layer {a.year} (30 m), majority class per 480 m patch"
    else:
        pix, has = worldcereal_labels(a.farm, transform, crs, x.shape[2:])
        label_src = "ESA WorldCereal 2021 v100 (10 m, Zenodo 7875105; CC-BY-4.0), majority class per 480 m patch"
    y = patch_labels(pix, has, len(names)).reshape(-1)
    lab = np.where(y >= 0)[0]
    print("label counts", {names[c]: int((y == c).sum()) for c in range(len(names))}, "unlabelled", int((y < 0).sum()))

    # spectral baseline: per-patch mean of the 4 x 6 raw HLS values (what the encoder has to beat)
    xs = np.nan_to_num(x).reshape(x.shape[0] * x.shape[1], gh, PATCH, gw, PATCH).mean((2, 4))
    B = xs.reshape(x.shape[0] * x.shape[1], -1).T

    def probe(F, idx_tr):
        """Standardise + logistic regression; C picked by 5-fold CV on the training patches only (no test leakage)."""
        sc = StandardScaler().fit(F[idx_tr])
        grid = LogisticRegressionCV(Cs=[1e-3, 1e-2, 1e-1, 1, 10], cv=5, scoring="f1_macro", max_iter=3000,
                                    class_weight="balanced", random_state=0)
        clf = grid.fit(sc.transform(F[idx_tr]), y[idx_tr])
        return sc, clf

    idx_tr, idx_te = train_test_split(lab, train_size=a.train_fraction, stratify=y[lab], random_state=0)
    labels = list(range(len(names)))
    res = {}
    for tag, F in (("prithvi", E), ("spectral_baseline", B)):
        sc, clf = probe(F, idx_tr)
        p = clf.predict(sc.transform(F[idx_te]))
        res[tag] = {"accuracy": float(accuracy_score(y[idx_te], p)), "macro_f1": macro(y[idx_te], p, labels),
                    "per_class_f1": {names[c]: float(f1_score(y[idx_te], p, labels=[c], average="macro", zero_division=0)) for c in labels}}
        print(tag, res[tag])
        if tag == "prithvi":
            sc_p, clf_p = sc, clf

    by_frac = {}
    for fr in (0.1, 0.3, 0.5):
        tr, te = train_test_split(lab, train_size=fr, stratify=y[lab], random_state=0)
        row = {}
        for tag, F in (("prithvi", E), ("spectral_baseline", B)):
            sc, clf = probe(F, tr)
            row[tag] = round(macro(y[te], clf.predict(sc.transform(F[te])), labels), 4)
        by_frac[str(fr)] = row
    print("macro-F1 by train fraction", by_frac)

    base_meta = {
        "farm": a.farm, "model": MODEL_ID, "labels": label_src, "year": a.year,
        "dates": [s["date"] for s in meta_h["scenes"]], "scenes": [s["id"] for s in meta_h["scenes"]],
        "classes": names, "patch_m": 480, "block_km": round(x.shape[2] * 30 / 1000, 1), "beta": True,
        "n_patches": int(gh * gw), "n_labelled": len(lab), "n_train": len(idx_tr), "n_test": len(idx_te),
        "train_fraction": a.train_fraction, "macro_f1_by_train_fraction": by_frac,
        "baseline_spectral_macro_f1": round(res["spectral_baseline"]["macro_f1"], 4),
        "baseline_spectral_accuracy": round(res["spectral_baseline"]["accuracy"], 4),
    }

    if a.farm == "iowa":
        proba = clf_p.predict_proba(sc_p.transform(E))
        pred, conf = proba.argmax(1), proba.max(1)
        meta = {**base_meta, "method": "prithvi-probe", "accuracy": round(res["prithvi"]["accuracy"], 4),
                "macro_f1": round(res["prithvi"]["macro_f1"], 4),
                "per_class_f1": {k: round(v, 4) for k, v in res["prithvi"]["per_class_f1"].items()},
                "note": "Frozen Prithvi-EO-2.0-100M-TL encoder + logistic-regression probe trained on "
                        f"{a.train_fraction:.0%} of CDL-labelled patches; metrics are on the other patches. "
                        "Patches used for training are predicted too. One year, one county."}
    else:
        Z = PCA(n_components=32, random_state=0).fit_transform(StandardScaler().fit_transform(E))
        km = KMeans(n_clusters=a.k, n_init=10, random_state=0).fit(Z)
        cl = km.labels_
        mapping, purity = {}, {}
        for k in range(a.k):
            m = (cl == k) & (y >= 0)
            if m.sum() == 0:
                mapping[k], purity[k] = 0, 0.0
                continue
            cnt = np.bincount(y[m], minlength=len(names))
            mapping[k], purity[k] = int(cnt.argmax()), float(cnt.max() / cnt.sum())
        pred = np.array([mapping[k] for k in cl])
        conf = np.array([purity[k] for k in cl])
        agree = float(accuracy_score(y[lab], pred[lab]))
        km_f1 = macro(y[lab], pred[lab], labels)
        meta = {**base_meta, "method": "prithvi-kmeans", "agreement": round(agree, 4), "kmeans_macro_f1": round(km_f1, 4),
                "accuracy": round(res["prithvi"]["accuracy"], 4), "macro_f1": round(res["prithvi"]["macro_f1"], 4), "k": a.k,
                "note": f"Unsupervised k-means (k={a.k}, PCA-32) on Prithvi embeddings; each cluster is named after the majority "
                        "WorldCereal class it overlaps. 'agreement' = share of labelled patches whose cluster name equals the WorldCereal "
                        "majority class (labels are used to name clusters, so this is an agreement, not a held-out accuracy). "
                        "'accuracy' is a held-out logistic-regression probe on WorldCereal labels."}
        print("kmeans agreement", agree, "macro-F1", km_f1)

    gj = patches_geojson(pred.reshape(gh, gw), conf.reshape(gh, gw), names, transform, crs)
    dump_json(OUT / a.farm / "cropmap.json", gj)
    dump_json(OUT / a.farm / "cropmap_meta.json", meta, compact=False)
    print("wrote", OUT / a.farm / "cropmap.json", (OUT / a.farm / "cropmap.json").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
