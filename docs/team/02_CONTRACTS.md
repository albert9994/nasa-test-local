# 02 · Contracts: hand-off formats between people

Albert signs these off at **CP1** (T+3). After that, a change needs Albert + every affected person.
Each contract names a **mock**, so whoever consumes the data can start before it exists.

| ID | What | Producer → consumers | Mock |
|---|---|---|---|
| C1 | Farm pack = layers merged by `build_packs.py` | Luca (+ Moldo, Albert layers) → Albert, Octa, Ionut | `apps/web/public/data/mock/tiny_pack.json` (Luca, 15 min) |
| C2 | Rotation + options objects | Albert defines → everyone | shapes only |
| C3 | Engine API (Rust crate → WASM + server) | Albert (`season/rotation`) + Ionut (`stress/optimize`) + Moldo (`crops/soil_health`) → Octa, Ionut, Luca | Rust stub compiled to WASM with fake numbers (Albert, A6) |
| C4 | Climate scenarios layer | Luca → Ionut, Albert, Luca (deck) | `apps/web/public/data/mock/scenarios.json` (Luca) |
| C5 | County yields | Moldo → Luca, Moldo | — |
| C6 | Validation summary | Luca → Ionut, Albert, Luca (deck) | `apps/web/public/data/mock/summary.json` (Luca) |
| C7 | AppEEARS layers (stretch) | Moldo (M11) → Albert (engine), Octa (badges) | — |
| C8 | Farm presets + economics | Moldo → Luca (packs), Albert (engine defaults) | — |
| C9 | Server API (Axum) | Albert → Octa | fixed JSON files in `apps/web/public/data/mock/api/` (Albert, 15 min) |
| C11 | Quant parameters (`data/quant_params.json`) | Moldo (M12) → Ionut (I6) | literature defaults inside `quant.rs` |
| C12 | FieldShift Score (`/api/score`) | Ionut (`score.rs`, rules runner) + Moldo (rules) + Albert (LLM adjust) → Octa | `apps/web/public/data/mock/api/score.json` |
| C10 | LLM fact sheet + `/api/explain` | Albert (fact sheet in Rust) + Luca (prompt, fallback texts) → Octa (UI) | `apps/web/public/data/mock/api/explain.json` |

---

## C1 · Farm pack, built from layers (no two people write the same file)
Each producer writes **one layer file per farm**:
```
apps/web/public/data/layers/<farmId>/meta.json        ← Moldo (from pipeline/presets.json, C8)
apps/web/public/data/layers/<farmId>/weather.json     ← Luca (NASA POWER)
apps/web/public/data/layers/<farmId>/soil.json        ← Luca (SoilGrids)
apps/web/public/data/layers/<farmId>/ndvi.json        ← Moldo (MODIS)
apps/web/public/data/layers/<farmId>/scenarios.json   ← Luca (NEX-GDDP-CMIP6, C4)
apps/web/public/data/layers/<farmId>/appeears.json    ← Moldo, stretch M11 (SMAP, ECOSTRESS, slope, C7)
```
`python3 pipeline/build_packs.py` (Luca) merges whatever layers exist into `apps/web/public/data/farms/<farmId>.json` and writes `index.json`.
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

## C3 · Engine API: Rust crate `fieldshift-core`, used two ways
The **same Rust code** runs (a) in the browser through **WASM** (site + app sliders) and (b) natively in the **Axum server** (heavy runs, LLM).
All inputs and outputs are JSON with the shapes below (`serde`, camelCase); the frontend never knows which one answered.

```
crates/fieldshift-core/src/
  crops.rs        Moldo   crop library (C8 defaults)
  soil.rs         Albert  SoilGrids → water holding, curve number, erodibility, carbon stock
  season.rs       Albert  daily simulation of one season
  rotation.rs     Albert  phases × years, carry-over, economics, P(fail)
  soil_health.rs  Moldo   soil carbon, erosion, soil score
  stress.rs       Ionut   margin, frontier, drought replay, market/budget shocks, marginYear
  optimize.rs     Ionut   optimizer + pickThree + budget/equipment filters
  quant.rs        Ionut   Monte Carlo futures (weather × prices × costs) + risk metrics
  explain.rs      Albert  builds the LLM fact sheet (C10)
crates/fieldshift-wasm/   wasm-bindgen exports (Albert)
crates/fieldshift-server/ Axum server (Albert, C9)
```

