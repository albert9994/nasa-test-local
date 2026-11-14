//! Monte Carlo quant engine (C3 `quantSimulate`, C11 parameters).
//!
//! Every path is one possible future 2026–2050:
//! * weather: 3-year block bootstrap of *real* historical seasons, shifted along the CMIP6 trajectory of the
//!   chosen SSP, with the inter-model spread (p10–p90) sampled once per path;
//! * crop prices: correlated mean-reverting log-prices (Ornstein–Uhlenbeck + Cholesky), negatively correlated
//!   with the regional yield shock; each crop reverts to *its own* mean;
//! * input costs: real drift plus rare fertilizer / energy jumps that accumulate;
//! * metrics: income fan, P(bad year), VaR / CVaR 95, P(ruin), drawdown, margin-year distribution.
//!
//! All rotations are evaluated on the *same* simulated worlds (common random numbers), so differences between
//! rotations are never Monte Carlo noise. A later task will replace the stochastic model; the interface is final.

#![allow(clippy::needless_range_loop)] // fixed-size matrix algebra reads clearer with indices

use crate::crops::{season_crop, CROP_IDS};
use crate::rotation::{phase_carry, start_fill};
use crate::season::{simulate_season_ctx, CarryOverContext};
use crate::stress::interp_series;
use crate::{
    par_map, round1, round2, round3, PreparedFarm, ResolvedRotation, Result, RotationStep,
    ScenarioPoint, SimOptions,
};
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

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
    /// Annual real drift of input costs (applied at 25 %: prices are real, costs mostly are too).
    #[serde(default = "d_drift")]
    pub drift: f64,
    #[serde(default = "d_jprob")]
    pub jump_prob: f64,
    #[serde(default = "d_jsize")]
    pub jump_size: f64,
    /// Share of an input-cost jump that persists to the next year.
    #[serde(default = "d_jpersist")]
    pub jump_persistence: f64,
}
fn d_drift() -> f64 {
    0.03
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
            jump_prob: d_jprob(),
            jump_size: d_jsize(),
            jump_persistence: d_jpersist(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantModel {
    pub source: String,
    pub crops: BTreeMap<String, CropQuantParam>,
    /// Pairwise price correlations keyed `"a|b"`.
    pub price_corr: BTreeMap<String, f64>,
    pub inputs: InputCostParam,
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

/// C3 `QuantParams`.
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
impl Default for QuantConfig {
    fn default() -> Self {
        Self {
            paths: d_paths(),
            from_year: d_from(),
            to_year: d_to(),
            ssp: d_ssp(),
            cash_reserve: d_cash(),
            seed: d_seed(),
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

/// C3 `QuantResult`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantResult {
    pub rotation: Vec<RotationStep>,
    pub years: Vec<i32>,
    pub income: IncomeFan,
    pub p_bad_year: Vec<f64>,
    pub var95: f64,
    pub cvar95: f64,
    pub p_ruin: f64,
    pub max_drawdown_p50: f64,
    pub margin_year: MarginYearQuantiles,
    pub mean_annual: f64,
    pub sd_annual: f64,
    pub risk_adjusted: f64,
}

// ---- stochastic worlds ----

struct WorldYear {
    hist_idx: usize,
    d_t: f64,
    d_p: f64,
    /// Price of every crop in `CROP_IDS` order, $/t.
    prices: [f64; N_CROPS],
    cost_mult: f64,
}

fn std_normal(rng: &mut ChaCha8Rng) -> f64 {
    let u1: f64 = rng.random::<f64>().max(1e-12);
    let u2: f64 = rng.random::<f64>();
    (-2.0 * u1.ln()).sqrt() * (std::f64::consts::TAU * u2).cos()
}

/// Lower-triangular Cholesky factor of the crop price correlation matrix (shrunk to identity if not PD).
fn cholesky_corr(model: &QuantModel) -> [[f64; N_CROPS]; N_CROPS] {
    let base = 0.30;
    let mut corr = [[0.0; N_CROPS]; N_CROPS];
    for i in 0..N_CROPS {
        for j in 0..N_CROPS {
            corr[i][j] = if i == j { 1.0 } else { base };
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
    for shrink in [1.0, 0.9, 0.7, 0.4, 0.0] {
        let mut m = corr;
        for (i, row) in m.iter_mut().enumerate() {
            for (j, v) in row.iter_mut().enumerate() {
                if i != j {
                    *v *= shrink;
                }
            }
        }
        let mut l = [[0.0; N_CROPS]; N_CROPS];
        let mut ok = true;
        'outer: for i in 0..N_CROPS {
            for j in 0..=i {
                let s: f64 = (0..j).map(|k| l[i][k] * l[j][k]).sum();
                if i == j {
                    let d = m[i][i] - s;
                    if d <= 1e-9 {
                        ok = false;
                        break 'outer;
                    }
                    l[i][j] = d.sqrt();
                } else {
                    l[i][j] = (m[i][j] - s) / l[j][j];
                }
            }
        }
        if ok {
            return l;
        }
    }
    let mut id = [[0.0; N_CROPS]; N_CROPS];
    for (i, row) in id.iter_mut().enumerate() {
        row[i] = 1.0;
    }
    id
}

/// z-score of the growing-season rain deficit / heat of each historical year (regional yield shock proxy).
fn hist_climate_index(farm: &PreparedFarm) -> Vec<(f64, f64, f64, f64)> {
    let raw: Vec<(f64, f64)> = farm
        .years
        .iter()
        .filter_map(|y| farm.weather_by_year.get(y))
        .map(|w| {
            let n = w.days();
            let rain: f64 = w.prcp[90.min(n)..273.min(n)].iter().sum();
            let hot = &w.tmax[150.min(n)..240.min(n)];
            let tmax = if hot.is_empty() {
                25.0
            } else {
                hot.iter().sum::<f64>() / hot.len() as f64
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
    raw.into_iter()
        .map(|(r, t)| (r, t, mr, mt))
        .map(|(r, t, mr, mt)| ((r - mr) / sr, (t - mt) / st, sr, st))
        .collect()
}

fn build_worlds(
    farm: &PreparedFarm,
    opts: &SimOptions,
    cfg: &QuantConfig,
    model: &QuantModel,
    years: &[i32],
) -> Vec<Vec<WorldYear>> {
    let n_paths = cfg.paths.clamp(10, 10_000);
    let n_years = years.len();
    let n_hist = farm.years.len().max(1);
    let series: Vec<ScenarioPoint> = farm.scenario_series(&cfg.ssp);
    let (dt_p10, dt_p90, dp_p10, dp_p90) = farm
        .scenario_spread_2050(&cfg.ssp)
        .unwrap_or((-0.5, 0.6, -0.04, 0.04));
    let chol = cholesky_corr(model);
    let hist = hist_climate_index(farm);

    // each crop's own long-run mean price: farmer override, else the model's mean, else the crop default
    let mut mean_price = [0.0; N_CROPS];
    let mut kappa = [0.5; N_CROPS];
    let mut sigma = [0.25; N_CROPS];
    let mut rho_y = [-0.3; N_CROPS];
    for (i, id) in CROP_IDS.iter().enumerate() {
        let Ok(c) = season_crop(id) else { continue };
        let q = model.crops.get(*id);
        mean_price[i] = opts
            .prices
            .get(*id)
            .or_else(|| farm.meta.prices.get(*id))
            .copied()
            .or_else(|| q.map(|q| q.price_mean))
            .unwrap_or(c.default_price_usd_t);
        if let Some(q) = q {
            kappa[i] = q.reversion.clamp(0.05, 1.5);
            sigma[i] = q.vol.clamp(0.05, 0.65);
            rho_y[i] = q.yield_corr.clamp(-0.85, 0.85);
        }
    }

    let mut rng = ChaCha8Rng::seed_from_u64(cfg.seed);
    let mut worlds = Vec::with_capacity(n_paths);
    for _ in 0..n_paths {
        let u: f64 = rng.random::<f64>();
        let off_t = (u - 0.5) * (dt_p90 - dt_p10);
        let off_p = (u - 0.5) * (dp_p90 - dp_p10);

        let mut boot = Vec::with_capacity(n_years);
        while boot.len() < n_years {
            let start = rng.random_range(0..n_hist);
            for k in 0..3 {
                if boot.len() < n_years {
                    boot.push((start + k) % n_hist);
                }
            }
        }

        let mut x = [0.0_f64; N_CROPS]; // log(price / own mean)
        let mut cost_mult = 1.0_f64;
        let mut jump = 0.0_f64;
        let mut path = Vec::with_capacity(n_years);
        for (t, &yr) in years.iter().enumerate() {
            let sp = interp_series(&series, yr);
            let frac = (f64::from(yr - 2025) / 25.0).clamp(0.0, 1.5);
            let d_t = opts.d_t + sp.d_t + off_t * frac;
            let d_p = ((1.0 + opts.d_p) * (1.0 + sp.d_p + off_p * frac) - 1.0).clamp(-0.75, 0.5);

            let hist_idx = boot[t].min(hist.len().saturating_sub(1));
            let (z_rain, z_heat) = hist
                .get(hist_idx)
                .map_or((0.0, 0.0), |h| (h.0 + d_p * 2.0, h.1 + d_t / h.3.max(0.8)));
            let z_yield = (z_rain - 0.7 * z_heat).clamp(-2.5, 2.5);

            let indep: Vec<f64> = (0..N_CROPS).map(|_| std_normal(&mut rng)).collect();
            let mut prices = [0.0; N_CROPS];
            for i in 0..N_CROPS {
                if CROP_IDS[i] == "fallow" {
                    continue;
                }
                let corr_z: f64 = (0..=i).map(|j| chol[i][j] * indep[j]).sum();
                let shock = rho_y[i] * z_yield + (1.0 - rho_y[i] * rho_y[i]).sqrt() * corr_z;
                x[i] += kappa[i] * (0.0 - x[i]) + sigma[i] * shock;
                prices[i] = mean_price[i] * x[i].exp().clamp(0.40, 2.60);
            }

            // input costs: real drift, plus rare jumps that persist and accumulate
            if rng.random_bool(model.inputs.jump_prob.clamp(0.0, 0.5)) {
                jump = jump * model.inputs.jump_persistence.clamp(0.0, 1.0)
                    + model.inputs.jump_size.clamp(0.0, 1.5);
            } else {
                jump *= model.inputs.jump_persistence.clamp(0.0, 1.0);
            }
            cost_mult = (cost_mult * (1.0 + model.inputs.drift * 0.25)).min(2.0);
            path.push(WorldYear {
                hist_idx,
                d_t,
                d_p,
                prices,
                cost_mult: cost_mult * (1.0 + jump),
            });
        }
        worlds.push(path);
    }
    worlds
}

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

fn evaluate_rotation(
    farm: &PreparedFarm,
    rot: &ResolvedRotation,
    opts: &SimOptions,
    cfg: &QuantConfig,
    years: &[i32],
    worlds: &[Vec<WorldYear>],
) -> QuantResult {
    let k = rot.steps.len();
    let carry = phase_carry(farm, rot);
    let crop_idx: Vec<usize> = rot.crops.iter().map(|c| crop_index(c.id)).collect();
    let n_years = years.len();
    let n_paths = worlds.len();

    // season cache keyed by (phase, historical year, dT bucket, dP bucket) -> (yield, cost at base prices)
    let mut cache: HashMap<(usize, usize, i32, i32), (f64, f64)> = HashMap::new();

    let mut annual: Vec<Vec<f64>> = vec![Vec::with_capacity(n_paths); n_years];
    let mut all = Vec::with_capacity(n_paths * n_years);
    let mut drawdowns = Vec::with_capacity(n_paths);
    let mut margin_years: Vec<Option<i32>> = Vec::with_capacity(n_paths);
    let mut ruined = 0usize;

    for path in worlds {
        let (mut cash, mut peak, mut max_dd) = (cfg.cash_reserve, cfg.cash_reserve, 0.0_f64);
        let mut was_ruined = false;
        let mut bad = Vec::with_capacity(n_years);
        let mut crossed = None;
        for (t, wy) in path.iter().enumerate() {
            let tb = (wy.d_t * 4.0).round() as i32;
            let pb = (wy.d_p * 50.0).round() as i32;
            let mut sum = 0.0;
            for p in 0..k {
                // phase p grows crop step (t + p) % k in year t
                let s = (t + p) % k;
                let (y, cost) = *cache.entry((s, wy.hist_idx, tb, pb)).or_insert_with(|| {
                    let hist_year = farm.years[wy.hist_idx];
                    let Some(w) = farm.weather_by_year.get(&hist_year) else {
                        return (0.0, 0.0);
                    };
                    let o = SimOptions {
                        d_t: f64::from(tb) / 4.0,
                        d_p: f64::from(pb) / 50.0,
                        ..opts.clone()
                    };
                    let gwet = farm.year_mean_gwet_anomaly(w);
                    let ctx = CarryOverContext {
                        initial_fill: start_fill(
                            farm,
                            0.72,
                            w.off_season_precip_mm() * (1.0 + o.d_p),
                            gwet,
                            &carry[s],
                        ),
                        rotation_factor: carry[s].rotation_factor,
                        cost_delta_usd_ha: carry[s].cost_delta_usd_ha,
                    };
                    let r = simulate_season_ctx(farm, rot.crops[s], w, &o, false, ctx);
                    (r.yield_t_ha, r.cost)
                });
                sum += y * wy.prices[crop_idx[s]] - cost * wy.cost_mult;
            }
            let net = round1(sum / k as f64);
            annual[t].push(net);
            all.push(net);

            cash += net;
            peak = peak.max(cash);
            max_dd = max_dd.max(peak - cash);
            was_ruined |= cash < 0.0;

            bad.push(net < opts.fail_net);
            if crossed.is_none() && t >= 4 {
                let fails = bad[t - 4..=t].iter().filter(|&&b| b).count();
                if fails as f64 / 5.0 > opts.fail_share {
                    crossed = Some(years[t]);
                }
            }
        }
        ruined += usize::from(was_ruined);
        drawdowns.push(max_dd);
        margin_years.push(crossed);
    }

    let (mut p10, mut p50, mut p90, mut p_bad) = (vec![], vec![], vec![], vec![]);
    for col in &mut annual {
        p_bad.push(round3(
            col.iter().filter(|&&v| v < opts.fail_net).count() as f64 / n_paths as f64,
        ));
        col.sort_by(f64::total_cmp);
        p10.push(round1(percentile_sorted(col, 0.10)));
        p50.push(round1(percentile_sorted(col, 0.50)));
        p90.push(round1(percentile_sorted(col, 0.90)));
    }

    all.sort_by(f64::total_cmp);
    let var95 = percentile_sorted(&all, 0.05);
    let tail: Vec<f64> = all.iter().copied().filter(|&v| v <= var95).collect();
    let cvar95 = tail.iter().sum::<f64>() / tail.len().max(1) as f64;
    let n = all.len().max(1) as f64;
    let mean = all.iter().sum::<f64>() / n;
    let sd = (all.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n).sqrt();

    drawdowns.sort_by(f64::total_cmp);
    let mut crossed: Vec<i32> = margin_years.iter().flatten().copied().collect();
    crossed.sort_unstable();
    let share = crossed.len() as f64 / n_paths as f64;
    let my_q = |q: f64| -> Option<i32> {
        (share > q && !crossed.is_empty()).then(|| {
            let idx = ((q / share) * (crossed.len() - 1) as f64).floor() as usize;
            crossed[idx.min(crossed.len() - 1)]
        })
    };

    QuantResult {
        rotation: rot.steps.clone(),
        years: years.to_vec(),
        income: IncomeFan { p10, p50, p90 },
        p_bad_year: p_bad,
        var95: round1(var95),
        cvar95: round1(cvar95),
        p_ruin: round3(ruined as f64 / n_paths as f64),
        max_drawdown_p50: round1(percentile_sorted(&drawdowns, 0.5)),
        margin_year: MarginYearQuantiles {
            p10: my_q(0.10),
            p50: my_q(0.50),
            p90: my_q(0.90),
        },
        mean_annual: round1(mean),
        sd_annual: round1(sd),
        risk_adjusted: round2(mean / sd.max(1e-9)),
    }
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
    let worlds = build_worlds(farm, opts, cfg, model, &years);
    Ok(par_map(&resolved, |rot| {
        evaluate_rotation(farm, rot, opts, cfg, &years, &worlds)
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cholesky_is_valid() {
        let l = cholesky_corr(&default_quant_model());
        for i in 0..N_CROPS {
            let norm: f64 = (0..=i).map(|j| l[i][j] * l[i][j]).sum();
            assert!((norm - 1.0).abs() < 1e-9, "row {i}: {norm}");
        }
    }

    #[test]
    fn percentiles_pick_order_statistics() {
        let v: Vec<f64> = (0..=100).map(f64::from).collect();
        assert_eq!(percentile_sorted(&v, 0.1), 10.0);
        assert_eq!(percentile_sorted(&v, 0.5), 50.0);
    }
}
