//! I6 · Monte Carlo Quant Engine (`quant.rs`, Contracts C3 `quantSimulate` & C11)
//!
//! Simulates N reproducible future trajectories (2026–2050) combining:
//! 1. **Weather**: 3-year block-bootstrap of real historical seasons shifted along the CMIP6
//!    trajectory (`ssp245` / `ssp585`), sampling the inter-model spread (`p10`–`p90`) per path.
//! 2. **Crop Prices**: mean-reverting Ornstein–Uhlenbeck log-price per crop, correlated across
//!    crops (Cholesky decomposition) and negatively correlated with the regional yield shock
//!    (`yieldCorr`, the natural price–yield hedge).
//! 3. **Input Costs**: annual inflation drift + rare fertilizer/energy price jumps (jump-diffusion).
//! 4. **Finance & Risk Metrics**: annual income fan (`p10`/`p50`/`p90`), `pBadYear` per year,
//!    95% Value at Risk (`var95`), 95% Expected Shortfall (`cvar95`), probability of ruin (`pRuin`)
//!    for a starting cash reserve, median max drawdown (`maxDrawdownP50`), stochastic `marginYear`
//!    distribution (`p10`/`p50`/`p90`), and Sharpe-like `riskAdjusted` score (`mean ÷ sd`).

use crate::stress::default_cmip6_series;
use crate::{
    default_crop_pool, get_crop_spec, resolve_crop_cost, resolve_crop_price,
    simulate_season_with_carry, Farm, RotationStep, ScenarioHorizon, ScenarioPoint, SimOpts,
};
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

// ============================================================================
// C11 · Quant Parameters & Literature Defaults
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropQuantParam {
    pub price_mean: f64,
    #[serde(default = "default_vol")]
    pub vol: f64,
    #[serde(default = "default_reversion")]
    pub reversion: f64,
    #[serde(default = "default_yield_corr")]
    pub yield_corr: f64,
}

fn default_vol() -> f64 {
    0.25
}

fn default_reversion() -> f64 {
    0.50
}

