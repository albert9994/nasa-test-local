# FieldShift Story, Persona, Video Storyboard & Plain-Language UI Copy (LU2, LU4)

---

## 1. Farmer Persona (LU2)

| Attribute | Detail |
|---|---|
| **Name & Age** | **Mihai Ionescu**, 46 years old (second-generation arable farmer) |
| **Farm** | **320 ha rain-fed farm in the Bărăgan Plain** (Slobozia / Ialomița County, Romania · `44.55°N, 27.45°E`) — chernozem silty clay loam (`pH 7.4`, `SOC 3.1 %` topsoil), no irrigation access |
| **Secondary US Persona** | **Dave Miller**, 52, **480 acres in Story County, Iowa** (`42.03°N, -93.62°W`) — continuous `maize → soybean` rotation hit hard by the 2012 flash drought |
| **Current Rotation** | `Maize → Winter Wheat` (with occasional sunflower) — chosen from the climate of the 1990s and 2000s |
| **Core Worry** | *"In 2007, 2020, 2022, and 2024, summer heat above 35 °C during maize flowering wiped out my profit while my winter wheat survived because we harvested it in June. How many more bad years am I facing, and what rotation can I switch to **with the planter, combine headers, and working capital I already have**?"* |
| **Devices & Context** | Checks field conditions on an **Android phone (375 px screen)** in the pickup cab or kitchen table; prints a **1-page PDF plan** on his home printer to take to his agronomist, cooperative, or agricultural bank officer (CEC Bank / APIA) |
| **What Turns Him Off** | Academic jargon (`ETc`, `Ks`, `GDD`, `VPD`, `AWC`, `CVaR`), login walls, slow GIS portals, and black-box recommendations that ignore machinery or local crop buyers |

---

## 2. 30-Second Video Storyboard (LU2 → Octa O9 & Ionut I9)

**Format:** `1920×1080` (16:9), 60 fps, burned-in high-contrast captions, no NASA "meatball" logo (per Space Apps rules).

| Frame | Time | Visual (Screen / Motion) | On-Screen Caption / Voiceover |
|---|---|---|---|
| **1. Hook** | `0–4 s` | 3D globe / satellite zoom (NASA GIBS MODIS true-color + NDVI overlay) onto a rain-fed farm in the Bărăgan Plain / Iowa. | **"How much climate change can this farm take?"** |
| **2. The Number** | `4–10 s` | Hero card reveals the **Adaptation Margin** badge (`+1.8 °C` warming / `−22 %` rain) and the **"Safe until ~2041"** marker. | **"Not a fragile yield forecast — one number: this rotation can absorb +1.8 °C before bad years exceed 1 in 5."** |
| **3. Stress Test to 2050** | `10–16 s` | User clicks **2050 (CMIP6)** slider; failure frontier heatmap dot crosses the white tolerance contour; baseline card turns red (`8/24 bad years`). | **"Slide to 2050 NASA climate projections: the current maize–soybean plan crosses the farmer's failure limit."** |
| **4. Replay the Worst Drought** | `16–22 s` | Clicks **▶ Replay 2012 / 2024 Drought**: animated soil-water tank drains to red, flowering days `> 35 °C` tick up, maize income collapses while winter wheat escapes in June. | **"Replay the worst local drought day by day: watch soil moisture drain and flowering heat destroy summer crops."** |
| **5. Resilient Rotation + AI Plan** | `22–27 s` | Compare cards highlight **Drought Shield** (`Winter Wheat → Sorghum → Pea + Rye cover`): bad years drop to `1/24`, Adaptation Margin jumps to `+3.4 °C`, soil health rises `+18 pts`, AI streams plain-language steps. | **"FieldShift finds 3 resilient rotations that fit the farmer's budget and machinery — and writes a printable plan."** |
| **6. End Card** | `27–30 s` | Clean dark brand card with live URL + dataset text credits: `NASA POWER · MODIS MOD13Q1 · NEX-GDDP-CMIP6 · SMAP · ECOSTRESS · NASADEM · ISRIC SoilGrids`. | **"FieldShift: 25 years of NASA data → farm headroom, anywhere on Earth."** |

---

## 3. Plain-Language UI Copy (LU4 — No Technical Jargon)

