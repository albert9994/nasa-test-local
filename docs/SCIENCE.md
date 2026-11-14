# FieldShift science notes: simulator and quant engine

Everything here is implemented in `crates/fieldshift-core` (one Rust crate: native server, desktop and browser WASM).
Numbers are **scenario probabilities, not forecasts**; the UI and the AI advisor must say so.

## 1. Crop simulator (`season.rs`, `et0.rs`, `co2.rs`, `climate.rs`)

One field-season is a daily FAO-56 root-zone water balance driven by NASA POWER Tmax, Tmin, precipitation, solar
radiation, RH2M and WS2M, plus SoilGrids water-holding capacity and curve number.

### 1.1 Reference evapotranspiration: FAO-56 Penman-Monteith (daily, Eq. 6)

```
ET0 = [0.408 Δ (Rn - G) + γ 900/(T+273) u2 (es - ea)] / [Δ + γ (1 + 0.34 u2)]
```

* `T` = (Tmax + Tmin)/2, `Δ` = slope of the saturation vapour pressure curve (Eq. 13), `γ = 0.000665 P`, `P` from
  elevation (Eq. 7), `G = 0` at the daily step (Eq. 42).
* `es` = mean of e0(Tmax), e0(Tmin) (Eq. 12); `ea = RHmean/100 · es` (Eq. 19) using POWER RH2M.
* `Rn = 0.77 Rs - Rnl`; `Rnl = σ (Tmax,K⁴ + Tmin,K⁴)/2 (0.34 - 0.14 √ea)(1.35 Rs/Rso - 0.35)` (Eq. 39), `Rso = (0.75 + 2e-5 z) Ra`
  (Eq. 37), `Ra` from latitude and day of year (Eq. 21). `u2` = POWER WS2M (already at 2 m), floored at 0.5 m/s.
* **Fallback**: radiation-calibrated Hargreaves-Samani when RH or wind are missing in the pack.
* **Test**: FAO-56 Example 18 (Brussels, 6 July) reproduces ET0 = 3.9 mm/day and Ra = 41.1 MJ m⁻² d⁻¹.
* **Grid bias factor `POWER_ET0_BIAS = 0.92`** (`et0.rs`): point-scale station comparisons find POWER (MERRA-2/CERES)
  shortwave radiation and wind a few percent too high, which inflates PM-ET0 by roughly 5-10 % (e.g. Duarte & Sentelhas
  2020). The exact value is an *empirical calibration*: the largest factor that keeps Story County (Iowa) maize
  9-12 and soybean 3-3.8 t/ha (USDA NASS county range). Set it to 1.0 to disable; refresh it with `validate` (§4) whenever
  county yields change.

Warming keeps relative humidity constant (vapour pressure rises with `es`), so a warmer day is also a drier-air day.

### 1.2 Water stress and yield (unchanged structure)

Ks (FAO-56 Eq. 84), stage-wise FAO-33 water-yield response `Π [1 - Ky_s (1 - ETa/ETc)]`, flowering heat penalty and
Schlenker & Roberts (2009) extreme-degree-day penalty (applied to (Tmax+Tmean)/2 because the data are daily), frost,
season-length and rotation carry-over multipliers.

### 1.3 CO₂ fertilisation (`co2.rs`)

| Crop type | Yield (RUE) | Transpiration demand |
|---|---|---|
| C3 (wheat, barley, soybean, pea, sunflower) | +0.1 % per ppm above 420, capped at +15 % | −5 % per +130 ppm |
| C4 (maize, sorghum, millet) | none | −3 % at 550 ppm (water-use efficiency) |

Sources: Ainsworth & Long (2005, *New Phytologist* 165) and Long et al. (2006, *Science* 312) for the FACE response
(the cap reflects that field FACE gains are smaller than chamber studies under N and water limits); Leakey (2009,
*Proc. R. Soc. B*) for the C4 water-use benefit. Default `opts.co2ppm` = 420 (today): no effect on existing numbers.

