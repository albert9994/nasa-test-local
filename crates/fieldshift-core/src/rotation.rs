use crate::crops::{get_crop, normalize_crop_id};
use crate::season::{round1, round2, simulate_season_with_context, CarryOverContext, SeasonResult};
use crate::soil_health::evaluate_soil_health;
use crate::{PreparedFarm, RotationStep, SimOptions};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropYieldSummary {
    pub mean: f32,
    pub min: f32,
    pub max: f32,
    pub years: BTreeMap<String, f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationResult {
    pub years: Vec<i32>,
    pub farm_net: Vec<f32>,
    pub mean_net: f32,
    pub min_net: f32,
    pub worst_year: i32,
    pub p_fail: f32,
    pub fails: u32,
    pub yield_by_crop: BTreeMap<String, CropYieldSummary>,
    pub soil_score: f32,
    pub soc_change_pct: f32,
    pub erosion: f32,
    pub water_use: f32,
    pub traced: Option<SeasonResult>,
    #[serde(skip)]
    pub worst_year_reasons: Vec<String>,
}

/// Simulates a multi-crop rotation across all historical weather years on the farm (`phases × years`).
/// Each phase `p in 0..k` represents a field offset in the rotation so all rotation steps
/// are active every year and experience true year-to-year soil water & nitrogen carry-over.
pub fn simulate_rotation(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
    trace_year: Option<i32>,
) -> RotationResult {
    let fallback_rot = [RotationStep {
        crop: "maize".to_string(),
        cover: false,
    }];
    let rot = if rotation.is_empty() {
        &fallback_rot[..]
    } else {
        rotation
    };
    let k = rot.len();
    let years = &farm.years;
    let n_years = years.len();

    // Count distinct crops/families for rotation diversity bonus
    let mut distinct_crops = HashSet::new();
    let mut distinct_families = HashSet::new();
    for step in rot {
        let cid = normalize_crop_id(&step.crop);
        distinct_crops.insert(cid);
        let fam = &get_crop(cid).family;
        if fam != "none" {
            distinct_families.insert(fam.as_str());
        }
    }
    let diversity_bonus = if distinct_crops.len() >= 3 && distinct_families.len() >= 2 {
        0.04
    } else if distinct_crops.len() >= 2 {
        0.015
    } else {
        0.0
    };

    // Precompute transition carry-over multipliers from step `(s + k - 1) % k` -> `s`
    let mut step_rot_factor = vec![1.0_f32; k];
    let mut step_cost_delta = vec![0.0_f32; k];
    let rye_cost = get_crop("rye").default_cost_usd_ha;

    for s in 0..k {
        let prev_idx = (s + k - 1) % k;
        let curr_id = normalize_crop_id(&rot[s].crop);
        let prev_id = normalize_crop_id(&rot[prev_idx].crop);
        let curr_crop = get_crop(curr_id);
        let prev_crop = get_crop(prev_id);

        let mut mult: f32 = 1.0 + diversity_bonus;
        let mut cost_adj = 0.0_f32;

        if curr_id != "fallow" {
            if prev_crop.legume && !curr_crop.legume {
                // Legume N credit to following cereal/oilseed (+8% yield, -$55/ha N fertilizer)
                mult += 0.08;
                cost_adj -= 55.0;
            } else if prev_id == "fallow" {
                // Fallow weed/nutrient rest benefit
                mult += 0.05;
            } else if curr_id == prev_id {
                // Same-crop monoculture penalty (pests, root disease, allelopathy)
                mult -= if curr_id == "sunflower" || curr_id == "pea" {
                    0.18
                } else {
                    0.12
                };
            } else if curr_crop.family == prev_crop.family && curr_crop.family != "none" {
                // Same botanical family penalty
                mult -= 0.04;
            }
        }

        if rot[prev_idx].cover {
            // Winter rye cover crop adds soil structure benefit (+2% yield)
            mult += 0.02;
        }
        if rot[s].cover {
            // Seed & establishment cost for cover crop planted after harvest
            cost_adj += rye_cost;
        }

        step_rot_factor[s] = mult.clamp(0.70, 1.20);
        step_cost_delta[s] = cost_adj;
    }

    // Track ending soil moisture fill per physical phase `p in 0..k`
    let mut phase_fill = vec![0.72_f32; k];
    let mut farm_net = Vec::with_capacity(n_years);
    let mut total_water_use = 0.0_f32;
    let mut season_count = 0.0_f32;

    // Store per-crop annual yields
    let mut crop_year_yields: BTreeMap<String, BTreeMap<String, (f32, f32)>> = BTreeMap::new();
    for step in rot {
        let cid = normalize_crop_id(&step.crop).to_string();
        crop_year_yields.entry(cid).or_default();
    }

    let mut min_net = f32::INFINITY;
    let mut worst_year = years.first().copied().unwrap_or(2012);
    let mut worst_year_idx = 0usize;
    let mut fails = 0_u32;
    let mut net_sum = 0.0_f32;

    // Remember worst-year season diagnostics
    let mut worst_year_heat_days = 0_u32;
    let mut worst_year_flower_drought = false;
    let mut worst_year_stress_days = 0_u32;

    let p_mult = (1.0 + opts.d_p).max(0.0);

    for (y_idx, &year) in years.iter().enumerate() {
        let gwet_anom = farm.year_mean_gwet_anomaly(year);
        let wy = farm.get_weather_year(year);
        let off_season_rain = wy.off_season_precip_mm() * p_mult;
        let off_season_recharge =
            (off_season_rain / (farm.soil.taw_mm_per_m * 1.4)).clamp(0.05, 0.55);

        let mut year_net_sum = 0.0_f32;
        let mut year_max_heat_days = 0_u32;
        let mut year_flower_drought = false;
        let mut year_max_stress_days = 0_u32;

        for (p, pf) in phase_fill.iter_mut().enumerate().take(k) {
            let s = (y_idx + p) % k;
            let prev_s = (s + k - 1) % k;
            let prev_id = normalize_crop_id(&rot[prev_s].crop);
            let curr_id = normalize_crop_id(&rot[s].crop);

            // Off-season soil moisture balance from previous harvest to current sowing
            let cover_water_draw = if rot[prev_s].cover { -0.04 } else { 0.0 };
            let fallow_bonus = if prev_id == "fallow" { 0.16 } else { 0.0 };
            let start_fill = (*pf * 0.55
                + off_season_recharge
                + 0.22 * gwet_anom
                + cover_water_draw
                + fallow_bonus)
                .clamp(0.22, 0.94);

            let ctx = CarryOverContext {
                initial_fill: start_fill,
                rotation_factor: step_rot_factor[s],
                cost_delta_usd_ha: step_cost_delta[s],
            };

            let res = simulate_season_with_context(farm, curr_id, year, opts, false, ctx);
            *pf = res.ending_fill_fraction;
            year_net_sum += res.net;
            total_water_use += res.eta;
            season_count += 1.0;

            year_max_heat_days = year_max_heat_days.max(res.extreme_heat_days);
            if res.flowering_drought {
                year_flower_drought = true;
            }
            year_max_stress_days = year_max_stress_days.max(res.stress_days);

            let entry = crop_year_yields
                .entry(curr_id.to_string())
                .or_default()
                .entry(year.to_string())
                .or_insert((0.0, 0.0));
            entry.0 += res.yield_t_ha;
            entry.1 += 1.0;
        }

        let year_net = round1(year_net_sum / (k as f32));
        farm_net.push(year_net);
        net_sum += year_net;

        if year_net < opts.fail_net {
            fails += 1;
        }
        if year_net < min_net {
            min_net = year_net;
            worst_year = year;
            worst_year_idx = y_idx;
            worst_year_heat_days = year_max_heat_days;
            worst_year_flower_drought = year_flower_drought;
            worst_year_stress_days = year_max_stress_days;
        }
    }

    let n_f = (n_years.max(1)) as f32;
    let mean_net = round1(net_sum / n_f);
    let p_fail = ((fails as f32) / n_f * 10000.0).round() / 10000.0;
    if !min_net.is_finite() {
        min_net = 0.0;
    }

    // Summarize yields by crop
    let mut yield_by_crop = BTreeMap::new();
    for (cid, yr_map) in crop_year_yields {
        let mut sum = 0.0_f32;
        let mut min_y = f32::INFINITY;
        let mut max_y = 0.0_f32;
        let mut clean_years = BTreeMap::new();
        for (yr_str, (y_tot, cnt)) in yr_map {
            let val = round2(y_tot / cnt.max(1.0));
            sum += val;
            min_y = min_y.min(val);
            max_y = max_y.max(val);
            clean_years.insert(yr_str, val);
        }
        let count = clean_years.len().max(1) as f32;
        if !min_y.is_finite() {
            min_y = 0.0;
        }
        yield_by_crop.insert(
            cid,
            CropYieldSummary {
                mean: round2(sum / count),
                min: round2(min_y),
                max: round2(max_y),
                years: clean_years,
            },
        );
    }

    let soil_metrics = evaluate_soil_health(farm, rot);

    // Build traced season for `trace_year` (or default to `worst_year` when requested)
    let target_trace_year = trace_year.unwrap_or(worst_year);
    let trace_y_idx = years
        .iter()
        .position(|&y| y == target_trace_year)
        .unwrap_or(worst_year_idx);
    let actual_trace_year = years.get(trace_y_idx).copied().unwrap_or(worst_year);

    // Pick first non-fallow crop in rotation for the trace
    let trace_step_idx = rot
        .iter()
        .position(|st| normalize_crop_id(&st.crop) != "fallow")
        .unwrap_or(0);
    let trace_crop_id = normalize_crop_id(&rot[trace_step_idx].crop);
    let gwet_anom = farm.year_mean_gwet_anomaly(actual_trace_year);
    let trace_ctx = CarryOverContext {
        initial_fill: (0.68 + 0.22 * gwet_anom).clamp(0.25, 0.90),
        rotation_factor: step_rot_factor[trace_step_idx],
        cost_delta_usd_ha: step_cost_delta[trace_step_idx],
    };
    let traced = Some(simulate_season_with_context(
        farm,
        trace_crop_id,
        actual_trace_year,
        opts,
        true,
        trace_ctx,
    ));

    let mut worst_year_reasons = Vec::new();
    if worst_year_flower_drought {
        worst_year_reasons.push("drought at flowering".to_string());
    } else if worst_year_stress_days > 20 {
        worst_year_reasons.push(format!("{} water-stress days", worst_year_stress_days));
    }
    if worst_year_heat_days > 0 {
        worst_year_reasons.push(format!("{} extreme heat days", worst_year_heat_days));
    }
    if worst_year_reasons.is_empty() {
        worst_year_reasons.push("moisture deficit during grain fill".to_string());
    }

    RotationResult {
        years: years.clone(),
        farm_net,
        mean_net,
        min_net: round1(min_net),
        worst_year,
        p_fail,
        fails,
        yield_by_crop,
        soil_score: soil_metrics.soil_score,
        soc_change_pct: soil_metrics.soc_change_pct,
        erosion: soil_metrics.erosion,
        water_use: round1(total_water_use / season_count.max(1.0)),
        traced,
        worst_year_reasons,
    }
}
