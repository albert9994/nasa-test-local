# Ionut: Decision layer + Charts + Design system

**You are:** the bridge between science and UI. You design the look (wireframe, design tokens, CSS), build the chart toolkit,
and code the **decision layer**: Adaptation Margin, failure frontier, optimizer and "safe until 20XX". Then you put
those on screen (compare cards, frontier, validation panel).
**You own:** `web/css/*` · `web/js/charts.js` · `web/js/engine/decision.js` · `web/js/ui/compare.js`, `frontier.js`, `marginyear.js`, `science.js` · `assets/brand/`.
**Your partners:** Octa (UI pair: Octa owns `app.js` and the page; you plug components into slots Octa leaves) · Albert (engine you build on) · Luca (persona, data) · Moldo (soil score, realism of picks).
**Sleep:** shift 2, ≈T+15.5 → T+19.5.

## Your tasks in order
| # | Task | With | Needs / start when | Done when | Unblocks | Est. | By |
|---|---|---|---|---|---|---|---|
| I1 | **Wireframe + design system**: wireframe of the whole app (inputs left, results right, hero margin on top; one column on phones) and of **farmer mode**; design tokens as CSS variables (light **and** dark), type, cards, buttons, sliders, chips → `web/css/style.css`; logo/wordmark | Luca (persona), Octa | T0 | Octa's shell uses it | **O1, O6** | 3 h | **CP1** |
| I2 | **Chart toolkit** `charts.js` (SVG, colours from CSS variables): multi-line chart with a threshold line + highlighted year; heatmap with a contour line + labelled markers + a current-point ring; scatter | — | I1 | A demo page shows all 3 in light + dark | **O3, I3b, O4, I7** | 2.5 h | T+5.5 |
| I3 | **Adaptation Margin + frontier** in `decision.js` (C3): `pFail` at (ΔT, ΔP) = `simulateRotation(...).pFail`; bisection on ΔT ∈ [0, 6] °C and rain cut ∈ [0, 70 %] (8 steps each); `frontier` = an 11×11 grid ΔT 0–5 °C × ΔP 0 to −50 %, yielding to the UI between rows. Build on the stub; switch to the real engine when A8 lands | Albert | **A6** stub; real: **A8** | Iowa's baseline margin prints from the real engine | **O3**, I3b | 3 h | **CP2** |
| I3b | **Frontier heatmap UI** `ui/frontier.js`: card with rotation tabs, colour = share of bad years, white contour at the farmer's limit, Today / 2050 markers, a ring for the current slider climate | Octa (slot) | I2 + I3 | Renders in < 1 s per rotation | CP3 | 1.5 h | T+10.5 |
| I4 | **Optimizer + pickThree**: enumerate rotations of 1–3 crops from the farm's crop pool (no back-to-back repeats; A-B-C = B-C-A), with and without rye cover; score at today and at a stress test (+2 °C, −20 % rain); normalise profit / stability / soil / water 0–1, weight by the farmer's priorities; keep "viable" (no more bad years than the farmer's own rotation); pick **Best balance / Drought shield / Soil builder** | Moldo (does the pick make sense?) | **A8** (+ M6 for the soil score) | ~250 rotations in < 1 s; 3 sensible picks per farm | **I5**, M8 | 3 h | T+13.5 |
| I5 | **Compare cards** `ui/compare.js`: your rotation + 3 picks: average income (+ difference), bad years, worst year, margin, soil score, soil carbon trend, erosion, water use; "Make this my rotation"; optimizer progress bar | Octa (slot) | I4 | 4 cards update with the sliders | CP3, O6 | 2 h | T+15.5 |
| — | *Sleep ≈T+15.5 → T+19.5* | | | | | | |
| I6 | **`marginYear()` + "safe until ~20XX"** in `decision.js` + `ui/marginyear.js`: first year each rotation crosses the farmer's limit along the scenario series; fill the hero's `#marginYear` slot; replace placeholder 2050 markers with real `scenarios` (p10–p90 whiskers) | Luca | **LU7** (mock until then) | Hero shows the year per scenario | CP3 | 2 h | **CP3** |
| I7 | **Validation + data panel** `ui/science.js`: modelled vs observed yields per year with r/RMSE (C6 `pairs`), NDVI r, and a "data behind every number" table (dataset, resolution, what it does, status) | Luca | **LU8 + LU9** (mock until then) | Renders for every farm with data | **CP4** | 2 h | T+23.5 |
| I8 | *(stretch, before CP4 only if green)* "why?" tooltips (from `factors`), share link (state in the URL hash) | Octa | I7 | — | — | 1.5 h | CP4 |
| I9 | **Video graphics** for Octa: title cards, number callouts, captions style, end card; deck styling help for Luca | Octa, Luca | **A15** freeze | Assets in Drive `04 Video` | **O9**, LU10 | 4 h | T+30 |

## UI pair rules with Octa
- Octa owns `index.html` and `app.js` and leaves **empty slots** (`<section id="compare">`, `#frontier`, `#science`, `#marginYear`).
  Your modules export `render(el, data)`; Octa calls them. Neither of you edits the other's files.
- UI syncs: T+3 (layout + slots) · T+7.5 (chart API) · T+13.5 (cards/frontier) · T+20.5 (farmer mode + panels).

## Fallbacks
- A8 late → keep I3/I4 on the stub; if Albert asks at T+9, take over A8 (rotation layer) yourself.
- Optimizer too slow → fewer candidates (length ≤ 2 + cover variants) or chunked async with a progress bar.
- LU7 late → keep illustrative 2050 markers, clearly labelled.
