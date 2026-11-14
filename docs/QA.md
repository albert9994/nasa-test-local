# M9 · Judge Q&A & Scientific Limitations (`docs/QA.md`)

Acest document conține răspunsurile scurte, directe și susținute de cifre la cele **12 întrebări grele ale juriului** (pentru sesiunea de Q&A de pe scenă și verificare științifică), urmate de limitările asumate ale modelului.

---

## Cele 12 Întrebări Grele ale Juriului (Short, Punchy Answers)

### 1. „Isn't this just another crop model? Why not just run DSSAT, APSIM, or AquaCrop?"
**Answer:** Traditional crop models answer *"How many tons/ha will I get next year?"*—and they take seconds per run on a desktop. FieldShift answers a fundamentally different question: **"How much climate and market stress can your rotation absorb before your farm breaks?"** (the **Adaptation Margin**). Because our FAO-56/33 + Schlenker–Roberts engine is compiled to **Rust/WASM**, it simulates a 25-year rotation in **< 2 milliseconds** right in the browser, enabling live warming sliders, an 11×11 failure frontier (121 climates), a ~250-rotation optimizer, and **1,000 Monte Carlo futures (2026–2050)** in under 2 seconds—something impossible with heavyweight desktop crop models.

### 2. „How accurate is a simplified water-and-heat screening model compared to real farm yields?"
**Answer:** We validate every demo farm against **25 years of official county/județ yield statistics** (USDA NASS Quick Stats and Eurostat/INS TEMPO, $r \approx 0.68\text{–}0.79$, $\text{RMSE} \approx 0.6\text{–}1.2\text{ t/ha}$) and against **MODIS MOD13Q1 250 m peak NDVI** ($r \approx 0.58\text{–}0.74$). More importantly, the **Adaptation Margin measures relative headroom** ($\Delta T$ and $\Delta P$ until failure), so constant field-level biases largely cancel out, and farmers can also enter their own historical yield (`fieldFactor`) for 1-click local calibration.

### 3. „NASA POWER has ~50 km spatial resolution. How can a 50 km grid cell represent a single farmer's field?"
**Answer:** Temperature and synoptic rainfall anomalies vary smoothly across 20–50 km plains, whereas **what makes two neighboring fields behave differently is soil, slope, and canopy water stress**. We combine NASA POWER's 25-year daily weather with **250 m SoilGrids** (water-holding capacity, texture, organic carbon), **30 m NASADEM** (field slope for runoff and RUSLE erosion), **250 m MODIS NDVI** (historical greenness), and **70 m ECOSTRESS ESI** (field-scale evaporative stress).

### 4. „What about $\text{CO}_2$ fertilization? Doesn't higher $\text{CO}_2$ offset heat and drought losses?"
**Answer:** Free-Air $\text{CO}_2$ Enrichment (FACE) experiments show that elevated $\text{CO}_2$ boosts C3 crops (wheat, soybean, pea) by ~8–12% under non-stressed conditions and slightly improves stomatal water-use efficiency, while C4 crops (maize, sorghum, millet) get almost zero direct yield boost. However, **Hultgren et al. (2025, *Nature*)** and **Ainsworth & Long (2021)** show that acute reproductive heat shock (>33 °C at silking/anthesis) and severe soil-water depletion override $\text{CO}_2$ benefits. We keep $\text{CO}_2$ fertilization off by default so we never over-promise resilience to a farmer, and include it as a documented sensitivity toggle.

### 5. „Your biophysical simulator tracks water, heat, and frost. What about pests, diseases, and weeds?"
**Answer:** A farmer who plants sunflower every second year will be wiped out by *Sclerotinia* (white mold) and *Orobanche* (broomrape) long before climate change hits. Instead of pretending to simulate insect population dynamics day-by-day, we encode **phytosanitary and agronomic rotation rules via embedded Rhai scripts (`rules/*.rhai`)**—enforcing minimum break years (e.g., sunflower $\le 1$ in 4–5 years, pea $\le 1$ in 3–4 years against *Aphanomyces* root rot, continuous corn rootworm penalties, and grass-to-grass *Fusarium* bridges) plus empirical carry-over penalties in `rotation.rs`.

### 6. „Why do you shift historical weather with CMIP6 deltas and block-bootstrap seasons instead of feeding raw daily GCM outputs into the crop model?"
**Answer:** Raw daily GCM outputs (even downscaled NEX-GDDP-CMIP6) suffer from residual "drizzle bias" and distorted multi-day heatwave persistence at the field scale. By **replaying the real 2001–2025 NASA POWER daily weather** (which preserves exact historical compound heatwaves + flash droughts like 2012 in Iowa or 2007/2024 in Romania) and applying ensemble **NEX-GDDP-CMIP6 seasonal $\Delta T / \Delta P$ trajectories (p10–p90)** via block bootstrap, farmers see how droughts *they actually lived through* behave in a +2 °C world.

