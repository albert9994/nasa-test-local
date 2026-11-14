# FieldShift Scientific Documentation & Model Formulation (A14)

FieldShift uses a fast, deterministic agro-climatic **screening model** written in Rust (`crates/fieldshift-core`) that runs identically in the browser via WebAssembly and on the server. Every equation is drawn from peer-reviewed literature and FAO irrigation/drainage manuals so that relative sensitivity to warming ($\Delta T$) and rainfall change ($\Delta P$) is physically grounded and transparent.

---

## 1. Pedotransfer & Soil Hydraulics (`soil.rs`)

From ISRIC **SoilGrids 250 m** depth layers (`0–5`, `5–15`, `15–30`, `30–60`, `60–100 cm`), we compute depth-weighted root-zone sand ($S$), clay ($C$), silt, organic carbon ($\text{SOC}$), bulk density ($\rho_b$), and pH. Organic matter fraction is estimated as $\text{OM} = 0.1724 \times \text{SOC}_{\text{g/kg}}$.

### 1.1 Saxton & Rawls (2006) Water Retention
Wilting point ($\theta_{\text{WP}}$, at $1500\text{ kPa}$) and field capacity ($\theta_{\text{FC}}$, at $33\text{ kPa}$) volumetric moisture ($\text{m}^3\text{ m}^{-3}$) follow **Saxton & Rawls (2006)**:

$$\theta_{1500t} = -0.024 S + 0.487 C + 0.006 \text{OM} + 0.005 (S \cdot \text{OM}) - 0.013 (C \cdot \text{OM}) + 0.068 (S \cdot C) + 0.031$$

$$\theta_{\text{WP}} = \theta_{1500t} + (0.14 \theta_{1500t} - 0.02)$$

$$\theta_{33t} = -0.251 S + 0.195 C + 0.011 \text{OM} + 0.006 (S \cdot \text{OM}) - 0.027 (C \cdot \text{OM}) + 0.452 (S \cdot C) + 0.299$$

$$\theta_{\text{FC}} = \theta_{33t} + \left(1.283 \theta_{33t}^2 - 0.374 \theta_{33t} - 0.015\right)$$

Total Available Water per meter of active root depth is:

$$\text{TAW}_m = 1000 \cdot (\theta_{\text{FC}} - \theta_{\text{WP}}) \quad [\text{mm m}^{-1}]$$

### 1.2 Surface Runoff (USDA-SCS Curve Number)
Daily surface runoff $Q_{\text{ro}}$ ($\text{mm d}^{-1}$) from daily precipitation $P$ uses the SCS Curve Number method with $\text{CN}_2$ adjusted for NASADEM terrain slope (`slope` %):

$$S_{\text{ret}} = \frac{25400}{\text{CN}_2} - 254, \qquad I_a = 0.2 S_{\text{ret}}, \qquad Q_{\text{ro}} = \begin{cases} 0 & P \le I_a \\ \dfrac{(P - I_a)^2}{P + 0.8 S_{\text{ret}}} & P > I_a \end{cases}$$

---

## 2. Phenology & Daily Soil-Water Balance (`season.rs`)

### 2.1 Sowing Rule & Growing Degree Days (GDD)
- **Spring crops:** Sown on the first day inside the crop's sowing window `[sowStartDoy, sowEndDoy]` when the 5-day trailing mean temperature satisfies $\bar{T}_{5\text{d}} \ge T_{\text{sow}}$.
- **Winter crops:** Autumn establishment followed by active spring-to-summer canopy simulation.
- **Southern Hemisphere ($\text{lat} < 0$):** All calendar windows shift by $+182\text{ days}$.
- Daily thermal time accumulation with upper cutoff $T_{\text{upper}}$ and base temperature $T_{\text{base}}$:

$$\text{GDD}_d = \max\left(0, \min(T_{\text{mean}, d}, T_{\text{upper}}) - T_{\text{base}}\right)$$

Phenological stage $s \in \{0, 1, 2, 3\}$ is determined by cumulative GDD fraction $f_{\text{GDD}} = \sum \text{GDD}_d / \text{GDD}_{\text{maturity}}$:
- **Vegetative ($s=0$):** $f_{\text{GDD}} < 0.45$
- **Flowering / Anthesis ($s=1$):** $0.45 \le f_{\text{GDD}} < 0.62$
- **Grain Fill ($s=2$):** $0.62 \le f_{\text{GDD}} < 0.85$
- **Ripening ($s=3$):** $f_{\text{GDD}} \ge 0.85$

### 2.2 Dual-Store FAO-56 Bucket (Root Zone + Subsoil Store)
Active root depth $Z_r(d)$ expands linearly with thermal time from $Z_{r,\text{init}} = 0.15\text{ m}$ to $Z_{r,\max}$ by mid-season ($f_{\text{GDD}} = 0.55$).
- A **subsoil store** ($Z_{r}(d) \to Z_{r,\max}$) catches water percolating below the shallow early-season root zone and releases it into the active root zone as roots deepen, plus upward capillary flux during severe mid-season drought.
- Reference evapotranspiration $\text{ET}_0$ ($\text{mm d}^{-1}$) uses the radiation-calibrated **Hargreaves–Samani (1985)** equation driven by NASA POWER daily shortwave irradiance $R_s$ (`ALLSKY_SFC_SW_DWN`, converted via $0.408\text{ mm MJ}^{-1}\text{ m}^2$):

$$\text{ET}_0 = 0.0135 \cdot (T_{\text{mean}} + 17.8) \cdot (0.408 R_s) \cdot \sqrt{\frac{\max(2, T_{\max} - T_{\min})}{12}}$$