SSP concentration pathways (Meinshausen et al. 2020, *GMD* 13): SSP2-4.5 ≈ 440 / 487 / 603 ppm in 2030 / 2050 / 2100,
SSP5-8.5 ≈ 449 / 541 / 1135 ppm (linear in between). The quant engine applies them per year (`co2` flag, default on).
Note: the project brief quoted 530 / 570 ppm for 2050; the harmonised CMIP6 values above are lower, and are what the
CMIP6 temperature deltas in the pack were computed with.

### 1.4 Climate shifts (`climate.rs`)

* Sliders: `opts.dT` (added to Tmax and Tmin) and `opts.dP` (rain multiplier) are uniform over the year.
* **Monthly CMIP6 deltas**: `opts.monthly = { dT: [12], dP: [12] }` adds per-calendar-month shifts on top. The pack carries
  `scenarios.<ssp>.monthly` (2050 anchor vs 2001-2020). Along a trajectory the pattern is rescaled so its annual means equal
  the year's ΔT/ΔP (`MonthlyShift::scaled_to`), so *when* the heat arrives is preserved. Used by `marginYear` (set
  `opts.ssp`) and the quant engine; `margin`/`frontier` axes stay uniform annual shifts by design.
* `opts.ssp` also selects the CO₂ pathway in `marginYear`.

### 1.5 Southern hemisphere

For `lat < 0` seasons are shifted 182 days and may run past 31 December: each weather year carries the first 300 days of the
next one (`WeatherYear::head`), sowing windows search the extended calendar and winter crops resume growth in late August
instead of late February. `sow`/`harvest` are day indices from 1 January of the sowing year (> 365 means next year).
The final year of a southern pack has no continuation and is dropped rather than simulated truncated.

## 2. Quant engine (`quant.rs`)

Each of N paths is one possible future (default 2026-2050). All rotations are evaluated on the same paths.

### 2.1 Weather

* **Stationary bootstrap** (Politis & Romano 1994): geometric block lengths with mean 3 years; a block that reaches the
  last historical year restarts instead of wrapping around. Real simulated seasons are resampled, so the distribution
  of droughts and heat waves stays physical.
* **CMIP6 model per path**: uniform draw from `scenarios.<ssp>.perModel` (each with its own ΔT/ΔP trajectory and optional
  monthly shape). Without per-model data: ΔT and ΔP of 2050 are drawn from a skewed normal matched to the ensemble
  p10/p50/p90 (warm-dry correlation −0.5) and the ensemble trajectory is scaled to the draw.

### 2.2 Prices

Per crop, log-price deviation `x` follows an exact Ornstein-Uhlenbeck discretisation
`x_{t+1} = e^{-κ} x_t + σ sqrt((1-e^{-2κ})/(2κ)) ε_t`, price = mean · e^{drift·t} · exp(x - σ²/(4κ)) (the last term makes the
long-run *mean* price equal the drifting mean: no convexity drift). The drift is the inflation `inputs.drift`, shared with
costs; money is reported in today's dollars by default.

