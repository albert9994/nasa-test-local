use crate::crops::{get_crop, normalize_crop_id};
use crate::quant::{quant_simulate, QuantSimConfig};
use crate::rotation::simulate_rotation;
use crate::season::round2;
use crate::stress::adaptation_margin;
use crate::{PreparedFarm, PriorityWeights, RotationConstraints, RotationStep, SimOptions};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subscores {
    pub climate: i32,
    pub financial_risk: i32,
    pub profit: i32,
    pub soil: i32,
    pub water: i32,
    pub feasibility: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedWeights {
    pub climate: f32,
    pub financial_risk: f32,
    pub profit: f32,
    pub soil: f32,
    pub water: f32,
    pub feasibility: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedRule {
    pub id: String,
    pub delta: i32,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmScoreAdjust {
    pub delta: i32,
    pub reason: String,
    pub confidence: String,
}

/// Contract C12 FieldShift Score response shape (`/api/score`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreResult {
    pub rotation: String,
    pub score: i32,
    pub confidence: String,
    pub subscores: Subscores,
    pub weights: NormalizedWeights,
    pub base: i32,
    pub rules: Vec<AppliedRule>,
    pub excluded_by: Option<String>,
    pub llm: LlmScoreAdjust,
    pub waterfall: Vec<(String, i32)>,
}

/// Evaluates the 6-source FieldShift Score (C12):
/// physical simulator + quant risk + agronomic rules + data confidence + bounded [-10, +10] LLM adjustment.
pub fn compute_score(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
    priorities: &PriorityWeights,
    constraints: &RotationConstraints,
    llm_adjust: Option<LlmScoreAdjust>,
) -> ScoreResult {
    let rot_label = rotation
        .iter()
        .map(|s| {
            let cid = normalize_crop_id(&s.crop);
            if cid == "wheat" {
                "winter wheat".to_string()
            } else {
                cid.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" → ");

    let sim = simulate_rotation(farm, rotation, opts, None);
    let margin = adaptation_margin(farm, rotation, opts);
    let q_res = quant_simulate(
        farm,
        &[rotation.to_vec()],
        opts,
        &QuantSimConfig {
            paths: 250,
            from_year: 2026,
            to_year: 2050,
            ssp: "ssp245".to_string(),
            cash_reserve: 500.0,
            seed: 42,
        },
        None,
    );
    let quant = q_res.first();

    // 1. Subscores (0..100)
    let climate_sub = if margin.already {
        ((1.0 - sim.p_fail) * 45.0).round() as i32
    } else {
        (45.0 + (margin.d_t / 4.5) * 35.0 + (margin.d_p.abs() / 0.45) * 20.0)
            .clamp(10.0, 98.0)
            .round() as i32
    };

    let fin_risk_sub = if let Some(q) = quant {
        let ruin_part = (1.0 - q.p_ruin) * 60.0;
        let cvar_part = ((q.cvar95 + 600.0) / 800.0 * 40.0).clamp(0.0, 40.0);
        (ruin_part + cvar_part).clamp(10.0, 98.0).round() as i32
    } else {
        70
    };

    let profit_sub = ((sim.mean_net + 100.0) / 800.0 * 100.0)
        .clamp(10.0, 98.0)
        .round() as i32;
    let soil_sub = sim.soil_score.clamp(10.0, 98.0).round() as i32;
    let water_sub = ((650.0 - sim.water_use) / 450.0 * 100.0)
        .clamp(15.0, 98.0)
        .round() as i32;

    // Check feasibility against budget & equipment
    let mut avg_cost = 0.0_f32;
    let mut missing_eq = Vec::new();
    let equip_set: HashSet<String> = constraints
        .equipment
        .iter()
        .map(|e| e.to_ascii_lowercase())
        .collect();
    for st in rotation {
        let cid = normalize_crop_id(&st.crop);
        avg_cost += farm.crop_cost(cid, opts);
        if !equip_set.is_empty() {
            for req in &get_crop(cid).equipment {
                if !equip_set.contains(&req.to_ascii_lowercase()) && !missing_eq.contains(req) {
                    missing_eq.push(req.clone());
                }
            }
        }
    }
    avg_cost /= rotation.len().max(1) as f32;
    let fits_budget = constraints
        .max_cost_per_ha
        .map(|m| m <= 0.0 || avg_cost <= m)
        .unwrap_or(true);

    let mut feas_sub = 95_i32;
    if !fits_budget {
        feas_sub -= 35;
    }
    feas_sub -= (missing_eq.len() as i32) * 20;
    feas_sub = feas_sub.clamp(15, 98);

    // 2. Normalize weights from farmer priorities
    let w_clim_raw = priorities.stability.max(0.5) * 1.1;
    let w_fin_raw = priorities.stability.max(0.5) * 0.9;
    let w_prof_raw = priorities.profit.max(0.5) * 1.0;
    let w_soil_raw = priorities.soil.max(0.5) * 0.7;
    let w_wat_raw = priorities.water.max(0.5) * 0.5;
    let w_feas_raw = 0.6_f32;
    let w_tot = w_clim_raw + w_fin_raw + w_prof_raw + w_soil_raw + w_wat_raw + w_feas_raw;

    let weights = NormalizedWeights {
        climate: round2(w_clim_raw / w_tot),
        financial_risk: round2(w_fin_raw / w_tot),
        profit: round2(w_prof_raw / w_tot),
        soil: round2(w_soil_raw / w_tot),
        water: round2(w_wat_raw / w_tot),
        feasibility: round2(w_feas_raw / w_tot),
    };

    let base_score = ((climate_sub as f32 * w_clim_raw
        + fin_risk_sub as f32 * w_fin_raw
        + profit_sub as f32 * w_prof_raw
        + soil_sub as f32 * w_soil_raw
        + water_sub as f32 * w_wat_raw
        + feas_sub as f32 * w_feas_raw)
        / w_tot)
        .round()
        .clamp(10.0, 96.0) as i32;

    // 3. Agronomic rules evaluation
    let (rules, excluded_by) = evaluate_agronomic_rules(farm, rotation, fits_budget, &missing_eq);
    let rules_delta: i32 = rules.iter().map(|r| r.delta).sum();

    // 4. Schema-validated & bounded [-10, +10] LLM adjustment
    let validated_llm = match llm_adjust {
        Some(adj) if (-10..=10).contains(&adj.delta) && !adj.reason.trim().is_empty() => adj,
        _ => LlmScoreAdjust {
            delta: 0,
            reason: "no additional qualitative context adjustment applied".to_string(),
            confidence: "high".to_string(),
        },
    };

    let final_score = if excluded_by.is_some() {
        (base_score + rules_delta + validated_llm.delta).clamp(0, 45)
    } else {
        (base_score + rules_delta + validated_llm.delta).clamp(0, 100)
    };

    let confidence = if farm.soil.has_observed_soil && farm.has_ndvi() {
        "high".to_string()
    } else if farm.soil.has_observed_soil || farm.years.len() >= 20 {
        "medium".to_string()
    } else {
        "low".to_string()
    };

    let waterfall = vec![
        ("base".to_string(), base_score),
        ("rules".to_string(), rules_delta),
        ("llm".to_string(), validated_llm.delta),
        ("final".to_string(), final_score),
    ];

    ScoreResult {
        rotation: rot_label,
        score: final_score,
        confidence,
        subscores: Subscores {
            climate: climate_sub,
            financial_risk: fin_risk_sub,
            profit: profit_sub,
            soil: soil_sub,
            water: water_sub,
            feasibility: feas_sub,
        },
        weights,
        base: base_score,
        rules,
        excluded_by,
        llm: validated_llm,
        waterfall,
    }
}

fn evaluate_agronomic_rules(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    fits_budget: bool,
    missing_eq: &[String],
) -> (Vec<AppliedRule>, Option<String>) {
    let mut rules = Vec::new();
    let mut excluded_by = None;
    let k = rotation.len();
    if k == 0 {
        return (rules, excluded_by);
    }

    // Rule 1: Legume before cereal nitrogen bonus
    for s in 0..k {
        let prev = normalize_crop_id(&rotation[(s + k - 1) % k].crop);
        let curr = normalize_crop_id(&rotation[s].crop);
        if get_crop(prev).legume && get_crop(curr).family == "poaceae" {
            rules.push(AppliedRule {
                id: "legume_before_cereal".to_string(),
                delta: 3,
                reason: format!("{} leaves biological nitrogen for the next {}", prev, curr),
            });
            break;
        }
    }

    // Rule 2: Cover crop living-roots bonus
    if rotation.iter().any(|s| s.cover) {
        rules.push(AppliedRule {
            id: "winter_cover_crop".to_string(),
            delta: 3,
            reason: "winter rye cover protects topsoil from erosion and builds organic carbon"
                .to_string(),
        });
    }

    // Rule 3: Sunflower / Pea phytosanitary break check (Sclerotinia / Aphanomyces root rot)
    let sunflower_count = rotation
        .iter()
        .filter(|s| normalize_crop_id(&s.crop) == "sunflower")
        .count();
    if sunflower_count > 0 && k < 3 {
        rules.push(AppliedRule {
            id: "sunflower_short_break".to_string(),
            delta: -5,
            reason: "sunflower grown more often than 1 in 3-4 years increases Sclerotinia risk"
                .to_string(),
        });
    }

    // Rule 4: Back-to-back monoculture penalty
    for s in 0..k {
        let prev = normalize_crop_id(&rotation[(s + k - 1) % k].crop);
        let curr = normalize_crop_id(&rotation[s].crop);
        if k > 1 && prev == curr && curr != "fallow" {
            rules.push(AppliedRule {
                id: "back_to_back_same_crop".to_string(),
                delta: -6,
                reason: format!("consecutive {} increases root pest and yield drag", curr),
            });
            break;
        }
    }

    // Rule 5: EU CAP / multi-family crop diversification bonus
    let families: HashSet<&str> = rotation
        .iter()
        .map(|s| get_crop(normalize_crop_id(&s.crop)).family.as_str())
        .filter(|&f| f != "none")
        .collect();
    if families.len() >= 2 && k >= 3 {
        rules.push(AppliedRule {
            id: "crop_diversification".to_string(),
            delta: 2,
            reason:
                "3-phase multi-family rotation meets diversification & pest-break best practice"
                    .to_string(),
        });
    }

    // Rule 6: Soil pH suitability check for legumes
    if (farm.soil.ph < 5.3 || farm.soil.ph > 8.3)
        && rotation
            .iter()
            .any(|s| get_crop(normalize_crop_id(&s.crop)).legume)
    {
        rules.push(AppliedRule {
            id: "soil_ph_legume_stress".to_string(),
            delta: -3,
            reason: format!(
                "soil pH ({:.1}) is suboptimal for legume nodulation",
                farm.soil.ph
            ),
        });
    }

    // Rule 7: Equipment & budget feasibility rules
    if !missing_eq.is_empty() {
        let eq_list = missing_eq.join(", ");
        rules.push(AppliedRule {
            id: "missing_equipment".to_string(),
            delta: -8,
            reason: format!("requires unavailable machinery: {}", eq_list),
        });
        excluded_by = Some("missing_equipment".to_string());
    } else if !fits_budget {
        rules.push(AppliedRule {
            id: "exceeds_operating_budget".to_string(),
            delta: -6,
            reason: "average operating cost exceeds farmer's max $/ha budget".to_string(),
        });
        excluded_by = Some("exceeds_operating_budget".to_string());
    }

    (rules, excluded_by)
}
