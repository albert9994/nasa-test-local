# Octa: Frontend lead + the video

**You are:** the owner of the web app the judges touch: the page, the map, the inputs, the hero result, the drought replay,
"click anywhere on Earth", farmer mode, the printable plan, deployment. At the end you make **the video**.
You also back up Albert as the merger (all PRs while he sleeps; frontend PRs any time).
**You own:** `web/index.html`, `web/js/app.js` · `web/js/ui/inputs.js`, `hero.js`, `yearly.js`, `replay.js`, `farmer.js`, `report.js` ·
`web/js/data/*` (loading packs + live fetch) · deployment · the video.
**Your partners:** Ionut (UI pair: design system, charts, decision layer, cards, frontier, panels) · Albert (engine) · Luca (data, copy, storyboard) · Moldo (plan wording).
**Sleep:** shift 1, ≈T+11.5 → T+15.5. **You merge during shift 2 (≈T+15.5 → T+19.5).**

## Your tasks in order
| # | Task | With | Needs / start when | Done when | Unblocks | Est. | By |
|---|---|---|---|---|---|---|---|
| O1 | **App shell**: page layout per Ionut's wireframe with empty **slots** for Ionut's components; header with farm dropdown; **Leaflet** map (satellite tiles + NASA GIBS MODIS NDVI overlay) with farm markers from `index.json`; pack loader (`js/data/packs.js`); farm info panel (location, climate means, soil). **First GitHub Pages deploy** | Ionut (I1) | A1 · LU0 mock → LU1 real | Selecting a farm loads its pack; the Pages URL works | **O2** | 3.5 h | **CP1** (WIP) / T+4 |
| O2 | **Inputs** `ui/inputs.js`: rotation builder (a chip per year + rye-cover toggle + add/remove), priorities (4 sliders), bad-year rule ($ threshold + "1 in N years"), levers (irrigation mm, sowing shift, variety maturity), climate sliders (ΔT, ΔP) + Today/2050 buttons, crop-pool chips, prices/costs table → C2 objects | — | **A6** stub | Every input calls the (stub) engine | O3 | 3.5 h | T+7.5 |
| O3 | **Hero + yearly chart**: hero card (Adaptation Margin +X °C / −Y % rain, bars with 2050 ticks, the sentence from Luca's copy, current-climate risk badge, empty `#marginYear` slot); **year-by-year farm income chart** (Ionut's line chart) with the bad-year line. Debounced: sliders recompute only what they affect. **Switch to the real engine** | Ionut | **A8 + I3 + I2** · LU4 copy | Full loop on real data: farm → margin → slider → chart | **CP2** | 3.5 h | **CP2** |
| — | *Sleep ≈T+11.5 → T+15.5* | | | | | | |
| O4 | **Drought replay** `ui/replay.js`: year selector (default = worst year), ▶ play/pause + scrubber; a panel per rotation with an animated **soil-water tank** (fill + red stress line), date, stage, stress days, heat days, final yield + farm income; **shared calendar** across panels (winter wheat starts in Oct, maize in Apr); Tmax chart with the heat threshold; MODIS NDVI that year vs the median | Ionut (charts) | **A7 trace + M4 NDVI** | A drought year plays smoothly and clearly | **CP3, O9** | 3 h | T+18.5 |
| O5 | **Live click anywhere** `js/data/live.js`: map click → popup "Analyse this field" → NASA POWER daily in the browser (CORS OK) + SoilGrids WCS (CORS OK; decode the deflate GeoTIFF with `DecompressionStream`) → C1 pack in memory → load; progress toasts; default loam if soil fails; deep links `?farm=id`, `?lat=&lon=` | Luca (WCS details) | O4 | Any land point loads in < 10 s | **CP3** | 2 h | T+20.5 |
| O6 | **Farmer mode** `ui/farmer.js`: toggle that hides charts and shows the margin, the 4 rotation cards in plain words, the replay button and the plan; remembered in localStorage (wrapped in try/catch) | Ionut (design), Luca (copy) | I1 + I5 + O3 | Works on desktop + phone | **CP4** | 2 h | T+22.5 |
| O7 | **Printable plan** `ui/report.js` + print CSS: 3–4 plain sentences from results ("Today your rotation loses money N of 24 years… switching to … adds +X °C of margin…") + Moldo's "what to try first" tips | Moldo (M8), Luca | **M8** + LU4 | Prints a clean 1-page PDF | **CP4** | 2 h | T+24.5 |
| O8 | **Freeze deploy**: deploy tag `v1.0-freeze`; test on 2 phones + 2 browsers; no console errors | Albert | **A15** | Live URL = frozen build | **LU11, O9** | 1 h | T+26 |
| O9 | **THE VIDEO**: follow Luca's storyboard (LU2); record from the **frozen deployed build** (fresh browser profile, 1920×1080, no bookmarks bar); Ionut's title cards and callouts; captions on (judges watch muted); length per the rules (likely ≤ 30 s); music without copyright issues; upload; Albert + one more person watch it | **Ionut** (I9), Luca | **O8 + LU11** | Link in chat + Drive `04 Video` | **A17** | 4 h | **CP5** |
| O10 | After freeze: bug fixes only, between video sessions | — | CP4 | — | — | — | CP5 |
| — | **Ongoing:** review frontend PRs any time; merge **all** PRs during shift 2 (Albert asleep) | Albert | — | `main` always loads | all | — | — |

## Video prep you can do early (in gaps)
- Collect B-roll ideas: NASA GIBS satellite zoom (record the map zooming onto a farm), the drought tanks draining.
- Pick a free music track (YouTube Audio Library / Pixabay Music) and save it to Drive `04 Video`.
- Decide the tool (CapCut / DaVinci Resolve / Premiere) and make a 30-s template with caption style and end card.
- Read the rules: video length, format, AI-generated media labelling, no NASA "meatball" logo.

## UI pair rules with Ionut
You own the page and leave **slots** (`#compare`, `#frontier`, `#science`, `#marginYear`); Ionut's modules export `render(el, data)` and you call them.
UI syncs: T+3 · T+7.5 · T+13.5 · T+20.5.

## Definition of done (every UI task)
Works at 375 px wide, no horizontal scroll · light + dark · no console errors · slider moves < 100 ms · every farm loads ·
nothing breaks when a pack lacks `ndvi` / `soil` / `scenarios`.

## Fallbacks
- Real engine late at CP2 → keep the stub wired; demo the flow.
- Live soil fails → default loam + a toast (never block the user).
- Video editing late → Luca's 2-min backup capture trimmed to the limit, with captions.