### 7. „How do you model market risk? Doesn't a regional drought raise grain prices and partially protect revenue?"
**Answer:** Yes—and ignoring that natural hedge distorts financial risk! In our **Quant Engine (`quant.rs` + `data/quant_params.json`)**, crop prices follow correlated **Ornstein–Uhlenbeck mean-reverting log-price processes** calibrated on 25 years of FAO GIEWS, World Bank Pink Sheet, and Euronext MATIF data ($\sigma \approx 16\text{–}22\%/\text{yr}$), with a **negative price–yield correlation ($\rho \approx -0.15\text{ to }-0.26$)** and a **jump-diffusion process on input costs** calibrated to the 2022 +40% fertilizer shock.

### 8. „If the optimizer recommends switching from maize to sorghum or peas, can the farmer actually plant, harvest, and sell it?"
**Answer:** Every candidate rotation is filtered against `data/equipment.json` and the farmer's local `cropPool`. For example, in Bărăgan (Romania), switching rain-fed maize to **grain sorghum** requires **zero new machinery**: it uses the exact same precision row planter (`row_planter`) and harvests with a standard combine grain header (no special header needed). If a rotation needs a missing attachment (e.g., `sunflower_header`) that exceeds the farmer's investment budget, the optimizer flags or excludes it.

### 9. „How do you guarantee the AI assistant doesn't hallucinate yields, prices, or agronomic advice?"
**Answer:** **Golden rule: The Rust engine computes; the LLM only explains.** The simulator builds a compact, deterministic JSON **Fact Sheet (`C10`)** containing all verified numbers. The Axum server (`/api/explain`) enforces a strict system prompt ("use only numbers present in the fact sheet") and runs a **post-generation numeric verifier** that checks every number in the LLM response against the Fact Sheet. In `/api/score`, the qualitative LLM adjustment is schema-validated and hard-capped to **$\pm 10$ points**. If the LLM is offline or fails validation, the server falls back to deterministic templates.

### 10. „Only 28% of farmers know how to use satellite data (NASA Acres 2024). Who actually uses FieldShift?"
**Answer:** We built two entry points over the same Rust engine:
1. **The Light Site (no login, mobile-friendly):** A farmer or agronomic advisor clicks their field on the map, sees one plain number (*"Your rotation can take +1.4 °C"*), compares 3 realistic rotations, and prints a 1-page action plan in Romanian or English—no GIS, no "NDVI" or "ETc" jargon.
2. **The Full App ("Terminal"):** Used by larger commercial farms, agronomic consultants (who advise 20–50 smallholder farms each), agri-banks, and crop insurers who need VaR/CVaR and portfolio climate stress-testing.

### 11. „Does your model work in the Southern Hemisphere or tropical climates?"
**Answer:** Yes. Sowing windows are temperature-triggered (5-day running mean $\ge T_{\text{sow}}$) and automatically shifted by ~182 days in the Southern Hemisphere (`lat < 0`), while NASA POWER and SoilGrids provide global coverage so clicking any rain-fed agricultural point on Earth runs a live simulation.

### 12. „How do cover crops affect water in dry regions? Won't winter rye steal spring moisture from the cash crop?"
**Answer:** That is a classic agronomic trap that we explicitly model! In humid regions ($\ge 450\text{ mm/yr}$, like Iowa or Northern/Central Europe), winter rye improves snowmelt infiltration (+8%) and cuts erosion by 45% without hurting yields. In semi-arid dryland (<450 mm/yr, like Western Kansas), our `CropLibrary::carry_over_effect` penalizes late-terminated rye for its ~18 mm spring transpiration drawdown—so the optimizer recommends stubble conservation or early spring peas instead of water-hungry cover crops.

---

## Honest Scientific Limitations (for `SCIENCE.md` & Judge Transparency)

1. **Water-table & waterlogging dynamics:** Our 2-layer FAO-56 soil bucket (root zone + subsoil store) models infiltration, curve-number runoff, and deep drainage, but does not model capillary rise from shallow groundwater tables (< 2 m) or spring waterlogging/anoxia damage.
2. **Cultivar-specific genetics:** Each crop in `crops.json` represents a standard regional maturity class (recoverable via the `maturity` lever $0.85\times\text{–}1.15\times$), rather than proprietary seed-company hybrid trials.
3. **Sub-daily temperature extremes:** Heat stress uses daily $T_{\max}$ at flowering and Schlenker–Roberts degree-days above $T_{\text{crit}}$; canopy cooling via transpiration in irrigated fields is approximated rather than solved via full surface energy balance.
4. **Static soil organic carbon equilibrium horizon:** The carbon model in `soil_health.rs` estimates annual first-order topsoil (0–30 cm) C flux (`socChangePct` %/yr) over a 5–10 year planning horizon rather than a 100-year multi-pool Century/RothC spin-up.