**WASM exports** (`import init, * as fs from "./pkg/fieldshift_wasm.js"`, all take/return plain JS objects):
```js
fs.prepareFarm(pack) → farmHandle            // parses the C1 pack once; keep the handle
fs.simulateSeason(farmHandle, cropId, year, opts, trace) → {
  crop, year, sow, harvest, yield /*t/ha*/, net /*$/ha*/, matured, eta, etp, irr, rain, runoff, drain, stressDays,
  factors: { water, heat, frost, duration, rotation },     // each 0–1
  trace: { idx, fill /*0–1*/, ks, tmax, stage /*0–3*/, heat /*°C threshold*/ } | null }
fs.simulateRotation(farmHandle, rotation, opts, traceYear?) → {
  years, farmNet, meanNet, minNet, worstYear, pFail, fails, yieldByCrop,
  soilScore, socChangePct, erosion, waterUse, traced }
fs.adaptationMargin(farmHandle, rotation, opts) → { already, basePFail, dT, dTcapped, dP, dPcapped }
fs.frontier(farmHandle, rotation, opts) → { dTs, dPs, grid }            // 11×11; run it in a Web Worker
fs.optimize(farmHandle, cropPool, opts, weights, baselineRot, constraints) → [{ rot, base, stress, score, parts, viable }]
fs.pickThree(ranked, baselineRot) → [{ rot, label: "Best balance" | "Drought shield" | "Soil builder", why, base, stress }]
fs.marginYear(farmHandle, rotation, opts, series) → { year: 2043 | null | "now", path }
fs.marketShock(farmHandle, rotation, opts, { pricePct, inputPct }) → simulateRotation-shaped result   // thin wrapper over opts.prices/costs (Ionut, I3)
fs.quantSimulate(farmHandle, rotations, opts, { paths: 1000, fromYear: 2026, toYear: 2050, ssp: "ssp245", cashReserve: 500, seed: 42 }, quantParams) → [{
  rotation, years: [2026…2050],
  income: { p10: [...], p50: [...], p90: [...] },          // fan chart
  pBadYear: [...per year], var95, cvar95, pRuin, maxDrawdownP50,
  marginYear: { p10, p50, p90 }, meanAnnual, sdAnnual, riskAdjusted }]
fs.factSheet(farmHandle, rotation, opts, picks) → C10 fact sheet
```
- `constraints` = `{ maxCostPerHa, maxInvestment, equipment: ["row_planter","grain_drill","corn_header","sunflower_header","irrigation"], sellable: ["maize", …] }`.
- **Speed budget:** `simulateRotation` < 2 ms native, < 5 ms in WASM; optimizer (~250 rotations) < 1 s in WASM.
- **Determinism:** same inputs → same numbers (fixed seed for anything random), so LLM explanations are reproducible.
- **Mock first (A6):** a Rust stub with these exact exports returning fake-but-plausible numbers, built with `wasm-pack`, so Octa/Ionut wire the UI from hour 3.
- **Plan B:** if WASM isn't working by CP2, the same functions are called through the server (C9) with identical JSON.

## C4 · Climate scenarios layer (`layers/<farm>/scenarios.json`)
```json
{ "source": "NASA NEX-GDDP-CMIP6, N-model ensemble, growing season Apr–Sep, vs 2001–2020",
  "models": ["…"], "season": "Apr-Sep",
  "ssp245": { "2050": { "dT": 2.1, "dT_p10": 1.5, "dT_p90": 2.8, "dP": -0.04, "dP_p10": -0.15, "dP_p90": 0.06 },
              "series": [ { "year": 2030, "dT": 1.0, "dP": -0.01 }, … every 10 y … { "year": 2090, "dT": 3.1, "dP": -0.06 } ] },
  "ssp585": { … } }
```

## C5 · County yields (`apps/web/public/data/validation/<farm>.json`)
```json
{ "farm": "iowa", "region": "Story County, IA", "source": "USDA NASS Quick Stats", "url": "…",
  "crops": { "maize": { "unit": "t/ha", "years": { "2002": 10.9 } } } }
```
Corn bu/ac × 0.0628 = t/ha; soybean/wheat bu/ac × 0.0673.

## C6 · Validation summary (`apps/web/public/data/validation/summary.json`)
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

## C9 · Server API (`crates/fieldshift-server`, Axum)
| Method + path | Body → response | Use |
|---|---|---|
| `GET /api/health` | → `{ ok: true, version }` | deploy check |
| `POST /api/simulate` | `{ farmId \| pack, rotation, opts, traceYear? }` → `simulateRotation` result | plan B + app |
| `POST /api/stress` | `{ farmId, rotation, opts, kind: "margin"\|"frontier"\|"market"\|"quant", params }` → result (`quant`: 10,000 paths with `rayon`) | heavy runs (app) |
| `POST /api/optimize` | `{ farmId, cropPool, opts, weights, baselineRot, constraints }` → `pickThree` result | big searches (app) |
| `POST /api/explain` | `{ factSheet, question?, lang: "ro"\|"en", mode: "short"\|"plan"\|"chat" }` → **SSE stream** of text; final event `{ done: true, usedNumbers: [...] }` | LLM (site + app) |
- CORS on for the site's domain. The **LLM API key lives only in the server's environment** (`LLM_API_KEY`, `LLM_API_URL`), never in the browser.
- Rate-limit `/api/explain` per IP (e.g. 20/hour on the site); cache by hash of (fact sheet, question, lang).

