# Albert: Lead + Engine core + NASA satellite layers

**You are:** the integrator (repo, checkpoints, merges, submission) and the person who **codes the simulation engine core**
(the daily crop/soil/water loop). Moldo gives you the agronomy (parameters, rules); Ionut builds the decision layer on top of your engine.
**You own:** `web/js/engine/season.js`, `rotation.js`, `index.js`, `engine.stub.js` · `pipeline/appeears/` · `tests/` ·
`docs/team/*`, `docs/CHALLENGE.md`, `docs/SUBMISSION.md`, `docs/SCIENCE.md`, `README.md` · merges to `main`.
**Your partners:** Moldo (engine pair) · Luca (data you consume) · Ionut (consumes your engine) · Octa (backup merger).
**Sleep:** shift 2, ≈T+15.5 → T+19.5 (Octa merges meanwhile).

## Your tasks in order
| # | Task | With | Needs / start when | Done when | Unblocks | Est. | By |
|---|---|---|---|---|---|---|---|
| A1 | **Repo skeleton + stack** (repo and Drive already exist): commit the folder structure below, an empty `web/index.html` that loads, GitHub Pages on; create the Drive folders (01_PLAN.md) | — | T0 | Everyone cloned it and opened the page | everyone | 30 m | CP0 |
| A2 | **Choose demo farms** together: 3 contrasting places + 1 from your home region; check on satellite imagery that each point is a **rain-fed field** (no irrigation circles, towns, forest) | **Moldo** (M1) | T0 | Farms in `docs/CHALLENGE.md` + chat | **LU1, A4, M3** | 30 m | CP0 |
| A3 | **Kickoff stand-up** (15 min): roles, clock table, chat rules; read the official challenge statement aloud and paste it into `docs/CHALLENGE.md` | everyone | A1 + A2 | Clock times written in 01_PLAN.md | — | 30 m | **CP0** |
| A4 | **Submit AppEEARS point requests** (Earthdata login): `SPL4SMGP` root-zone soil moisture, `ECO_L4T_ESI` (or `ECO4ESIPTJPL`) ESI, `NASADEM_NC` elevation; each farm + a 3×3 grid at ~30 m (for slope); 2015–2025 | — | A2 | Request IDs in chat | A10 | 45 m | **CP1** |
| A5 | **Contracts sign-off**: walk Luca, Ionut, Octa, Moldo through `02_CONTRACTS.md`; change it now if someone objects | everyone | CP0 | Everyone OK'd in chat | all | 30 m | **CP1** |
| A6 | **`engine.stub.js`**: the C3 functions with fake-but-plausible results (same shapes) | — | A5 | Merged; Ionut and Octa import it | **I3, O2** | 30 m | **CP1** |
| A7 | **Season simulator** `season.js` + soil hydraulics: `prepareFarm`, sowing rule, GDD phenology, roots + **subsoil store**, rain → runoff → soil → drainage, ET0 × Kc → water stress, stage yield response, heat (flowering + season-long extreme heat), frost, season-length factor, `$`; `trace` option. Plus `tests/smoke.mjs <farm>` | Moldo (parameters, sanity checks at the engine syncs) | **LU1** (Iowa weather) · M2 (start with a draft maize line) · LU3 (soil; use Iowa defaults until then) | Iowa maize yields believable, 2012 among the worst years; < 1 ms per season | **A8, O4** | 5.5 h | T+8.5 |
| A8 | **Rotation layer** `rotation.js`: every phase × every year; carry-over (legume N, same-crop penalty, soil water from the previous crop, fallow stores water, rye cover uses spring water) per Moldo's M3 rules; farm-level net, `pFail`, `fails`, `worstYear`, `traced` | Moldo (rules) | A7 + **M3** | `simulateRotation` returns the C3 shape in < 10 ms | **I3, I4, O3, M6, M7** | 2 h | **T+10.5** |
| A9 | **CP2 live demo** of the first full loop + **cut list** | everyone | CP2 items | Cut list in chat | sleep shift 1 | 30 m | **CP2** |
| A10 | **AppEEARS layer** (C7): `pipeline/appeears/merge.py` → `layers/<farm>/appeears.json` (SMAP daily, QC-filtered ESI, slope from the 3×3 elevation grid); optionally use SMAP to set starting soil water after 2015 | — | A4 results | Layer files + rebuilt packs | Octa (badges) | 2.5 h | T+14 |
| A11 | **Engine hardening**: run the smoke test on all farms, speed check (optimizer < 1 s), edge cases (missing soil/NDVI, southern hemisphere, tropics) | Ionut | A10 | Smoke passes everywhere | CP3 | 1.5 h | T+15.5 |
| — | *Sleep ≈T+15.5 → T+19.5* | | | | | | |
| A12 | **CP3 stand-up**: check every feature is on screen | everyone | — | CP3 decided | — | 15 m | **CP3** |
| A13 | **Submission text** `docs/SUBMISSION.md`: summary, description, NASA + partner data, tools, **AI-use disclosure** | Luca (numbers) | **LU8 + LU9** | Reviewed by Luca | **A17** | 2 h | T+23.5 |
| A14 | **`docs/SCIENCE.md`**: equations, every parameter cited, limitations | **Moldo** (M9) | A13 | Reviewed by Moldo | M9, A16 | 1.5 h | **CP4** |
| A15 | **Feature freeze**: check the CP4 list, tag `v1.0-freeze`, announce "bug fixes only" | Octa | CP4 items | Tag pushed | **O8, O9** | 30 m | **CP4** |
| A16 | **Rehearse the pitch** 3× (you present; Moldo answers agronomy; Luca runs slides; one person plays a hostile judge) | Moldo, Luca | LU10 + M9 | Under the time limit; Q&A without notes | CP5 | 3 h | **CP5** |
| A17 | **Submit**: form + links (video, repo, live URL); open everything in incognito on a phone | Octa | **O9 + A13** | Confirmation screenshot in chat | — | 45 m | **CP6** |
| — | **Ongoing:** review/merge PRs within 30 min; open the app after every merge | Octa (backup) | from CP0 | `main` always loads | all | — | — |

