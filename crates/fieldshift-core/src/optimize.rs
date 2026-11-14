use crate::crops::{get_crop, normalize_crop_id};
use crate::rotation::{simulate_rotation, RotationResult};
use crate::season::{round1, round2};
use crate::{PreparedFarm, PriorityWeights, RotationConstraints, RotationStep, SimOptions};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreParts {
    pub profit: f32,
    pub stability: f32,
    pub soil: f32,
    pub water: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeCandidate {
    pub rot: Vec<RotationStep>,
    pub base: RotationResult,
    pub stress: RotationResult,
    pub score: f32,
    pub parts: ScoreParts,
    pub viable: bool,
    pub fits_budget: bool,
    pub missing_equipment: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedRotation {
    pub rot: Vec<RotationStep>,
    pub label: String,
    pub why: String,
    pub base: RotationResult,
    pub stress: RotationResult,
    pub fits_budget: bool,
    pub missing_equipment: Vec<String>,
}

/// Enumerates candidate rotations (length 2..=3, canonicalized against cyclic shifts, with/without cover crops),
/// filters by farmer constraints (budget, equipment, sellable crops), and scores each at baseline and stress (+2 °C, -20% rain).
pub fn optimize(
    farm: &PreparedFarm,
    crop_pool: &[String],
    opts: &SimOptions,
    weights: &PriorityWeights,
    baseline_rot: &[RotationStep],
    constraints: &RotationConstraints,
) -> Vec<OptimizeCandidate> {
    let default_pool: Vec<String> = if !crop_pool.is_empty() {
        crop_pool
            .iter()
            .map(|c| normalize_crop_id(c).to_string())
            .collect()
    } else if !farm.meta.crop_pool.is_empty() {
        farm.meta
            .crop_pool
            .iter()
            .map(|c| normalize_crop_id(c).to_string())
            .collect()
    } else {
        vec![
            "maize".to_string(),
            "soybean".to_string(),
            "wheat".to_string(),
            "sorghum".to_string(),
            "sunflower".to_string(),
            "pea".to_string(),
            "barley".to_string(),
            "fallow".to_string(),
        ]
    };

    // Deduplicate pool while preserving order
    let mut pool = Vec::new();
    for c in default_pool {
        if !pool.contains(&c) {
            pool.push(c);
        }
    }

    let sellable_set: HashSet<String> = constraints
        .sellable
        .iter()
        .map(|s| normalize_crop_id(s).to_string())
        .collect();
    let equip_set: HashSet<String> = constraints
        .equipment
        .iter()
        .map(|s| s.trim().to_ascii_lowercase())
        .collect();

    let candidates = generate_candidate_rotations(&pool, 180);
    let mut stress_opts = opts.clone();
    stress_opts.d_t = opts.d_t + 2.0;
    stress_opts.d_p = (opts.d_p - 0.20).max(-0.75);

    let w_profit = weights.profit.max(0.0);
    let w_stab = weights.stability.max(0.0);
    let w_soil = weights.soil.max(0.0);
    let w_water = weights.water.max(0.0);
    let w_sum = (w_profit + w_stab + w_soil + w_water).max(1.0);

    let mut results = Vec::with_capacity(candidates.len());

    for rot in candidates {
        // Check sellable constraint (fallow is always allowed as a rest phase)
        if !sellable_set.is_empty() {
            let all_sellable = rot.iter().all(|st| {
                let cid = normalize_crop_id(&st.crop);
                cid == "fallow" || sellable_set.contains(cid)
            });
            if !all_sellable {
                continue;
            }
        }

        // Check budget & equipment
        let mut avg_cost = 0.0_f32;
        let mut missing_eq = Vec::new();
        for st in &rot {
            let cid = normalize_crop_id(&st.crop);
            let cp = get_crop(cid);
            let mut step_cost = farm.crop_cost(cid, opts);
            if st.cover {
                step_cost += get_crop("rye").default_cost_usd_ha;
            }
            avg_cost += step_cost;

            if !equip_set.is_empty() {
                for req in &cp.equipment {
                    let req_low = req.to_ascii_lowercase();
                    if !equip_set.contains(&req_low) && !missing_eq.contains(req) {
                        missing_eq.push(req.clone());
                    }
                }
            }
        }
        avg_cost /= rot.len().max(1) as f32;
        let fits_budget = constraints
            .max_cost_per_ha
            .map(|max_c| max_c <= 0.0 || avg_cost <= max_c)
            .unwrap_or(true);

        let mut base = simulate_rotation(farm, &rot, opts, None);
        base.traced = None; // Keep optimizer payload compact and fast
        let mut stress = simulate_rotation(farm, &rot, &stress_opts, None);
        stress.traced = None;

        let profit_raw = 0.60 * base.mean_net + 0.40 * stress.mean_net;
        let profit_part = ((profit_raw + 100.0) / 850.0 * 100.0).clamp(0.0, 100.0);

        let mean_p_fail = 0.45 * base.p_fail + 0.55 * stress.p_fail;
        let stability_part = ((1.0 - mean_p_fail / 0.65) * 100.0).clamp(0.0, 100.0);

        let soil_part = base.soil_score.clamp(0.0, 100.0);
        let water_part = ((650.0 - base.water_use) / 450.0 * 100.0).clamp(0.0, 100.0);

        let mut score = (w_profit * profit_part
            + w_stab * stability_part
            + w_soil * soil_part
            + w_water * water_part)
            / w_sum;

        if !fits_budget {
            score -= 15.0;
        }
        if !missing_eq.is_empty() {
            score -= 8.0 * (missing_eq.len() as f32);
        }

        let viable = fits_budget
            && missing_eq.is_empty()
            && base.p_fail <= (opts.fail_share + 0.05)
            && base.mean_net > opts.fail_net;

        results.push(OptimizeCandidate {
            rot,
            base,
            stress,
            score: round1(score),
            parts: ScoreParts {
                profit: round1(profit_part),
                stability: round1(stability_part),
                soil: round1(soil_part),
                water: round1(water_part),
            },
            viable,
            fits_budget,
            missing_equipment: missing_eq,
        });
    }

    let _ = baseline_rot;
    results.sort_by(|a, b| {
        b.viable.cmp(&a.viable).then_with(|| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    });
    results
}

/// Selects the 3 distinct rotation archetypes (`Best balance`, `Drought shield`, `Soil builder`)
/// from the ranked candidate list.
pub fn pick_three(
    ranked: &[OptimizeCandidate],
    baseline_rot: &[RotationStep],
) -> Vec<PickedRotation> {
    if ranked.is_empty() {
        return Vec::new();
    }

    let base_sig = rotation_signature(baseline_rot);
    let mut chosen_sigs = HashSet::new();
    chosen_sigs.insert(base_sig);

    let mut picks = Vec::with_capacity(3);

    // 1. Best balance: highest overall weighted score
    if let Some(best) = ranked
        .iter()
        .find(|c| !chosen_sigs.contains(&rotation_signature(&c.rot)))
        .or_else(|| ranked.first())
    {
        chosen_sigs.insert(rotation_signature(&best.rot));
        picks.push(PickedRotation {
            rot: best.rot.clone(),
            label: "Best balance".to_string(),
            why: format!(
                "Balances profit ({:.0} $/ha mean) and stability ({:.0}% bad years under stress) with soil score {:.0}.",
                best.base.mean_net,
                best.stress.p_fail * 100.0,
                best.base.soil_score
            ),
            base: best.base.clone(),
            stress: best.stress.clone(),
            fits_budget: best.fits_budget,
            missing_equipment: best.missing_equipment.clone(),
        });
    }

    // 2. Drought shield: highest stability + water conservation under +2 °C / -20% rain
    if let Some(drought) = ranked
        .iter()
        .filter(|c| !chosen_sigs.contains(&rotation_signature(&c.rot)))
        .max_by(|a, b| {
            let sa = a.parts.stability * 0.70 + a.parts.water * 0.30 + a.stress.mean_net * 0.04;
            let sb = b.parts.stability * 0.70 + b.parts.water * 0.30 + b.stress.mean_net * 0.04;
            sa.partial_cmp(&sb).unwrap_or(std::cmp::Ordering::Equal)
        })
        .or_else(|| ranked.get(1).or_else(|| ranked.first()))
    {
        chosen_sigs.insert(rotation_signature(&drought.rot));
        picks.push(PickedRotation {
            rot: drought.rot.clone(),
            label: "Drought shield".to_string(),
            why: format!(
                "Minimizes bad years under +2 °C / -20% rain ({}/{} bad years) while using {:.0} mm/yr water.",
                drought.stress.fails,
                drought.stress.years.len(),
                drought.base.water_use
            ),
            base: drought.base.clone(),
            stress: drought.stress.clone(),
            fits_budget: drought.fits_budget,
            missing_equipment: drought.missing_equipment.clone(),
        });
    }

    // 3. Soil builder: highest soil health score + positive carbon trend
    if let Some(soil) = ranked
        .iter()
        .filter(|c| !chosen_sigs.contains(&rotation_signature(&c.rot)))
        .max_by(|a, b| {
            let sa = a.parts.soil + a.base.soc_change_pct * 20.0 + a.parts.profit * 0.15;
            let sb = b.parts.soil + b.base.soc_change_pct * 20.0 + b.parts.profit * 0.15;
            sa.partial_cmp(&sb).unwrap_or(std::cmp::Ordering::Equal)
        })
        .or_else(|| ranked.get(2).or_else(|| ranked.first()))
    {
        picks.push(PickedRotation {
            rot: soil.rot.clone(),
            label: "Soil builder".to_string(),
            why: format!(
                "Raises soil health score to {:.0}/100 ({:+.2}%/yr SOC change, {:.2} t/ha/yr erosion).",
                soil.base.soil_score,
                soil.base.soc_change_pct,
                soil.base.erosion
            ),
            base: soil.base.clone(),
            stress: soil.stress.clone(),
            fits_budget: soil.fits_budget,
            missing_equipment: soil.missing_equipment.clone(),
        });
    }

    let _ = round2(0.0);
    picks
}

fn rotation_signature(rot: &[RotationStep]) -> String {
    if rot.is_empty() {
        return String::new();
    }
    let parts: Vec<String> = rot
        .iter()
        .map(|s| {
            format!(
                "{}:{}",
                normalize_crop_id(&s.crop),
                if s.cover { 1 } else { 0 }
            )
        })
        .collect();
    // Canonicalize across cyclic rotations (A->B->C == B->C->A)
    let n = parts.len();
    let mut best = parts.join("|");
    for shift in 1..n {
        let mut rotated = Vec::with_capacity(n);
        for i in 0..n {
            rotated.push(parts[(i + shift) % n].clone());
        }
        let cand = rotated.join("|");
        if cand < best {
            best = cand;
        }
    }
    best
}

fn generate_candidate_rotations(pool: &[String], max_candidates: usize) -> Vec<Vec<RotationStep>> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();

    // 2-crop rotations (no back-to-back repeats) with cover false / true
    for i in 0..pool.len() {
        for j in (i + 1)..pool.len() {
            if pool[i] == "fallow" && pool[j] == "fallow" {
                continue;
            }
            for cover_flag in [false, true] {
                let cand = vec![
                    RotationStep {
                        crop: pool[i].clone(),
                        cover: cover_flag && pool[i] != "wheat" && pool[i] != "fallow",
                    },
                    RotationStep {
                        crop: pool[j].clone(),
                        cover: cover_flag && pool[j] != "wheat" && pool[j] != "fallow",
                    },
                ];
                let sig = rotation_signature(&cand);
                if seen.insert(sig) {
                    out.push(cand);
                    if out.len() >= max_candidates {
                        return out;
                    }
                }
            }
        }
    }

    // 3-crop rotations (distinct crops) with cover false / true
    for i in 0..pool.len() {
        for j in 0..pool.len() {
            if i == j {
                continue;
            }
            for k in 0..pool.len() {
                if k == i || k == j {
                    continue;
                }
                for cover_flag in [false, true] {
                    let cand = vec![
                        RotationStep {
                            crop: pool[i].clone(),
                            cover: cover_flag && pool[i] != "wheat" && pool[i] != "fallow",
                        },
                        RotationStep {
                            crop: pool[j].clone(),
                            cover: cover_flag && pool[j] != "wheat" && pool[j] != "fallow",
                        },
                        RotationStep {
                            crop: pool[k].clone(),
                            cover: cover_flag && pool[k] != "wheat" && pool[k] != "fallow",
                        },
                    ];
                    let sig = rotation_signature(&cand);
                    if seen.insert(sig) {
                        out.push(cand);
                        if out.len() >= max_candidates {
                            return out;
                        }
                    }
                }
            }
        }
    }

    out
}
