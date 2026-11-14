# Ionut: Stress test + optimizer + quant engine (Rust) + charts + design system

**You are:** the bridge between science and UI. You design the look (wireframe, design tokens, CSS), build the chart toolkit,
and write the **stress test and optimizer in Rust** (`stress.rs`, `optimize.rs`): Adaptation Margin, failure frontier, market/budget shocks,
"safe until 20XX", the **quant engine** (Monte Carlo futures of weather, prices and costs, with finance-style risk metrics), and the search for better rotations under the farmer's budget and equipment. Then you put them on screen.
**You own:** `crates/fieldshift-core/src/{stress,optimize,quant}.rs` · `web/css/*` · `web/js/charts.ts` · `web/js/ui/{compare,frontier,marginyear,science}.ts` · `assets/brand/`.
**Your partners:** Albert (engine you build on; reviews your Rust) · Octa (UI pair: Octa owns the page, you plug components into slots) · Moldo (realism of picks) · Luca (persona, data).
**Sleep:** shift 2, ≈T+15.5 → T+19.5.
**New to Rust?** Albert's stub (A6) gives you the function signatures; write plain functions over `&Farm`, return `serde` structs, and ask Albert to review the first PR.

## Your tasks in order
| # | Task | With | Needs / start when | Done when | Unblocks | Est. | By |
|---|---|---|---|---|---|---|---|
| I1 | **Wireframe + design system**: wireframe of the app (inputs left, results right, hero margin on top; one column on phones) and of the **light site**; design tokens as CSS variables (light **and** dark), type, cards, buttons, sliders, chips → `web/css/style.css` (shared by app + site); logo/wordmark | Luca (persona), Octa | T0 | Octa's shell uses it | **O1, O6** | 3 h | **CP1** |
| I2 | **Chart toolkit** `charts.ts` (SVG, colours from CSS variables): multi-line chart with threshold + highlighted year; heatmap with contour + labelled markers + current-point ring; scatter | — | I1 | A demo page shows all 3 in light + dark | **O3, I3b, O4, I7** | 2.5 h | T+5.5 |
| I3 | **Margin + frontier in Rust** (`stress.rs`, C3): `p_fail(dT, dP)` = `simulate_rotation(...).p_fail`; bisection on ΔT ∈ [0, 6] °C and rain cut ∈ [0, 70 %] (8 steps each); `frontier` 11×11 grid (ΔT 0–5 °C × ΔP 0 to −50 %); expose through WASM (Albert's wasm crate); frontend runs `frontier` in a **Web Worker**. Build on the stub's `Farm`, switch to the real engine when A8 lands | Albert (review) | **A6**; real: **A8** | Iowa's margin from the real engine, in the browser | **O3**, I3b | 3 h | **CP2** |
| I3b | **Frontier heatmap UI** `ui/frontier.ts`: rotation tabs, colour = share of bad years, white contour at the farmer's limit, Today / 2050 markers, current-climate ring | Octa (slot) | I2 + I3 | < 1 s per rotation | CP3 | 1.5 h | T+10.5 |
| I4 | **Optimizer in Rust** (`optimize.rs`): enumerate rotations of 1–3 crops (no back-to-back repeats; A-B-C = B-C-A) ± rye cover; **filter by constraints** (max cost/ha, required equipment, sellable crops); score at today + stress test (+2 °C, −20 % rain) on profit / stability / soil / water, weighted by priorities; keep "viable"; `pick_three` → **Best balance / Drought shield / Soil builder** | Moldo (do the picks make sense?) | **A8** (+ M6 soil score) | ~250 rotations < 1 s in WASM; sensible picks per farm | **I5**, M8 | 3 h | T+13.5 |
| I5 | **Compare cards** `ui/compare.ts`: your rotation + 3 picks: income (+ difference), bad years, worst year, margin, soil score, carbon trend, erosion, water use, **fits budget / missing equipment**; "Make this my rotation"; progress bar | Octa (slot) | I4 | 4 cards update with the sliders | CP3, O6 | 2 h | T+15.5 |
| — | *Sleep ≈T+15.5 → T+19.5* | | | | | | |
| I6 | **Quant engine in Rust** (`quant.rs`, C3 `quantSimulate`): simulate **N future paths 2026–2050**. Weather: block-bootstrap of real seasons shifted along the CMIP6 trajectory, with the model spread (p10–p90) sampled per path. Prices: mean-reverting log-price (Ornstein–Uhlenbeck) per crop, correlated across crops and with the regional yield shock (Cholesky). Costs: drift + rare fertilizer-price jumps. Output per rotation: income fan (p10/p50/p90 per year), P(bad year) per year, **VaR95 / CVaR95**, **probability of ruin** for a starting cash reserve, max drawdown, distribution of the **margin year** (median + 80 % band), risk-adjusted score (mean ÷ sd). Seeded RNG (`rand_chacha`) so results are reproducible; `rayon` on the server (10k paths), 1k paths in a Web Worker in WASM. Plus `ui/marginyear.ts` ("safe until ~20XX") and a **fan chart** in the hero | Moldo (M12 params), Luca (scenarios), Albert (review) | **LU7** + **M12** (literature defaults until then: vol 25 %/yr, reversion 0.5/yr, price–yield ρ −0.3) | Iowa: fan chart + VaR/CVaR + ruin probability for all 4 rotations in < 2 s (WASM, 1k paths) | CP3/CP4, fact sheet (C10), O9 | 3.5 h | T+23 |
| I7 | **Validation + data panel** `ui/science.ts`: modelled vs observed yields (C6 `pairs`) with r/RMSE, NDVI r, and "data behind every number" table | Luca | **LU8 + LU9** (mock until then) | Renders for every farm with data | **CP4** | 1.5 h | T+24.5 |
| I8 | *(stretch, only if green)* **Risk–return frontier UI**: every candidate rotation as a dot (expected income vs CVaR95), the farmer's rotation highlighted, the 3 picks labelled. Rotations as a portfolio | Octa | I6 | Behind a tab | — | 1.5 h | CP4 |
| I9 | **Video graphics** for Octa: title cards, number callouts, caption style, end card; deck styling help for Luca | Octa, Luca | **A15** freeze | Assets in Drive `04 Video` | **O9**, LU10 | 4 h | T+30 |

## UI pair rules with Octa
- Octa owns the page (`web/` shell and `site/`) and leaves **slots** (`#compare`, `#frontier`, `#science`, `#marginYear`).
  Your modules export `render(el, data)`; Octa calls them. Neither of you edits the other's files.
- UI syncs: T+3 (layout + slots) · T+7.5 (chart API) · T+13.5 (cards/frontier) · T+20.5 (site + panels).

## Fallbacks
- A8 late → keep I3/I4 on the stub; if Albert asks at T+9, take over A8 yourself.
- Rust compile fights eating time → write the algorithm in TypeScript against the stub first, then port (the math is the same).
- Optimizer too slow in WASM → fewer candidates (length ≤ 2 + cover variants) or call `/api/optimize` on the server.
- LU7 late → illustrative 2050 markers, clearly labelled.
