# Hotar

**How much hotter and drier can your field get before bad years come too often?**

Hotar is a climate-risk tool for farmers built on NASA data. Pick your land on a map and Hotar compares it with 25 years
of NASA weather, soil and satellite data, simulates your crop rotation day by day, and gives you one number: the
**Adaptation Margin**, the °C of warming (or % less rain) your rotation can take before money-losing years become more
frequent than you can accept (by default 1 year in 5). It then stress-tests the rotation against futures to 2050,
finds rotations that hold up better, and explains the result in plain Romanian or English.

*Hotar* is Romanian for the boundary between two fields, the old marker stone at the edge of the land: how far a farm is
from its limit.

Built for the **NASA Space Apps Challenge 2026**, challenge *Field Shift: Adapting Farms with NASA Data*.

| | |
|---|---|
| **Website + free map tool** | https://hotar.pages.dev/en (also https://hotar.tavi-doandes.workers.dev) |
| **Desktop app (macOS, Windows)** | [GitHub Releases](https://github.com/albert9994/nasa-test-local/releases/latest): the installers are not signed yet (see [First launch](#first-launch)) |
| **Science** | [docs/SCIENCE.md](docs/SCIENCE.md) · **Data** [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) |

## What it does

- **Free map tool (web):** search a place, select land (a farmland parcel, a drawn polygon or a circle), get a field
  snapshot (25 years of NASA POWER weather, SoilGrids soil, heat days, rain) and "how you could be affected": margin,
  bad years today vs 2050, a climate analog, 7-day weather alerts.
- **Desktop app:** a farm with several fields and the full analysis: overview and "what needs attention", climate-risk
  frontier, stress test, futures to 2050 (10,000 simulated paths of weather, CMIP6 models, prices and costs), rotation
  optimizer with a 0-100 score and 13 agronomy rules, drought replay, satellite layers (NASA GIBS, HLS NDVI, a
  Prithvi-EO-2.0 crop map in beta), an AI advisor and a printable report.
- **Mobile app (iOS, Android):** onboarding and the field overview (built from the same code; not released yet).

Everything is in **Romanian and English**. Numbers that come from real data are shown as real; anything else is labelled
*illustrative*.

## How it works

```
NASA POWER (daily weather) ─┐
MODIS + HLS NDVI ───────────┤   pipeline/ (Python)    ┌─ crates/hotar-core (Rust): FAO-56 water balance,
NEX-GDDP-CMIP6 (2050) ──────┼──> farm data packs ─────┤   Penman-Monteith ET0, crop phenology, heat stress,
SoilGrids, SRTM, yields ────┘   apps/web/public/data  │   stress tests, optimizer, quant (Monte Carlo), score
                                                      └─ runs as WASM in the browser, natively in the desktop app
                                                         and in crates/hotar-server (API + AI advisor)
```

The AI advisor never computes numbers. The engine builds a **fact sheet**; the language model only explains it, the
server checks that every number in the answer appears in the fact sheet and drops sentences it cannot back, and falls
back to a deterministic template when no model is available.

## Repository

| Path | What |
|---|---|
| `crates/hotar-core` | Rust engine (simulator, stress tests, optimizer, quant, score, Rhai rules in `rules/`, fact sheet) |
| `crates/hotar-wasm` | WebAssembly bindings used by the web app |
| `crates/hotar-server` | Axum API and grounded AI advisor (`/api/explain`, `/api/score`); prompts in `prompts/` |
| `apps/web` | Next.js site and free map tool (deployed on Cloudflare) |
| `apps/desktop` | Tauri 2 desktop app (runs the engine and, optionally, the AI advisor locally) |
| `apps/mobile` | Tauri 2 iOS/Android app |
| `apps/pages-proxy` | Forwards hotar.pages.dev to the Cloudflare Worker |
| `packages/ui` | Shared React UI, design system, RO/EN translations |
| `pipeline` | Python data pipeline (NASA POWER, MODIS, NEX-GDDP-CMIP6, SoilGrids, yields, Prithvi-EO-2.0) |
| `docs` | Science notes, data sources, data contracts, impact evidence, farmer tips |

## Run it

Requirements: Node 22 + pnpm, Rust (stable) + `wasm-pack`, Python 3.12 for the pipeline.

```bash
pnpm install
pnpm dev                                  # website + map tool on http://localhost:3000 (builds the WASM engine first)
pnpm --filter desktop tauri dev           # desktop app
cargo test --workspace                    # engine + server tests
pnpm --filter @hotar/ui test              # UI tests
```

**AI advisor (optional, local):** put an OpenAI-compatible model in `~/.hotar/ai.env` (never committed; example in
[crates/hotar-server/README.md](crates/hotar-server/README.md)), then run `pnpm ai` for the website. The desktop app
reads the same file and starts the advisor itself. Without it, the app explains results with templates.

### First launch

The installers are not signed yet. On macOS, if the app is reported as damaged or cannot be checked, run
`xattr -dr com.apple.quarantine /Applications/Hotar.app` or use System Settings → Privacy & Security → Open Anyway.
On Windows, choose More info → Run anyway.

## Use of AI (Super Intelligence) tools

- **Code and documentation:** written with the help of AI coding assistants (Claude Code). Commits made with it carry a
  `Co-Authored-By: Claude` line. The team chose the idea, the science and the design and reviewed the changes.
- **In the product:** the AI advisor uses a large language model (currently Meta Muse Spark through the Meta Model API)
  only to explain numbers computed by the engine; its answers are labelled as AI and checked against the data.
- **Prithvi-EO-2.0** (NASA/IBM geospatial foundation model) produces the beta crop map; it is labelled as a model output.
- **Media:** any AI-generated image, video or audio used in the demo is marked as AI-generated on screen.

## Data and credits

NASA data: POWER, MODIS MOD13Q1, NEX-GDDP-CMIP6, GIBS, HLS (Landsat + Sentinel-2), SRTM, Prithvi-EO-2.0. Partner data:
Copernicus Sentinel-2 (ESA) through HLS. Others: ISRIC SoilGrids, INS TEMPO, USDA NASS/CDL, ESA WorldCereal,
Open-Meteo, OpenStreetMap (Overpass, Nominatim), Esri World Imagery. Full list, licences and citations:
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md). Hotar is an independent project and is not endorsed by NASA or any agency.

## Licence

[MIT](LICENSE). Data keeps the licence of its provider (see [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)).