## C10 · LLM fact sheet + explanation rules
The engine computes; **the LLM only explains**. `fs.factSheet(...)` (Rust, `explain.rs`) builds:
```json
{ "farm": { "name": "Bărăgan", "lat": 44.55, "lon": 27.45, "soil": "silty clay loam", "climate": "13.2 °C, 524 mm/yr" },
  "rotation": "maize → winter wheat",
  "rule": { "badYear": "net < 0 $/ha", "tolerance": "1 year in 5" },
  "today": { "badYears": "8/24", "meanNet": 276, "worstYear": 2007 },
  "margin": { "dT": 0.0, "dP": 0.0, "status": "already_over", "safeUntil": { "ssp245": "now", "ssp585": "now" } },
  "worstYearWhy": ["drought at flowering", "14 days > 35 °C"],
  "alternatives": [ { "label": "Drought shield", "rotation": "winter wheat → sorghum → fallow", "badYears": "0/24",
                      "deltaNet": 48, "margin": { "dT": 6.0 }, "soilScore": 37, "fitsBudget": true, "missingEquipment": [] } ],
  "soil": { "score": 39, "carbonTrendPctYr": -0.54, "erosionTHaYr": 1.4 },
  "market": { "pricePct": -30, "badYearsUnderShock": "13/24" },
  "quant": { "paths": 1000, "horizon": "2026–2050", "pBadYear2035": 0.31, "cvar95": -410, "pRuin": 0.18, "marginYearP50": 2034 },
  "sources": ["NASA POWER", "SoilGrids", "MODIS NDVI", "NEX-GDDP-CMIP6"] }
```
Rules (Luca writes the prompt in `prompts/explain_*.md`):
- Use **only numbers present in the fact sheet**; if one is missing, say so. Never estimate.
- Explain *why* (heat at flowering, soil water, no legumes) and *what to do* (2–3 concrete steps with cost).
- Plain language, short, in the requested language; always end with "planning aid, not a guarantee".
- The server checks every number in the answer against the fact sheet; on a mismatch it regenerates or falls back.
- **Fallback:** template sentences (`prompts/fallback_*.md`) filled from the fact sheet, so the app works without the LLM.

## C11 · Quant parameters (`data/quant_params.json`, Moldo → Ionut)
```json
{ "source": "FAO GIEWS / World Bank Pink Sheet monthly prices 2000–2025; county yields (C5)",
  "crops": { "maize": { "priceMean": 190, "vol": 0.24, "reversion": 0.6, "yieldCorr": -0.3 },
             "wheat": { "priceMean": 230, "vol": 0.22, "reversion": 0.5, "yieldCorr": -0.2 } },
  "priceCorr": { "maize|wheat": 0.7, "maize|soybean": 0.6 },
  "inputs": { "drift": 0.03, "jumpProb": 0.05, "jumpSize": 0.4 } }
```
- `vol`: annual volatility of log price; `reversion`: Ornstein–Uhlenbeck speed (per year); `yieldCorr`: correlation of price with the regional yield shock (negative = natural hedge).
- Weather paths reuse real seasons (block bootstrap) shifted along `scenarios.<ssp>.series`, sampling between p10 and p90 per path.
- These are **scenario probabilities, not forecasts**; the UI and the LLM must say so.

## C12 · FieldShift Score (`POST /api/score` → JSON)
```json
{ "rotation": "winter wheat → sorghum → pea",
  "score": 78, "confidence": "medium",
  "subscores": { "climate": 85, "financialRisk": 72, "profit": 64, "soil": 70, "water": 80, "feasibility": 95 },
  "weights": { "climate": 0.3, "financialRisk": 0.25, "profit": 0.25, "soil": 0.1, "water": 0.05, "feasibility": 0.05 },
  "base": 76,
  "rules": [ { "id": "legume_before_cereal", "delta": 3, "reason": "pea leaves nitrogen for the next wheat" } ],
  "excludedBy": null,
  "llm": { "delta": -1, "reason": "farmer reports compacted soil; first-year sorghum may lag", "confidence": "medium" },
  "waterfall": [ ["base", 76], ["rules", 3], ["llm", -1], ["final", 78] ] }
```
- Combines: simulator (climate, profit, water), quant (financial risk), rules (feasibility, soil bonuses), data signals (confidence), LLM (bounded ±10).
- Rules are Rhai scripts: `fn apply(rot, farm, profile) -> #{ exclude: bool, delta: int, reason: string }`.
- The LLM adjustment is schema-validated; out of range or invalid → `delta: 0`.
