//! I4 · Rotation Optimizer & `pickThree` Selector (`optimize.rs`, Contract C3)
//!
//! Implements:
//! - Canonical rotation enumeration (1–3 crops, no back-to-back repeats, cyclic deduplication
//!   `A-B-C == B-C-A == C-A-B`, ± winter rye cover crop, capped to ~250 candidates for < 1 s WASM)
//! - Constraint filtering (`maxCostPerHa`, `equipment`, `sellable`)
//! - Dual evaluation: today (`base`) + climate stress (`+2 °C`, `−20 %` rain)
//! - `pick_three`: selects `"Best balance"`, `"Drought shield"`, and `"Soil builder"`

use crate::rules::{evaluate_rules, RuleHit};
use crate::score::{compute_score_from_precomputed, format_rotation_label, ScoreSubscores};
use crate::{
    default_crop_pool, get_crop_spec, simulate_rotation, Constraints, Farm, PriorityWeights,
    RotationResult, RotationStep, SimOpts,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const STRESS_DT_C: f64 = 2.0;
pub const STRESS_DP_FRAC: f64 = -0.20;
pub const MAX_CANDIDATES: usize = 250;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScoreParts {
    pub subscores: ScoreSubscores,
    pub base: i32,
    pub rules_delta: i32,
    pub rules: Vec<RuleHit>,
    pub excluded_by: Option<String>,
    pub fits_budget: bool,
    pub missing_equipment: Vec<String>,
    pub avg_cost_per_ha: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizedCandidate {
    pub rot: Vec<RotationStep>,
    pub base: RotationResult,
    pub stress: RotationResult,
    pub score: f64,
    pub parts: ScoreParts,
    pub viable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedRotation {
    pub rot: Vec<RotationStep>,
    pub label: String,
    pub why: String,
    pub base: RotationResult,
    pub stress: RotationResult,
    pub score: f64,
    pub fits_budget: bool,
    pub missing_equipment: Vec<String>,
}

/// Returns the canonical cyclic shift of a rotation so `A-B-C`, `B-C-A`, and `C-A-B` map to the same key.
pub fn canonicalize_rotation(rot: &[RotationStep]) -> Vec<RotationStep> {
    let n = rot.len();
    if n <= 1 {
        return rot.to_vec();
    }
    let mut best = rot.to_vec();
    let mut best_key = rotation_sort_key(&best);

    for shift in 1..n {
        let mut shifted = Vec::with_capacity(n);
        for i in 0..n {
            shifted.push(rot[(i + shift) % n].clone());
        }
        let key = rotation_sort_key(&shifted);
        if key < best_key {
            best_key = key;
            best = shifted;
        }
    }
    best
}

fn rotation_sort_key(rot: &[RotationStep]) -> String {
    rot.iter()
        .map(|s| format!("{}:{}", get_crop_spec(&s.crop).id, u8::from(s.cover)))
        .collect::<Vec<_>>()
        .join("|")
}

/// Generates up to `MAX_CANDIDATES` (~250) distinct candidate rotations of length 1–3 crops,
/// without back-to-back repeats and with cyclic deduplication (`A-B-C == B-C-A`), ± rye cover.
pub fn enumerate_candidate_rotations(crop_pool: &[String]) -> Vec<Vec<RotationStep>> {
    let raw_pool: Vec<String> = if crop_pool.is_empty() {
        default_crop_pool()
    } else {
        crop_pool.to_vec()
    };

    let mut crops = Vec::new();
    for c in raw_pool {
        let id = get_crop_spec(&c).id.to_string();
        if !crops.contains(&id) {
            crops.push(id);
        }
    }

    let mut seen_keys = BTreeSet::new();
    let mut candidates = Vec::new();

    let mut push_unique = |rot: Vec<RotationStep>| {
        if candidates.len() >= MAX_CANDIDATES {
            return;
        }
        let canon = canonicalize_rotation(&rot);
        let key = rotation_sort_key(&canon);
        if seen_keys.insert(key) {
            candidates.push(canon);
        }
    };

    // 1. Length-2 rotations (no back-to-back repeat: A != B), with 3 cover variants:
    //    (false, false), (false, true), (true, true)
    for i in 0..crops.len() {
        for j in (i + 1)..crops.len() {
            let a = &crops[i];
            let b = &crops[j];
            push_unique(vec![
                RotationStep::new(a.clone(), false),
                RotationStep::new(b.clone(), false),
            ]);
            if b != "fallow" {
                push_unique(vec![
                    RotationStep::new(a.clone(), false),
                    RotationStep::new(b.clone(), true),
                ]);
            }
            if a != "fallow" && b != "fallow" {
                push_unique(vec![
                    RotationStep::new(a.clone(), true),
                    RotationStep::new(b.clone(), true),
                ]);
            }
        }
    }

    // 2. Length-3 rotations (all 3 crops distinct so no back-to-back or wrap-around repeat),
    //    with cover = false and cover = true on the last phase
    for i in 0..crops.len() {
        for j in 0..crops.len() {
            if j == i {
                continue;
            }
            for k in 0..crops.len() {
                if k == i || k == j {
                    continue;
                }
                let a = &crops[i];
                let b = &crops[j];
                let c = &crops[k];
                push_unique(vec![
                    RotationStep::new(a.clone(), false),
                    RotationStep::new(b.clone(), false),
                    RotationStep::new(c.clone(), false),
                ]);
                if c != "fallow" {
                    push_unique(vec![
                        RotationStep::new(a.clone(), false),
                        RotationStep::new(b.clone(), false),
                        RotationStep::new(c.clone(), true),
                    ]);
                }
            }
        }
    }

    // 3. Length-1 reference rotations (with rye cover) for comparison
    for c in &crops {
        if c != "fallow" {
            push_unique(vec![RotationStep::new(c.clone(), true)]);
        }
    }

    candidates
}

/// Evaluates and ranks candidate rotations under the farmer's constraints and priorities (Contract C3).
pub fn optimize(
    farm: &Farm,
    crop_pool: &[String],
    opts: &SimOpts,
    weights: &PriorityWeights,
    baseline_rot: &[RotationStep],
    constraints: &Constraints,
) -> Vec<OptimizedCandidate> {
    optimize_with(
        farm,
        crop_pool,
        opts,
        weights,
        baseline_rot,
        constraints,
        &simulate_rotation,
    )
}

pub fn optimize_with<F>(
    farm: &Farm,
    crop_pool: &[String],
    opts: &SimOpts,
    weights: &PriorityWeights,
    baseline_rot: &[RotationStep],
    constraints: &Constraints,
    sim_fn: &F,
) -> Vec<OptimizedCandidate>
where
    F: Fn(&Farm, &[RotationStep], &SimOpts, Option<i32>) -> RotationResult,
{
    let mut candidates = enumerate_candidate_rotations(crop_pool);

    // Ensure baseline rotation is included if non-empty
    if !baseline_rot.is_empty() {
        let base_canon = canonicalize_rotation(baseline_rot);
        let base_key = rotation_sort_key(&base_canon);
        if !candidates
            .iter()
            .any(|c| rotation_sort_key(c) == base_key)
        {
            candidates.push(base_canon);
        }
    }

    let mut stress_opts = opts.clone();
    stress_opts.d_t += STRESS_DT_C;
    stress_opts.d_p += STRESS_DP_FRAC;

    let mut ranked = Vec::with_capacity(candidates.len());

    for rot in candidates {
        let rules_eval = evaluate_rules(farm, &rot, opts, constraints, &[]);
        let base_res = sim_fn(farm, &rot, opts, None);
        let stress_res = sim_fn(farm, &rot, &stress_opts, None);

        let score_res = compute_score_from_precomputed(
            farm,
            &rot,
            opts,
            weights,
            &base_res,
            &stress_res,
            None,
            &rules_eval,
            None,
        );

        let viable = rules_eval.excluded_by.is_none()
            && rules_eval.fits_budget
            && rules_eval.missing_equipment.is_empty()
            && base_res.mean_net > opts.fail_net;

        ranked.push(OptimizedCandidate {
            rot,
            base: base_res,
            stress: stress_res,
            score: score_res.score as f64,
            parts: ScoreParts {
                subscores: score_res.subscores,
                base: score_res.base,
                rules_delta: rules_eval.total_delta,
                rules: rules_eval.rules,
                excluded_by: rules_eval.excluded_by,
                fits_budget: rules_eval.fits_budget,
                missing_equipment: rules_eval.missing_equipment,
                avg_cost_per_ha: (rules_eval.avg_cost_per_ha * 10.0).round() / 10.0,
            },
            viable,
        });
    }

    // Sort viable candidates first, then by descending composite score, then by stress mean_net
    ranked.sort_by(|a, b| {
        b.viable
            .cmp(&a.viable)
            .then_with(|| {
                b.score
                    .partial_cmp(&a.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| {
                b.stress
                    .mean_net
                    .partial_cmp(&a.stress.mean_net)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });

    ranked
}

/// Selects the 3 distinct rotation archetypes (`"Best balance"`, `"Drought shield"`, `"Soil builder"`)
/// from the ranked optimizer output (Contract C3 `pickThree`).
pub fn pick_three(
    ranked: &[OptimizedCandidate],
    baseline_rot: &[RotationStep],
) -> Vec<PickedRotation> {
    if ranked.is_empty() {
        return Vec::new();
    }

    let base_key = rotation_sort_key(&canonicalize_rotation(baseline_rot));
    let baseline_cand = ranked
        .iter()
        .find(|c| rotation_sort_key(&canonicalize_rotation(&c.rot)) == base_key)
        .or_else(|| ranked.first());

    // Pool of viable candidates different from the farmer's current rotation (fall back to all if < 3 viable)
    let pool: Vec<&OptimizedCandidate> = {
        let viable_non_base: Vec<&OptimizedCandidate> = ranked
            .iter()
            .filter(|c| {
                c.viable && rotation_sort_key(&canonicalize_rotation(&c.rot)) != base_key
            })
            .collect();
        if viable_non_base.len() >= 3 {
            viable_non_base
        } else {
            ranked
                .iter()
                .filter(|c| rotation_sort_key(&canonicalize_rotation(&c.rot)) != base_key)
                .collect()
        }
    };

    if pool.is_empty() {
        return Vec::new();
    }

    let mut chosen_keys = BTreeSet::new();
    let mut picks = Vec::with_capacity(3);

    // 1. "Best balance": highest overall FieldShift Score
    if let Some(&best_balance) = pool.first() {
        chosen_keys.insert(rotation_sort_key(&best_balance.rot));
        picks.push(build_pick(
            best_balance,
            baseline_cand,
            "Best balance",
        ));
    }

    // 2. "Drought shield": lowest stress p_fail and highest stress mean_net under +2°C / -20% rain
    let drought_pick = pool
        .iter()
        .copied()
        .filter(|c| !chosen_keys.contains(&rotation_sort_key(&c.rot)))
        .min_by(|a, b| {
            a.stress
                .p_fail
                .partial_cmp(&b.stress.p_fail)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| {
                    b.stress
                        .mean_net
                        .partial_cmp(&a.stress.mean_net)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
        })
        .or_else(|| pool.get(1).copied());

    if let Some(drought) = drought_pick {
        chosen_keys.insert(rotation_sort_key(&drought.rot));
        picks.push(build_pick(drought, baseline_cand, "Drought shield"));
    }

    // 3. "Soil builder": highest soil health score + organic carbon trend
    let soil_pick = pool
        .iter()
        .copied()
        .filter(|c| !chosen_keys.contains(&rotation_sort_key(&c.rot)))
        .max_by(|a, b| {
            let sa = a.base.soil_score + a.base.soc_change_pct * 20.0;
            let sb = b.base.soil_score + b.base.soc_change_pct * 20.0;
            sa.partial_cmp(&sb).unwrap_or(std::cmp::Ordering::Equal)
        })
        .or_else(|| pool.get(2).copied());

    if let Some(soil) = soil_pick {
        picks.push(build_pick(soil, baseline_cand, "Soil builder"));
    }

    picks
}

fn build_pick(
    cand: &OptimizedCandidate,
    baseline: Option<&OptimizedCandidate>,
    label: &str,
) -> PickedRotation {
    let rot_name = format_rotation_label(&cand.rot);
    let n_years = cand.base.years.len().max(1);

    let why = if let Some(base_c) = baseline {
        let delta_net = cand.base.mean_net - base_c.base.mean_net;
        let delta_sign = if delta_net >= 0.0 { "+" } else { "" };
        match label {
            "Best balance" => format!(
                "{rot_name}: {delta_sign}{:.0} $/ha vs baseline, {}/{} bad years under +2 °C/-20 % rain, soil score {:.0}/100",
                delta_net, cand.stress.fails, n_years, cand.base.soil_score
            ),
            "Drought shield" => format!(
                "{rot_name}: cuts drought bad years to {}/{} (stress net {:.0} $/ha, water use {:.0} mm)",
                cand.stress.fails, n_years, cand.stress.mean_net, cand.base.water_use
            ),
            _ => format!(
                "{rot_name}: boosts soil score to {:.0}/100 ({:+.2} %/yr SOC, {:.2} t/ha/yr erosion)",
                cand.base.soil_score, cand.base.soc_change_pct, cand.base.erosion
            ),
        }
    } else {
        format!(
            "{rot_name}: score {:.0}/100, {}/{} bad years, soil score {:.0}/100",
            cand.score, cand.base.fails, n_years, cand.base.soil_score
        )
    };

    PickedRotation {
        rot: cand.rot.clone(),
        label: label.to_string(),
        why,
        base: cand.base.clone(),
        stress: cand.stress.clone(),
        score: cand.score,
        fits_budget: cand.parts.fits_budget,
        missing_equipment: cand.parts.missing_equipment.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{prepare_farm, FarmPack};

    #[test]
    fn test_cyclic_deduplication() {
        let r1 = vec![
            RotationStep::new("maize", false),
            RotationStep::new("soybean", false),
            RotationStep::new("wheat", false),
        ];
        let r2 = vec![
            RotationStep::new("soybean", false),
            RotationStep::new("wheat", false),
            RotationStep::new("maize", false),
        ];
        assert_eq!(canonicalize_rotation(&r1), canonicalize_rotation(&r2));
    }

    #[test]
    fn test_optimize_and_pick_three_distinct_labels() {
        let farm = prepare_farm(FarmPack::default());
        let pool = vec![
            "maize".to_string(),
            "soybean".to_string(),
            "wheat".to_string(),
            "sorghum".to_string(),
            "pea".to_string(),
            "barley".to_string(),
        ];
        let opts = SimOpts::default();
        let weights = PriorityWeights::default();
        let baseline = vec![
            RotationStep::new("maize", false),
            RotationStep::new("soybean", false),
        ];
        let constraints = Constraints {
            max_cost_per_ha: Some(850.0),
            max_investment: None,
            equipment: vec![
                "row_planter".to_string(),
                "grain_drill".to_string(),
                "corn_header".to_string(),
            ],
            sellable: pool.clone(),
        };

        let ranked = optimize(&farm, &pool, &opts, &weights, &baseline, &constraints);
        assert!(!ranked.is_empty());
        assert!(ranked.len() <= MAX_CANDIDATES);

        let picks = pick_three(&ranked, &baseline);
        assert_eq!(picks.len(), 3);
        assert_eq!(picks[0].label, "Best balance");
        assert_eq!(picks[1].label, "Drought shield");
        assert_eq!(picks[2].label, "Soil builder");

        // All 3 picks must be distinct rotations
        assert_ne!(
            canonicalize_rotation(&picks[0].rot),
            canonicalize_rotation(&picks[1].rot)
        );
        assert_ne!(
            canonicalize_rotation(&picks[1].rot),
            canonicalize_rotation(&picks[2].rot)
        );
    }
}
