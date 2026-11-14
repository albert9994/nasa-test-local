//! Rotation optimizer and `pickThree` (C3).
//!
//! Candidates: the farmer's baseline, every single crop (± rye), every 2-crop and 3-crop cyclic rotation
//! without back-to-back repeats (± rye). Each is simulated today and under +2 °C / -20 % rain, run through
//! the rules and scored. All candidates see the same weather years (common random numbers by construction).

use crate::crops::{canonical_id, CROP_IDS};
use crate::rotation::{simulate_resolved, RotationResult};
use crate::rules::evaluate_rules;
use crate::score::score_from_parts;
use crate::stress::{STRESS_DP_FRAC, STRESS_DT_C};
use crate::{
    par_map, rotation_label, round1, Constraints, PreparedFarm, ResolvedRotation, Result,
    RotationStep, SimOptions, Weights,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const MAX_CANDIDATES: usize = 520;

/// C3 `RankedRotation`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankedRotation {
    pub rot: Vec<RotationStep>,
    pub base: RotationResult,
    pub stress: RotationResult,
    pub score: f64,
    /// Sub-scores 0..100 (`profit`, `stability`, `soil`, `water` plus `climate`, `financialRisk`,
    /// `feasibility`) and the `base` / `rules` points of the score waterfall.
    pub parts: BTreeMap<String, f64>,
    pub viable: bool,
}

/// C3 `PickResult`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PickResult {
    pub rot: Vec<RotationStep>,
    pub label: String,
    pub why: String,
    pub base: RotationResult,
    pub stress: RotationResult,
}

fn key(rot: &[RotationStep]) -> String {
    rot.iter()
        .map(|s| format!("{}{}", s.crop, if s.cover { "+" } else { "" }))
        .collect::<Vec<_>>()
        .join("|")
}

/// Cyclic canonical form: `A-B-C == B-C-A == C-A-B`.
pub fn canonicalize_rotation(rot: &[RotationStep]) -> Vec<RotationStep> {
    let n = rot.len();
    (0..n.max(1))
        .map(|shift| {
            (0..n)
                .map(|i| rot[(i + shift) % n].clone())
                .collect::<Vec<_>>()
        })
        .min_by_key(|r| key(r))
        .unwrap_or_default()
}

/// Candidate rotations for a crop pool (canonical ids; unknown ids are an error).
pub fn enumerate_candidates(pool: &[String]) -> Result<Vec<Vec<RotationStep>>> {
    let mut crops: Vec<&'static str> = Vec::new();
    for c in pool {
        let id = canonical_id(c)?;
        if !crops.contains(&id) {
            crops.push(id);
        }
    }
    if crops.is_empty() {
        crops = CROP_IDS.to_vec();
    }
    let mut seen = BTreeSet::new();
    let mut out: Vec<Vec<RotationStep>> = Vec::new();
    let mut push = |rot: Vec<RotationStep>| {
        if out.len() >= MAX_CANDIDATES {
            return;
        }
        let canon = canonicalize_rotation(&rot);
        if seen.insert(key(&canon)) {
            out.push(canon);
        }
    };
    let st = |c: &str, cover: bool| RotationStep::new(c, cover);

    for &a in crops.iter().filter(|&&c| c != "fallow") {
        push(vec![st(a, false)]);
        push(vec![st(a, true)]);
    }
    for (i, &a) in crops.iter().enumerate() {
        for &b in &crops[i + 1..] {
            push(vec![st(a, false), st(b, false)]);
            if b != "fallow" {
                push(vec![st(a, false), st(b, true)]);
            }
            if a != "fallow" && b != "fallow" {
                push(vec![st(a, true), st(b, true)]);
            }
        }
    }
    for &a in &crops {
        for &b in crops.iter().filter(|&&b| b != a) {
            for &c in crops.iter().filter(|&&c| c != a && c != b) {
                push(vec![st(a, false), st(b, false), st(c, false)]);
                if c != "fallow" {
                    push(vec![st(a, false), st(b, false), st(c, true)]);
                }
            }
        }
    }
    Ok(out)
}

fn evaluate_candidate(
    farm: &PreparedFarm,
    rot: &[RotationStep],
    opts: &SimOptions,
    weights: &Weights,
    constraints: &Constraints,
) -> Option<RankedRotation> {
    let resolved = ResolvedRotation::new(rot).ok()?;
    let base = simulate_resolved(farm, &resolved, opts, None);
    let stress = simulate_resolved(
        farm,
        &resolved,
        &opts.shifted(STRESS_DT_C, STRESS_DP_FRAC),
        None,
    );
    let rules = evaluate_rules(farm, &resolved, opts, constraints);
    let score = score_from_parts(
        farm,
        &resolved.steps,
        opts,
        weights,
        &base,
        &stress,
        None,
        &rules,
        None,
    );
    let s = &score.subscores;
    let stability = 0.55 * f64::from(s.climate) + 0.45 * f64::from(s.financial_risk);
    let parts: BTreeMap<String, f64> = [
        ("profit", f64::from(s.profit)),
        ("stability", stability.round()),
        ("soil", f64::from(s.soil)),
        ("water", f64::from(s.water)),
        ("climate", f64::from(s.climate)),
        ("financialRisk", f64::from(s.financial_risk)),
        ("feasibility", f64::from(s.feasibility)),
        ("base", f64::from(score.base)),
        ("rules", f64::from(rules.total_delta)),
    ]
    .into_iter()
    .map(|(k, v)| (k.to_string(), v))
    .collect();
    let viable = rules.excluded_by.is_none() && rules.fits_budget && base.mean_net > opts.fail_net;
    Some(RankedRotation {
        rot: resolved.steps,
        base,
        stress,
        score: f64::from(score.score),
        parts,
        viable,
    })
}

