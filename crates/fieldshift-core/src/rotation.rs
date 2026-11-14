//! Rotation simulation: every phase of the rotation is on some field every year (phases x years),
//! with soil-water, nitrogen and disease carry-over between consecutive crops.

use crate::crops::{CropLibrary, COVER_CROP_COST_USD_HA};
use crate::season::{simulate_season_ctx, CarryOverContext, SeasonResult};
use crate::soil_health::{compute_soil_health, RotationPhaseSoilInput, SiteSoilClimate};
use crate::{
    round1, round2, round3, PreparedFarm, ResolvedRotation, Result, RotationStep, SimOptions,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

/// C3 `RotationResult`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationResult {
    pub years: Vec<i32>,
    pub farm_net: Vec<f64>,
    pub mean_net: f64,
    pub min_net: f64,
    pub worst_year: i32,
    pub p_fail: f64,
    pub fails: u32,
    /// Mean yield (t/ha) of each crop in every year (averaged over the rotation phases growing that crop).
    pub yield_by_crop: BTreeMap<String, Vec<f64>>,
    pub soil_score: f64,
    pub soc_change_pct: f64,
    pub erosion: f64,
    pub water_use: f64,
    /// One season per rotation phase in `traceYear` (with daily traces), `null` otherwise.
    pub traced: Option<Vec<SeasonResult>>,
}

/// Carry-over of one rotation step coming from the previous step.
#[derive(Debug, Clone, Copy)]
pub struct PhaseCarry {
    pub rotation_factor: f64,
    pub cost_delta_usd_ha: f64,
    /// Extra plant-available water at sowing, as a fraction of the root zone (fallow / legume / cover effects).
    pub water_delta_fill: f64,
}

/// Precomputes the carry-over multipliers of every step `(s + k - 1) % k -> s`.
pub fn phase_carry(farm: &PreparedFarm, rot: &ResolvedRotation) -> Vec<PhaseCarry> {
    let k = rot.steps.len();
    let annual = farm.mean_annual_precip_mm();
    let mut families = HashSet::new();
    for c in &rot.crops {
        if c.family != "none" {
            families.insert(c.family.as_str());
        }
    }
    let n_fam = families.len();
    let lib = CropLibrary::load().ok();
    (0..k)
        .map(|s| {
            let prev = (s + k - 1) % k;
            let (mut factor, mut cost, mut water_mm) = (1.0, 0.0, 0.0);
            if let Some(lib) = lib {
                let e = lib.carry_over_effect(
                    rot.crops[prev].id,
                    rot.steps[prev].cover,
                    rot.crops[s].id,
                    n_fam,
                    annual,
                );
                factor = e.yield_multiplier;
                cost = e.cost_delta_usd_ha;
                water_mm = e.starting_water_delta_mm;
            }
            if rot.steps[s].cover {
                cost += COVER_CROP_COST_USD_HA;
            }
            PhaseCarry {
                rotation_factor: factor,
                cost_delta_usd_ha: cost,
                water_delta_fill: water_mm / farm.soil.taw_mm_per_m.max(60.0),
            }
        })
        .collect()
}

/// Starting root-zone fill of a season from the previous season's ending fill and the off-season weather.
pub fn start_fill(
    farm: &PreparedFarm,
    prev_end_fill: f64,
    off_season_rain_mm: f64,
    gwet_anom: f64,
    carry: &PhaseCarry,
) -> f64 {
    let recharge = (off_season_rain_mm / (farm.soil.taw_mm_per_m * 1.4)).clamp(0.05, 0.55);
    (prev_end_fill * 0.55 + recharge + 0.22 * gwet_anom + carry.water_delta_fill).clamp(0.22, 0.94)
}

/// C3 `simulateRotation` (validates crop ids).
pub fn simulate_rotation(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
    trace_year: Option<i32>,
) -> Result<RotationResult> {
    let rot = ResolvedRotation::new(rotation)?;
    Ok(simulate_resolved(farm, &rot, opts, trace_year))
}