`ε` comes from a **Student-t copula** (ν = 5, Demarta & McNeil 2005): correlated Gaussians from the Cholesky factor of the
C11 `priceCorr` matrix (repaired to the nearest positive-definite correlation matrix by eigenvalue clipping if needed)
divided by a shared √(χ²_ν/ν), rescaled to unit variance. Marginals have excess kurtosis 6/(ν-4) and joint crashes are
likelier than under a Gaussian copula. Each crop's shock also contains `yieldCorr` × the standardised regional yield shock
(rain deficit and heat of the bootstrapped year plus the path's climate shift): a bad regional harvest raises prices, a
natural hedge for the farmer.

### 2.3 Costs

Index = GBM `exp((μ - σ²/2) t + σ W)` with `μ = drift (+ realDrift)`, times `1 + J`, where `J` is a compound-Poisson jump
state (probability `jumpProb` per year, Exp(mean `jumpSize`) size, share `jumpPersistence` carried to the next year). Jumps
are centred (divided by `1 + E[J]`): they add risk, not expected cost.

### 2.4 Metrics (per rotation)

Annual income fan p10/p50/p90; P(bad year) per year (`net < failNet`); VaR95 / CVaR95 of annual income (5 % quantile and tail
mean over all path-years) and of cumulative income at the horizon; **probability of ruin**
(`cash_t = reserve + Σ(net - debtService - livingCost) < 0` at any year-end; `debtService`, `livingCost` in $/ha/yr, default 0);
median maximum drawdown in $/ha and as a share of the running peak wealth; margin-year p10/p50/p90 (first year with more than
`failShare` bad years in a 5-year window); mean, sd, Sharpe-like `mean/sd`.
**Monte-Carlo standard errors** (batch means over 20 groups of paths) for the mean, VaR, CVaR and P(ruin).
`sensitivity: true` adds tornado rows: price volatility ×1.5, warming +0.5 °C, jump size ×2 (same random numbers).

### 2.5 Reproducibility and speed

Path `i` is seeded by splitmix64(`seed`, `i`) with ChaCha8: independent of the number of paths, of thread count and of the
rotations requested (common random numbers). Unique (rotation phase, weather year, climate bucket) seasons are simulated
once, in parallel (rayon on native), and looked up for every path.

## 3. Parameters (C11 `quant_params.json`)

Read by the server from `apps/web/public/data/quant_params.json` (or `FIELDSHIFT_QUANT_PARAMS`), passed as the 5th argument of
`quantSimulate` in WASM (the browser adapter fetches `/data/quant_params.json`), or inline as `params.quantParams` in
`POST /api/stress`. Missing file or crops fall back to literature defaults (FAO GIEWS / World Bank Pink Sheet: annual
log-price volatility 20-26 %, reversion 0.5-0.55 /yr, yield-price correlation −0.2…−0.3). Additions to C11 (all optional):
`inputs.vol`, `inputs.realDrift`, `inputs.jumpPersistence`.

## 4. Calibration report (`validate.rs`)

`validate(farm, observed, opts)` (WASM `validate`, `POST /api/validate`) simulates each crop every year and compares with the
C5 county yields: Pearson `r`, RMSE and bias (simulated − observed, t/ha), `calib` = mean observed / mean simulated
(informational) and the `[year, observed, simulated]` pairs. It never changes `meta.calib`.

## References

* Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998) *Crop evapotranspiration*, FAO Irrigation and Drainage Paper 56.
* Doorenbos, J., Kassam, A.H. (1979) *Yield response to water*, FAO Irrigation and Drainage Paper 33.
* Politis, D.N., Romano, J.P. (1994) The stationary bootstrap. *J. Am. Stat. Assoc.* 89, 1303-1313.
* Schlenker, W., Roberts, M.J. (2009) Nonlinear temperature effects indicate severe damages to U.S. crop yields under climate
  change. *PNAS* 106, 15594-15598.
* Ainsworth, E.A., Long, S.P. (2005) What have we learned from 15 years of free-air CO₂ enrichment (FACE)? *New Phytologist* 165, 351-372.
* Long, S.P., Ainsworth, E.A., Leakey, A.D.B., Nösberger, J., Ort, D.R. (2006) Food for thought: lower-than-expected crop yield
  stimulation with rising CO₂ concentrations. *Science* 312, 1918-1921.
* Leakey, A.D.B. (2009) Rising atmospheric CO₂ concentration and the future of C4 crops for food and fuel. *Proc. R. Soc. B* 276, 2333-2343.
* Demarta, S., McNeil, A.J. (2005) The t copula and related copulas. *Int. Stat. Review* 73, 111-129.
* Meinshausen, M. et al. (2020) The shared socio-economic pathway (SSP) greenhouse gas concentrations and their extensions to
  2500. *Geosci. Model Dev.* 13, 3571-3605.
* Marsaglia, G., Tsang, W.W. (2000) A simple method for generating gamma variables. *ACM TOMS* 26, 363-372.