> **Rule:** Never show raw model symbols (`ETc`, `ET0`, `Ks`, `TAW`, `Ky`, `RUSLE`, `GDD`, `CVaR`) as primary labels. Always use farmer-first wording, with English (`en`) and Romanian (`ro`) translations below.

### 3.1 Hero Sentences (Dynamic Templates)

#### Status: `safe` (`margin.dT >= 1.5`)
- **EN:** Your **{{rotation}}** rotation can absorb **+{{dT}} °C** of warming or **{{dP_pct}} % less rain** before money-losing years exceed your **{{tolerance}}** limit. Under mid-century climate projections, your current plan stays within your risk limit until **~{{safeUntil}}**.
- **RO:** Rotația ta **{{rotation}}** poate absorbi **+{{dT}} °C** încălzire sau **cu {{dP_pct}} % mai puțină ploaie** înainte ca anii pe minus să depășească limita ta de **{{tolerance}}**. Conform proiecțiilor climatice NASA, planul actual rămâne sub pragul de risc până în **~{{safeUntil}}**.

#### Status: `tight` (`0 < margin.dT < 1.5`)
- **EN:** Thin headroom: your **{{rotation}}** rotation has only **+{{dT}} °C** of warming buffer (**{{dP_pct}} %** rain buffer) left before bad years exceed **{{tolerance}}** — a threshold projected around **~{{safeUntil}}**.
- **RO:** Rezervă mică: rotația ta **{{rotation}}** mai are doar **+{{dT}} °C** marjă de încălzire (**{{dP_pct}} %** marjă de ploaie) până când anii proști depășesc **{{tolerance}}** — prag estimat în jurul anului **~{{safeUntil}}**.

#### Status: `already_over` (`margin.already == true` or `margin.dT == 0`)
- **EN:** Already over your risk limit: over the last 24 real NASA weather seasons, **{{rotation}}** lost money in **{{badYears}}** years (worse than your **{{tolerance}}** rule). Switching to **{{bestAlt}}** cuts bad years to **{{bestAltBadYears}}** and restores **+{{bestAltDT}} °C** of headroom.
- **RO:** Deja peste limita de risc: în ultimele 24 de sezoane reale NASA, rotația **{{rotation}}** a ieșit pe pierdere în **{{badYears}}** ani (peste pragul tău de **{{tolerance}}**). Trecerea la **{{bestAlt}}** reduce anii proști la **{{bestAltBadYears}}** și îți oferă **+{{bestAltDT}} °C** marjă de siguranță.

### 3.2 Section & Control Labels (EN / RO)

| Key | English (`en`) | Romanian (`ro`) | Helper / Subtitle |
|---|---|---|---|
| `hero.title` | Adaptation Margin | Marja de Adaptare | How much warmer or drier the climate can get before bad years exceed your limit |
| `hero.safeUntil` | Safe until ~{{year}} | Sigură până în ~{{year}} | Year when NASA CMIP6 warming reaches your rotation's limit |
| `inputs.rotation` | Your Crop Rotation | Rotația Culturilor Tale | Crops grown in sequence across your fields; add winter rye cover to protect soil |
| `inputs.badYearRule` | What counts as a bad year? | Ce înseamnă un an prost? | Net farm income below this $/ha threshold counts as a bad year |
| `inputs.tolerance` | How many bad years can you absorb? | Câți ani proști poți suporta? | e.g., 1 year in 5 (20 %) before cash reserves run tight |
| `inputs.climateSliders` | Stress-Test Future Weather | Testează Vremea Viitoare | Shift all 25 historical NASA seasons warmer (+°C) or drier (−% rain) |
| `inputs.levers` | On-Farm Adjustments | Pârghii în Fermă | Earlier sowing, shorter-season hybrids, or supplemental irrigation (mm) |
| `inputs.profile` | Budget & Machinery on Farm | Buget și Utilaje în Fermă | Filter recommendations to crops you can plant, harvest, and sell locally |
| `inputs.market` | Market & Input Price Shock | Șoc de Prețuri și Inputuri | Test a harvest price drop (−30 %) or fertilizer cost spike (+40 %) |
| `compare.title` | 3 Resilient Rotations for Your Field | 3 Rotații Reziliente pentru Terenul Tău | Automatically searched across ~250 rotations and filtered by your budget & equipment |
| `compare.bestBalance` | Best Balance | Cel Mai Bun Echilibru | Highest overall score across profit, stability, soil health, and water |
| `compare.droughtShield` | Drought Shield | Scut Anti-Secetă | Fewest money-losing years under +2 °C warming and 20 % less rain |
| `compare.soilBuilder` | Soil Builder | Constructor de Sol | Rebuilds organic matter, protects topsoil from heavy rain, and adds legume nitrogen |
| `frontier.title` | Climate Failure Map | Harta Pragului de Risc | White line marks your bad-year limit; move inside the green zone for safety |
| `replay.title` | Replay the Worst Local Drought | Derulează Cea Mai Grea Secetă | Watch day-by-day soil moisture, flowering heat days, and satellite greenness |
| `quant.title` | 1,000 Possible Futures (2026–2050) | 1.000 de Viitoruri Posibile (2026–2050) | Scenario probabilities combining NASA climate shifts with grain price & fertilizer swings |
| `explain.button` | Explain in plain words | Explică pe înțelesul meu | AI summary using only the simulator's verified numbers |
| `report.button` | Print 1-Page Farm Plan | Printează Planul de 1 Pagină | Ready to take to your agronomist, co-op, or lender |

