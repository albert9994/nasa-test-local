# 02 · Contracts: hand-off formats between people

Albert signs these off at **CP1** (T+3). After that, a change needs Albert + every affected person.
Each contract names a **mock**, so whoever consumes the data can start before it exists.

| ID | What | Producer → consumers | Mock |
|---|---|---|---|
| C1 | Farm pack = layers merged by `build_packs.py` | Luca (+ Moldo, Albert layers) → Albert, Octa, Ionut | `web/data/mock/tiny_pack.json` (Luca, 15 min) |
| C2 | Rotation + options objects | Albert defines → everyone | shapes only |
| C3 | Engine API | Albert (`season/rotation`) + Ionut (`decision.js`) → Octa, Ionut, Luca | `engine.stub.js` (Albert, A6) |
| C4 | Climate scenarios layer | Luca → Ionut, Albert, Luca (deck) | `web/data/mock/scenarios.json` (Luca) |
| C5 | County yields | Moldo → Luca, Moldo | — |
| C6 | Validation summary | Luca → Ionut, Albert, Luca (deck) | `web/data/mock/summary.json` (Luca) |
| C7 | AppEEARS layers | Albert → Albert (engine), Octa (badges) | — |
| C8 | Farm presets + economics | Moldo → Luca (packs), Albert (engine defaults) | — |

---

## C1 · Farm pack, built from layers (no two people write the same file)
Each producer writes **one layer file per farm**:
```
web/data/layers/<farmId>/meta.json        ← Moldo (from pipeline/presets.json, C8)
web/data/layers/<farmId>/weather.json     ← Luca (NASA POWER)
web/data/layers/<farmId>/soil.json        ← Luca (SoilGrids)
web/data/layers/<farmId>/ndvi.json        ← Moldo (MODIS)
web/data/layers/<farmId>/scenarios.json   ← Luca (NEX-GDDP-CMIP6, C4)
web/data/layers/<farmId>/appeears.json    ← Albert (SMAP, ECOSTRESS, slope, C7)
```
`python3 pipeline/build_packs.py` (Luca) merges whatever layers exist into `web/data/farms/<farmId>.json` and writes `index.json`.
**Anyone may run it** after adding a layer. Missing layers are simply absent keys, and the app must cope.

Merged pack:
```json
{
  "meta": { "id": "iowa", "name": "Story County, Iowa (USA)", "lat": 42.03, "lon": -93.62, "elev": 310, "slope": 2.0,
            "rotation": ["maize", "soybean"], "note": "Corn Belt; 2012 drought", "cropPool": ["maize","soybean","wheat","…"],
            "costs": { "maize": 950 }, "prices": { "maize": 190 }, "calib": { "maize": 1.0 }, "sources": { … } },
  "weather": { "2001": { "tmax": [...365/366], "tmin": [...], "prcp": [...], "gwet": [...], "rad": [...], "rh": [...], "wind": [...] }, … "2025": {…} },
  "soil":    { "sand": { "0-5cm": { "mean": 16.0 }, "5-15cm": {…}, "15-30cm": {…}, "30-60cm": {…}, "60-100cm": {…} },
               "clay": {…}, "silt": {…}, "soc": {…}, "bdod": {…}, "phh2o": {…} },
  "ndvi":    { "2001": [[113, 0.41], [129, 0.55], …], … },
  "scenarios": { … C4 … },
  "smap": { … }, "esi": [ … ]
}
```
- Daily values Jan 1 → Dec 31, 2001–2025. Units: °C, mm/day, `gwet` 0–1, `rad` MJ m⁻² d⁻¹, `rh` %, `wind` m/s. POWER −999 → previous day's value.
- Soil after conversion: sand/clay/silt **%**, soc **g/kg**, bdod **g/cm³**. `soil` may be missing (the engine uses a default loam).
- NDVI: `[day-of-year, value]`, already scaled (×0.0001); `null` = bad pixel.
- `index.json`: `[{ id, name, lat, lon, slope, rotation, note }]` in demo order.

## C2 · Rotation and options
```js
rotation = [ { crop: "maize", cover: false }, { crop: "soybean", cover: true } ]   // repeats; cover = rye after that crop
opts = { dT: 0, dP: 0,            // °C added to daily Tmax/Tmin; fraction of rain change (-0.2 = 20 % less)
         sowShift: 0, maturity: 1.0, irrigCap: 0,      // levers: days, cultivar length ×, mm/season
         fieldFactor: 1,          // farmer's own calibration
         failNet: 0, failShare: 0.2,                   // "bad year" = farm net < failNet; tolerated share (1 in 5)
         prices: {}, costs: {} }
weights = { profit: 3, stability: 3, soil: 2, water: 1 }   // farmer priorities 0–5
```
Crop ids (Moldo finalises in M2): `maize, soybean, wheat (winter), barley, sorghum, sunflower, pea, millet, fallow`.

