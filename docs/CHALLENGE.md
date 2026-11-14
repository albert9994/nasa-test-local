# NASA Space Apps 2026 · Field Shift: Adapting Farms with NASA Data

## 1. Official Challenge Statement (A3)
**Challenge:** *Field Shift: Adapting Farms with NASA Data*

> Help farmers explore crop rotation strategies that strengthen soil health and adapt to changing temperature, rainfall, and water availability by combining NASA Earth observation datasets, local soil information, crop characteristics, and the farmer's own priorities.

### Core Prompt Requirements & FieldShift Mapping
| Prompt Requirement | FieldShift Implementation | Owner & Module |
|---|---|---|
| **NASA Earth observations** | NASA POWER daily weather (2001–2025: `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `GWETROOT`, `ALLSKY_SFC_SW_DWN`, `RH2M`, `WS2M`), MODIS `MOD13Q1` NDVI (250 m), SMAP L4 root-zone soil moisture (`SPL4SMGP`), ECOSTRESS evaporative stress (`ECO_L4T_ESI`), NASADEM slope (`NASADEM_NC`), NEX-GDDP-CMIP6 climate projections, NASA GIBS map tiles | Luca (`pipeline/`), Moldo (`pipeline/ndvi`), Albert (`season.rs`, `rotation.rs`), Octa (`apps/web`) |
| **Local soil information** | ISRIC SoilGrids 250 m (`sand`, `clay`, `silt`, `soc`, `bdod`, `phh2o` across 0–100 cm) transformed via Saxton & Rawls (2006) pedotransfer functions into plant-available water (TAW), SCS Curve Number ($\text{CN}_2$), and RUSLE erodibility ($K$) | Luca (`pipeline/soil`), Albert (`soil.rs`), Moldo (`soil_health.rs`) |
| **Crop characteristics** | 9 core crops + winter rye cover crop (`maize`, `soybean`, `wheat`, `barley`, `sorghum`, `sunflower`, `pea`, `millet`, `fallow`, `rye`) parameterized with FAO-56 ($K_c$, root depth, depletion fraction $p$), FAO-33 stage $K_y$, flowering heat thresholds, and Schlenker–Roberts extreme degree-day slopes | Moldo (`crops.json`), Albert (`crops.rs`, `season.rs`) |
| **Farmer priorities & constraints** | 4 priority weights (`profit`, `stability`, `soil`, `water`), custom bad-year threshold (`failNet`) and tolerance (`failShare`), maximum operating cost (`maxCostPerHa`), available machinery (`equipment`), and locally sellable crops | Octa (`inputs.tsx`), Ionut (`optimize.rs`, `score.rs`) |
| **Explore crop rotation strategies** | Interactive rotation builder + automated search over ~250 candidate rotations returning 3 distinct archetypes: **Best balance**, **Drought shield**, and **Soil builder** | Albert (`rotation.rs`), Ionut (`optimize.rs`) |
| **Strengthen soil health** | Dynamic soil organic carbon trend ($\text{t C ha}^{-1}\text{ yr}^{-1}$), RUSLE erosion ($\text{t ha}^{-1}\text{ yr}^{-1}$), botanical diversity, living cover (rye cover crop), and composite `soilScore` (0–100) | Moldo (`soil_health.rs`), Albert (`rotation.rs`) |
| **Changing temperature, rainfall & water** | **Adaptation Margin** (+°C warming and −% rainfall before $P(\text{fail}) > \text{tolerance}$), 11×11 Failure Frontier heatmap, CMIP6 `marginYear`, 1,000-path Quant Monte Carlo (2026–2050), and day-by-day Drought Replay with irrigation lever | Albert (`season.rs`, `rotation.rs`), Ionut (`stress.rs`, `quant.rs`), Octa (`replay.tsx`) |
| **Plain-language decision support** | Fact-sheet-constrained LLM explanation stream (`/api/explain`) in Romanian & English with strict number verification and deterministic template fallback | Albert (`explain.rs`, `fieldshift-server`), Luca (`prompts/`) |

---

## 2. Selected Rain-Fed Demo Farms (A2 + M1)

All four farms were verified on satellite imagery to represent **rain-fed arable fields** (no center-pivot or canal irrigation circles) across contrasting agro-climatic zones, including our home region in Romania:

| ID | Region & Name | Coordinates (`lat`, `lon`) | Elev / Slope | Usual Baseline Rotation | Local Crop Pool | Known Historical Droughts | Why Selected |
|---|---|---|---|---|---|---|---|
| `iowa` | **Story County, Iowa (USA)** | `42.03, -93.62` | 310 m · 2.0% | `maize → soybean` | `maize, soybean, wheat, sorghum, pea, barley, fallow` | **2012** (severe August flowering heat & flash drought), 2023 | High-yielding temperate Corn Belt benchmark; fertile Mollisol loam; vulnerable to flowering heat spikes |
| `kansas` | **Thomas County (Colby), Kansas (USA)** | `39.39, -101.05` | 960 m · 1.5% | `wheat → sorghum → fallow` | `wheat, sorghum, maize, sunflower, millet, pea, fallow` | **2012, 2013, 2022** | Semi-arid US High Plains (~460 mm/yr rain); demonstrates fallow moisture storage & drought-hardy sorghum/millet |
| `cordoba` | **Campiña de Córdoba, Andalusia (Spain)** | `37.85, -4.78` | 145 m · 3.2% | `wheat → sunflower` | `wheat, barley, sunflower, pea, sorghum, fallow` | **2005, 2017, 2022, 2023** | Mediterranean dryland hotspot; spring heat > 38 °C; demonstrates autumn-sown winter cereal escape vs summer crop stress |
| `baragan` | **Bărăgan Plain (Călărași), Romania** *(Home Region)* | `44.55, 27.45` | 48 m · 1.2% | `maize → wheat → sunflower` | `maize, wheat, sunflower, barley, soybean, pea, sorghum, fallow` | **2007, 2020, 2022, 2024** | Home-region chernozem breadbasket (~510 mm/yr); spring-sown maize already near or past failure limit while winter wheat escapes July heatwaves |

---

## 3. AppEEARS Satellite Extraction Specification (A4)

Submitted for the 4 demo farm coordinates plus a 3×3 neighborhood grid (~30 m spacing) covering **2015-01-01 to 2025-12-31**:

1. **SMAP L4 Global 3-hourly 9 km Surface and Rootzone Soil Moisture (`SPL4SMGP.007`)**
   - Variable: `sm_rootzone` ($\text{m}^3\text{ m}^{-3}$) → converted to relative root-zone wetness and merged into `layers/<farm>/appeears.json` (`smap`).
2. **ECOSTRESS Evaporative Stress Index PT-JPL 70 m (`ECO_L4T_ESI.002`)**
   - Variable: `ESIavg` (0–1) with quality flag filtering → field-scale evaporative stress check (`esi`).
3. **NASADEM 1 arc-second (~30 m) Digital Elevation (`NASADEM_NC.001`)**
   - Variable: `NASADEM_HGT` on a 3×3 grid around `(lat, lon)` → central-difference terrain slope (%) for SCS Curve Number adjustment and RUSLE $LS$ factor (`slope`).
