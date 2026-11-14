# NASA Space Apps 2026 · Submission Document (A13)

## Project Title
**FieldShift: How Much Climate Change Can Your Crop Rotation Take?**

## High-Level Summary (One Sentence)
FieldShift turns 25 years of NASA Earth observation data into one number every farmer understands — their farm's **Adaptation Margin** (+°C of warming and −% of rain their current rotation can absorb before losing money too often) — and finds resilient, budget-feasible crop rotations backed by stochastic risk modeling and fact-checked AI explanations.

---

## Project Description

### The Problem
Farmers choose crop rotations based on the climate they remember, while most digital tools try to answer *"What will my yield be next year?"*. Point forecasts are fragile, opaque, and ignore farm-level financial survival. Nobody tells a farmer **how close their current rotation is to breaking** under rising heat and erratic rainfall.

### Our Solution: Measure Headroom, Not a Fragile Forecast
FieldShift introduces the **Adaptation Margin**:
> *"Your maize → winter wheat rotation can absorb **+1.4 °C** of warming or **−18% rainfall** before you lose money more often than 1 year in 5. Mid-century NASA CMIP6 projections consume 100% of that margin by ~2038."*

How FieldShift works:
1. **25-Year Daily Physical Replay (Rust → WASM + Server):** Replays 2001–2025 daily NASA weather through a FAO-56 dual-store soil-water balance (growing roots + subsoil store), Saxton–Rawls soil hydraulics, FAO-33 stage-wise yield response, and Schlenker–Roberts extreme heat model across all rotation phases.
2. **Adaptation Margin & Failure Frontier:** Bisects warming ($\Delta T \in [0, 6]^\circ\text{C}$) and rainfall loss ($\Delta P \in [0, -70\%]$) to find the exact breaking point, and maps an $11\times 11$ Failure Frontier heatmap with NASA NEX-GDDP-CMIP6 2050 trajectories.
3. **Constrained Rotation Optimizer:** Searches ~200 multi-crop + winter rye cover-crop rotations filtered by the farmer's **operating budget (\$/ha), owned machinery, and locally sellable crops**, returning three clear archetypes: **Best balance**, **Drought shield**, and **Soil builder**.
4. **Quant Monte Carlo Engine (2026–2050):** Simulates 1,000–10,000 future paths combining block-bootstrapped historical weather along CMIP6 trajectories, Ornstein–Uhlenbeck mean-reverting crop prices (with natural negative yield–price hedge), and fertilizer cost shocks to report **VaR95 / CVaR95**, **probability of cash ruin**, and the **margin exhaustion year band**.
5. **Transparent 6-Source FieldShift Score:** Combines physical simulation, quant financial risk, agronomic rules, satellite data confidence, and a schema-validated bounded ($\pm 10$) qualitative LLM adjustment into a 0–100 waterfall score.
6. **Fact-Checked AI Agronomist (`/api/explain`):** Streams plain-language explanations and a 1-page printable farm transition plan in Romanian and English. **The LLM never computes numbers:** our Rust engine builds a deterministic JSON `FactSheet` and verifies that every number in the AI response exists in the fact sheet, falling back automatically to deterministic templates if needed.

---

## NASA & Partner Data Used

| Dataset | Source / Agency | Role in FieldShift |
|---|---|---|
| **NASA POWER Agroclimatology Daily (2001–2025)** (`T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `GWETROOT`, `ALLSKY_SFC_SW_DWN`, `RH2M`, `WS2M`) | NASA LaRC (MERRA-2 / CERES) | Drives daily GDD phenology, Hargreaves–Samani $\text{ET}_0$, soil water balance, heat stress, and off-season `GWETROOT` moisture anomaly |
| **MODIS Terra `MOD13Q1` v061 NDVI (250 m, 16-day)** | NASA LP DAAC / ORNL DAAC | Independent satellite vegetation greenness validation ($r$ vs. modelled water × heat stress) and visual drought-replay overlay |
| **NASA NEX-GDDP-CMIP6** (`historical`, `ssp245`, `ssp585`) | NASA NCCS | Multi-model ensemble growing-season $\Delta T$ and $\Delta P$ trajectories (2030–2090) for `marginYear` and Quant Monte Carlo paths |
| **SMAP L4 Root-Zone Soil Moisture (`SPL4SMGP.007`, 9 km)** | NASA NSIDC DAAC (via AppEEARS) | Post-2015 spring root-zone soil wetness initialization and drought anomaly verification |
| **ECOSTRESS Evaporative Stress Index (`ECO_L4T_ESI.002`, 70 m)** | NASA LP DAAC (via AppEEARS) | Field-scale canopy evaporative stress timing check |
| **NASADEM 30 m Digital Elevation (`NASADEM_NC.001`)** | NASA LP DAAC (via AppEEARS) | Terrain slope (%) for SCS Curve Number runoff adjustment and RUSLE $LS$ erosion factor |
| **NASA GIBS WMTS** | NASA EOSDIS | True-color satellite imagery and vegetation map layers |
| **ISRIC SoilGrids 250 m v2.0** *(Partner Data)* | ISRIC World Soil Information | Sand, clay, silt, SOC, bulk density, and pH across 0–100 cm for Saxton & Rawls (2006) pedotransfer functions |
| **USDA NASS Quick Stats / Eurostat / FAO GIEWS** *(Partner Data)* | USDA / EU / FAO | Historical county yields for model validation and crop price volatility calibration |

---

## Tools, Languages & Stack
- **Simulation, Stress, Optimizer, Quant & Fact-Sheet Engine:** Rust (`crates/fieldshift-core`, `crates/fieldshift-wasm`) compiled to WebAssembly (`wasm32-unknown-unknown`) for instant browser execution and natively for the backend.
- **Backend API & LLM Verification Server:** Rust (`crates/fieldshift-server`, `tokio`, `serde_json`, `lru`) serving `/api/health`, `/api/simulate`, `/api/stress`, `/api/optimize`, `/api/score`, and `/api/explain` (SSE streaming).
- **Frontend & Light Site:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Three.js (React Three Fiber), MapLibre GL, ECharts, Web Workers.
- **Data Pipeline:** Python (`requests`, `numpy`, `pandas`, `xarray`).

---

## AI-Use Disclosure (Mandatory Space Apps Declaration)
1. **Runtime AI Feature (`/api/explain` & `/api/score`):** FieldShift uses a Large Language Model strictly to translate deterministic simulation outputs (`FactSheet` JSON generated by `crates/fieldshift-core/src/explain.rs`) into plain-language Romanian and English agronomic explanations and bounded ($\pm 10\text{ pt}$) qualitative score adjustments. Every numeric literal in the LLM output is programmatically verified against the `FactSheet` before display; if verification fails or the LLM API is unavailable, the server returns deterministic template explanations.
2. **Development & Documentation Assistance:** AI coding and writing assistants were used during the hackathon to accelerate Rust/TypeScript boilerplate, unit test generation, and documentation formatting. All physical equations, agronomic parameters, and scientific citations were verified by the team against published literature (see [docs/SCIENCE.md](SCIENCE.md)). No NASA logos or unlabelled AI-generated imagery are used.