## Recommended stack and skeleton (A1)
No-build static site: `web/index.html` + ES modules, **Leaflet 1.9.4** (CDN), hand-made SVG charts; engine in JavaScript in the browser;
pipeline in Python. Local: `python3 -m http.server 8000 --directory web`.
```
web/index.html  web/css/  web/js/app.js  web/js/charts.js  web/js/engine/  web/js/ui/  web/js/data/
web/data/farms/  web/data/layers/  web/data/mock/  web/data/validation/
pipeline/power/ pipeline/soil/ pipeline/ndvi/ pipeline/yields/ pipeline/cmip6/ pipeline/appeears/ pipeline/presets.json
tests/  docs/  assets/
```

## Engine recipe for A7/A8 (agree details with Moldo at the T+4.5 engine sync)
1. Spring crops sow on the first day in their window when the 5-day mean temperature ≥ the sowing temperature; winter wheat on a fixed autumn day of the previous year; southern hemisphere: shift ~182 days.
2. GDD = max(0, min(Tmean, Tupper) − Tbase). Stages by GDD fraction: vegetative < 0.45 ≤ flowering < 0.62 ≤ grain fill < 0.85 ≤ ripening.
3. Soil: Saxton & Rawls (2006) for field capacity/wilting point from sand, clay, organic matter → plant-available water mm/m.
4. FAO-56 bucket; roots grow 0.15 m → max by mid-season; **subsoil store** catches drainage and is taken up as roots deepen.
5. Starting soil water: off-season bucket since the previous harvest + **GWETROOT anomaly** nudge (it's model-relative, so never use it as an absolute value).
6. ET0: Hargreaves with POWER solar radiation; ETc = Kc × ET0; water stress Ks when depletion > p × TAW.
7. Yield = attainable × Π stages [1 − Ky (1 − ETa/ETc)] × heat × frost × season-length × rotation × calibration.
8. Heat: acute at flowering + season-long extreme degree-days (Schlenker & Roberts 2009). Without the second, warming barely hurts.
9. Climate shift: + ΔT to every daily Tmax/Tmin; × (1+ΔP) every rain day.
10. Performance: typed arrays in `prepareFarm`; no object allocation inside the daily loop.

## Checkpoint duties
Read the CP list in 01_PLAN.md; each owner answers done / fallback / blocked; decide on the spot; post the decision in chat.

## Fallbacks
- A7 late at T+9 → Ionut takes A8 (rotation layer) while you finish A7; CP2 demo runs on the stub.
- Pages broken at the end → serve from a laptop + Luca's 2-min backup capture.
- Someone disappears → give their next main task to whoever is free; drop their stretch tasks.