## C3 · Engine API (`web/js/engine/index.js` re-exports everything)
```js
// Albert: season.js / rotation.js (+ Moldo: crops.js, soilhealth.js)
prepareFarm(pack) → farm   // farm.soil = { texture, sand, clay, awc /*mm per m*/, socStock /*t C/ha*/ }; farm.simYears = [2002…2025]
simulateSeason(farm, cropId, year, opts, ctx = {}, trace = false) → {
  crop, year, sow, harvest, yield /*t/ha*/, net /*$/ha*/, matured, eta, etp, irr, rain, runoff, drain, stressDays,
  factors: { water, heat, frost, duration, rotation },     // each 0–1
  trace: trace ? { idx: [...], fill: [0–1...], ks: [...], tmax: [...], stage: [0–3...], heat: thresholdC } : null }
simulateRotation(farm, rotation, opts, wantSeasons = false, traceYear = null) → {
  years, farmNet: [$/ha per year], meanNet, minNet, worstYear, pFail, fails, yieldByCrop,
  soilScore /*0–100*/, socChangePct /*%/yr*/, erosion /*t/ha/yr*/, waterUse /*mm*/, traced }

// Ionut: decision.js
adaptationMargin(farm, rotation, opts) → { already, basePFail, dT, dTcapped, dP /*positive fraction*/, dPcapped }
frontier(farm, rotation, opts, onRow) → Promise<{ dTs, dPs, grid /*pFail*/ }>
optimize(farm, cropPool, opts, weights, onProgress, baselineRot) → Promise<[{ rot, base, stress, score, parts, viable }]>
pickThree(ranked, baselineRot) → [{ rot, label: "Best balance" | "Drought shield" | "Soil builder", why, base, stress }]
marginYear(farm, rotation, opts, series) → { year: 2043 | null | "now", path }
```
- **Speed budget:** `simulateRotation` < 10 ms (24 years, 2–3 crops). Needed for live sliders and the optimizer.
- `engine.stub.js` exports the **same functions and shapes** with fake-but-plausible numbers. Swapping it for the real engine is **one import line**.

## C4 · Climate scenarios layer (`layers/<farm>/scenarios.json`)
```json
{ "source": "NASA NEX-GDDP-CMIP6, N-model ensemble, growing season Apr–Sep, vs 2001–2020",
  "models": ["…"], "season": "Apr-Sep",
  "ssp245": { "2050": { "dT": 2.1, "dT_p10": 1.5, "dT_p90": 2.8, "dP": -0.04, "dP_p10": -0.15, "dP_p90": 0.06 },
              "series": [ { "year": 2030, "dT": 1.0, "dP": -0.01 }, … every 10 y … { "year": 2090, "dT": 3.1, "dP": -0.06 } ] },
  "ssp585": { … } }
```

## C5 · County yields (`web/data/validation/<farm>.json`)
```json
{ "farm": "iowa", "region": "Story County, IA", "source": "USDA NASS Quick Stats", "url": "…",
  "crops": { "maize": { "unit": "t/ha", "years": { "2002": 10.9 } } } }
```
Corn bu/ac × 0.0628 = t/ha; soybean/wheat bu/ac × 0.0673.

## C6 · Validation summary (`web/data/validation/summary.json`)
```json
{ "iowa": { "maize": { "n": 24, "r": 0.71, "rmse": 1.2, "bias": -0.1, "calib": 1.12, "pairs": [[2002, 10.9, 10.1]] },
            "ndvi": { "n": 24, "r": 0.57 } } }
```
`pairs` = `[year, observed, modelled]`. The `calib` factors also go into `meta.calib` (via Moldo's presets → meta layer).

## C7 · AppEEARS layer (`layers/<farm>/appeears.json`)
```json
{ "smap": { "2016": [[1, 0.31], …] }, "esi": [["2019-07-12", 0.42], …], "slope": 1.8, "slopeSource": "NASADEM 30 m, 3×3 median" }
```
`build_packs.py` copies `slope` into `meta.slope`.

## C8 · Farm presets + economics (`pipeline/presets.json`, owner Moldo)
```json
[ { "id": "iowa", "name": "…", "lat": 42.03, "lon": -93.62, "slope": 2.0, "rotation": ["maize","soybean"],
    "note": "…", "cropPool": ["maize","soybean","wheat","sorghum","sunflower","pea","barley","fallow"],
    "costs": { "maize": 950 }, "prices": { "maize": 190 }, "calib": {},
    "sources": { "costs": "https://…", "prices": "https://…" } } ]
```
Moldo's script writes each farm's `layers/<farm>/meta.json` from this file.