/// Simulation on an already validated rotation (infallible).
pub fn simulate_resolved(
    farm: &PreparedFarm,
    rot: &ResolvedRotation,
    opts: &SimOptions,
    trace_year: Option<i32>,
) -> RotationResult {
    let k = rot.steps.len();
    let years = &farm.years;
    let n_years = years.len();
    let carry = phase_carry(farm, rot);
    let p_mult = (1.0 + opts.d_p).max(0.0);

    let mut phase_fill = vec![0.72_f64; k];
    let mut farm_net = Vec::with_capacity(n_years);
    let mut total_water_use = 0.0_f64;
    let mut season_count = 0.0_f64;
    let mut traced: Option<Vec<SeasonResult>> = None;

    // crop id -> per-year (sum of yields, count)
    let mut crop_year: BTreeMap<&'static str, Vec<(f64, f64)>> = BTreeMap::new();
    for c in &rot.crops {
        crop_year
            .entry(c.id)
            .or_insert_with(|| vec![(0.0, 0.0); n_years]);
    }

    let (mut min_net, mut worst_year) = (f64::INFINITY, years.first().copied().unwrap_or(0));
    let (mut fails, mut net_sum) = (0_u32, 0.0);

    for (y_idx, &year) in years.iter().enumerate() {
        let Some(wy) = farm.weather_by_year.get(&year) else {
            continue;
        };
        let gwet_anom = farm.year_mean_gwet_anomaly(wy);
        let off_season_rain = wy.off_season_precip_mm() * p_mult;
        let want_trace = trace_year == Some(year);
        let mut year_net_sum = 0.0;
        let mut year_trace = Vec::new();

        for (p, fill) in phase_fill.iter_mut().enumerate() {
            let s = (y_idx + p) % k;
            let ctx = CarryOverContext {
                initial_fill: start_fill(farm, *fill, off_season_rain, gwet_anom, &carry[s]),
                rotation_factor: carry[s].rotation_factor,
                cost_delta_usd_ha: carry[s].cost_delta_usd_ha,
            };
            let res = simulate_season_ctx(farm, rot.crops[s], wy, opts, want_trace, ctx);
            *fill = res.ending_fill_fraction;
            year_net_sum += res.net;
            total_water_use += res.eta;
            season_count += 1.0;
            if let Some(cell) = crop_year
                .get_mut(rot.crops[s].id)
                .and_then(|v| v.get_mut(y_idx))
            {
                cell.0 += res.yield_t_ha;
                cell.1 += 1.0;
            }
            if want_trace {
                year_trace.push(res);
            }
        }
        if want_trace {
            traced = Some(year_trace);
        }

        let year_net = round1(year_net_sum / k as f64);
        farm_net.push(year_net);
        net_sum += year_net;
        if year_net < opts.fail_net {
            fails += 1;
        }
        if year_net < min_net {
            min_net = year_net;
            worst_year = year;
        }
    }

    let n_f = n_years.max(1) as f64;
    if !min_net.is_finite() {
        min_net = 0.0;
    }

    let mut yield_by_crop = BTreeMap::new();
    let mut crop_mean_yield: BTreeMap<&'static str, f64> = BTreeMap::new();
    for (cid, per_year) in &crop_year {
        let ys: Vec<f64> = per_year
            .iter()
            .map(|&(sum, cnt)| round2(sum / cnt.max(1.0)))
            .collect();
        crop_mean_yield.insert(cid, ys.iter().sum::<f64>() / ys.len().max(1) as f64);
        yield_by_crop.insert((*cid).to_string(), ys);
    }

    let (soil_score, soc_change_pct, erosion) = soil_metrics(farm, rot, &crop_mean_yield);

    RotationResult {
        years: years.clone(),
        farm_net,
        mean_net: round1(net_sum / n_f),
        min_net: round1(min_net),
        worst_year,
        p_fail: round3(fails as f64 / n_f),
        fails,
        yield_by_crop,
        soil_score,
        soc_change_pct,
        erosion,
        water_use: round1(total_water_use / season_count.max(1.0)),
        traced,
    }
}

/// Soil carbon / erosion / soil score from the yield-driven soil-health model.
fn soil_metrics(
    farm: &PreparedFarm,
    rot: &ResolvedRotation,
    mean_yield: &BTreeMap<&'static str, f64>,
) -> (f64, f64, f64) {
    let Ok(lib) = CropLibrary::load() else {
        return (50.0, 0.0, 0.0);
    };
    let phases: Vec<RotationPhaseSoilInput<'_>> = rot
        .crops
        .iter()
        .zip(&rot.steps)
        .map(|(c, step)| {
            let params = lib.get(c.id);
            RotationPhaseSoilInput {
                crop_id: c.id,
                family: c.family.as_str(),
                is_legume: c.legume,
                is_winter: c.winter,
                cover: step.cover,
                mean_yield_t_ha: mean_yield.get(c.id).copied().unwrap_or(0.0),
                residue_ratio: params.map(|p| p.residue_ratio).unwrap_or(c.residue_ratio),
                root_shoot_ratio: params
                    .map(|p| p.root_shoot_ratio)
                    .unwrap_or(c.root_shoot_ratio),
                rusle_c: c.rusle_c,
            }
        })
        .collect();
    let site = SiteSoilClimate {
        sand_pct: farm.soil.sand_pct,
        silt_pct: farm.soil.silt_pct,
        clay_pct: farm.soil.clay_pct,
        soc_g_kg: farm.soil.soc_top_g_kg,
        bdod_g_cm3: farm.soil.bdod_top_g_cm3,
        slope_pct: farm.meta.slope,
        mean_annual_prcp_mm: farm.mean_annual_precip_mm(),
        mean_annual_temp_c: farm.mean_annual_temp_c(),
    };
    let r = compute_soil_health(&phases, &site);
    (f64::from(r.soil_score), r.soc_change_pct, r.erosion)
}