/// Ranks candidate rotations (viable first, then by score). Unknown crop ids in `pool` / `baseline` are errors.
pub fn optimize(
    farm: &PreparedFarm,
    pool: &[String],
    opts: &SimOptions,
    weights: &Weights,
    baseline: &[RotationStep],
    constraints: &Constraints,
) -> Result<Vec<RankedRotation>> {
    let mut pool = pool.to_vec();
    if pool.is_empty() {
        pool = farm.meta.crop_pool.clone();
    }
    let mut candidates = enumerate_candidates(&pool)?;
    if !baseline.is_empty() {
        let canon = canonicalize_rotation(&ResolvedRotation::new(baseline)?.steps);
        if !candidates.iter().any(|c| key(c) == key(&canon)) {
            candidates.push(canon);
        }
    }
    let evaluated = par_map(&candidates, |rot| {
        evaluate_candidate(farm, rot, opts, weights, constraints)
    });
    let mut ranked: Vec<RankedRotation> = evaluated.into_iter().flatten().collect();
    ranked.sort_by(|a, b| {
        b.viable
            .cmp(&a.viable)
            .then_with(|| b.score.total_cmp(&a.score))
            .then_with(|| b.stress.mean_net.total_cmp(&a.stress.mean_net))
            .then_with(|| key(&a.rot).cmp(&key(&b.rot)))
    });
    Ok(ranked)
}

/// Best balance / Drought shield / Soil builder, distinct from each other and from the baseline.
pub fn pick_three(ranked: &[RankedRotation], baseline: &[RotationStep]) -> Vec<PickResult> {
    let base_key = key(&canonicalize_rotation(baseline));
    let same_as_baseline = |r: &&RankedRotation| key(&canonicalize_rotation(&r.rot)) == base_key;
    let baseline_cand = ranked.iter().find(same_as_baseline);

    let viable: Vec<&RankedRotation> = ranked
        .iter()
        .filter(|r| r.viable && !same_as_baseline(r))
        .collect();
    let pool: Vec<&RankedRotation> = if viable.len() >= 3 {
        viable
    } else {
        ranked.iter().filter(|r| !same_as_baseline(r)).collect()
    };
    if pool.is_empty() {
        return Vec::new();
    }

    let mut used: BTreeSet<String> = BTreeSet::new();
    let mut picks = Vec::with_capacity(3);

    let best = pool.first().copied();
    if let Some(c) = best {
        used.insert(key(&c.rot));
        picks.push(build_pick(c, baseline_cand, "Best balance"));
    }
    let drought = pool
        .iter()
        .copied()
        .filter(|c| !used.contains(&key(&c.rot)))
        .min_by(|a, b| {
            a.stress
                .p_fail
                .total_cmp(&b.stress.p_fail)
                .then_with(|| b.stress.mean_net.total_cmp(&a.stress.mean_net))
        });
    if let Some(c) = drought {
        used.insert(key(&c.rot));
        picks.push(build_pick(c, baseline_cand, "Drought shield"));
    }
    let soil = pool
        .iter()
        .copied()
        .filter(|c| !used.contains(&key(&c.rot)))
        .max_by(|a, b| {
            let sa = a.base.soil_score + a.base.soc_change_pct * 20.0;
            let sb = b.base.soil_score + b.base.soc_change_pct * 20.0;
            sa.total_cmp(&sb)
        });
    if let Some(c) = soil {
        picks.push(build_pick(c, baseline_cand, "Soil builder"));
    }
    picks
}

fn build_pick(c: &RankedRotation, baseline: Option<&RankedRotation>, label: &str) -> PickResult {
    let name = rotation_label(&c.rot);
    let n_years = c.base.years.len().max(1);
    let why = match label {
        "Best balance" => match baseline {
            Some(b) => format!(
                "{name}: {:+.0} $/ha vs your rotation, {}/{} bad years under +2 °C and 20 % less rain, soil score {:.0}",
                round1(c.base.mean_net - b.base.mean_net),
                c.stress.fails,
                n_years,
                c.base.soil_score
            ),
            None => format!(
                "{name}: highest overall score for your priorities ({:.0}/100)",
                c.score
            ),
        },
        "Drought shield" => format!(
            "{name}: only {}/{} bad years at +2 °C and 20 % less rain (stress net {:.0} $/ha)",
            c.stress.fails, n_years, c.stress.mean_net
        ),
        _ => format!(
            "{name}: soil score {:.0}/100 ({:+.2} %/yr soil carbon, {:.2} t/ha/yr erosion)",
            c.base.soil_score, c.base.soc_change_pct, c.base.erosion
        ),
    };
    PickResult {
        rot: c.rot.clone(),
        label: label.to_string(),
        why,
        base: c.base.clone(),
        stress: c.stress.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates_are_canonical_and_unique() {
        let pool: Vec<String> = ["maize", "soybean", "wheat"].map(String::from).to_vec();
        let c = enumerate_candidates(&pool).unwrap();
        let keys: BTreeSet<_> = c.iter().map(|r| key(r)).collect();
        assert_eq!(keys.len(), c.len());
        // single crops are present
        assert!(c
            .iter()
            .any(|r| r.len() == 1 && r[0].crop == "maize" && !r[0].cover));
        // no back-to-back repeats in 2/3-crop rotations
        for r in c.iter().filter(|r| r.len() > 1) {
            for i in 0..r.len() {
                assert_ne!(r[i].crop, r[(i + 1) % r.len()].crop);
            }
        }
    }

    #[test]
    fn unknown_pool_crop_is_an_error() {
        assert!(enumerate_candidates(&["quinoa".to_string()]).is_err());
    }
}