### 3.3 3-Step Onboarding Quick Tour
1. **Pick your field (or click anywhere on Earth):** FieldShift loads 25 years of real daily NASA weather, satellite greenness, and soil layers for that exact spot.
2. **Read your Adaptation Margin:** See how many degrees of warming (`+°C`) and rain loss (`−%`) your current rotation can take before bad years happen too often.
3. **Compare 3 safer rotations & print your plan:** Replay your region's worst drought day by day, pick a rotation that fits your machinery and budget, and print a 1-page action plan.

### 3.4 Plain-Language Glossary (Replacing Model Jargon)

| Technical Concept (Internal) | What We Call It in the UI | Plain-Language Explanation for the Farmer |
|---|---|---|
| `Adaptation Margin (dT, dP)` | **Adaptation Margin (Headroom)** | The extra warming (`+°C`) or rainfall drop (`−%`) your rotation can handle before money-losing years exceed your limit (for example, 1 year in 5). |
| `ETc / ETa / Ks` | **Crop Water Supply & Dry-Soil Days** | How many days the roots could not pull enough water from the soil to keep the crop growing at full speed. |
| `TAW + Subsoil Store` | **Soil Water Tank (mm)** | How much rainwater your top meter of soil can hold like a sponge between storms. |
| `Flowering Heat + EDD` | **Heat Days at Flowering** | Days hotter than the crop's safe threshold (`32–36 °C`) during pollination, when heat sterilizes pollen and cuts grain set even if soil is moist. |
| `VaR95 / CVaR95` | **Worst-1-in-20-Year Loss ($/ha)** | Across 1,000 simulated futures of weather and market prices, the average loss in the worst 5 % of years. *(Scenario probability, not a forecast.)* |
| `Probability of Ruin (pRuin)` | **Cash-Reserve Depletion Risk** | The share of simulated 2026–2050 futures where consecutive bad years exhaust your starting cash buffer per hectare. |
| `SOC Trend & RUSLE` | **Soil Health & Topsoil Loss** | Whether crop residues, roots, and winter cover crops are building organic matter faster than warm summers and heavy rain wash it away. |

### 3.5 "What to Try First" Practical Farmer Tips (with Moldo M8)
- **Escape mid-summer heat with autumn-sown crops:** In regions like the Bărăgan Plain or Kansas, winter wheat and winter barley flower in May and are harvested in June — *before* July–August `> 35 °C` heatwaves strike.
- **Swap half your drought-sensitive maize for grain sorghum or sunflower:** Sorghum tolerates flowering temperatures up to `38 °C`, uses ~25 % less water per season, and uses your existing row planter and grain combine.
- **Put a grain legume (pea or soybean) ahead of winter wheat:** Legumes fix atmospheric nitrogen in the soil, boosting the following cereal yield by `8–15 %` while cutting synthetic nitrogen fertilizer costs by `$40–70/ha`.
- **Add winter rye cover before spring crops on sloping or low-carbon fields:** A living winter root mat cuts heavy-rain topsoil runoff by nearly half and rebuilds soil water-holding capacity over 3–5 seasons.
