# Prithvi-EO-2.0 crop map + HLS NDVI (offline precompute)

Everything here runs once, offline, and writes small JSON files that the UI reads
(`apps/web/public/data/layers/<farm>/{cropmap,cropmap_meta,hls_ndvi}.json`). No Earthdata login is needed:
HLS v2 and USDA CDL come from Microsoft Planetary Computer (STAC, anonymous signing), WorldCereal from Zenodo,
the model from Hugging Face. Runs on CPU (about 1 minute of inference per 16 km block).

## Rerun

```bash
python3 -m venv pipeline/.venv && source pipeline/.venv/bin/activate
pip install -r pipeline/prithvi/requirements.txt      # Python 3.9+; torch CPU build is enough

# 1. 4 clear HLS scenes (May 15 - Sep 30) for a 16.3 km block -> pipeline/cache/hls_<farm>_<year>.npy  (gitignored)
python -m pipeline.prithvi.fetch_hls --farm iowa --year 2021
python -m pipeline.prithvi.fetch_hls --farm baragan --year 2021

# 2. Prithvi-EO-2.0-100M-TL embeddings (455 MB checkpoint, cached by huggingface_hub) -> crop map + metrics
python -m pipeline.prithvi.embed_and_classify --farm iowa --year 2021      # logistic-regression probe vs USDA CDL 2021
python -m pipeline.prithvi.embed_and_classify --farm baragan --year 2021   # k-means named by WorldCereal 2021 (+ probe metrics)

# 3. NDVI / NDMI time series of every clear HLS scene (8.2 km block)
python -m pipeline.prithvi.ndvi_series --farm iowa
python -m pipeline.prithvi.ndvi_series --farm baragan

ruff check pipeline/prithvi
```

`--reuse-embeddings` skips the model when `pipeline/cache/emb_<farm>_<year>.npy` exists. If a Hugging Face call hangs,
set `HF_HUB_DISABLE_XET=1` for the download and `HF_HUB_OFFLINE=1` once the checkpoint is cached.

## Method

* Input: HLS v2.0 (Landsat 8/9 + Sentinel-2, 30 m), bands Blue, Green, Red, NIR narrow, SWIR1, SWIR2 as HLS integers
  (reflectance x 10000), normalised with the model's own mean/std. Scenes are chosen by Fmask clear fraction over the block (>= 90 %),
  at least 20 days apart. Year/day-of-year and lon/lat are passed as the model's time/location coordinates (as in the official `inference.py`).
* Encoder: `ibm-nasa-geospatial/Prithvi-EO-2.0-100M-TL` (Apache-2.0), frozen. The official `prithvi_mae.py` is loaded from the
  Hugging Face repo (terratorch is not needed). 224 x 224 tiles (overlaps averaged), last-layer tokens averaged over the 4 dates,
  one 768-d vector per 16 x 16 px patch (480 m).
* Iowa: patch label = majority USDA CDL 2021 class (corn, soybeans, other). Standardise + logistic regression (C by 5-fold CV on the
  training patches only), stratified split with 10 % of patches for training, metrics on the rest.
* Baragan (no CDL in Romania): label = majority ESA WorldCereal 2021 class (maize, winter cereals, other; only the AEZ 6136 entry of the
  Zenodo zips is range-downloaded). Map = unsupervised k-means (k = 8, PCA-32) on the embeddings, each cluster named after the WorldCereal
  class it overlaps most; `confidence` = cluster purity. `agreement` is therefore not a held-out accuracy; a held-out probe is reported alongside.
* A spectral baseline (per-patch mean of the raw 4 x 6 band values, same classifier) is always reported so the encoder is judged fairly.

## Results actually obtained (2021, 16.3 km blocks, 34 x 34 patches = 1156)

| Farm | Scenes | Prithvi probe, 10 % train: acc / macro-F1 | Spectral baseline macro-F1 | Other |
|---|---|---|---|---|
| Iowa (Story Co.) | 2021-05-26, 08-14, 09-06, 09-28 | 0.891 / 0.881 | 0.910 | macro-F1 at 30 % / 50 % train: 0.893 / 0.894 (baseline 0.910 / 0.930) |
| Baragan | 2021-06-09, 07-27, 08-20, 09-19 | 0.817 / 0.790 (probe, not the shipped map) | 0.843 | k-means vs WorldCereal: agreement 0.702, macro-F1 0.645 |

Honest reading: with these cloud-limited dates the frozen encoder does **not** beat a plain spectral baseline, and is below the > 0.9
macro-F1 of the mentor kit (which used more favourable summer dates and a larger county). The layer is therefore labelled beta in the UI.

## Data notes

* HLS on Planetary Computer starts in 2020 for these tiles, so `hls_ndvi.json` covers 2020-2025 (not 2019).
* USDA CDL on Planetary Computer ends at 2021, hence 2021 for all crop maps.
* The crop-map file is a GeoJSON of 480 m patch squares (about 250 KB per farm).
