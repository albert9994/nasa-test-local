//! Monte Carlo quant engine (C3 `quantSimulate`, C11 parameters). Method notes and references: `docs/SCIENCE.md`.
//!
//! Every path is one possible future `fromYear..=toYear`:
//! * **weather**: stationary bootstrap (Politis & Romano 1994; geometric blocks, mean 3 years, no wrap-around) of the
//!   *real* simulated seasons of the pack. Each path draws one CMIP6 model (the pack's `perModel` trajectories, else a
//!   ΔT/ΔP pair drawn from the ensemble p10/p50/p90 with a warm-dry correlation) and follows its trajectory, its monthly
//!   shape and the SSP CO2 pathway to the horizon;
//! * **crop prices**: per-crop Ornstein-Uhlenbeck log-price (exact discretisation) toward a drifting long-run mean,
//!   shocks from a Student-t copula (nu = 5, Demarta & McNeil 2005) on a PSD-repaired C11 correlation matrix, plus a
//!   correlation with the regional yield shock (negative = natural hedge);
//! * **input costs**: geometric Brownian motion with drift plus a compound-Poisson jump process (fertiliser / energy
//!   spikes) whose effect persists and decays;
//! * **metrics**: income fan, P(bad year), VaR / CVaR 95 (annual and cumulative), probability of ruin with reserve, debt
//!   service and living costs, drawdown, margin year, and Monte-Carlo standard errors (batch means);
//! * **common random numbers**: path `i` is seeded from `(seed, i)` independently of the number of paths and of the
//!   rotations, and all rotations are evaluated on the *same* worlds, so differences between rotations are never noise.
//!
//! Scenario probabilities, not forecasts.

#![allow(clippy::needless_range_loop)] // fixed-size matrix algebra reads clearer with indices

use crate::climate::{quantile_sample, ModelTrajectory, MonthlyShift};
use crate::co2;
use crate::crops::{season_crop, CROP_IDS};
use crate::rotation::{phase_carry, start_fill};
use crate::season::{simulate_season_ctx, CarryOverContext};
use crate::stress::interp_series;
use crate::{
    par_map, round1, round2, round3, EngineError, PreparedFarm, ResolvedRotation, Result,
    RotationStep, ScenarioPoint, SimOptions,
};
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};

const N_CROPS: usize = CROP_IDS.len();

