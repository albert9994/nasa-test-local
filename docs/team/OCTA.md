# Octa: Frontend lead (app + light site) + AI explanations UI + the video

**You are:** the owner of everything the judges touch: the **full app** (map, inputs, hero result, drought replay, click anywhere,
AI explanations, plan) and the **light site** (landing page + instant demo). At the end you make **the video**.
You also back up Albert as the merger (all PRs while he sleeps; frontend PRs any time).
**You own:** `apps/web/` Next.js app (`app/` routes, `components/{inputs,hero,yearly,replay,explain,report,hero3d}.tsx`, `lib/data/*` loaders + live fetch, Web Worker for WASM) · deployment of app + site · the video.
**Your partners:** Ionut (UI pair: design system, charts, stress/optimizer, cards, frontier, panels) · Albert (WASM engine + server) · Luca (data, copy, LLM prompt, storyboard) · Moldo (plan wording).
**Sleep:** shift 1, ≈T+11.5 → T+15.5. **You merge during shift 2 (≈T+15.5 → T+19.5).**

## Your tasks in order
| # | Task | With | Needs / start when | Done when | Unblocks | Est. | By |
|---|---|---|---|---|---|---|---|
| O1 | **App shell**: **Next.js (App Router) + React + TypeScript + Tailwind + shadcn/ui**; load the WASM package (`packages/engine-wasm`) inside a **Web Worker** (Comlink); state with Zustand; layout per Ionut's wireframe with **slots** for Ionut's components; header with farm dropdown; **map** (MapLibre GL via react-map-gl: satellite tiles + NASA GIBS MODIS NDVI overlay) with farm markers from `index.json`; pack loader; farm info panel. **First deploy** (Vercel) | Albert (A1), Ionut (I1) | **A1** · LU0 mock → LU1 real | Selecting a farm loads its pack and calls WASM; the deploy URL works | **O2** | 3.5 h | **CP1** (WIP) / T+4 |
| O2 | **Inputs** `ui/inputs.ts`: rotation builder (chip per year + rye cover + add/remove), priorities (4 sliders), bad-year rule, levers (irrigation mm, sowing shift, variety), climate sliders (ΔT, ΔP) + Today/2050 buttons, **farmer profile: budget (max €/ha) + equipment checkboxes + sellable crops**, **market slider** (crop price ±30 %, inputs +40 %), prices/costs table → C2 + C3 `constraints` | — | **A6** stub | Every input calls the (stub) engine | O3 | 3.5 h | T+7.5 |
| O3 | **Hero + yearly chart**: hero card (Adaptation Margin +X °C / −Y % rain, bars with 2050 ticks, Luca's sentence, risk badge, empty `#marginYear` slot); **year-by-year income chart** (Ionut's chart) with the bad-year line; debounced recomputes. **Switch to the real WASM engine** (or to `/api/simulate` if A9 says plan B) | Ionut | **A8 + I3 + I2** · LU4 copy | Full loop on real data: farm → margin → slider → chart | **CP2** | 3.5 h | **CP2** |
| — | *Sleep ≈T+11.5 → T+15.5* | | | | | | |
| O4 | **Drought replay** `ui/replay.ts`: year selector (default = worst year), ▶ play/pause + scrubber; a panel per rotation with an animated **soil-water tank**, date, stage, stress days, heat days, final yield + income; **shared calendar** across panels (winter wheat starts in Oct, maize in Apr); Tmax chart with the heat threshold; MODIS NDVI that year vs the median | Ionut (charts) | **A7 trace + M4 NDVI** | A drought year plays smoothly | **CP3, O9** | 3 h | T+18.5 |
| O5 | **Live click anywhere** `data/live.ts`: map click → popup "Analyse this field" → NASA POWER daily in the browser (CORS OK) + SoilGrids WCS (CORS OK; decode the deflate GeoTIFF with `DecompressionStream`) → C1 pack in memory → WASM; progress toasts; default loam if soil fails; deep links `?farm=id`, `?lat=&lon=` | Luca (WCS details) | O4 | Any land point loads in < 10 s | **CP3** | 2 h | T+20.5 |
| O6 | **Light site** = static/ISR routes in the same Next.js app (`/`, `/demo`, `/farm/[id]`, `/sponsors`): **Three.js hero** (React Three Fiber: 3D globe zooming to the farm, or the farm's terrain from NASADEM) + landing story (problem → the number → demo → how it works → NASA data → team), embedded **lite demo** (demo farms + click anywhere, climate sliders, margin, 3 rotations, replay) reusing your components in "lite" mode (= farmer mode: plain words, fewer charts), one short AI explanation, "Open the full app" button | Ionut (design), Luca (copy) | I1 + I5 + O3 | Site deployed; demo works on a phone | **CP4**, O9 | 2.5 h | T+23 |
| O7 | **AI explanations UI** `explain.tsx` (Vercel AI SDK streaming) + **FieldShift Score card** (score 0–100, confidence, waterfall from `/api/score`, C12) + **plan** `report.tsx` (@react-pdf/renderer): "Explain this" button on the hero, cards, frontier and replay → `POST /api/explain` with `fs.factSheet(...)` (C10), **streamed** text, highlighted numbers, "where does this number come from?" link; printable **plan** written by the LLM (mode `plan`) with Moldo's tips; template fallback if the server is down; *(stretch)* chat box | Albert (A10), Luca (prompt), Moldo (M8) | **A10** + M8 | Explanations stream for every farm; a plan prints on 1 page | **CP4** | 2 h | T+25 |
| O8 | **Freeze deploy**: deploy tag `v1.0-freeze` (app + site); test on 2 phones + 2 browsers; no console errors; WASM loads on mobile Safari | Albert | **A15** | Live URLs = frozen build | **LU11, O9** | 1 h | T+26 |
| O9 | **THE VIDEO**: Luca's storyboard (LU2); record from the **frozen deployed build** (fresh browser profile, 1920×1080); Ionut's title cards and callouts; show the AI explanation streaming; captions on; length per the rules (likely ≤ 30 s); copyright-free music; upload; Albert + one more person watch it | **Ionut** (I9), Luca | **O8 + LU11** | Link in chat + Drive `04 Video` | **A17** | 4 h | **CP5** |
| O10 | After freeze: bug fixes only, between video sessions | — | CP4 | — | — | — | CP5 |
| — | **Ongoing:** review frontend PRs any time; merge **all** PRs during shift 2 (Albert asleep) | Albert | — | `main` always builds and loads | all | — | — |

## Video prep you can do early (in gaps)
- B-roll ideas: the map zooming onto a farm (NASA GIBS), the drought tanks draining, the AI text streaming in Romanian.
- Pick a free music track (YouTube Audio Library / Pixabay Music) → Drive `04 Video`.
- Pick the tool (CapCut / DaVinci Resolve / Premiere) and make a 30-s template with caption style and end card.
- Read the rules: video length, format, AI-generated media labelling, no NASA "meatball" logo.

## UI pair rules with Ionut
You own the page and leave **slots** (`#compare`, `#frontier`, `#science`, `#marginYear`); Ionut's modules export `render(el, data)` and you call them.
UI syncs: T+3 · T+7.5 · T+13.5 · T+20.5.

## Definition of done (every UI task)
Works at 375 px wide, no horizontal scroll · light + dark · no console errors · slider moves < 100 ms · every farm loads ·
nothing breaks when a pack lacks `ndvi` / `soil` / `scenarios` · nothing breaks when the server or the LLM is down.

## Fallbacks
- WASM not ready at CP2 → use the mock JSON / `/api/simulate` (plan B); same shapes.
- Live soil fails → default loam + a toast (never block the user).
- LLM down → template explanations (C10 fallback); hide the chat.
- Video editing late → Luca's 2-min backup capture trimmed to the limit, with captions.
