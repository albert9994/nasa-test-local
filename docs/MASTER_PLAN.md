# FieldShift: Master Plan (feature catalog, judging, pitch)

> **One line:** FieldShift measures a farm's **Adaptation Margin**: how many °C of warming or % less rain the current crop
> rotation can absorb before the farm loses money more often than the farmer can accept. Then it stress-tests that
> rotation against 3 automatically found resilient rotations, using 25 years of NASA data for that exact field.

**Event:** NASA Space Apps 2026 · Challenge *Field Shift: Adapting Farms with NASA Data* · team of 5 · building from zero.
**Who does what, in what order:** [docs/team/](team/README.md) (Albert, Moldo, Luca, Ionut, Octa). This file is the *what* and the *why*.

---

## 1. How Space Apps judges, and how we score
| Criterion | What judges look for | Our answer |
|---|---|---|
| **Impact** | Could it help real people? | One number a farmer understands + a printed plan; works for any field on Earth, no login |
| **Creativity** | Is it new? | A *stress test* that measures headroom (Adaptation Margin, failure frontier, drought replay), not another "what to plant" recommender |
| **Validity** | Is the science sound? | Published methods only; validated against MODIS NDVI and county yields; honest limitations |
| **Relevance** | Does it answer the prompt with NASA data? | Every bullet mapped (§2); 6–8 NASA datasets each doing a visible job |
| **Presentation** | Is the story clear in 30 s / a few slides? | Margin → slide to 2050 → replay drought → better rotation |

Add one **space-agency partner** dataset (ESA Sentinel-2 / ESA CCI soil moisture, JAXA, CONAE) for relevance and partner-award eligibility.
Target awards: *Best Use of Science*, *Best Use of Data*, *Global Impact*.

## 2. Requirements → features (Albert completes this against the official text in `docs/CHALLENGE.md`)
| Prompt asks for | FieldShift feature | Task |
|---|---|---|
| NASA Earth observations | POWER weather, MODIS NDVI, SMAP, ECOSTRESS, NASADEM, NEX-GDDP-CMIP6, GIBS | LU1, M4, LU7, A10, O1 |
| Local soil information | SoilGrids → water holding, runoff, erodibility, carbon | LU3, A7, M6 |
| Crop characteristics | Crop library with cited parameters | M2 |
| Farmer priorities | Priority weights + farmer-defined "bad year" + tolerance | O2, I4 |
| Explore rotation strategies | Rotation builder, optimizer, compare cards, "make this my rotation" | O2, I4, I5 |
| Strengthen soil health | Soil carbon, erosion, diversity, cover crops, soil score | M3, M6 |
| Changing temperature/rainfall | Sliders, margin, frontier, 2050 projections, margin year | I3, I3b, O3, LU7, I6 |
| Water availability | Irrigation lever, crop water use, SMAP | O2, A7, A10 |
| Decision support | Plain-language plan, farmer mode | O7, O6, LU4, M8 |

## 3. Feature catalog (P0 = demo can't work without it · P1 = this weekend · P2 = stretch · P3 = roadmap slide)

### Simulation engine (Albert + Moldo)
- [ ] P0 Daily soil-water balance with growing roots + subsoil store; off-season recharge
- [ ] P0 Growing-degree-day phenology; temperature-triggered sowing
- [ ] P0 Stage-wise water-stress yield response; heat at flowering + season-long extreme heat; frost
- [ ] P0 Rotation carry-over (legume N, same-crop penalty, soil water), economics, farm-level bad years
- [ ] P1 Soil carbon, erosion, soil-health score; rye cover crop
- [ ] P1 Calibration + validation (county yields, MODIS NDVI)
- [ ] P1 `marginYear()` along CMIP6 series
- [ ] P2 Penman–Monteith ET0, CO₂ effect, weather generator with confidence intervals
- [ ] P2 Double-cropping when seasons get longer; disease-pressure proxy
- [ ] P3 Swap the core for AquaCrop/APSIM for production use

### Decision layer (Ionut)
- [ ] P0 Adaptation Margin (ΔT and rain-cut bisection)
- [ ] P1 Failure frontier grid
- [ ] P1 Optimizer → Best balance / Drought shield / Soil builder
- [ ] P2 Probabilistic margin (10/50/90 %)

