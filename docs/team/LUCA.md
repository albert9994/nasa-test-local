# Luca: Data pipeline + Validation + Story

**You are:** the owner of the NASA data pipeline (weather, soil, climate projections) and of the **validation numbers**
that win the *Validity* score. You also own the story: persona, plain-language copy and the deck.
**You own:** `pipeline/power/`, `pipeline/soil/`, `pipeline/cmip6/`, `pipeline/build_packs.py` · `web/data/farms/*`, `web/data/mock/*` ·
`web/data/validation/summary.json` · `docs/DATA_SOURCES.md`, `docs/STORY.md` · the deck.
**Your partners:** Moldo (NDVI, yields, presets → your packs) · Albert (consumes packs; AppEEARS layer) · Ionut (wireframe, design) · Octa (copy, video).
**Sleep:** shift 1, ≈T+11.5 → T+15.5. **Start the CMIP6 downloads before you sleep.**
**Setup:** Earthdata account (urs.earthdata.nasa.gov); `pip install requests numpy pandas xarray netCDF4 s3fs`.

## Your tasks in order
| # | Task | With | Needs / start when | Done when | Unblocks | Est. | By |
|---|---|---|---|---|---|---|---|
| LU0 | **Mocks** (15 min): `web/data/mock/tiny_pack.json` (C1 shape, 2 years of fake values), `mock/scenarios.json` (C4), `mock/summary.json` (C6) | — | T0 | Merged | A6, O1, I6, I7 | 15 m | T+0.5 |
| LU1 | **NASA POWER weather** `pipeline/power/` → `layers/<farm>/weather.json` (daily `T2M_MAX, T2M_MIN, PRECTOTCORR, GWETROOT, ALLSKY_SFC_SW_DWN, RH2M, WS2M`, `community=AG`, 2001–2025; one request per farm, ~2 s). Plus **`pipeline/build_packs.py`** (merges layers → `farms/<id>.json` + `index.json`). **Iowa first** | — | A2 farms | Iowa pack merged by T+2.5, all farms by T+3 | **A7, O1** | 2 h | **CP1** |
| LU2 | **Persona + storyboard**: one farmer (name, farm, worry, phone or laptop) + the 30-s video storyboard (6 frames, below) → Drive `02 Design` | **Ionut** (wireframe) | LU1 | Approved at the story sync (T+4) | I1, **O9** | 1.5 h | T+4 |
| LU3 | **SoilGrids soil** `pipeline/soil/` → `layers/<farm>/soil.json`: sand, clay, silt, SOC, bulk density, pH at 0–5, 5–15, 15–30, 30–60, 60–100 cm. Use the **WCS** service first (`maps.isric.org/mapserv?map=/map/<prop>.map`, tiny GeoTIFF around the point → median); the REST API is often down (503). Divide by the d_factor (10, or 100 for bdod) | — | LU2 | Soil in every pack | **A7** | 2 h | T+6 |
| LU4 | **Plain-language copy** in `docs/STORY.md`: every UI label, hero sentence templates ("Your rotation can absorb…"), onboarding, glossary; no jargon ("ETc", "Ks") | Octa, Moldo | LU3 | Octa and Ionut use the wording | **O3, O6, O7** | 2 h | T+8 |
| LU5 | **CMIP6 setup + downloads**: public S3 `s3://nex-gddp-cmip6/NEX-GDDP-CMIP6/<MODEL>/<scenario>/r1i1p1f1/<var>/` (`--no-sign-request`); `tasmax, tasmin, pr`; `historical, ssp245, ssp585`; 6–8 models; nearest 0.25° cell per farm. **Leave downloads running through your sleep** | — | LU4 | Downloads running, script tested on 1 file | LU7 | 2 h | T+10 |
| LU6 | **Deck skeleton** (7 slides: problem · insight · demo · how it works · validation · impact · team/next) with `[TBD]` numbers → Drive `03 Deck` | Ionut (style) | LU5 | Shown at CP2 | LU10 | 1.5 h | **CP2** |
| — | *Sleep ≈T+11.5 → T+15.5* | | | | | | |
| LU7 | **Scenarios layer** (C4): growing-season ΔT/ΔP, 2041–2060 vs 2001–2020, ensemble median + p10/p90, decade series 2030–2090 → `layers/<farm>/scenarios.json` | — | LU5 downloads | Every pack has `scenarios`; sanity: ΔT 1.5–3.5 °C by 2050 | **I6**, LU10 | 2 h | T+17.5 |
| LU8 | **Calibration + validation**: per farm and crop, factor = observed mean ÷ modelled mean (→ Moldo's presets `calib`); then **r, RMSE, bias** (r is the honest skill score); NDVI check = correlation of the model's water × heat factor with MODIS peak NDVI → `summary.json` (C6) + 3 headline sentences | Moldo | **M4 + M5 + M7** | summary.json merged; headlines in chat | **I7, LU10, A13** | 2.5 h | T+20 |
| LU9 | **Data sources** `docs/DATA_SOURCES.md`: every dataset with name, version, DOI/URL, resolution, dates, what it does, citation | Albert | LU8 | Reviewed by Albert | **I7, A13, LU10** | 1 h | T+21 |
| LU10 | **Deck final** with real numbers (LU8 validation, LU7 projections, LU9 sources) + "Future work" slide | Ionut (style), Moldo (farmer slide) | LU8 + LU9 | Albert rehearsed with it once | **A16** | 3.5 h | T+25 |
| LU11 | **QA pass** on the frozen deployed URL (every button, every farm, live click, phone, dark mode, print) on 3 devices + a **2-min backup screen capture** | Ionut | **O8** | All green or P0 issues filed | **O9** | 1.5 h | T+27 |
| LU12 | Run the slides in rehearsals; time each run | Albert, Moldo | LU10 | — | A16 | 2 h | CP5 |

## Video storyboard (hand to Octa in LU2)
1. 0–4 s: satellite zoom onto a field · "How much climate change can this farm take?"
2. 4–10 s: the big margin number · "This rotation can absorb X degrees."
3. 10–16 s: slide to 2050: cards turn red, the dot crosses the limit line.
4. 16–22 s: "Replay the worst drought": tanks drain, heat days count up, yields collapse.
5. 22–27 s: the resilient rotation: more margin, soil health up.
6. 27–30 s: "FieldShift: NASA data → farm headroom." + dataset names as text (no NASA logo).

## Pipeline tips
- POWER missing values are −999, so carry the previous day forward. Round values to 1–2 decimals (~300 KB per pack).
- Write files atomically (write to a temp file, then rename) so the app never loads half a file.
- `build_packs.py` must never fail on a missing layer; it just leaves the key out.

## Fallbacks
- SoilGrids both down → no soil layer (the engine uses a default loam); retry later.
- CMIP6 S3 slow → 4 models (say so) or the NCCS THREDDS point service; else illustrative markers, labelled.
- No county yields → validation on NDVI only.
