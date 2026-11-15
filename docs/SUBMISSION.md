# Space Apps 2026 submission text (Hotar)

Text for each field of the project page, in English (required). Paste it, then fill the `TODO` items.
Rules: [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/).
Deadline: **Sunday 15 November 2026, 11:59 p.m. local time of the team's Local Event.**

## Before you press "Submit for Judging"

- [ ] Demo is **≤ 30 s video** (English or English subtitles) **or ≤ 7 slides** (English, with team name, member names
      and the challenge). Longer demos are not eligible for Global Judging.
- [ ] Every AI-generated image, video clip or voice in the demo has a visible "AI-generated" mark (and a note in the
      video description).
- [ ] No people under 18 in any image, video or audio.
- [ ] Demo link and final-project link open in a private browser window with no login.
- [ ] Final-project link points at the English page (`/en`). If the GitHub repo is linked, it must be **public**.
- [ ] Optional: request a FortiGuard web-filter classification for `hotar.pages.dev` (category: web-based application,
      company name "N/A").
- [ ] Tick "Terms and Conditions" and "Confirm All Work is Original", then "Submit for Judging".

## Project Name

Hotar

## High-Level Project Summary

Hotar tells a farmer how much climate change their field can take. Pick your land on a map and Hotar compares it with
25 years of NASA weather, soil and satellite data, simulates the current crop rotation day by day, and returns one
number: the Adaptation Margin, the degrees of warming (or percent less rain) the rotation can absorb before
money-losing years come more often than the farmer accepts (by default 1 year in 5). It then tests the rotation against
thousands of futures to 2050 built from NASA's NEX-GDDP-CMIP6 projections, finds rotations that hold up better, and
explains the result in plain language. It matters because farmers plan rotations from the climate they remember, while
heat and drought are already breaking those plans: Romania's 2024 drought hit more than two million hectares.

## Link to Project Demo

TODO: public link to the ≤ 30 s video (YouTube/Drive) or the ≤ 7-slide deck.

## Link to Final Project

https://hotar.pages.dev/en

(Source code: https://github.com/albert9994/nasa-test-local, only once the repository is public.)

## Detailed Project Description

**What it does.** Hotar is a free map tool on the web and a desktop app (macOS, Windows).
- *Free map tool:* search a place, select a field (an OpenStreetMap farmland parcel, a drawn polygon or a circle) and get
  a field snapshot: 25 years of NASA POWER weather, soil from SoilGrids, heat days above 35 °C, rain, the Adaptation
  Margin with a traffic light, bad years today versus 2050, and a 7-day weather alert.
- *Desktop app:* a whole farm with several fields: climate-risk frontier, stress test, futures to 2050, a rotation
  optimizer with a 0-100 score and 13 agronomy rules (for example the EU diversification rule and sunflower breaks),
  a day-by-day replay of the worst drought, satellite layers (NASA GIBS, HLS NDVI, a Prithvi-EO-2.0 crop map in beta),
  an AI advisor that explains the numbers, and a printable report for a bank or subsidy file.
- Romanian and English throughout. Real data is shown as real; anything else is labelled "illustrative".

**How it works.** A Python pipeline turns NASA data into small "farm packs". A Rust engine runs a daily FAO-56 water
balance with Penman-Monteith evapotranspiration, crop phenology from growing degree days, heat stress at flowering and
CO2 fertilisation. To find the margin it warms and dries the 25-year record step by step until bad years exceed the
farmer's tolerance. For the future it simulates 10,000 paths that combine resampled weather years, the monthly change
of five CMIP6 models, and correlated crop prices and costs, and reports risk measures such as the chance of a bad year
and the worst 1-in-20 loss. The same engine runs as WebAssembly in the browser and natively in the desktop app (10,000
paths in under a second). The AI advisor never computes numbers: the engine writes a fact sheet, the model only explains
it, and the server removes any sentence whose numbers are not in the fact sheet.

**Benefits.** One understandable number per field instead of a climate report; a concrete next step (which rotation to
test first); free for any field in the world because it runs on open NASA data; offline-capable desktop app for farms
with poor connectivity.

**What we hope to achieve.** Give small and mid-size farmers, starting in Romania, the same climate-risk view that large
agribusinesses buy, and help advisers, banks and subsidy agencies (APIA, AFIR) discuss adaptation with numbers.

**Tools.** Rust (engine, WebAssembly via wasm-bindgen, Axum API), TypeScript with React, Next.js, Tailwind CSS,
MapLibre GL and ECharts (web and UI), Tauri 2 (desktop and mobile), Python with NumPy and netCDF4 (data pipeline),
PyTorch with Prithvi-EO-2.0 (crop map), Cloudflare Workers (hosting), GitHub Actions (tests and installers).

## Use of Super Intelligence (SI)

Yes. (1) Code and documentation were written with the help of AI coding assistants (Claude Code); commits made with them
are marked with a "Co-Authored-By: Claude" line and the README states it. The idea, science choices and design are the
team's. (2) The product's AI advisor uses a large language model (Meta Muse Spark) only to explain numbers computed by our
engine; every answer is labelled as AI and checked against the data. (3) Prithvi-EO-2.0, the NASA/IBM geospatial
foundation model, produces the beta crop map. (4) TODO: list any AI-generated footage, images, voice or music in the
demo; each is watermarked "AI-generated" on screen.

## NASA Data

- **NASA POWER** (MERRA-2 / CERES): daily max/min temperature, rain, root-zone soil wetness, solar radiation, humidity
  and wind, 2001-2025, for every field (pipeline and live API).
- **NEX-GDDP-CMIP6** (NASA Earth Exchange, via NCCS THREDDS): five-model ensemble, SSP2-4.5 and SSP5-8.5, monthly
  temperature and rain changes to 2050 and beyond.
- **MODIS Terra MOD13Q1** NDVI (LP DAAC / ORNL DAAC): growing-season greenness 2001-2025 to validate the crop model.
- **HLS v2.0** (Harmonized Landsat Sentinel-2, NASA/USGS): 30 m NDVI and NDMI time series.
- **Prithvi-EO-2.0-100M-TL** (NASA/IBM): embeddings of HLS scenes for the beta crop map.
- **NASA GIBS**: MODIS NDVI, true colour and land surface temperature, VIIRS true colour and SMAP L4 soil moisture map
  layers.
- **SRTM** (NASA/NGA): elevation and slope.

## Space Agency Partner Data and Other References

- **ESA, Copernicus Sentinel-2** (through HLS S30): half of the 30 m time series behind the NDVI series and the crop map.
- **ESA WorldCereal 2021** (CC-BY-4.0): crop-type labels for the Romanian crop map.
- ISRIC SoilGrids 2.0 (soil), SRTM via OpenTopoData, INS TEMPO (Romanian county yields), USDA NASS Quick Stats and
  Cropland Data Layer, Open-Meteo (7-day forecast), OpenStreetMap contributors via Overpass and Nominatim (parcels and
  place search), Esri World Imagery (base map).
- Science: FAO-56 (Allen et al. 1998), Saxton and Rawls (2006), Zhao et al. (2017, PNAS) and the sources in
  `docs/SCIENCE.md` and `docs/IMPACT_EVIDENCE.md`.
- Open-source software listed in `docs/DATA_SOURCES.md` (MIT-licensed project code in this repository).
- No NASA logos or insignia are used. Full list with licences and citations: `docs/DATA_SOURCES.md`.

## Team (for the demo slides and the project page)

TODO: team name. Members: Albert, Ionuț, Luca, Moldo, Octa (full names as on the Space Apps profiles).
Challenge: *Field Shift: Adapting Farms with NASA Data*.