### Data (Luca + Moldo + Albert)
- [ ] P0 NASA POWER daily packs for demo farms
- [ ] P0 SoilGrids soil (WCS first, REST fallback)
- [ ] P1 MODIS NDVI, county yields, NEX-GDDP-CMIP6 deltas
- [ ] P1 AppEEARS: SMAP, ECOSTRESS ESI, NASADEM slope
- [ ] P2 ESA Sentinel-2 / CCI partner data; GPM IMERG cross-check; land-cover check of the pixel
- [ ] P3 HLS 30 m, OpenET, NISAR soil moisture

### App (Octa + Ionut)
- [ ] P0 Map + farm selection; inputs; hero margin; year-by-year chart
- [ ] P1 Compare cards, frontier heatmap, drought replay, live click anywhere
- [ ] P1 Validation + data-provenance panel, printable plan, farmer mode
- [ ] P2 Share link, "why?" tooltips, field polygon, i18n, offline/PWA
- [ ] P3 Extension-agent dashboard, SMS summaries, insurer/lender view

## 4. How the simulator works (for the pitch and Q&A)
```
 NASA POWER daily weather 2001–2025  ── + ΔT, × (1+ΔP)  (or CMIP6 2050 deltas)
                    │
 SoilGrids soil ──► water holding, runoff, erodibility, carbon
                    │
   for every rotation phase × every year:
     off-season recharge (fallow / cover / bare) ← GWETROOT / SMAP
     sowing when warm enough → daily: GDD, roots, rain → runoff → soil water,
     evaporative demand → water stress → stage deficits; heat, frost, season length
     yield → $ ; soil carbon ; erosion
                    │
   farm income per year → bad years → P(fail)
                    │
   search ΔT and ΔP → ADAPTATION MARGIN ;  grid → FAILURE FRONTIER
                    │
   ~250 candidate rotations × (today, +2 °C/−20 %) → priority-weighted score → 3 picks
```
Talking points: a **screening** model, fast enough for live sliders; every equation published; validated against an independent
satellite; we report **margin**, not a fragile yield forecast.

## 5. Demo and pitch
**30-second video** (Octa): storyboard in [team/LUCA.md](team/LUCA.md).
**Slides (7):** problem · insight (headroom, not forecast) · demo screenshot · how it works (§4) · validation · impact · team + next.
**Live demo (3 min):** a demo farm → read the margin → "2050" button → frontier → "Replay worst drought" → compare cards →
"Make this my rotation" → printed plan → **click a spot in the judge's own country** (live NASA data in seconds). Rehearse the live click with a known-good fallback point.

**Stories to look for once the engine runs** (pick the best 2 for the pitch):
- a farm that is fine today but whose margin is used up by 2050;
- a farm already past its limit, where a different rotation fixes it;
- a drought year where one crop escaped because it was harvested before the heat (e.g. winter wheat vs maize).

## 6. Submission checklist (verify against the official rules)
- [ ] Title + one-sentence summary · [ ] demo video (≤ limit) or slides · [ ] public repo + live GitHub Pages URL
- [ ] Detailed description · [ ] **NASA data used** with links · [ ] partner data · [ ] references
- [ ] **AI-use disclosure**; AI media labelled; no NASA logos · [ ] license + data attributions
- [ ] Every link tested on a phone in incognito

## 7. Risks and fallbacks
| Risk | Fallback |
|---|---|
| Engine not ready at CP2 | Demo the UI on the stub engine; Ionut takes the rotation layer |
| A data API is down during judging | Demo farms are cached JSON; the live click is a bonus |
| AppEEARS queue slow | Submit in hour 1; keep GWETROOT; show "requested" |
| Silly recommendation for a place | Crop-pool chips (untick crops not grown locally); calibrate to the farmer's yields; "screening model" framing |
| Laptop/Wi-Fi fails | GitHub Pages works from any device; 2-min backup screen capture |
| Scope creep | Feature freeze at CP4; Albert decides |

## 8. Judge Q&A prep (Moldo and Albert finalise in `docs/QA.md`)
- **"Isn't this just a crop model?"** The product is the *margin* + *frontier* + optimizer over the farmer's priorities; the model is the engine.
- **"How accurate?"** Report r/RMSE vs county yields and r vs MODIS NDVI (LU8). The margin is about *relative* change, so constant biases largely cancel.
- **"50 km weather for one field?"** Weather varies slowly in space; soil (250 m), slope (30 m) and ECOSTRESS (70 m) carry the field detail.
- **"Why deltas, not daily CMIP6?"** The delta method is standard for impact screening; quantile mapping is next.
- **"CO₂, pests, markets?"** CO₂ toggle (stretch); prices editable; pests on the roadmap.
- **"Who uses it?"** Farmers and extension agents first; insurers and agri-lenders later.
