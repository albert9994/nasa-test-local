# 00 · The idea (read this first, 3 minutes)

## FieldShift: "How much climate change can your farm take?"

**Challenge:** NASA Space Apps 2026 · *Field Shift: Adapting Farms with NASA Data*: help farmers explore crop rotations
that strengthen soil health and adapt to changing temperature, rainfall and water availability, using NASA Earth
observations, soil data, crop traits and the farmer's own priorities.

### The problem
Farmers choose rotations from the climate they *remember*. Nobody tells them how close their current plan is to breaking.
Most tools (and most other teams this weekend) answer "what should I plant?". That is a forecast, and forecasts are fragile.

### Our answer: measure headroom, not a forecast
FieldShift gives every farm one number, the **Adaptation Margin**:

> "Your corn → soybean rotation can absorb **+X °C** of warming or **Y % less rain** before you lose money more often
> than 1 year in 5. Mid-century climate projections use Z % of that margin."

How it works: replay the last ~25 years of real NASA weather for that exact field, day by day, through a crop/soil model.
Then do it again with the climate shifted warmer and drier, and find the point where the farm starts failing.

Then the app shows how to get more margin:
1. **Stress-test**: drag warming/rain sliders, or jump to 2050 climate projections; every number updates live.
2. **Failure frontier**: a heatmap of every future climate, marking where each rotation breaks.
3. **3 resilient rotations**, found automatically and ranked by the farmer's priorities (profit / fewer bad years / soil / water), within their **budget and equipment**.
3b. **The future, quant-style:** 1,000+ simulated futures 2026–2050 (weather × prices × costs) → income fan chart, worst-case loss (CVaR), probability of running out of cash, "safe until ~20XX".
3c. **AI explanations:** an LLM explains every result in plain Romanian/English, using only the simulator's numbers.
4. **Replay the worst local drought** day by day: watch soil water drain and heat days pile up in each rotation.
5. **Plain-language plan** the farmer can print.

### Why it can win
| Judges score | We bring |
|---|---|
| Impact | One number a farmer understands + a printed plan. Works for any field on Earth, no login. |
| Creativity | "Adaptation Margin" + failure frontier + drought replay: a stress test, not another recommender. |
| Validity | Published methods only (FAO-56/33 water and yield, Saxton–Rawls soil, Schlenker–Roberts heat, RUSLE erosion). Checked against MODIS satellite greenness and county yield statistics. |
| Relevance | Every bullet of the prompt is covered; 6–8 NASA datasets each do a visible job. |
| Presentation | 30-second story: margin → slide to 2050 → replay drought → better rotation. |

### NASA data and what each will do
| Dataset | Job in FieldShift |
|---|---|
| NASA POWER daily 2001–2025 (MERRA-2, CERES) | Weather that drives the whole simulation; GWETROOT soil wetness |
| MODIS MOD13Q1 NDVI 250 m | Independent check of the model; drought-replay greenness |
| NEX-GDDP-CMIP6 | Real 2050 climate markers + "safe until year X" |
| SMAP L4 soil moisture 9 km | Starting soil water after 2015 |
| ECOSTRESS ESI 70 m | Check stress timing at field scale |
| NASADEM/SRTM 30 m | Field slope for runoff and erosion |
| NASA GIBS | Satellite map layers |
| ISRIC SoilGrids 250 m (partner data) | Soil water holding, runoff, erodibility, carbon |

### What we build this weekend (all from zero)
One **Rust engine** (`fieldshift-core`: simulator, stress test, optimizer, **quant engine**) used two ways:
- compiled to **WASM** in the browser: the **light site** (Next.js static landing with a Three.js 3D hero + instant demo) and the live sliders of the app;
- natively in an **Axum server**: heavy runs (10,000 Monte Carlo futures) and the **LLM explanation endpoint** (our API), which explains results to the farmer using only the engine's numbers.

Plus a **Python data pipeline** that caches NASA data for the demo farms, and **live NASA data** for any point clicked on the map.
Full Romanian brainstorm: [../BRAINSTORM.md](../BRAINSTORM.md).

Demo farms: 3 contrasting places (e.g. US Corn Belt, dryland High Plains, a European drought region) + **one from the team's home region**.

### Our one-sentence pitch
**"FieldShift turns 25 years of NASA data into one number every farmer understands: how much climate change their rotation can take, and which rotation gives them more."**
