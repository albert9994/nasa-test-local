# Moldo: Agronomy (the practical side) + crop data

**You are:** the team's farmer brain. You decide what the crops, rotations and economics look like in real life, so the
model and its recommendations **make sense to a real farmer**. You also run two data jobs (MODIS NDVI and county yields)
and code the soil-health formulas.
**You own:** `web/js/engine/crops.js`, `web/js/engine/soilhealth.js` · `pipeline/presets.json` (farms + economics) ·
`pipeline/ndvi/`, `pipeline/yields/` · `web/data/validation/<farm>.json` · `docs/QA.md`.
**Your partners:** Albert (engine pair: you give rules and numbers, he codes the loop) · Luca (data + validation) · Octa (farmer plan text).
**Sleep:** shift 2, ≈T+15.5 → T+19.5.

## Your tasks in order
| # | Task | With | Needs / start when | Done when | Unblocks | Est. | By |
|---|---|---|---|---|---|---|---|
| M1 | **Choose demo farms** (with Albert's A2): rain-fed fields; for each, the **usual rotation**, sowing months, main crops sold locally, and the known drought years (e.g. 2012 US, 2007/2022/2024 Romania) | **Albert** | T0 | Farms + notes in `pipeline/presets.json` | **LU1**, A4 | 1.5 h | CP0 (+30 m) |
| M2 | **Crop library** `crops.js`: maize, soybean, winter wheat, barley, sorghum, sunflower, pea, millet, fallow + rye cover. Per crop: base/upper temp, GDD to maturity, sowing temp + window, Kc (ini/mid/end), root depth, depletion p, stage Ky (veg/flower/fill/ripen), flowering heat threshold, extreme-heat threshold + slope, frost limit, attainable yield, harvest index, RUSLE C factor, family, legume. **Source for each column** (FAO-56 tables, FAO-33, papers) in Drive `01 Research` | Albert reviews | M1 | Merged; sources listed | **A7** | 3 h | T+4.5 |
| M3 | **Rotation rules + economics**: legume → next crop N credit (+% yield, −$ fertilizer); same-crop penalty (e.g. continuous corn −10–15 %); same-family penalty; diversity benefit; what rye cover and fallow do (water, erosion, carbon); **prices + costs per farm** from extension budgets (Iowa State, K-State, your country's ministry) with links → `presets.json` → `layers/<farm>/meta.json` | Albert (engine sync T+4.5) | M2 | Rules posted for Albert; meta layers written | **A8** | 2.5 h | T+7 |
| M4 | **MODIS NDVI** `pipeline/ndvi/`: ORNL DAAC subset API (`modis.ornl.gov/rst/api/v1/MOD13Q1/subset`, band `250m_16_days_NDVI`). ≤ 10 dates/request and 30–90 s each, so fetch one growing season per request **in parallel** (6 threads), cache raw responses → `layers/<farm>/ndvi.json` | Luca (runs build_packs) | M3 | NDVI in ≥ 1 pack by CP2, all by T+10 | **O4, LU8** | 2.5 h | T+9.5 |
| M5 | **County yields** (C5): USDA NASS Quick Stats (US counties: corn, soybean, wheat, sorghum); your country's statistics office or Eurostat `apro_cpshr`. Post rough **long-term averages** in chat immediately (you need them yourself for M7) | — | M4 running | `web/data/validation/<farm>.json` for all farms | **M7, LU8** | 2 h | T+11.5 |
| M6 | **Soil-health formulas** `soilhealth.js`: soil carbon trend (residue + root inputs vs temperature-dependent decay), RUSLE erosion (R from rain, K from soil, LS from slope, C per crop), diversity, living cover → `soilScore` 0–100, `socChangePct`, `erosion`. Albert reviews the code | Albert | **A8** | Cover crops raise the score; numbers in believable ranges | **I4** (soil priority) | 2 h | T+13.5 |
| M7 | **Sanity tuning** (practical check): run the smoke test; compare yields with M5 averages (±25 %), check worst years match known droughts, check sowing/harvest dates match local practice; fix **parameters** (ask Albert before touching physics) | Albert | A8 + M5 | Each farm's main crops are realistic | **LU8** | 2 h | T+15.5 |
| — | *Sleep ≈T+15.5 → T+19.5* | | | | | | |
| M8 | **Farmer realism for recommendations**: per-farm crop pool (crops actually grown and sellable there); review the optimizer's picks for each farm ("would a farmer do this?"); write the "what to try first" tips and the plan sentences with Octa | Octa, Luca | I4 + LU4 | Picks make agronomic sense; tips text in `docs/STORY.md` | **O7** | 2 h | T+21.5 |
| M9 | **Q&A + limitations**: `docs/QA.md`: 12 hard judge questions with short answers (accuracy, 50 km weather, CO₂, pests, markets, who uses it); review Albert's SCIENCE.md | Albert (A14) | M8 | Reviewed by Albert | **A16** | 2.5 h | **CP4** (final CP5) |
| M10 | **Pitch co-presenter**: you answer the agronomy / "real farmer" questions in rehearsals and on stage | Albert, Luca | M9 | 3 rehearsals done | CP5 | 3 h | **CP5** |

## Engine syncs with Albert
T+4.5 (crop library + rules) · T+8.5 (first yields: realistic?) · T+13.5 (soil health + tuning).
Bring numbers, not opinions: "Iowa maize model 7.9 t/ha vs NASS 11.2 → check root depth / AWC".

## While you wait
Collect sources (FAO-56 Table 12/17/22, FAO-33 Ky table, Schlenker & Roberts 2009, Bowles et al. 2020 rotation-diversity
resilience, Poeplau & Don 2015 cover-crop carbon) in Drive `01 Research`. Write down 3 real farmer stories for the pitch.

## Fallbacks
- No county yields for a country → use national averages and say so.
- MODIS service slow → ship packs without NDVI first; the app must cope.
