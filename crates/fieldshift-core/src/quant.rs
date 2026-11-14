use crate::crops::{get_crop, normalize_crop_id};
use crate::rotation::simulate_rotation;
use crate::season::{round1, round2};
use crate::{PreparedFarm, RotationStep, SimOptions};
use rand::prelude::*;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    pub cash_reserve: f32,
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
fn default_cash_reserve() -> f32 {
    500.0
}
fn default_seed() -> u64 {
    42
}

impl Default for QuantSimConfig {
    fn default() -> Self {
        Self {
            paths: 1000,
            from_year: 2026,
            to_year: 2050,
            ssp: "ssp245".to_string(),
            cash_reserve: 500.0,
            seed: 42,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantCropParam {
    pub price_mean: Option<f32>,
    pub vol: Option<f32>,
    pub reversion: Option<f32>,
    pub yield_corr: Option<f32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantInputParam {
    pub drift: Option<f32>,
    pub jump_prob: Option<f32>,
    pub jump_size: Option<f32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantParams {
    #[serde(default)]
    pub crops: HashMap<String, QuantCropParam>,
    #[serde(default)]
    pub inputs: QuantInputParam,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantBand {
    pub p10: Vec<f32>,
    pub p50: Vec<f32>,
    pub p90: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantMarginYearBand {
    pub p10: Option<i32>,
    pub p50: Option<i32>,
    pub p90: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantRotationResult {
    pub rotation: Vec<RotationStep>,
    pub years: Vec<i32>,
    pub income: QuantBand,
    pub p_bad_year: Vec<f32>,
    pub var95: f32,
    pub cvar95: f32,
    pub p_ruin: f32,
    pub max_drawdown_p50: f32,
    pub margin_year: QuantMarginYearBand,
    pub mean_annual: f32,
    pub sd_annual: f32,
    pub risk_adjusted: f32,
}

/// Runs deterministic Monte Carlo futures (`paths` trajectories across `from_year..=to_year`)
/// for each rotation using block-bootstrapped historical weather shifted along CMIP6 trajectories,
/// Ornstein-Uhlenbeck mean-reverting crop prices with negative yield-price correlation, and cost jumps.
pub fn quant_simulate(
    farm: &PreparedFarm,
    rotations: &[Vec<RotationStep>],
    opts: &SimOptions,
    cfg: &QuantSimConfig,
    quant_params: Option<&QuantParams>,
) -> Vec<QuantRotationResult> {
    let from_y = cfg.from_year.min(cfg.to_year);
    let to_y = cfg.to_year.max(from_y);
    let years: Vec<i32> = (from_y..=to_y).collect();
    let n_horizon = years.len().max(1);
    let n_paths = cfg.paths.clamp(10, 20_000);

    // Target 2050 warming/precipitation shift from scenario or defaults
    let (target_dt_2050, target_dp_2050, dt_spread) =
        farm.scenario_delta_2050(&cfg.ssp).unwrap_or_else(|| {
            if cfg.ssp.eq_ignore_ascii_case("ssp585") {
                (2.6, -0.08, 0.65)
            } else {
                (1.9, -0.04, 0.50)
            }
        });

    let qp = quant_params.cloned().unwrap_or_default();
    let cost_drift = qp.inputs.drift.unwrap_or(0.015).clamp(-0.02, 0.08);
    let jump_prob = qp.inputs.jump_prob.unwrap_or(0.05).clamp(0.0, 0.30);
    let jump_size = qp.inputs.jump_size.unwrap_or(0.32).clamp(0.0, 1.0);

    let mut out = Vec::with_capacity(rotations.len());

    for (rot_idx, rot) in rotations.iter().enumerate() {
        // Precompute rotation response at 3 warming checkpoints (0.0, +1.5, +3.0 °C) for fast interpolation
        let base_sim = simulate_rotation(farm, rot, opts, None);
        let mut mid_opts = opts.clone();
        mid_opts.d_t += 1.5;
        mid_opts.d_p += target_dp_2050 * 0.6;
        let mid_sim = simulate_rotation(farm, rot, &mid_opts, None);

        let mut high_opts = opts.clone();
        high_opts.d_t += 3.0;
        high_opts.d_p += target_dp_2050 * 1.2;
        let high_sim = simulate_rotation(farm, rot, &high_opts, None);

        let n_hist = base_sim.farm_net.len().max(1);

        // Compute average crop price volatility, reversion, yield correlation, and base revenue/cost split
        let mut vol_avg = 0.0_f32;
        let mut rev_avg = 0.0_f32;
        let mut y_corr_avg = 0.0_f32;
        let mut base_cost_avg = 0.0_f32;

        for st in rot {
            let cid = normalize_crop_id(&st.crop);
            let cp = qp.crops.get(cid);
            vol_avg += cp.and_then(|p| p.vol).unwrap_or(0.23);
            rev_avg += cp.and_then(|p| p.reversion).unwrap_or(0.55);
            y_corr_avg += cp.and_then(|p| p.yield_corr).unwrap_or(-0.28);
            let mut sc = farm.crop_cost(cid, opts);
            if st.cover {
                sc += get_crop("rye").default_cost_usd_ha;
            }
            base_cost_avg += sc;
        }
        let k_f = rot.len().max(1) as f32;
        vol_avg /= k_f;
        rev_avg /= k_f;
        y_corr_avg /= k_f;
        base_cost_avg /= k_f;

        let base_rev_avg = (base_sim.mean_net + base_cost_avg).max(50.0);

        let mut rng = ChaCha8Rng::seed_from_u64(cfg.seed.wrapping_add((rot_idx as u64) * 7919));

        // Per-year income across paths: `year_incomes[t][path]`
        let mut year_incomes: Vec<Vec<f32>> = vec![Vec::with_capacity(n_paths); n_horizon];
        let mut bad_year_counts = vec![0_u32; n_horizon];
        let mut all_annual_incomes = Vec::with_capacity(n_paths * n_horizon);
        let mut max_drawdowns = Vec::with_capacity(n_paths);
        let mut margin_years = Vec::with_capacity(n_paths);
        let mut ruin_count = 0_u32;

        for _ in 0..n_paths {
            // Sample climate sensitivity multiplier for this trajectory (between p10 and p90)
            let z_clim = sample_standard_normal(&mut rng);
            let path_dt_2050 = (target_dt_2050 + z_clim * dt_spread).max(0.2);

            let mut log_price = 0.0_f32;
            let mut cost_shock_mult = 1.0_f32;
            let mut cash = cfg.cash_reserve;
            let mut peak_cash = cash;
            let mut max_dd = 0.0_f32;
            let mut ruined = false;

            // Block bootstrap starting index
            let mut hist_idx = rng.random_range(0..n_hist);
            let mut block_rem = 0usize;
            let mut bad_window = [0_u8; 5];
            let mut margin_crossed_yr: Option<i32> = None;

            for (t, &yr) in years.iter().enumerate() {
                if block_rem == 0 {
                    hist_idx = rng.random_range(0..n_hist);
                    block_rem = 3; // 3-year block bootstrap preserves multi-year droughts
                } else {
                    hist_idx = (hist_idx + 1) % n_hist;
                    block_rem -= 1;
                }

                let progress = ((yr - 2025) as f32 / 25.0).clamp(0.0, 2.0);
                let dt_now = path_dt_2050 * progress;

                // Interpolate real historical season outcome at current warming `dt_now`
                let net_at_dt = if dt_now <= 1.5 {
                    let w = (dt_now / 1.5).clamp(0.0, 1.0);
                    base_sim.farm_net[hist_idx] * (1.0 - w) + mid_sim.farm_net[hist_idx] * w
                } else {
                    let w = ((dt_now - 1.5) / 1.5).clamp(0.0, 1.5);
                    mid_sim.farm_net[hist_idx] * (1.0 - w) + high_sim.farm_net[hist_idx] * w
                };

                let implied_rev = (net_at_dt + base_cost_avg).max(0.0);
                let yield_shock = ((implied_rev - base_rev_avg) / base_rev_avg).clamp(-0.85, 0.85);

                // Ornstein-Uhlenbeck log-price correlated with regional yield shock
                let z_p = sample_standard_normal(&mut rng);
                let eps_p = y_corr_avg * yield_shock + (1.0 - y_corr_avg * y_corr_avg).sqrt() * z_p;
                log_price = log_price * (1.0 - rev_avg) + vol_avg * eps_p;
                let price_mult = log_price.exp().clamp(0.45, 2.20);

                // Input cost jump-diffusion with fast recovery
                let jump = if rng.random::<f32>() < jump_prob {
                    jump_size
                } else {
                    0.0
                };
                cost_shock_mult = (1.0 + (cost_shock_mult - 1.0) * 0.45 + jump).clamp(0.85, 1.85);
                let trend_cost_mult = (1.0 + cost_drift * (t as f32) * 0.35) * cost_shock_mult;

                let sim_income = implied_rev * price_mult - base_cost_avg * trend_cost_mult;

                year_incomes[t].push(sim_income);
                all_annual_incomes.push(sim_income);

                let is_bad = sim_income < opts.fail_net;
                if is_bad {
                    bad_year_counts[t] += 1;
                }

                bad_window[t % 5] = if is_bad { 1 } else { 0 };
                if t >= 4 && margin_crossed_yr.is_none() {
                    let recent_bad: u8 = bad_window.iter().sum();
                    if (recent_bad as f32 / 5.0) > opts.fail_share + 0.05 {
                        margin_crossed_yr = Some(yr);
                    }
                }

                cash += sim_income;
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
            }

            if ruined {
                ruin_count += 1;
            }
            max_drawdowns.push(max_dd);
            margin_years.push(margin_crossed_yr.unwrap_or(2055));
        }

        // Compute year-by-year fan percentiles (p10, p50, p90) and P(bad year)
        let mut p10_vec = Vec::with_capacity(n_horizon);
        let mut p50_vec = Vec::with_capacity(n_horizon);
        let mut p90_vec = Vec::with_capacity(n_horizon);
        let mut p_bad_vec = Vec::with_capacity(n_horizon);

        for t in 0..n_horizon {
            let slice = &mut year_incomes[t];
            slice.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            p10_vec.push(round1(percentile_sorted(slice, 0.10)));
            p50_vec.push(round1(percentile_sorted(slice, 0.50)));
            p90_vec.push(round1(percentile_sorted(slice, 0.90)));
            p_bad_vec.push(round2(bad_year_counts[t] as f32 / n_paths as f32));
        }

        // Overall VaR95, CVaR95, meanAnnual, sdAnnual
        all_annual_incomes.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let var95 = round1(percentile_sorted(&all_annual_incomes, 0.05));
        let tail_count = ((all_annual_incomes.len() as f32 * 0.05).ceil() as usize).max(1);
        let cvar95 =
            round1(all_annual_incomes[..tail_count].iter().sum::<f32>() / (tail_count as f32));

        let n_all = all_annual_incomes.len().max(1) as f32;
        let mean_annual = all_annual_incomes.iter().sum::<f32>() / n_all;
        let variance = all_annual_incomes
            .iter()
            .map(|&x| (x - mean_annual) * (x - mean_annual))
            .sum::<f32>()
            / n_all;
        let sd_annual = variance.sqrt().max(1.0);
        let risk_adjusted = round2(mean_annual / sd_annual);

        max_drawdowns.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let max_drawdown_p50 = round1(percentile_sorted(&max_drawdowns, 0.50));

        margin_years.sort();
        let my_p10 = margin_years[(margin_years.len() * 10 / 100).min(margin_years.len() - 1)];
        let my_p50 = margin_years[(margin_years.len() * 50 / 100).min(margin_years.len() - 1)];
        let my_p90 = margin_years[(margin_years.len() * 90 / 100).min(margin_years.len() - 1)];

        out.push(QuantRotationResult {
            rotation: rot.clone(),
            years: years.clone(),
            income: QuantBand {
                p10: p10_vec,
                p50: p50_vec,
                p90: p90_vec,
            },
            p_bad_year: p_bad_vec,
            var95,
            cvar95,
            p_ruin: round2(ruin_count as f32 / n_paths as f32),
            max_drawdown_p50,
            margin_year: QuantMarginYearBand {
                p10: if my_p10 <= 2050 { Some(my_p10) } else { None },
                p50: if my_p50 <= 2050 { Some(my_p50) } else { None },
                p90: if my_p90 <= 2050 { Some(my_p90) } else { None },
            },
            mean_annual: round1(mean_annual),
            sd_annual: round1(sd_annual),
            risk_adjusted,
        });
    }

    out
}

#[inline]
fn percentile_sorted(sorted: &[f32], q: f32) -> f32 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((sorted.len() - 1) as f32 * q.clamp(0.0, 1.0)).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

/// Box-Muller standard normal draw from deterministic RNG.
#[inline]
fn sample_standard_normal<R: Rng>(rng: &mut R) -> f32 {
    let u1 = rng.random::<f32>().clamp(1e-6, 1.0 - 1e-6);
    let u2 = rng.random::<f32>();
    (-2.0 * u1.ln()).sqrt() * (std::f32::consts::TAU * u2).cos()
}