fn default_yield_corr() -> f64 {
    -0.30
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputCostQuantParam {
    #[serde(default = "default_cost_drift")]
    pub drift: f64,
    #[serde(default = "default_jump_prob")]
    pub jump_prob: f64,
    #[serde(default = "default_jump_size")]
    pub jump_size: f64,
}

fn default_cost_drift() -> f64 {
    0.03
}

fn default_jump_prob() -> f64 {
    0.05
}

fn default_jump_size() -> f64 {
    0.40
}

impl Default for InputCostQuantParam {
    fn default() -> Self {
        Self {
            drift: default_cost_drift(),
            jump_prob: default_jump_prob(),
            jump_size: default_jump_size(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuantParams {
    #[serde(default = "default_quant_source")]
    pub source: String,
    #[serde(default)]
    pub crops: BTreeMap<String, CropQuantParam>,
    #[serde(default)]
    pub price_corr: BTreeMap<String, f64>,
    #[serde(default)]
    pub inputs: InputCostQuantParam,
}

fn default_quant_source() -> String {
    "FAO GIEWS / World Bank Pink Sheet monthly prices 2000–2025; county yields (C5)".to_string()
}

/// Returns literature-backed C11 quant parameters when `data/quant_params.json` is not yet provided.
pub fn default_quant_params() -> QuantParams {
    let mut crops = BTreeMap::new();
    crops.insert(
        "maize".to_string(),
        CropQuantParam {
            price_mean: 190.0,
            vol: 0.24,
            reversion: 0.55,
            yield_corr: -0.32,
        },
    );
    crops.insert(
        "soybean".to_string(),
        CropQuantParam {
            price_mean: 410.0,
            vol: 0.22,
            reversion: 0.50,
            yield_corr: -0.28,
        },
    );
    crops.insert(
        "wheat".to_string(),
        CropQuantParam {
            price_mean: 230.0,
            vol: 0.23,
            reversion: 0.50,
            yield_corr: -0.25,
        },
    );
    crops.insert(
        "barley".to_string(),
        CropQuantParam {
            price_mean: 205.0,
            vol: 0.22,
            reversion: 0.52,
            yield_corr: -0.22,
        },
    );
    crops.insert(
        "sorghum".to_string(),
        CropQuantParam {
            price_mean: 185.0,
            vol: 0.24,
            reversion: 0.55,
            yield_corr: -0.28,
        },
    );
    crops.insert(
        "sunflower".to_string(),
        CropQuantParam {
            price_mean: 440.0,
            vol: 0.26,
            reversion: 0.48,
            yield_corr: -0.30,
        },
    );
    crops.insert(
        "pea".to_string(),
        CropQuantParam {
            price_mean: 310.0,
            vol: 0.20,
            reversion: 0.55,
            yield_corr: -0.20,
        },
    );
    crops.insert(
        "millet".to_string(),
        CropQuantParam {
            price_mean: 220.0,
            vol: 0.21,
            reversion: 0.55,
            yield_corr: -0.20,
        },
    );

    let mut price_corr = BTreeMap::new();
    price_corr.insert("maize|wheat".to_string(), 0.70);
    price_corr.insert("maize|soybean".to_string(), 0.62);
    price_corr.insert("maize|sorghum".to_string(), 0.82);
    price_corr.insert("wheat|barley".to_string(), 0.78);
    price_corr.insert("soybean|sunflower".to_string(), 0.65);
    price_corr.insert("soybean|pea".to_string(), 0.58);

    QuantParams {
        source: default_quant_source(),
        crops,
        price_corr,
        inputs: InputCostQuantParam::default(),
    }
}

// ============================================================================
// C3 · `quantSimulate` Input & Output Contracts
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantSimConfig {
    #[serde(default = "default_paths")]
    pub paths: usize,
    #[serde(default = "default_from_year")]
    pub from_year: i32,
    #[serde(default = "default_to_year")]
    pub to_year: i32,
    #[serde(default = "default_ssp")]
    pub ssp: String,
    #[serde(default = "default_cash_reserve")]
    pub cash_reserve: f64,
    #[serde(default = "default_seed")]
    pub seed: u64,
}

fn default_paths() -> usize {
    1000
}
fn default_from_year() -> i32 {
    2026
}
fn default_to_year() -> i32 {
    2050
}
fn default_ssp() -> String {
    "ssp245".to_string()
}
fn default_cash_reserve() -> f64 {
    500.0
}
fn default_seed() -> u64 {
    42
}

impl Default for QuantSimConfig {
    fn default() -> Self {
        Self {
            paths: default_paths(),
            from_year: default_from_year(),
            to_year: default_to_year(),
            ssp: default_ssp(),
            cash_reserve: default_cash_reserve(),
            seed: default_seed(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IncomeFan {
    pub p10: Vec<f64>,
    pub p50: Vec<f64>,
    pub p90: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarginYearDistribution {
    pub p10: Option<i32>,
    pub p50: Option<i32>,
    pub p90: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuantRotationResult {
    pub rotation: Vec<RotationStep>,
    pub years: Vec<i32>,
    pub income: IncomeFan,
    pub p_bad_year: Vec<f64>,
    pub var95: f64,
    pub cvar95: f64,
    pub p_ruin: f64,
    pub max_drawdown_p50: f64,
    pub margin_year: MarginYearDistribution,
    pub mean_annual: f64,
    pub sd_annual: f64,
    pub risk_adjusted: f64,
}

/// Runs the Monte Carlo simulation for one or more rotations over `from_year..=to_year` (Contract C3).
pub fn quant_simulate(
    farm: &Farm,
    rotations: &[Vec<RotationStep>],
    opts: &SimOpts,
    config: &QuantSimConfig,
    quant_params: Option<&QuantParams>,
) -> Vec<QuantRotationResult> {
    let default_qp = default_quant_params();
    let qp = quant_params.unwrap_or(&default_qp);

    let n_paths = config.paths.clamp(10, 20_000);
    let from_yr = config.from_year.min(config.to_year);
    let to_yr = config.to_year.max(from_yr);
    let years: Vec<i32> = (from_yr..=to_yr).collect();
    let n_years = years.len();

    // Collect all unique crops across all requested rotations
    let mut crop_list = default_crop_pool();
    for rot in rotations {
        for step in rot {
            let id = get_crop_spec(&step.crop).id.to_string();
            if !crop_list.contains(&id) {
                crop_list.push(id);
            }
        }
    }
    let n_crops = crop_list.len();

    // Resolve per-crop OU parameters & build Cholesky factor L of the crop price correlation matrix
    let crop_params: Vec<CropQuantParam> = crop_list
        .iter()
        .map(|cid| {
            qp.crops
                .get(cid)
                .cloned()
                .unwrap_or_else(|| CropQuantParam {
                    price_mean: resolve_crop_price(farm, opts, cid),
                    vol: default_vol(),
                    reversion: default_reversion(),
                    yield_corr: default_yield_corr(),
                })
        })
        .collect();

    let chol_l = build_cholesky_correlation(&crop_list, &qp.price_corr);

    // Extract CMIP6 trajectory and 2050 p10..p90 spread for the chosen SSP
    let (series, spread_2050) = extract_ssp_trajectory(farm, &config.ssp);

    // Precompute historical yields per (crop_idx, hist_year_idx, has_cover, rot_factor_tier)
    // and baseline historical yields to compute each year's regional yield anomaly.
    let hist_years = if farm.years.is_empty() {
        (2002..=2025).collect::<Vec<i32>>()
    } else {
        farm.years.clone()
    };
    let n_hist = hist_years.len();

    // Generate shared stochastic world paths (weather bootstrap + price paths + cost multiplier)
    // so every rotation is evaluated on the exact same N future worlds.
    let mut rng = ChaCha8Rng::seed_from_u64(config.seed);
    let mut worlds = Vec::with_capacity(n_paths);

    for _ in 0..n_paths {
        // Sample inter-model climate sensitivity quantile u ∈ [0, 1] (maps p10..p90)
        let u_climate: f64 = rng.gen_range(0.0..1.0);
        let dt_spread_offset = (u_climate - 0.5) * (spread_2050.d_t_p90 - spread_2050.d_t_p10);
        let dp_spread_offset = (u_climate - 0.5) * (spread_2050.d_p_p90 - spread_2050.d_p_p10);

        // 3-year block bootstrap of historical weather years
        let mut boot_hist_indices = Vec::with_capacity(n_years);
        while boot_hist_indices.len() < n_years {
            let start_idx = rng.gen_range(0..n_hist);
            for offset in 0..3 {
                if boot_hist_indices.len() < n_years {
                    boot_hist_indices.push((start_idx + offset) % n_hist);
                }
            }
        }

        // Simulate price & cost paths across years
        let mut log_prices: Vec<f64> = crop_params
            .iter()
            .enumerate()
            .map(|(idx, cp)| {
                let base_p = resolve_crop_price(farm, opts, &crop_list[idx])
                    .max(cp.price_mean)
                    .max(10.0);
                base_p.ln()
            })
            .collect();
        let mean_log_prices: Vec<f64> = log_prices.clone();

        let mut cost_mult = 1.0_f64;
        let mut jump_carry = 0.0_f64;

        let mut path_years = Vec::with_capacity(n_years);

        for (t_idx, &yr) in years.iter().enumerate() {
            let (base_dt, base_dp) = interpolate_cmip6(&series, yr);
            let horizon_frac = ((yr - 2025).max(0) as f64 / 25.0).clamp(0.0, 1.5);
            let dt_t = opts.d_t + base_dt + dt_spread_offset * horizon_frac;
            let dp_t = (opts.d_p + base_dp + dp_spread_offset * horizon_frac).clamp(-0.75, 0.50);

            let hist_idx = boot_hist_indices[t_idx];
            let hist_year = hist_years[hist_idx];

            // Regional yield shock proxy z_yield (negative in hot/dry years like 2012/2007)
            let clim = farm.annual_climate.get(&hist_year);
            let rain_anom = clim
                .map(|c| (c.growing_rain_mm * (1.0 + dp_t) - 460.0) / 140.0)
                .unwrap_or(0.0);
            let heat_anom = clim
                .map(|c| ((c.flowering_tmax + dt_t) - 31.5) / 3.5)
                .unwrap_or(0.0);
            let z_yield = (rain_anom - 0.7 * heat_anom).clamp(-2.5, 2.5);

            // Correlated standard normal draws via Box-Muller + Cholesky L
            let indep_z: Vec<f64> = (0..n_crops)
                .map(|_| sample_standard_normal(&mut rng))
                .collect();
            let mut corr_z = vec![0.0; n_crops];
            for i in 0..n_crops {
                let mut s = 0.0;
                for j in 0..=i {
                    s += chol_l[i][j] * indep_z[j];
                }
                corr_z[i] = s;
            }

            let mut year_prices = vec![0.0; n_crops];
            for c_idx in 0..n_crops {
                let cp = &crop_params[c_idx];
                if crop_list[c_idx] == "fallow" {
                    year_prices[c_idx] = 0.0;
                    continue;
                }
                let rho_y = cp.yield_corr.clamp(-0.85, 0.85);
                let combined_shock =
                    rho_y * z_yield + (1.0 - rho_y * rho_y).sqrt() * corr_z[c_idx];
                let kappa = cp.reversion.clamp(0.05, 1.5);
                let sigma = cp.vol.clamp(0.05, 0.65);

                // Ornstein-Uhlenbeck step (dt = 1 yr)
                log_prices[c_idx] +=
                    kappa * (mean_log_prices[c_idx] - log_prices[c_idx]) + sigma * combined_shock;
                let mean_p = mean_log_prices[c_idx].exp();
                year_prices[c_idx] = log_prices[c_idx].exp().clamp(mean_p * 0.40, mean_p * 2.60);
            }

            // Input cost drift + Poisson fertilizer/energy shock (decays over time)
            let is_jump = rng.gen_bool(qp.inputs.jump_prob.clamp(0.0, 0.5));
            if is_jump {
                jump_carry = qp.inputs.jump_size.clamp(0.0, 1.5);
            } else {
                jump_carry *= 0.45;
            }
            // Gently mean-revert cost drift relative to real crop prices so farm economics stay in real terms
            cost_mult = (cost_mult * (1.0 + qp.inputs.drift * 0.25)).clamp(0.85, 1.65);
            let effective_cost_mult = cost_mult * (1.0 + jump_carry);

            path_years.push(WorldYearState {
                hist_year,
                dt: dt_t,
                dp: dp_t,
                prices: year_prices,
                cost_mult: effective_cost_mult,
            });
        }

        worlds.push(path_years);
    }

    // Pre-build a fast yield lookup cache per `(crop_idx, hist_year, dt_bucket, dp_bucket, cover)`
    let crop_index_map: BTreeMap<String, usize> = crop_list
        .iter()
        .enumerate()
        .map(|(i, c)| (c.clone(), i))
        .collect();

    rotations
        .iter()
        .map(|rot| {
            evaluate_rotation_on_worlds(
                farm,
                rot,
                opts,
                config,
                &years,
                &crop_list,
                &crop_index_map,
                &worlds,
            )
        })
        .collect()
}

struct WorldYearState {
    hist_year: i32,
    dt: f64,
    dp: f64,
    prices: Vec<f64>,
    cost_mult: f64,
}

#[allow(clippy::too_many_arguments)]
fn evaluate_rotation_on_worlds(
    farm: &Farm,
    rotation: &[RotationStep],
    opts: &SimOpts,
    config: &QuantSimConfig,
    years: &[i32],
    crop_list: &[String],
    crop_index_map: &BTreeMap<String, usize>,
    worlds: &[Vec<WorldYearState>],
) -> QuantRotationResult {
    let steps: Vec<RotationStep> = if rotation.is_empty() {
        vec![RotationStep::new("maize", false)]
    } else {
        rotation.to_vec()
    };
    let n_phases = steps.len();
    let n_paths = worlds.len();
    let n_years = years.len();

    // Precompute phase carry-over multipliers and base costs
    let mut phase_crop_idx = Vec::with_capacity(n_phases);
    let mut phase_rot_factor = Vec::with_capacity(n_phases);
    let mut phase_n_credit = Vec::with_capacity(n_phases);
    let mut phase_base_cost = Vec::with_capacity(n_phases);

    for p in 0..n_phases {
        let cur = &steps[p];
        let prev = &steps[(p + n_phases - 1) % n_phases];
        let cur_spec = get_crop_spec(&cur.crop);
        let prev_spec = get_crop_spec(&prev.crop);

        let mut rf = 1.0;
        let mut n_cred = 0.0;
        if n_phases > 1 && cur_spec.id == prev_spec.id && cur_spec.id != "fallow" {
            rf -= 0.13;
        } else if n_phases == 1 && cur_spec.id != "fallow" {
            rf -= 0.12;
        } else if cur_spec.family == prev_spec.family && cur_spec.id != "fallow" {
            rf -= 0.05;
        }
        if prev_spec.is_legume && !cur_spec.is_legume && cur_spec.id != "fallow" {
            rf += 0.07;
            n_cred = 55.0;
        }
        if prev_spec.id == "fallow" && cur_spec.id != "fallow" {
            rf += 0.08;
        }
        if prev.cover {
            rf += 0.03;
        }

        let c_idx = crop_index_map.get(cur_spec.id).copied().unwrap_or(0);
        let base_cost = resolve_crop_cost(farm, opts, cur_spec.id, cur.cover);
        phase_crop_idx.push(c_idx);
        phase_rot_factor.push(rf);
        phase_n_credit.push(n_cred);
        phase_base_cost.push(base_cost);
    }

    let mut annual_incomes: Vec<Vec<f64>> = vec![Vec::with_capacity(n_paths); n_years];
    let mut all_incomes: Vec<f64> = Vec::with_capacity(n_paths * n_years);
    let mut path_drawdowns: Vec<f64> = Vec::with_capacity(n_paths);
    let mut path_margin_years: Vec<i32> = Vec::with_capacity(n_paths);
    let mut ruin_count = 0usize;

    let mut step_opts = opts.clone();

    for path in worlds {
        let mut cash = config.cash_reserve;
        let mut peak_cash = cash;
        let mut max_dd = 0.0_f64;
        let mut ruined = false;
        let mut bad_window = Vec::with_capacity(n_years);
        let mut crossed_margin_year: Option<i32> = None;

        for (t_idx, wy) in path.iter().enumerate() {
            step_opts.d_t = wy.dt;
            step_opts.d_p = wy.dp;

            let mut net_sum = 0.0;
            for p in 0..n_phases {
                let c_idx = phase_crop_idx[p];
                let crop_id = &crop_list[c_idx];
                let season = simulate_season_with_carry(
                    farm,
                    crop_id,
                    wy.hist_year,
                    &step_opts,
                    phase_rot_factor[p],
                    phase_n_credit[p],
                    steps[p].cover,
                    false,
                );
                let price = wy.prices[c_idx];
                let cost = (phase_base_cost[p] * wy.cost_mult - phase_n_credit[p]
                    + opts.irrig_cap.max(0.0) * 0.45)
                    .max(40.0);
                let phase_net = season.yield_t_ha * price - cost;
                net_sum += phase_net;
            }

            let annual_net = net_sum / (n_phases as f64);
            annual_incomes[t_idx].push(annual_net);
            all_incomes.push(annual_net);

            cash += annual_net;
            if cash > peak_cash {
                peak_cash = cash;
            }
            let dd = (peak_cash - cash).max(0.0);
            if dd > max_dd {
                max_dd = dd;
            }
            if cash < 0.0 {
                ruined = true;
            }

            let is_bad = annual_net < opts.fail_net;
            bad_window.push(u8::from(is_bad));
            // Check 5-year rolling failure share to identify when rotation crosses `fail_share`
            if crossed_margin_year.is_none() && t_idx >= 4 {
                let recent_fails: usize = bad_window[(t_idx - 4)..=t_idx]
                    .iter()
                    .map(|&x| x as usize)
                    .sum();
                if (recent_fails as f64) / 5.0 > opts.fail_share {
                    crossed_margin_year = Some(years[t_idx]);
                }
            }
        }

        if ruined {
            ruin_count += 1;
        }
        path_drawdowns.push(max_dd);
        path_margin_years.push(crossed_margin_year.unwrap_or(2065));
    }

    // Compute per-year p10, p50, p90 fan and pBadYear
    let mut p10_vec = Vec::with_capacity(n_years);
    let mut p50_vec = Vec::with_capacity(n_years);
    let mut p90_vec = Vec::with_capacity(n_years);
    let mut p_bad_vec = Vec::with_capacity(n_years);

    for yr_incomes in &mut annual_incomes {
        let bad_cnt = yr_incomes.iter().filter(|&&v| v < opts.fail_net).count();
        p_bad_vec.push(round3((bad_cnt as f64) / (n_paths as f64)));

        yr_incomes.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        p10_vec.push(round2(percentile_sorted(yr_incomes, 0.10)));
        p50_vec.push(round2(percentile_sorted(yr_incomes, 0.50)));
        p90_vec.push(round2(percentile_sorted(yr_incomes, 0.90)));
    }

    // Overall VaR95, CVaR95, mean, SD, riskAdjusted
    all_incomes.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let var95 = percentile_sorted(&all_incomes, 0.05);
    let tail_cutoff = ((all_incomes.len() as f64 * 0.05).ceil() as usize).max(1);
    let cvar95 = all_incomes[..tail_cutoff].iter().sum::<f64>() / (tail_cutoff as f64);

    let total_n = all_incomes.len().max(1) as f64;
    let mean_annual = all_incomes.iter().sum::<f64>() / total_n;
    let variance = all_incomes
        .iter()
        .map(|&v| (v - mean_annual) * (v - mean_annual))
        .sum::<f64>()
        / total_n;
    let sd_annual = variance.sqrt();
    let risk_adjusted = if sd_annual > 1.0 {
        mean_annual / sd_annual
    } else {
        mean_annual
    };

    path_drawdowns.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let max_drawdown_p50 = percentile_sorted(&path_drawdowns, 0.50);

    path_margin_years.sort_unstable();
    let my_p10 = percentile_sorted_i32(&path_margin_years, 0.10);
    let my_p50 = percentile_sorted_i32(&path_margin_years, 0.50);
    let my_p90 = percentile_sorted_i32(&path_margin_years, 0.90);

    let to_opt_year = |y: i32| if y <= config.to_year { Some(y) } else { None };

    QuantRotationResult {
        rotation: steps,
        years: years.to_vec(),
        income: IncomeFan {
            p10: p10_vec,
            p50: p50_vec,
            p90: p90_vec,
        },
        p_bad_year: p_bad_vec,
        var95: round2(var95),
        cvar95: round2(cvar95),
        p_ruin: round3((ruin_count as f64) / (n_paths as f64)),
        max_drawdown_p50: round2(max_drawdown_p50),
        margin_year: MarginYearDistribution {
            p10: to_opt_year(my_p10),
            p50: to_opt_year(my_p50),
            p90: to_opt_year(my_p90),
        },
        mean_annual: round2(mean_annual),
        sd_annual: round2(sd_annual),
        risk_adjusted: round2(risk_adjusted),
    }
}

fn build_cholesky_correlation(
    crops: &[String],
    price_corr: &BTreeMap<String, f64>,
) -> Vec<Vec<f64>> {
    let n = crops.len();
    let mut mat = vec![vec![0.0; n]; n];
    for i in 0..n {
        mat[i][i] = 1.0;
        for j in (i + 1)..n {
            let k1 = format!("{}|{}", crops[i], crops[j]);
            let k2 = format!("{}|{}", crops[j], crops[i]);
            let corr = price_corr
                .get(&k1)
                .or_else(|| price_corr.get(&k2))
                .copied()
                .unwrap_or_else(|| {
                    if crops[i] == "fallow" || crops[j] == "fallow" {
                        0.0
                    } else {
                        0.40
                    }
                })
                .clamp(-0.85, 0.85);
            mat[i][j] = corr;
            mat[j][i] = corr;
        }
    }

    // Cholesky decomposition with diagonal regularization fallback for positive-definiteness
    let mut l = vec![vec![0.0; n]; n];
    for i in 0..n {
        for j in 0..=i {
            let mut sum = mat[i][j];
            for k in 0..j {
                sum -= l[i][k] * l[j][k];
            }
            if i == j {
                l[i][j] = sum.max(0.05).sqrt();
            } else {
                l[i][j] = sum / l[j][j].max(1e-6);
            }
        }
    }
    l
}

fn extract_ssp_trajectory(farm: &Farm, ssp_name: &str) -> (Vec<ScenarioPoint>, ScenarioHorizon) {
    let default_horizon = ScenarioHorizon {
        d_t: 2.1,
        d_t_p10: 1.5,
        d_t_p90: 2.8,
        d_p: -0.05,
        d_p_p10: -0.15,
        d_p_p90: 0.05,
    };

    if let Some(scen) = &farm.pack.scenarios {
        let chosen = if ssp_name.eq_ignore_ascii_case("ssp585") {
            scen.ssp585.as_ref().or(scen.ssp245.as_ref())
        } else {
            scen.ssp245.as_ref().or(scen.ssp585.as_ref())
        };
        if let Some(ssp) = chosen {
            let series = if ssp.series.is_empty() {
                default_cmip6_series()
            } else {
                ssp.series.clone()
            };
            let h = ssp.horizon_2050.clone().unwrap_or(default_horizon);
            return (series, h);
        }
    }

    (default_cmip6_series(), default_horizon)
}

fn interpolate_cmip6(series: &[ScenarioPoint], year: i32) -> (f64, f64) {
    if series.is_empty() || year <= 2025 {
        return (0.0, 0.0);
    }
    let first = &series[0];
    if year <= first.year {
        let span = (first.year - 2025).max(1) as f64;
        let frac = (year - 2025) as f64 / span;
        return (frac * first.d_t, frac * first.d_p);
    }
    for w in series.windows(2) {
        let a = &w[0];
        let b = &w[1];
        if year >= a.year && year <= b.year {
            let span = (b.year - a.year).max(1) as f64;
            let frac = (year - a.year) as f64 / span;
            return (
                a.d_t + frac * (b.d_t - a.d_t),
                a.d_p + frac * (b.d_p - a.d_p),
            );
        }
    }
    let last = series.last().unwrap();
    (last.d_t, last.d_p)
}

fn sample_standard_normal<R: Rng>(rng: &mut R) -> f64 {
    let u1: f64 = rng.gen_range(1e-7..1.0);
    let u2: f64 = rng.gen_range(0.0..std::f64::consts::TAU);
    (-2.0 * u1.ln()).sqrt() * u2.cos()
}

fn percentile_sorted(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((sorted.len() - 1) as f64 * p.clamp(0.0, 1.0)).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

fn percentile_sorted_i32(sorted: &[i32], p: f64) -> i32 {
    if sorted.is_empty() {
        return 2050;
    }
    let idx = ((sorted.len() - 1) as f64 * p.clamp(0.0, 1.0)).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

fn round3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{prepare_farm, FarmPack};

    #[test]
    fn test_quant_simulate_determinism_and_percentile_ordering() {
        let farm = prepare_farm(FarmPack::default());
        let rotations = vec![
            vec![
                RotationStep::new("maize", false),
                RotationStep::new("soybean", false),
            ],
            vec![
                RotationStep::new("wheat", false),
                RotationStep::new("sorghum", false),
                RotationStep::new("pea", true),
            ],
        ];
        let opts = SimOpts::default();
        let cfg = QuantSimConfig {
            paths: 250,
            from_year: 2026,
            to_year: 2050,
            ssp: "ssp245".to_string(),
            cash_reserve: 500.0,
            seed: 42,
        };

        let run1 = quant_simulate(&farm, &rotations, &opts, &cfg, None);
        let run2 = quant_simulate(&farm, &rotations, &opts, &cfg, None);

        // Must be 100% deterministic for identical seed
        assert_eq!(run1, run2);
        assert_eq!(run1.len(), 2);

        for res in &run1 {
            assert_eq!(res.years.len(), 25);
            assert_eq!(res.income.p10.len(), 25);
            assert_eq!(res.income.p50.len(), 25);
            assert_eq!(res.income.p90.len(), 25);

            for t in 0..25 {
                assert!(res.income.p10[t] <= res.income.p50[t]);
                assert!(res.income.p50[t] <= res.income.p90[t]);
                assert!((0.0..=1.0).contains(&res.p_bad_year[t]));
            }
            // Expected Shortfall (CVaR95) is always <= VaR95
            assert!(res.cvar95 <= res.var95 + 1e-6);
            assert!((0.0..=1.0).contains(&res.p_ruin));
        }
    }
}