- Potential crop evapotranspiration is $\text{ET}_c = K_c(f_{\text{GDD}}) \cdot \text{ET}_0$.
- Water-stress coefficient $K_s \in [0, 1]$ follows **FAO-56 Eq. 84** when root-zone depletion $D_r$ exceeds Readily Available Water $\text{RAW} = p_{\text{adj}} \cdot \text{TAW}$:

$$K_s = \begin{cases} 1 & D_r \le \text{RAW} \\ \dfrac{\text{TAW} - D_r}{\text{TAW} - \text{RAW}} & D_r > \text{RAW} \end{cases}, \qquad \text{ET}_a = K_s \cdot \text{ET}_c$$

---

## 3. Multiplicative Yield & Heat Stress Model (`season.rs`)

Harvested yield $Y$ ($\text{t ha}^{-1}$) combines stage-wise **FAO-33 (Doorenbos & Kassam 1979)** water-deficit response with flowering heat shock, season-long extreme heat (**Schlenker & Roberts 2009**), frost, maturity duration, rotation carry-over, and local calibration:

$$Y = Y_{\text{att}} \times \underbrace{\prod_{s=0}^{3} \left[1 - K_{y,s}\left(1 - \frac{\text{ET}_{a,s}}{\text{ET}_{c,s}}\right)\right]}_{f_{\text{water}}} \times f_{\text{heat}} \times f_{\text{frost}} \times f_{\text{duration}} \times f_{\text{rotation}} \times c_{\text{calib}}$$

Where:
- **Heat stress ($f_{\text{heat}}$):** Combines acute pollen/silking sterilization above $T_{\text{flower}}$ during stage $s=1$ and exponential yield decay with Extreme Degree Days ($\text{EDD} = \sum \max(0, T_{\max, d} - T_{\text{crit}})$) following **Schlenker & Roberts (2009, PNAS)**.

---

## 4. Multi-Phase Rotation Carry-Over & Soil Health (`rotation.rs`, `soil_health.rs`)

1. **Staggered Farm Phases (`phases × years`):** A $k$-crop rotation is simulated across $k$ concurrent field phases over all 24 historical years so every crop is active every year and experiences sequential carry-over from the preceding phase.
2. **Off-Season Recharge & Satellite Nudge:** Starting spring moisture blends previous harvest moisture, off-season rainfall, winter cover-crop transpiration, fallow storage bonus, and the NASA POWER `GWETROOT` / SMAP root-zone wetness anomaly.
3. **Agronomic Carry-Over:**
   - Legume nitrogen fixation (`soybean`, `pea`) credits the subsequent non-legume crop with $+8\%$ yield and $-55\text{ \$/ha}$ fertilizer savings.
   - Consecutive monoculture (`maize → maize` or `sunflower → sunflower`) applies a $-12\%$ to $-18\%$ pest/disease yield penalty.
4. **Soil Health (`soil_health.rs`):**
   - **RUSLE Erosion:** $A = R \cdot K \cdot LS \cdot C \cdot P$ ($\text{t ha}^{-1}\text{ yr}^{-1}$), where $R$ scales with annual rainfall, $K$ follows Williams (1995), $LS$ uses NASADEM slope, and $C$ reflects crop canopy + winter rye cover crop (`cover: true` cuts $C$ by $48\%$).
   - **SOC Trend:** Balance of crop + cover-crop humified residue carbon inputs against $Q_{10}$-scaled temperature mineralization (**Poeplau & Don 2015**).

---

## 5. Honest Limitations
- **Screening vs. Process-Based Agronomy:** FieldShift is designed to measure **climate headroom (Adaptation Margin)** in under $2\text{ ms}$ per 24-year rotation, not to replace field-calibrated daily nutrient/pest models such as APSIM or DSSAT.
- **Delta-Method Climate Perturbations:** Uniform $\Delta T$ and $\Delta P$ shifts preserve historical drought sequencing (e.g., 2007, 2012, 2022, 2024) but do not alter sub-seasonal storm clustering.
- **CO₂ Fertilization & Pests:** Elevated atmospheric $\text{CO}_2$ stomatal effects and emerging pest/weed range shifts are excluded from the baseline physical loop to keep adaptation margins conservative.

---

## 6. Key References
1. **Allen, R. G., Pereira, L. S., Raes, D., & Smith, M. (1998).** *Crop Evapotranspiration: Guidelines for Computing Crop Water Requirements.* FAO Irrigation and Drainage Paper 56.
2. **Doorenbos, J., & Kassam, A. H. (1979).** *Yield Response to Water.* FAO Irrigation and Drainage Paper 33.
3. **Saxton, K. E., & Rawls, W. J. (2006).** Soil water characteristic estimates by texture and organic matter for hydrologic solutions. *Soil Science Society of America Journal*, 70(5), 1569–1578.
4. **Schlenker, W., & Roberts, M. J. (2009).** Nonlinear temperature effects indicate severe damages to U.S. crop yields under climate change. *PNAS*, 106(37), 15594–15598.
5. **Poeplau, C., & Don, A. (2015).** Carbon sequestration in agricultural soils via cultivation of cover crops – A meta-analysis. *Agriculture, Ecosystems & Environment*, 200, 33–41.
6. **Renard, K. G., et al. (1997).** *Predicting Soil Erosion by Water: A Guide to Conservation Planning with the Revised Universal Soil Loss Equation (RUSLE).* USDA Agriculture Handbook 703.