// ---- C11 model parameters ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropQuantParam {
    pub price_mean: f64,
    #[serde(default = "d_vol")]
    pub vol: f64,
    #[serde(default = "d_rev")]
    pub reversion: f64,
    #[serde(default = "d_ycorr")]
    pub yield_corr: f64,
}
fn d_vol() -> f64 {
    0.25
}
fn d_rev() -> f64 {
    0.50
}
fn d_ycorr() -> f64 {
    -0.30
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputCostParam {
    /// Annual nominal drift of input costs *and* of the long-run mean crop prices (shared inflation).
    #[serde(default = "d_drift")]
    pub drift: f64,
    /// Annual volatility of the input-cost index (GBM part).
    #[serde(default = "d_cvol")]
    pub vol: f64,
    /// Extra real drift of costs over prices (cost-price squeeze), per year.
    #[serde(default)]
    pub real_drift: f64,
    #[serde(default = "d_jprob")]
    pub jump_prob: f64,
    #[serde(default = "d_jsize")]
    pub jump_size: f64,
    /// Share of an input-cost jump that persists to the next year (the rest decays).
    #[serde(default = "d_jpersist")]
    pub jump_persistence: f64,
}
fn d_drift() -> f64 {
    0.03
}
fn d_cvol() -> f64 {
    0.06
}
fn d_jprob() -> f64 {
    0.05
}
fn d_jsize() -> f64 {
    0.40
}
fn d_jpersist() -> f64 {
    0.80
}
impl Default for InputCostParam {
    fn default() -> Self {
        Self {
            drift: d_drift(),
            vol: d_cvol(),
            real_drift: 0.0,
            jump_prob: d_jprob(),
            jump_size: d_jsize(),
            jump_persistence: d_jpersist(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantModel {
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub crops: BTreeMap<String, CropQuantParam>,
    /// Pairwise price correlations keyed `"a|b"`.
    #[serde(default)]
    pub price_corr: BTreeMap<String, f64>,
    #[serde(default)]
    pub inputs: InputCostParam,
}

impl QuantModel {
    /// Parses a C11 `quant_params.json`; crops missing from it keep the literature defaults.
    pub fn from_json(json: &str) -> Result<QuantModel> {
        let mut m: QuantModel = serde_json::from_str(json)
            .map_err(|e| EngineError::Data(format!("quant params: {e}")))?;
        let d = default_quant_model();
        for (k, v) in d.crops {
            m.crops.entry(k).or_insert(v);
        }
        for (k, v) in d.price_corr {
            m.price_corr.entry(k).or_insert(v);
        }
        if m.source.is_empty() {
            m.source = d.source;
        }
        Ok(m)
    }
}

/// Literature defaults (FAO GIEWS / World Bank price series) when no calibrated `quant_params.json` exists.
pub fn default_quant_model() -> QuantModel {
    let c = |price_mean, vol, reversion, yield_corr| CropQuantParam {
        price_mean,
        vol,
        reversion,
        yield_corr,
    };
    let crops = [
        ("maize", c(190.0, 0.24, 0.55, -0.32)),
        ("soybean", c(420.0, 0.22, 0.50, -0.28)),
        ("wheat", c(230.0, 0.23, 0.50, -0.25)),
        ("barley", c(200.0, 0.22, 0.52, -0.22)),
        ("sorghum", c(175.0, 0.24, 0.55, -0.28)),
        ("sunflower", c(430.0, 0.26, 0.48, -0.30)),
        ("pea", c(300.0, 0.20, 0.55, -0.20)),
        ("millet", c(260.0, 0.21, 0.55, -0.20)),
    ]
    .into_iter()
    .map(|(k, v)| (k.to_string(), v))
    .collect();
    let price_corr = [
        ("maize|wheat", 0.70),
        ("maize|soybean", 0.62),
        ("maize|sorghum", 0.82),
        ("wheat|barley", 0.78),
        ("soybean|sunflower", 0.65),
        ("soybean|pea", 0.58),
    ]
    .into_iter()
    .map(|(k, v)| (k.to_string(), v))
    .collect();
    QuantModel {
        source: "FAO GIEWS / World Bank Pink Sheet monthly prices 2000-2025".to_string(),
        crops,
        price_corr,
        inputs: InputCostParam::default(),
    }
}

// ---- C3 input / output ----

/// C3 `QuantParams` (+ optional extensions: all new fields default to the previous behaviour).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantConfig {
    #[serde(default = "d_paths")]
    pub paths: usize,
    #[serde(default = "d_from")]
    pub from_year: i32,
    #[serde(default = "d_to")]
    pub to_year: i32,
    #[serde(default = "d_ssp")]
    pub ssp: String,
    #[serde(default = "d_cash")]
    pub cash_reserve: f64,
    #[serde(default = "d_seed")]
    pub seed: u64,
    /// Annual debt service, $/ha/year in today's money (default 0).
    #[serde(default)]
    pub debt_service: f64,
    /// Annual household living costs drawn from the farm, $/ha/year in today's money (default 0).
    #[serde(default)]
    pub living_cost: f64,
    /// Also return the tornado `sensitivity` rows (re-runs the Monte Carlo 3 times).
    #[serde(default)]
    pub sensitivity: bool,
    /// Apply the SSP CO2 fertilisation pathway (default true; an explicit `opts.co2ppm` overrides it).
    #[serde(default = "d_true")]
    pub co2: bool,
    /// Report money in today's dollars (default true). `false` leaves the nominal inflated values.
    #[serde(default = "d_true")]
    pub real: bool,
    /// Mean block length of the stationary bootstrap, years.
    #[serde(default = "d_block")]
    pub block_years: f64,
    /// Degrees of freedom of the t copula (smaller = fatter joint tails). Clamped to 3..=60.
    #[serde(default = "d_nu")]
    pub t_df: f64,
}
fn d_paths() -> usize {
    1000
}
fn d_from() -> i32 {
    2026
}
fn d_to() -> i32 {
    2050
}
fn d_ssp() -> String {
    "ssp245".to_string()
}
fn d_cash() -> f64 {
    500.0
}
fn d_seed() -> u64 {
    42
}
fn d_true() -> bool {
    true
}
fn d_block() -> f64 {
    3.0
}
fn d_nu() -> f64 {
    5.0
}
impl Default for QuantConfig {
    fn default() -> Self {
        Self {
            paths: d_paths(),
            from_year: d_from(),
            to_year: d_to(),
            ssp: d_ssp(),
            cash_reserve: d_cash(),
            seed: d_seed(),
            debt_service: 0.0,
            living_cost: 0.0,
            sensitivity: false,
            co2: true,
            real: true,
            block_years: d_block(),
            t_df: d_nu(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IncomeFan {
    pub p10: Vec<f64>,
    pub p50: Vec<f64>,
    pub p90: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarginYearQuantiles {
    pub p10: Option<i32>,
    pub p50: Option<i32>,
    pub p90: Option<i32>,
}

/// Monte-Carlo standard errors (batch means over 20 groups of paths).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McStdErr {
    pub mean_annual: f64,
    pub var95: f64,
    pub cvar95: f64,
    pub p_ruin: f64,
}

/// One tornado bar: change of the headline metrics when one assumption is stressed (same random numbers).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SensitivityRow {
    /// `"priceVol"` (x1.5), `"warming"` (+0.5 C), `"costJumps"` (jump size x2).
    pub factor: String,
    pub label: String,
    pub delta_mean_annual: f64,
    pub delta_cvar95: f64,
    pub delta_p_ruin: f64,
}

/// C3 `QuantResult` (the first fields are the C3 contract; the rest are additive).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantResult {
    pub rotation: Vec<RotationStep>,
    pub years: Vec<i32>,
    pub income: IncomeFan,
    pub p_bad_year: Vec<f64>,
    /// 5 % quantile of annual income over all paths and years, $/ha.
    pub var95: f64,
    /// Mean annual income below `var95`.
    pub cvar95: f64,
    pub p_ruin: f64,
    pub max_drawdown_p50: f64,
    pub margin_year: MarginYearQuantiles,
    pub mean_annual: f64,
    pub sd_annual: f64,
    pub risk_adjusted: f64,
    // ---- additive ----
    /// Fan of cumulative income since `fromYear`, $/ha.
    pub cumulative: IncomeFan,
    /// 5 % quantile / tail mean of the cumulative income at the horizon, $/ha.
    pub var95_cum: f64,
    pub cvar95_cum: f64,
    /// Median of the maximum drawdown as a share (0..1) of the running peak wealth.
    pub max_drawdown_pct_p50: f64,
    /// Share of paths ruined by each year (cash below zero at least once so far).
    pub p_ruin_by_year: Vec<f64>,
    pub mc_se: McStdErr,
    pub mean_dt_end: f64,
    pub mean_co2_end: f64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sensitivity: Option<Vec<SensitivityRow>>,
}

// ---- random-number helpers ----

fn mix(seed: u64, i: u64) -> u64 {
    // splitmix64 of (seed, i): independent streams per path, whatever the thread count
    let mut z = seed
        .wrapping_add(i.wrapping_mul(0x9E37_79B9_7F4A_7C15))
        .wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

fn std_normal(rng: &mut ChaCha8Rng) -> f64 {
    let u1: f64 = rng.random::<f64>().max(1e-12);
    let u2: f64 = rng.random::<f64>();
    (-2.0 * u1.ln()).sqrt() * (std::f64::consts::TAU * u2).cos()
}

/// Gamma(shape, 1) sample (Marsaglia & Tsang 2000), shape >= 1.
fn gamma(rng: &mut ChaCha8Rng, shape: f64) -> f64 {
    let d = shape - 1.0 / 3.0;
    let c = 1.0 / (9.0 * d).sqrt();
    loop {
        let x = std_normal(rng);
        let v = (1.0 + c * x).powi(3);
        if v <= 0.0 {
            continue;
        }
        let u: f64 = rng.random::<f64>().max(1e-12);
        if u.ln() < 0.5 * x * x + d - d * v + d * v.ln() {
            return d * v;
        }
    }
}

fn norm_cdf(x: f64) -> f64 {
    // Abramowitz & Stegun 26.2.17 (|error| < 7.5e-8)
    let t = 1.0 / (1.0 + 0.231_641_9 * x.abs());
    let d = 0.398_942_280_4 * (-x * x / 2.0).exp();
    let p = d
        * t
        * (0.319_381_530
            + t * (-0.356_563_782
                + t * (1.781_477_937 + t * (-1.821_255_978 + t * 1.330_274_429))));
    if x >= 0.0 {
        1.0 - p
    } else {
        p
    }
}

// ---- price dependence ----

type Mat = [[f64; N_CROPS]; N_CROPS];

/// C11 price correlation matrix (default 0.30 between crops without a stated pair).
fn price_corr_matrix(model: &QuantModel) -> Mat {
    let mut corr = [[0.0; N_CROPS]; N_CROPS];
    for i in 0..N_CROPS {
        for j in 0..N_CROPS {
            corr[i][j] = if i == j { 1.0 } else { 0.30 };
        }
    }
    for (k, &v) in &model.price_corr {
        if let Some((a, b)) = k.split_once('|') {
            let ia = CROP_IDS.iter().position(|c| *c == a);
            let ib = CROP_IDS.iter().position(|c| *c == b);
            if let (Some(i), Some(j)) = (ia, ib) {
                let v = v.clamp(-0.95, 0.95);
                corr[i][j] = v;
                corr[j][i] = v;
            }
        }
    }
    corr
}

/// Eigen-decomposition of a symmetric matrix (cyclic Jacobi). Returns (eigenvalues, eigenvectors as columns).
fn jacobi_eigen(a: &Mat) -> ([f64; N_CROPS], Mat) {
    let mut m = *a;
    let mut v = [[0.0; N_CROPS]; N_CROPS];
    for (i, row) in v.iter_mut().enumerate() {
        row[i] = 1.0;
    }
    for _ in 0..60 {
        let mut off = 0.0;
        for i in 0..N_CROPS {
            for j in (i + 1)..N_CROPS {
                off += m[i][j] * m[i][j];
            }
        }
        if off < 1e-22 {
            break;
        }
        for p in 0..N_CROPS {
            for q in (p + 1)..N_CROPS {
                if m[p][q].abs() < 1e-15 {
                    continue;
                }
                let theta = (m[q][q] - m[p][p]) / (2.0 * m[p][q]);
                let t = if theta == 0.0 {
                    1.0
                } else {
                    theta.signum() / (theta.abs() + (theta * theta + 1.0).sqrt())
                };
                let c = 1.0 / (t * t + 1.0).sqrt();
                let s = t * c;
                for k in 0..N_CROPS {
                    let (mkp, mkq) = (m[k][p], m[k][q]);
                    m[k][p] = c * mkp - s * mkq;
                    m[k][q] = s * mkp + c * mkq;
                }
                for k in 0..N_CROPS {
                    let (mpk, mqk) = (m[p][k], m[q][k]);
                    m[p][k] = c * mpk - s * mqk;
                    m[q][k] = s * mpk + c * mqk;
                }
                for k in 0..N_CROPS {
                    let (vkp, vkq) = (v[k][p], v[k][q]);
                    v[k][p] = c * vkp - s * vkq;
                    v[k][q] = s * vkp + c * vkq;
                }
            }
        }
    }
    let mut ev = [0.0; N_CROPS];
    for i in 0..N_CROPS {
        ev[i] = m[i][i];
    }
    (ev, v)
}

/// Nearest positive-definite correlation matrix: clip eigenvalues at `eps`, rebuild and renormalise the diagonal
/// (repeated a few times, a light version of Higham's alternating projections). Identity-safe.
pub fn nearest_psd_corr(corr: &Mat, eps: f64) -> Mat {
    let mut c = *corr;
    for _ in 0..30 {
        let (ev, v) = jacobi_eigen(&c);
        if ev.iter().all(|&e| e >= eps * 0.999) {
            break;
        }
        let mut r = [[0.0; N_CROPS]; N_CROPS];
        for i in 0..N_CROPS {
            for j in 0..N_CROPS {
                r[i][j] = (0..N_CROPS)
                    .map(|k| v[i][k] * ev[k].max(eps) * v[j][k])
                    .sum();
            }
        }
        let d: Vec<f64> = (0..N_CROPS).map(|i| r[i][i].max(1e-12).sqrt()).collect();
        for i in 0..N_CROPS {
            for j in 0..N_CROPS {
                c[i][j] = if i == j { 1.0 } else { r[i][j] / (d[i] * d[j]) };
            }
        }
    }
    c
}

fn cholesky(m: &Mat) -> Option<Mat> {
    let mut l = [[0.0; N_CROPS]; N_CROPS];
    for i in 0..N_CROPS {
        for j in 0..=i {
            let s: f64 = (0..j).map(|k| l[i][k] * l[j][k]).sum();
            if i == j {
                let d = m[i][i] - s;
                if d <= 1e-10 {
                    return None;
                }
                l[i][j] = d.sqrt();
            } else {
                l[i][j] = (m[i][j] - s) / l[j][j];
            }
        }
    }
    Some(l)
}

/// Lower-triangular Cholesky factor of the (PSD-repaired) crop price correlation matrix.
fn cholesky_corr(model: &QuantModel) -> Mat {
    let fixed = nearest_psd_corr(&price_corr_matrix(model), 1e-6);
    cholesky(&fixed).unwrap_or_else(|| {
        let mut id = [[0.0; N_CROPS]; N_CROPS];
        for (i, row) in id.iter_mut().enumerate() {
            row[i] = 1.0;
        }
        id
    })
}

/// One year of correlated, unit-variance, fat-tailed shocks from a Student-t copula with `nu` degrees of freedom:
/// `T = Z / sqrt(W/nu)`, `Z = L eps`, `W ~ chi2(nu)`, rescaled to unit variance. All crops share the same `W`, which
/// produces the joint tail dependence that a Gaussian copula lacks (Demarta & McNeil 2005).
fn t_copula_shocks(rng: &mut ChaCha8Rng, chol: &Mat, nu: f64) -> [f64; N_CROPS] {
    let indep: [f64; N_CROPS] = std::array::from_fn(|_| std_normal(rng));
    let w = 2.0 * gamma(rng, nu / 2.0) / nu; // chi2(nu) / nu
    let scale = ((nu - 2.0) / nu).sqrt() / w.sqrt();
    let mut out = [0.0; N_CROPS];
    for i in 0..N_CROPS {
        let z: f64 = (0..=i).map(|j| chol[i][j] * indep[j]).sum();
        out[i] = z * scale;
    }
    out
}

// ---- weather: stationary bootstrap ----

/// Stationary bootstrap of `n_years` indices into `0..n_hist` (Politis & Romano 1994): a block continues with
/// probability `1 - 1/mean_block`, otherwise a new random start; blocks never wrap around the end of the record
/// (hitting the end forces a restart).
fn stationary_bootstrap(
    rng: &mut ChaCha8Rng,
    n_hist: usize,
    n_years: usize,
    mean_block: f64,
) -> Vec<usize> {
    let p_new = (1.0 / mean_block.max(1.0)).clamp(0.0, 1.0);
    let mut out = Vec::with_capacity(n_years);
    let mut cur = rng.random_range(0..n_hist);
    out.push(cur);
    while out.len() < n_years {
        let restart = cur + 1 >= n_hist || rng.random::<f64>() < p_new;
        cur = if restart {
            rng.random_range(0..n_hist)
        } else {
            cur + 1
        };
        out.push(cur);
    }
    out
}

/// z-scores of the growing-season rain and heat of each historical year and the scale of each.
struct HistClimate {
    z_rain: Vec<f64>,
    z_heat: Vec<f64>,
    mean_rain: f64,
    sd_rain: f64,
    sd_heat: f64,
}

fn hist_climate(farm: &PreparedFarm) -> HistClimate {
    let south = farm.meta.lat < 0.0;
    let (r0, r1, h0, h1) = if south {
        (272, 455, 332, 420)
    } else {
        (90, 273, 150, 240)
    };
    let raw: Vec<(f64, f64)> = farm
        .years
        .iter()
        .filter_map(|y| farm.weather_by_year.get(y))
        .map(|w| {
            let n = w.span_days();
            let rain: f64 = (r0.min(n)..r1.min(n)).map(|d| w.day(d).prcp).sum();
            let hs = h0.min(n);
            let he = h1.min(n);
            let tmax = if he > hs {
                (hs..he).map(|d| w.day(d).tmax).sum::<f64>() / (he - hs) as f64
            } else {
                25.0
            };
            (rain, tmax)
        })
        .collect();
    let n = raw.len().max(1) as f64;
    let mr = raw.iter().map(|r| r.0).sum::<f64>() / n;
    let mt = raw.iter().map(|r| r.1).sum::<f64>() / n;
    let sr = (raw.iter().map(|r| (r.0 - mr).powi(2)).sum::<f64>() / n)
        .sqrt()
        .max(20.0);
    let st = (raw.iter().map(|r| (r.1 - mt).powi(2)).sum::<f64>() / n)
        .sqrt()
        .max(0.8);
    HistClimate {
        z_rain: raw.iter().map(|r| (r.0 - mr) / sr).collect(),
        z_heat: raw.iter().map(|r| (r.1 - mt) / st).collect(),
        mean_rain: mr,
        sd_rain: sr,
        sd_heat: st,
    }
}

// ---- stochastic worlds ----

#[derive(Clone)]
struct WorldYear {
    hist_idx: usize,
    /// Total ΔT / ΔP of the year (user shift + CMIP6 path), annual means.
    d_t: f64,
    d_p: f64,
    /// Index into `Scenario::shapes` (monthly shape) or `usize::MAX` for a uniform shift.
    shape: usize,
    co2: f64,
    /// Price of every crop in `CROP_IDS` order, nominal $/t.
    prices: [f64; N_CROPS],
    cost_mult: f64,
    /// Deflator to today's dollars (1 when `real` is off).
    deflator: f64,
}

/// Everything the world generator needs, resolved once per `quant_simulate` call.
struct Scenario {
    models: Vec<ModelTrajectory>,
    /// Ensemble series for the fallback (no per-model data).
    series: Vec<ScenarioPoint>,
    /// Monthly shapes: the pack's (if any), then one per model that has its own.
    shapes: Vec<MonthlyShift>,
    model_shape: Vec<usize>,
    ens_shape: usize,
    /// (dT p10, p50, p90, dP p10, p50, p90) of the 2050 horizon.
    spread: (f64, f64, f64, f64, f64, f64),
    hist: HistClimate,
}

fn resolve_scenario(farm: &PreparedFarm, opts: &SimOptions, cfg: &QuantConfig) -> Scenario {
    let series = farm.scenario_series(&cfg.ssp);
    let models = farm.scenario_models(&cfg.ssp);
    let mut shapes = Vec::new();
    let pack_shape = farm
        .scenario_monthly(&cfg.ssp)
        .or_else(|| opts.monthly.clone());
    let ens_shape = pack_shape.map_or(usize::MAX, |s| {
        shapes.push(s);
        shapes.len() - 1
    });
    let model_shape: Vec<usize> = models
        .iter()
        .map(|m| match &m.monthly {
            Some(s) => {
                shapes.push(s.clone());
                shapes.len() - 1
            }
            None => ens_shape,
        })
        .collect();
    let ens50 = interp_series(&series, 2050);
    let sp = farm.scenario_spread_2050(&cfg.ssp);
    let (t10, t90, p10, p90) = sp.unwrap_or((ens50.d_t - 0.6, ens50.d_t + 0.7, -0.05, 0.05));
    Scenario {
        models,
        series,
        shapes,
        model_shape,
        ens_shape,
        spread: (t10, ens50.d_t, t90, p10, ens50.d_p, p90),
        hist: hist_climate(farm),
    }
}

struct PriceParams {
    mean: [f64; N_CROPS],
    /// exp(-kappa)
    phi: [f64; N_CROPS],
    /// Innovation scale of the exact OU discretisation: sigma * sqrt((1 - e^{-2k}) / 2k).
    innov: [f64; N_CROPS],
    /// Stationary standard deviation sigma / sqrt(2k).
    stat_sd: [f64; N_CROPS],
    rho_y: [f64; N_CROPS],
}

fn price_params(farm: &PreparedFarm, opts: &SimOptions, model: &QuantModel) -> PriceParams {
    let mut p = PriceParams {
        mean: [0.0; N_CROPS],
        phi: [0.0; N_CROPS],
        innov: [0.0; N_CROPS],
        stat_sd: [0.0; N_CROPS],
        rho_y: [-0.3; N_CROPS],
    };
    for (i, id) in CROP_IDS.iter().enumerate() {
        let Ok(c) = season_crop(id) else { continue };
        let q = model.crops.get(*id);
        p.mean[i] = opts
            .prices
            .get(*id)
            .or_else(|| farm.meta.prices.get(*id))
            .copied()
            .or_else(|| q.map(|q| q.price_mean))
            .unwrap_or(c.default_price_usd_t);
        let (kappa, sigma) = match q {
            Some(q) => {
                p.rho_y[i] = q.yield_corr.clamp(-0.85, 0.85);
                (q.reversion.clamp(0.05, 3.0), q.vol.clamp(0.05, 0.65))
            }
            None => (0.5, 0.25),
        };
        p.phi[i] = (-kappa).exp();
        p.innov[i] = sigma * ((1.0 - (-2.0 * kappa).exp()) / (2.0 * kappa)).sqrt();
        p.stat_sd[i] = sigma / (2.0 * kappa).sqrt();
    }
    p
}

struct WorldCtx<'a> {
    cfg: &'a QuantConfig,
    opts: &'a SimOptions,
    model: &'a QuantModel,
    years: &'a [i32],
    sc: &'a Scenario,
    pp: PriceParams,
    chol: Mat,
    n_hist: usize,
    nu: f64,
}

/// One path (independent of every other path and of the number of paths).
fn build_path(ctx: &WorldCtx, path_idx: usize) -> Vec<WorldYear> {
    let (cfg, sc) = (ctx.cfg, ctx.sc);
    let n_years = ctx.years.len();
    let mut rng = ChaCha8Rng::seed_from_u64(mix(cfg.seed, path_idx as u64));

    // --- climate model of this path ---
    let (series, shape): (Vec<ScenarioPoint>, usize) = if !sc.models.is_empty() {
        let k = rng.random_range(0..sc.models.len());
        (sc.models[k].series.clone(), sc.model_shape[k])
    } else {
        // fit a skewed normal to the ensemble p10/p50/p90 of 2050 and scale the ensemble trajectory to the draw;
        // warmer models are drier in the mid-latitudes: correlation -0.5 between the two draws
        let (t10, t50, t90, p10, p50, p90) = sc.spread;
        let zt = std_normal(&mut rng);
        let zp = -0.5 * zt + (1.0f64 - 0.25).sqrt() * std_normal(&mut rng);
        let dt = quantile_sample(t10, t50, t90, norm_cdf(zt));
        let dp = quantile_sample(p10, p50, p90, norm_cdf(zp));
        let kt = if t50.abs() > 0.05 { dt / t50 } else { 1.0 };
        let kp = if p50.abs() > 0.004 { dp / p50 } else { 1.0 };
        (
            sc.series
                .iter()
                .map(|p| ScenarioPoint {
                    year: p.year,
                    d_t: p.d_t * kt,
                    d_p: p.d_p * kp,
                })
                .collect(),
            sc.ens_shape,
        )
    };

    // --- weather years: stationary bootstrap, no wrap-around ---
    let boot = stationary_bootstrap(&mut rng, ctx.n_hist, n_years, cfg.block_years);

    // --- prices / costs ---
    let pp = &ctx.pp;
    let inp = &ctx.model.inputs;
    let sh0 = t_copula_shocks(&mut rng, &ctx.chol, ctx.nu);
    let mut x = [0.0_f64; N_CROPS]; // log(price / drifting mean): starts in the stationary law
    for i in 0..N_CROPS {
        x[i] = pp.stat_sd[i] * sh0[i];
    }
    let mut ln_cost = 0.0_f64;
    let mut jump = 0.0_f64;
    let persist = inp.jump_persistence.clamp(0.0, 0.99);
    let jp = inp.jump_prob.clamp(0.0, 0.5);
    let js = inp.jump_size.clamp(0.0, 1.5);
    // centring so that jumps add risk, not expected cost
    let e_jump = jp * js / (1.0 - persist);
    let cost_drift = inp.drift + inp.real_drift;
    let cvol = inp.vol.clamp(0.0, 0.5);

    let mut out = Vec::with_capacity(n_years);
    for (t, &yr) in ctx.years.iter().enumerate() {
        let sp = interp_series(&series, yr);
        let d_t = ctx.opts.d_t + sp.d_t;
        let d_p = ((1.0 + ctx.opts.d_p) * (1.0 + sp.d_p) - 1.0).clamp(-0.75, 0.6);

        let hist_idx = boot[t].min(sc.hist.z_rain.len().saturating_sub(1));
        // regional yield shock: historical year plus the persistent climate shift in standard deviations
        let zr = sc.hist.z_rain.get(hist_idx).copied().unwrap_or(0.0)
            + d_p * sc.hist.mean_rain / sc.hist.sd_rain;
        let zh = sc.hist.z_heat.get(hist_idx).copied().unwrap_or(0.0) + d_t / sc.hist.sd_heat;
        let z_yield = ((zr - 0.7 * zh) / 1.3).clamp(-3.0, 3.0);

        let sh = t_copula_shocks(&mut rng, &ctx.chol, ctx.nu);
        let drift_t = ((t + 1) as f64 * inp.drift).exp();
        let mut prices = [0.0; N_CROPS];
        for i in 0..N_CROPS {
            if CROP_IDS[i] == "fallow" {
                continue;
            }
            let rho = pp.rho_y[i];
            let shock = rho * z_yield + (1.0 - rho * rho).sqrt() * sh[i];
            x[i] = pp.phi[i] * x[i] + pp.innov[i] * shock;
            // E[exp(x)] = exp(var/2): centre so the long-run mean price is exactly the (drifting) mean
            let centred = x[i] - 0.5 * pp.stat_sd[i] * pp.stat_sd[i];
            prices[i] = pp.mean[i] * drift_t * centred.exp().clamp(0.30, 3.5);
        }

        // costs: GBM (mean-preserving) + persistent compound-Poisson jumps
        ln_cost += cost_drift - 0.5 * cvol * cvol + cvol * std_normal(&mut rng);
        if rng.random::<f64>() < jp {
            let size = -js * (1.0 - rng.random::<f64>()).max(1e-12).ln(); // Exp(mean = js)
            jump = jump * persist + size.min(1.5);
        } else {
            jump *= persist;
        }
        let cost_mult = ln_cost.exp() * (1.0 + jump) / (1.0 + e_jump);

        let co2_ppm = match ctx.opts.co2_ppm {
            Some(v) => v,
            None if cfg.co2 => co2::ssp_co2_ppm(&cfg.ssp, yr),
            None => co2::CO2_REFERENCE_PPM,
        };
        out.push(WorldYear {
            hist_idx,
            d_t,
            d_p,
            shape,
            co2: co2_ppm,
            prices,
            cost_mult,
            deflator: if cfg.real {
                (-(t as f64 + 1.0) * inp.drift).exp()
            } else {
                1.0
            },
        });
    }
    out
}

fn build_worlds(
    farm: &PreparedFarm,
    opts: &SimOptions,
    cfg: &QuantConfig,
    model: &QuantModel,
    sc: &Scenario,
    years: &[i32],
) -> Vec<Vec<WorldYear>> {
    let n_paths = cfg.paths.clamp(10, 20_000);
    let ctx = WorldCtx {
        cfg,
        opts,
        model,
        years,
        sc,
        pp: price_params(farm, opts, model),
        chol: cholesky_corr(model),
        n_hist: farm.years.len().max(1),
        nu: cfg.t_df.clamp(3.0, 60.0),
    };
    let idx: Vec<usize> = (0..n_paths).collect();
    par_map(&idx, |&i| build_path(&ctx, i))
}

// ---- evaluation ----

fn percentile_sorted(sorted: &[f64], q: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((sorted.len() - 1) as f64 * q).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

fn crop_index(id: &str) -> usize {
    CROP_IDS.iter().position(|c| *c == id).unwrap_or(0)
}

/// Season cache key: phase, historical year, dT bucket (0.25 C), dP bucket (0.02), monthly shape, CO2 bucket (25 ppm).
type SeasonKey = (usize, usize, i32, i32, usize, i32);

fn season_key(s: usize, wy: &WorldYear) -> SeasonKey {
    (
        s,
        wy.hist_idx,
        (wy.d_t * 4.0).round() as i32,
        (wy.d_p * 50.0).round() as i32,
        wy.shape,
        (wy.co2 / 25.0).round() as i32,
    )
}

/// 5 % VaR and CVaR of a (mutable, to be sorted) sample.
fn var_cvar(v: &mut [f64]) -> (f64, f64) {
    v.sort_unstable_by(f64::total_cmp);
    let var = percentile_sorted(v, 0.05);
    let cut = v.partition_point(|&x| x <= var);
    let tail = &v[..cut.max(1).min(v.len())];
    (var, tail.iter().sum::<f64>() / tail.len().max(1) as f64)
}

/// Net income per path-year, flattened `[path][year]`, for one rotation.
struct PathNets {
    nets: Vec<f64>,
    n_years: usize,
}

fn rotation_nets(
    farm: &PreparedFarm,
    rot: &ResolvedRotation,
    opts: &SimOptions,
    sc: &Scenario,
    years: &[i32],
    worlds: &[Vec<WorldYear>],
) -> PathNets {
    let k = rot.steps.len();
    let carry = phase_carry(farm, rot);
    let crop_idx: Vec<usize> = rot.crops.iter().map(|c| crop_index(c.id)).collect();
    let n_years = years.len();

    // stage 1: the unique (phase, weather year, climate bucket) seasons of this rotation, simulated in parallel
    let mut keys: HashSet<SeasonKey> = HashSet::new();
    for path in worlds {
        for (t, wy) in path.iter().enumerate() {
            for p in 0..k {
                keys.insert(season_key((t + p) % k, wy));
            }
        }
    }
    let keys: Vec<SeasonKey> = keys.into_iter().collect();
    let sims: Vec<(f64, f64)> = par_map(&keys, |&(s, hi, tb, pb, shape, cb)| {
        let hist_year = farm.years[hi];
        let Some(w) = farm.weather_by_year.get(&hist_year) else {
            return (0.0, 0.0);
        };
        let (d_t, d_p) = (f64::from(tb) / 4.0, f64::from(pb) / 50.0);
        let mut o = SimOptions {
            co2_ppm: Some(f64::from(cb) * 25.0),
            ..opts.clone()
        };
        if shape == usize::MAX {
            o.d_t = d_t;
            o.d_p = d_p;
            o.monthly = None;
        } else {
            o.d_t = 0.0;
            o.d_p = 0.0;
            o.monthly = Some(sc.shapes[shape].scaled_to(d_t, d_p));
        }
        let gwet = farm.year_mean_gwet_anomaly(w);
        let ctx = CarryOverContext {
            initial_fill: start_fill(farm, 0.72, w.off_season_precip_shifted(&o), gwet, &carry[s]),
            rotation_factor: carry[s].rotation_factor,
            cost_delta_usd_ha: carry[s].cost_delta_usd_ha,
        };
        let r = simulate_season_ctx(farm, rot.crops[s], w, &o, false, ctx);
        (r.yield_t_ha, r.cost)
    });
    let table: HashMap<SeasonKey, (f64, f64)> = keys.into_iter().zip(sims).collect();

    // stage 2: income of every path (revenue at the path's prices, cost at the path's input-cost index)
    let idx: Vec<usize> = (0..worlds.len()).collect();
    let rows: Vec<Vec<f64>> = par_map(&idx, |&pi| {
        worlds[pi]
            .iter()
            .enumerate()
            .map(|(t, wy)| {
                let mut sum = 0.0;
                for p in 0..k {
                    let s = (t + p) % k;
                    let (y, cost) = table[&season_key(s, wy)];
                    sum += y * wy.prices[crop_idx[s]] - cost * wy.cost_mult;
                }
                round1(sum / k as f64 * wy.deflator)
            })
            .collect()
    });
    PathNets {
        nets: rows.into_iter().flatten().collect(),
        n_years,
    }
}

/// Headline statistics of the paths `lo..hi`: (mean annual, VaR95, CVaR95, P(ruin)).
fn headline(pn: &PathNets, ruined: &[bool], lo: usize, hi: usize) -> (f64, f64, f64, f64) {
    let ny = pn.n_years;
    let mut v: Vec<f64> = pn.nets[lo * ny..hi * ny].to_vec();
    let mean = v.iter().sum::<f64>() / v.len().max(1) as f64;
    let (var, cvar) = var_cvar(&mut v);
    let pr = ruined[lo..hi].iter().filter(|&&r| r).count() as f64 / (hi - lo).max(1) as f64;
    (mean, var, cvar, pr)
}

fn std_err(vals: &[f64]) -> f64 {
    let b = vals.len() as f64;
    if vals.len() < 2 {
        return 0.0;
    }
    let m = vals.iter().sum::<f64>() / b;
    let var = vals.iter().map(|v| (v - m).powi(2)).sum::<f64>() / (b - 1.0);
    (var / b).sqrt()
}

fn evaluate_rotation(
    rot: &ResolvedRotation,
    opts: &SimOptions,
    cfg: &QuantConfig,
    years: &[i32],
    worlds: &[Vec<WorldYear>],
    pn: &PathNets,
) -> QuantResult {
    let n_paths = worlds.len();
    let ny = years.len();
    let outflow = cfg.debt_service + cfg.living_cost;

    // per path: wealth path (reserve + net - debt - living), drawdown, ruin, margin year
    let mut annual: Vec<Vec<f64>> = vec![Vec::with_capacity(n_paths); ny];
    let mut cum_cols: Vec<Vec<f64>> = vec![Vec::with_capacity(n_paths); ny];
    let mut horizon_cum = Vec::with_capacity(n_paths);
    let mut dd_abs = Vec::with_capacity(n_paths);
    let mut dd_pct = Vec::with_capacity(n_paths);
    let mut ruined = vec![false; n_paths];
    let mut ruin_first = vec![usize::MAX; n_paths];
    let mut margin_years: Vec<Option<i32>> = Vec::with_capacity(n_paths);

    for p in 0..n_paths {
        let row = &pn.nets[p * ny..(p + 1) * ny];
        let (mut cash, mut peak) = (cfg.cash_reserve, cfg.cash_reserve);
        let (mut max_dd, mut max_dd_pct, mut cum) = (0.0_f64, 0.0_f64, 0.0_f64);
        let mut bad = Vec::with_capacity(ny);
        let mut crossed = None;
        for (t, &net) in row.iter().enumerate() {
            annual[t].push(net);
            cum += net;
            cum_cols[t].push(cum);
            cash += net - outflow;
            peak = peak.max(cash);
            let dd = peak - cash;
            max_dd = max_dd.max(dd);
            if peak > 1e-9 {
                max_dd_pct = max_dd_pct.max(dd / peak);
            }
            if cash < 0.0 && !ruined[p] {
                ruined[p] = true;
                ruin_first[p] = t;
            }
            bad.push(net < opts.fail_net);
            if crossed.is_none() && t >= 4 {
                let fails = bad[t - 4..=t].iter().filter(|&&b| b).count();
                if fails as f64 / 5.0 > opts.fail_share {
                    crossed = Some(years[t]);
                }
            }
        }
        horizon_cum.push(cum);
        dd_abs.push(max_dd);
        dd_pct.push(max_dd_pct.min(1.0));
        margin_years.push(crossed);
    }

    let (mut p10, mut p50, mut p90, mut p_bad) = (vec![], vec![], vec![], vec![]);
    for col in &mut annual {
        p_bad.push(round3(
            col.iter().filter(|&&v| v < opts.fail_net).count() as f64 / n_paths as f64,
        ));
        col.sort_unstable_by(f64::total_cmp);
        p10.push(round1(percentile_sorted(col, 0.10)));
        p50.push(round1(percentile_sorted(col, 0.50)));
        p90.push(round1(percentile_sorted(col, 0.90)));
    }
    let (mut c10, mut c50, mut c90) = (vec![], vec![], vec![]);
    for col in &mut cum_cols {
        col.sort_unstable_by(f64::total_cmp);
        c10.push(round1(percentile_sorted(col, 0.10)));
        c50.push(round1(percentile_sorted(col, 0.50)));
        c90.push(round1(percentile_sorted(col, 0.90)));
    }
    let ruin_by_year: Vec<f64> = (0..ny)
        .map(|t| round3(ruin_first.iter().filter(|&&f| f <= t).count() as f64 / n_paths as f64))
        .collect();

    let (mean, var95, cvar95, p_ruin) = headline(pn, &ruined, 0, n_paths);
    let n = (n_paths * ny).max(1) as f64;
    let sd = (pn.nets.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n).sqrt();
    let (var_cum, cvar_cum) = var_cvar(&mut horizon_cum);

    // Monte-Carlo standard errors by batch means (paths are iid)
    let n_batches = 20.min(n_paths / 5).max(2);
    let mut parts: [Vec<f64>; 4] = [vec![], vec![], vec![], vec![]];
    for b in 0..n_batches {
        let (lo, hi) = (b * n_paths / n_batches, (b + 1) * n_paths / n_batches);
        let h = headline(pn, &ruined, lo, hi);
        parts[0].push(h.0);
        parts[1].push(h.1);
        parts[2].push(h.2);
        parts[3].push(h.3);
    }

    dd_abs.sort_unstable_by(f64::total_cmp);
    dd_pct.sort_unstable_by(f64::total_cmp);
    let mut crossed: Vec<i32> = margin_years.iter().flatten().copied().collect();
    crossed.sort_unstable();
    let share = crossed.len() as f64 / n_paths as f64;
    let my_q = |q: f64| -> Option<i32> {
        (share > q && !crossed.is_empty()).then(|| {
            let idx = ((q / share) * (crossed.len() - 1) as f64).floor() as usize;
            crossed[idx.min(crossed.len() - 1)]
        })
    };
    let mean_dt_end = worlds.iter().map(|w| w[ny - 1].d_t).sum::<f64>() / n_paths as f64;
    let mean_co2_end = worlds.iter().map(|w| w[ny - 1].co2).sum::<f64>() / n_paths as f64;

    QuantResult {
        rotation: rot.steps.clone(),
        years: years.to_vec(),
        income: IncomeFan { p10, p50, p90 },
        p_bad_year: p_bad,
        var95: round1(var95),
        cvar95: round1(cvar95),
        p_ruin: round3(p_ruin),
        max_drawdown_p50: round1(percentile_sorted(&dd_abs, 0.5)),
        margin_year: MarginYearQuantiles {
            p10: my_q(0.10),
            p50: my_q(0.50),
            p90: my_q(0.90),
        },
        mean_annual: round1(mean),
        sd_annual: round1(sd),
        risk_adjusted: round2(mean / sd.max(1e-9)),
        cumulative: IncomeFan {
            p10: c10,
            p50: c50,
            p90: c90,
        },
        var95_cum: round1(var_cum),
        cvar95_cum: round1(cvar_cum),
        max_drawdown_pct_p50: round3(percentile_sorted(&dd_pct, 0.5)),
        p_ruin_by_year: ruin_by_year,
        mc_se: McStdErr {
            mean_annual: round2(std_err(&parts[0])),
            var95: round2(std_err(&parts[1])),
            cvar95: round2(std_err(&parts[2])),
            p_ruin: round3(std_err(&parts[3])),
        },
        mean_dt_end: round2(mean_dt_end),
        mean_co2_end: round1(mean_co2_end),
        sensitivity: None,
    }
}

fn run_once(
    farm: &PreparedFarm,
    resolved: &[ResolvedRotation],
    opts: &SimOptions,
    cfg: &QuantConfig,
    model: &QuantModel,
    years: &[i32],
) -> Vec<QuantResult> {
    let sc = resolve_scenario(farm, opts, cfg);
    let worlds = build_worlds(farm, opts, cfg, model, &sc, years);
    resolved
        .iter()
        .map(|rot| {
            let pn = rotation_nets(farm, rot, opts, &sc, years, &worlds);
            evaluate_rotation(rot, opts, cfg, years, &worlds, &pn)
        })
        .collect()
}

/// Runs the Monte Carlo for one or more rotations on shared worlds (reproducible for a fixed `seed`).
pub fn quant_simulate(
    farm: &PreparedFarm,
    rotations: &[Vec<RotationStep>],
    opts: &SimOptions,
    cfg: &QuantConfig,
    model: Option<&QuantModel>,
) -> Result<Vec<QuantResult>> {
    let resolved: Vec<ResolvedRotation> = rotations
        .iter()
        .map(|r| ResolvedRotation::new(r))
        .collect::<Result<_>>()?;
    let default = default_quant_model();
    let model = model.unwrap_or(&default);
    let from = cfg.from_year.min(cfg.to_year);
    let to = cfg.to_year.max(from);
    let years: Vec<i32> = (from..=to).collect();

    let mut results = run_once(farm, &resolved, opts, cfg, model, &years);
    if cfg.sensitivity {
        // tornado: same seeds, one assumption stressed at a time
        let mut vol_model = model.clone();
        for c in vol_model.crops.values_mut() {
            c.vol = (c.vol * 1.5).min(0.65);
        }
        let warm_opts = SimOptions {
            d_t: opts.d_t + 0.5,
            ..opts.clone()
        };
        let mut jump_model = model.clone();
        jump_model.inputs.jump_size = (jump_model.inputs.jump_size * 2.0).min(1.5);
        let runs = [
            ("priceVol", "Price volatility x1.5", opts, &vol_model),
            ("warming", "Warming +0.5 °C", &warm_opts, model),
            ("costJumps", "Input cost jumps x2", opts, &jump_model),
        ];
        let mut rows: Vec<Vec<SensitivityRow>> = vec![Vec::new(); results.len()];
        for (factor, label, o, m) in runs {
            let alt = run_once(farm, &resolved, o, cfg, m, &years);
            for (i, a) in alt.iter().enumerate() {
                rows[i].push(SensitivityRow {
                    factor: factor.to_string(),
                    label: label.to_string(),
                    delta_mean_annual: round1(a.mean_annual - results[i].mean_annual),
                    delta_cvar95: round1(a.cvar95 - results[i].cvar95),
                    delta_p_ruin: round3(a.p_ruin - results[i].p_ruin),
                });
            }
        }
        for (r, s) in results.iter_mut().zip(rows) {
            r.sensitivity = Some(s);
        }
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prepare_farm_json;

    fn iowa() -> PreparedFarm {
        let p = format!(
            "{}/../../apps/web/public/data/mock/farms/iowa.json",
            env!("CARGO_MANIFEST_DIR")
        );
        prepare_farm_json(&std::fs::read_to_string(p).expect("mock pack")).expect("prepare")
    }

    fn rot(c: &[&str]) -> Vec<RotationStep> {
        c.iter().map(|s| RotationStep::new(*s, false)).collect()
    }

    fn cfg(paths: usize) -> QuantConfig {
        QuantConfig {
            paths,
            from_year: 2026,
            to_year: 2045,
            ..Default::default()
        }
    }

    #[test]
    fn cholesky_is_valid() {
        let l = cholesky_corr(&default_quant_model());
        for i in 0..N_CROPS {
            let norm: f64 = (0..=i).map(|j| l[i][j] * l[i][j]).sum();
            assert!((norm - 1.0).abs() < 1e-9, "row {i}: {norm}");
        }
    }

    #[test]
    fn non_psd_matrix_is_repaired_to_the_nearest_psd() {
        let mut m = default_quant_model();
        // 0.9 / 0.9 / -0.9 triangle cannot be a correlation matrix
        m.price_corr.insert("maize|wheat".into(), 0.9);
        m.price_corr.insert("wheat|barley".into(), 0.9);
        m.price_corr.insert("maize|barley".into(), -0.9);
        let raw = price_corr_matrix(&m);
        assert!(cholesky(&raw).is_none(), "test matrix must be indefinite");
        let fixed = nearest_psd_corr(&raw, 1e-6);
        assert!(cholesky(&fixed).is_some());
        for i in 0..N_CROPS {
            assert!((fixed[i][i] - 1.0).abs() < 1e-9);
        }
        // pairs away from the broken triangle stay close to the input
        let (a, b) = (
            CROP_IDS.iter().position(|c| *c == "soybean").unwrap(),
            CROP_IDS.iter().position(|c| *c == "sunflower").unwrap(),
        );
        assert!((fixed[a][b] - raw[a][b]).abs() < 0.2, "{}", fixed[a][b]);
    }

    #[test]
    fn percentiles_pick_order_statistics() {
        let v: Vec<f64> = (0..=100).map(f64::from).collect();
        assert_eq!(percentile_sorted(&v, 0.1), 10.0);
        assert_eq!(percentile_sorted(&v, 0.5), 50.0);
    }

    #[test]
    fn same_seed_same_numbers() {
        let f = iowa();
        let r = rot(&["maize", "soybean"]);
        let a = quant_simulate(
            &f,
            std::slice::from_ref(&r),
            &SimOptions::default(),
            &cfg(200),
            None,
        )
        .unwrap();
        let b = quant_simulate(
            &f,
            std::slice::from_ref(&r),
            &SimOptions::default(),
            &cfg(200),
            None,
        )
        .unwrap();
        assert_eq!(a, b);
        let other = QuantConfig {
            seed: 7,
            ..cfg(200)
        };
        let c = quant_simulate(&f, &[r], &SimOptions::default(), &other, None).unwrap();
        assert_ne!(a[0].mean_annual, c[0].mean_annual);
    }

    #[test]
    fn common_random_numbers_adding_a_rotation_changes_nothing() {
        let f = iowa();
        let (a, b) = (rot(&["maize", "soybean"]), rot(&["wheat", "sorghum"]));
        let o = SimOptions::default();
        let alone = quant_simulate(&f, std::slice::from_ref(&a), &o, &cfg(300), None).unwrap();
        let both = quant_simulate(&f, &[a, b], &o, &cfg(300), None).unwrap();
        assert_eq!(alone[0], both[0]);
    }

    #[test]
    fn a_path_does_not_depend_on_the_number_of_paths() {
        let f = iowa();
        let o = SimOptions::default();
        let m = default_quant_model();
        let years: Vec<i32> = (2026..=2040).collect();
        let (c1, c2) = (cfg(50), cfg(120));
        let sc = resolve_scenario(&f, &o, &c1);
        let w1 = build_worlds(&f, &o, &c1, &m, &sc, &years);
        let w2 = build_worlds(&f, &o, &c2, &m, &sc, &years);
        assert_eq!(w1[7][5].prices, w2[7][5].prices);
        assert_eq!(w1[49][14].hist_idx, w2[49][14].hist_idx);
    }

    #[test]
    fn var_below_mean_and_cvar_below_var() {
        let f = iowa();
        let rs = quant_simulate(
            &f,
            &[rot(&["maize", "soybean"]), rot(&["wheat", "sorghum"])],
            &SimOptions::default(),
            &cfg(600),
            None,
        )
        .unwrap();
        for r in &rs {
            assert!(r.var95 <= r.mean_annual, "{} {}", r.var95, r.mean_annual);
            assert!(r.cvar95 <= r.var95, "{} {}", r.cvar95, r.var95);
            assert!(r.cvar95_cum <= r.var95_cum);
            assert!(r.var95_cum <= r.cumulative.p50.last().copied().unwrap());
            assert!(r.income.p10.iter().zip(&r.income.p90).all(|(a, b)| a <= b));
            assert!((0.0..=1.0).contains(&r.max_drawdown_pct_p50));
            assert!(r.p_ruin_by_year.windows(2).all(|w| w[0] <= w[1]));
        }
    }

    #[test]
    fn monte_carlo_standard_error_shrinks_like_one_over_root_n() {
        let f = iowa();
        let r = rot(&["maize", "soybean"]);
        let o = SimOptions::default();
        let se = |n| {
            quant_simulate(&f, std::slice::from_ref(&r), &o, &cfg(n), None).unwrap()[0]
                .mc_se
                .mean_annual
        };
        let (small, large) = (se(200), se(3200)); // 16x the paths: SE should fall about 4x
        let ratio = small / large;
        assert!(
            (2.4..6.5).contains(&ratio),
            "SE ratio {ratio} ({small} / {large})"
        );
    }

    #[test]
    fn debt_and_living_costs_raise_the_probability_of_ruin() {
        let f = iowa();
        let r = rot(&["maize", "soybean"]);
        let o = SimOptions::default();
        let base = quant_simulate(&f, std::slice::from_ref(&r), &o, &cfg(400), None).unwrap();
        let burdened = QuantConfig {
            debt_service: 500.0,
            living_cost: 300.0,
            cash_reserve: 200.0,
            ..cfg(400)
        };
        let hard = quant_simulate(&f, &[r], &o, &burdened, None).unwrap();
        assert!(
            hard[0].p_ruin > base[0].p_ruin + 0.05,
            "{} {}",
            base[0].p_ruin,
            hard[0].p_ruin
        );
        assert_eq!(hard[0].mean_annual, base[0].mean_annual);
    }

    #[test]
    fn t_copula_has_heavier_tails_than_gaussian_and_keeps_the_correlation() {
        let model = default_quant_model();
        let chol = cholesky_corr(&model);
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        let (a, b) = (
            CROP_IDS.iter().position(|c| *c == "maize").unwrap(),
            CROP_IDS.iter().position(|c| *c == "sorghum").unwrap(),
        );
        let n = 60_000;
        let (mut xs, mut ys) = (Vec::with_capacity(n), Vec::with_capacity(n));
        for _ in 0..n {
            let s = t_copula_shocks(&mut rng, &chol, 5.0);
            xs.push(s[a]);
            ys.push(s[b]);
        }
        let kurt = |v: &[f64]| {
            let m = v.iter().sum::<f64>() / v.len() as f64;
            let s2 = v.iter().map(|x| (x - m).powi(2)).sum::<f64>() / v.len() as f64;
            v.iter().map(|x| (x - m).powi(4)).sum::<f64>() / v.len() as f64 / (s2 * s2)
        };
        let var = xs.iter().map(|x| x * x).sum::<f64>() / n as f64;
        assert!((var - 1.0).abs() < 0.08, "unit variance, got {var}");
        // Gaussian kurtosis is 3; t5 is 9 (sampling noise on kurtosis is large, so test well above 3)
        assert!(kurt(&xs) > 4.5, "kurtosis {}", kurt(&xs));
        let corr = xs.iter().zip(&ys).map(|(x, y)| x * y).sum::<f64>() / n as f64;
        let target = (0..=a.min(b)).map(|j| chol[a][j] * chol[b][j]).sum::<f64>();
        assert!((corr - target).abs() < 0.03, "corr {corr} vs {target}");
        assert!(
            target > 0.5,
            "maize and sorghum prices stay strongly linked: {target}"
        );
        // joint tail: P(both below the 1 % quantile) is far above the Gaussian-copula value
        let q = |v: &[f64]| {
            let mut s = v.to_vec();
            s.sort_unstable_by(f64::total_cmp);
            s[n / 100]
        };
        let (qx, qy) = (q(&xs), q(&ys));
        let joint = xs
            .iter()
            .zip(&ys)
            .filter(|(x, y)| **x <= qx && **y <= qy)
            .count() as f64
            / n as f64;
        let mut g = ChaCha8Rng::seed_from_u64(2);
        let (mut gx, mut gy) = (vec![], vec![]);
        for _ in 0..n {
            let z: [f64; N_CROPS] = std::array::from_fn(|_| std_normal(&mut g));
            gx.push((0..=a).map(|j| chol[a][j] * z[j]).sum::<f64>());
            gy.push((0..=b).map(|j| chol[b][j] * z[j]).sum::<f64>());
        }
        let (gqx, gqy) = (q(&gx), q(&gy));
        let gjoint = gx
            .iter()
            .zip(&gy)
            .filter(|(x, y)| **x <= gqx && **y <= gqy)
            .count() as f64
            / n as f64;
        assert!(
            joint > gjoint * 1.2,
            "t joint tail {joint} vs gaussian {gjoint}"
        );
    }

    #[test]
    fn prices_have_no_upward_drift_bias_without_inflation() {
        let f = iowa();
        let mut model = default_quant_model();
        model.inputs.drift = 0.0;
        // no price-yield link, so the warming/drying path of the default scenario cannot move the mean
        for c in model.crops.values_mut() {
            c.yield_corr = 0.0;
        }
        let o = SimOptions::default();
        let years: Vec<i32> = (2026..=2050).collect();
        let c = QuantConfig {
            paths: 3000,
            ..Default::default()
        };
        let sc = resolve_scenario(&f, &o, &c);
        let worlds = build_worlds(&f, &o, &c, &model, &sc, &years);
        let maize = CROP_IDS.iter().position(|x| *x == "maize").unwrap();
        let mean_price = model.crops["maize"].price_mean;
        for t in [0usize, 5, 12, 24] {
            let m = worlds.iter().map(|w| w[t].prices[maize]).sum::<f64>() / worlds.len() as f64;
            // sampling error of 3000 paths; allow 3 %
            assert!(
                ((m / mean_price) - 1.0).abs() < 0.03,
                "year {t}: mean price {m} vs {mean_price}"
            );
        }
        // with inflation the mean follows the drift
        let mut infl = default_quant_model();
        infl.inputs.drift = 0.03;
        let wi = build_worlds(&f, &o, &c, &infl, &sc, &years);
        let m = wi.iter().map(|w| w[24].prices[maize]).sum::<f64>() / wi.len() as f64;
        assert!(m / mean_price > 2.0, "{m}");
    }

    #[test]
    fn stationary_bootstrap_has_geometric_blocks_and_never_wraps() {
        let mut rng = ChaCha8Rng::seed_from_u64(5);
        let (mut runs, mut blocks) = (0usize, 0usize);
        for _ in 0..4000 {
            let b = stationary_bootstrap(&mut rng, 25, 25, 3.0);
            assert!(b.iter().all(|&i| i < 25));
            blocks += 1;
            for w in b.windows(2) {
                if w[1] == w[0] + 1 {
                    runs += 1;
                } else {
                    blocks += 1;
                }
            }
        }
        let mean_block = (runs + blocks) as f64 / blocks as f64;
        assert!((2.3..3.4).contains(&mean_block), "mean block {mean_block}");
        // a block ending at the last year restarts instead of wrapping to year 0
        let b = stationary_bootstrap(&mut ChaCha8Rng::seed_from_u64(9), 3, 400, 50.0);
        assert!(b.iter().all(|&i| i < 3));
        assert!(b
            .windows(2)
            .all(|w| w[1] == w[0] + 1 || w[0] == 2 || w[1] < 3));
    }

    #[test]
    fn sensitivity_rows_have_the_expected_signs() {
        let f = iowa();
        let c = QuantConfig {
            sensitivity: true,
            ..cfg(300)
        };
        let r = quant_simulate(
            &f,
            &[rot(&["maize", "soybean"])],
            &SimOptions::default(),
            &c,
            None,
        )
        .unwrap();
        let s = r[0].sensitivity.as_ref().unwrap();
        assert_eq!(s.len(), 3);
        let warm = s.iter().find(|x| x.factor == "warming").unwrap();
        assert!(warm.delta_mean_annual < 0.0, "{warm:?}");
        let jumps = s.iter().find(|x| x.factor == "costJumps").unwrap();
        assert!(jumps.delta_cvar95 <= 0.0, "{jumps:?}");
    }

    #[test]
    fn co2_pathway_lifts_c3_income_relative_to_a_fixed_climate() {
        let f = iowa();
        let r = rot(&["wheat", "pea"]);
        let o = SimOptions::default();
        let with = quant_simulate(&f, std::slice::from_ref(&r), &o, &cfg(300), None).unwrap();
        let without = QuantConfig {
            co2: false,
            ..cfg(300)
        };
        let wo = quant_simulate(&f, &[r], &o, &without, None).unwrap();
        assert!(
            with[0].mean_annual > wo[0].mean_annual,
            "{} {}",
            with[0].mean_annual,
            wo[0].mean_annual
        );
    }

    /// 1000 paths x 25 y x 4 rotations (release builds only; see the `report` example for the 10 000-path timing).
    #[cfg(not(debug_assertions))]
    #[test]
    fn timing_one_thousand_paths_four_rotations() {
        let f = iowa();
        let rots = vec![
            rot(&["maize", "soybean"]),
            rot(&["wheat", "sorghum"]),
            rot(&["maize", "soybean", "wheat"]),
            rot(&["sunflower", "pea"]),
        ];
        let c = QuantConfig {
            paths: 1000,
            ..Default::default()
        };
        let t = std::time::Instant::now();
        let r = quant_simulate(&f, &rots, &SimOptions::default(), &c, None).unwrap();
        let dt = t.elapsed();
        assert_eq!(r.len(), 4);
        assert!(dt.as_secs_f64() < 2.0, "took {dt:?}");
    }
}
