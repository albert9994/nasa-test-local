//! I4 · Agronomy & Feasibility Rule Runner (`rules.rs`, Contract C12)
//!
//! Runs:
//! 1. Built-in agronomic & farmer-constraint rules (equipment, budget, sellable crops,
//!    legume N credit, sunflower disease break, CAP crop diversification, rye cover, pH/slope).
//! 2. Optional Rhai scripts (`rules/*.rhai`) with signature:
//!    `fn apply(rot, farm, profile) -> #{ exclude: bool, delta: int, reason: string }`

use crate::{get_crop_spec, resolve_crop_cost, Constraints, Farm, RotationStep, SimOpts};
use rhai::{Dynamic, Engine, Map, Scope};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuleHit {
    pub id: String,
    pub delta: i32,
    pub reason: String,
    #[serde(skip_serializing_if = "std::ops::Not::not", default)]
    pub exclude: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RhaiRuleScript {
    pub id: String,
    pub script: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RulesEvaluation {
    pub rules: Vec<RuleHit>,
    pub total_delta: i32,
    pub excluded_by: Option<String>,
    pub fits_budget: bool,
    pub missing_equipment: Vec<String>,
    pub avg_cost_per_ha: f64,
}

/// Evaluates all built-in agronomy/feasibility rules plus any provided Rhai rule scripts.
pub fn evaluate_rules(
    farm: &Farm,
    rotation: &[RotationStep],
    opts: &SimOpts,
    constraints: &Constraints,
    custom_scripts: &[RhaiRuleScript],
) -> RulesEvaluation {
    let mut hits = Vec::new();
    let mut excluded_by: Option<String> = None;

    if rotation.is_empty() {
        return RulesEvaluation {
            rules: vec![RuleHit {
                id: "empty_rotation".to_string(),
                delta: -50,
                reason: "rotation contains no crops".to_string(),
                exclude: true,
            }],
            total_delta: -50,
            excluded_by: Some("empty_rotation".to_string()),
            fits_budget: true,
            missing_equipment: Vec::new(),
            avg_cost_per_ha: 0.0,
        };
    }

    let n = rotation.len();

    // 1. Check equipment, sellable crops, and average cost per ha
    let mut missing_equip_set = BTreeSet::new();
    let has_equip_filter = !constraints.equipment.is_empty();
    let has_sellable_filter = !constraints.sellable.is_empty();
    let mut unsellable_crops = BTreeSet::new();
    let mut total_cost = 0.0;

    for step in rotation {
        let spec = get_crop_spec(&step.crop);
        total_cost += resolve_crop_cost(farm, opts, spec.id, step.cover);

        if has_equip_filter {
            for &req in spec.required_equipment {
                if !constraints
                    .equipment
                    .iter()
                    .any(|e| e.eq_ignore_ascii_case(req))
                {
                    missing_equip_set.insert(req.to_string());
                }
            }
        }

        if has_sellable_filter
            && spec.id != "fallow"
            && !constraints.sellable.iter().any(|c| {
                c.eq_ignore_ascii_case(spec.id) || c.eq_ignore_ascii_case(&step.crop)
            })
        {
            unsellable_crops.insert(spec.id.to_string());
        }
    }

    let avg_cost_per_ha = total_cost / (n as f64);
    let missing_equipment: Vec<String> = missing_equip_set.into_iter().collect();

    if !missing_equipment.is_empty() {
        let id = "missing_equipment".to_string();
        if excluded_by.is_none() {
            excluded_by = Some(id.clone());
        }
        hits.push(RuleHit {
            id,
            delta: -25,
            reason: format!(
                "requires missing equipment: {}",
                missing_equipment.join(", ")
            ),
            exclude: true,
        });
    }

    if !unsellable_crops.is_empty() {
        let id = "crop_not_sellable".to_string();
        if excluded_by.is_none() {
            excluded_by = Some(id.clone());
        }
        let list: Vec<String> = unsellable_crops.into_iter().collect();
        hits.push(RuleHit {
            id,
            delta: -25,
            reason: format!("crop not in local sellable list: {}", list.join(", ")),
            exclude: true,
        });
    }

    let fits_budget = constraints
        .max_cost_per_ha
        .map(|max_c| avg_cost_per_ha <= max_c + 1e-6)
        .unwrap_or(true);

    if !fits_budget {
        let id = "over_budget".to_string();
        if excluded_by.is_none() {
            excluded_by = Some(id.clone());
        }
        hits.push(RuleHit {
            id,
            delta: -20,
            reason: format!(
                "average input cost ({:.0} $/ha) exceeds farmer budget ({:.0} $/ha)",
                avg_cost_per_ha,
                constraints.max_cost_per_ha.unwrap_or(0.0)
            ),
            exclude: true,
        });
    }

    // 2. Agronomic transition & diversity rules (Moldo M3 / M8)
    let mut legume_before_cereal = false;
    let mut back_to_back_same = false;
    let mut same_family_transition = false;
    let mut sunflower_count = 0usize;
    let mut cover_count = 0usize;
    let mut families = BTreeSet::new();
    let mut has_drought_anchor = false;
    let mut acid_sensitive_crop = None;

    for i in 0..n {
        let cur = &rotation[i];
        let next = &rotation[(i + 1) % n];
        let cur_spec = get_crop_spec(&cur.crop);
        let next_spec = get_crop_spec(&next.crop);

        families.insert(cur_spec.family);
        if cur.cover {
            cover_count += 1;
        }
        if cur_spec.id == "sunflower" {
            sunflower_count += 1;
        }
        if matches!(cur_spec.id, "sorghum" | "millet" | "wheat" | "barley") {
            has_drought_anchor = true;
        }
        if matches!(cur_spec.id, "pea" | "soybean" | "barley") && farm.soil_ph < 5.4 {
            acid_sensitive_crop = Some(cur_spec.id);
        }

        if cur_spec.is_legume && next_spec.family == "poaceae" {
            legume_before_cereal = true;
        }

        if n > 1 && cur_spec.id == next_spec.id && cur_spec.id != "fallow" {
            back_to_back_same = true;
        } else if n > 1 && cur_spec.family == next_spec.family && cur_spec.id != "fallow" {
            same_family_transition = true;
        }
    }

    if legume_before_cereal {
        hits.push(RuleHit {
            id: "legume_before_cereal".to_string(),
            delta: 4,
            reason: "legume leaves biological nitrogen and breaks pest cycles for the next cereal"
                .to_string(),
            exclude: false,
        });
    }

    if back_to_back_same || (n == 1 && get_crop_spec(&rotation[0].crop).id != "fallow") {
        let id = "continuous_same_crop".to_string();
        hits.push(RuleHit {
            id,
            delta: -10,
            reason: "growing the same crop back-to-back builds root diseases and weed pressure"
                .to_string(),
            exclude: false,
        });
    } else if same_family_transition {
        hits.push(RuleHit {
            id: "same_family_cereal".to_string(),
            delta: -3,
            reason: "consecutive cereals share foliar and root pathogens".to_string(),
            exclude: false,
        });
    }

    // Sunflower Sclerotinia break rule: sunflower > 1 in 3 years is risky; >= 50% share is excluded
    if sunflower_count > 0 && n <= 2 {
        let id = "sunflower_break_too_short".to_string();
        if excluded_by.is_none() {
            excluded_by = Some(id.clone());
        }
        hits.push(RuleHit {
            id,
            delta: -15,
            reason: "sunflower needs at least a 3-to-4 year break to prevent Sclerotinia and broomrape"
                .to_string(),
            exclude: true,
        });
    }

    if cover_count > 0 {
        hits.push(RuleHit {
            id: "rye_cover_soil_shield".to_string(),
            delta: 3,
            reason: "winter rye cover crop reduces soil erosion and builds organic carbon"
                .to_string(),
            exclude: false,
        });
    }

    if families.len() >= 3 {
        hits.push(RuleHit {
            id: "cap_crop_diversification".to_string(),
            delta: 4,
            reason: "3 distinct crop families satisfy EU CAP eco-scheme diversification and spread risk"
                .to_string(),
            exclude: false,
        });
    }

    if has_drought_anchor {
        hits.push(RuleHit {
            id: "drought_tolerant_anchor".to_string(),
            delta: 2,
            reason: "includes a drought-hardy crop (winter cereal, sorghum, or millet) that avoids mid-summer heat"
                .to_string(),
            exclude: false,
        });
    }

    if farm.pack.meta.slope > 4.5 && cover_count == 0 {
        let has_wide_row = rotation
            .iter()
            .any(|s| matches!(get_crop_spec(&s.crop).id, "maize" | "sunflower" | "soybean"));
        if has_wide_row {
            hits.push(RuleHit {
                id: "steep_slope_bare_winter".to_string(),
                delta: -5,
                reason: "wide-row crops on >4.5% slope without winter cover increase runoff erosion"
                    .to_string(),
                exclude: false,
            });
        }
    }

    if let Some(crop_name) = acid_sensitive_crop {
        hits.push(RuleHit {
            id: "acid_soil_penalty".to_string(),
            delta: -6,
            reason: format!(
                "{crop_name} nodulation and yield suffer when soil pH ({:.1}) is below 5.4",
                farm.soil_ph
            ),
            exclude: false,
        });
    }

    // 3. Evaluate any custom Rhai scripts (`rules/*.rhai`)
    if !custom_scripts.is_empty() {
        run_rhai_scripts(
            farm,
            rotation,
            constraints,
            avg_cost_per_ha,
            custom_scripts,
            &mut hits,
            &mut excluded_by,
        );
    }

    let total_delta: i32 = hits.iter().map(|h| h.delta).sum();

    RulesEvaluation {
        rules: hits,
        total_delta: total_delta.clamp(-40, 25),
        excluded_by,
        fits_budget,
        missing_equipment,
        avg_cost_per_ha,
    }
}

fn run_rhai_scripts(
    farm: &Farm,
    rotation: &[RotationStep],
    constraints: &Constraints,
    avg_cost_per_ha: f64,
    scripts: &[RhaiRuleScript],
    hits: &mut Vec<RuleHit>,
    excluded_by: &mut Option<String>,
) {
    let engine = Engine::new();

    // Build `rot` array of maps: `[{ crop: "maize", cover: false, family: "poaceae", legume: false }]`
    let rot_arr: Vec<Dynamic> = rotation
        .iter()
        .map(|s| {
            let spec = get_crop_spec(&s.crop);
            let mut m = Map::new();
            m.insert("crop".into(), Dynamic::from(spec.id.to_string()));
            m.insert("cover".into(), Dynamic::from(s.cover));
            m.insert("family".into(), Dynamic::from(spec.family.to_string()));
            m.insert("legume".into(), Dynamic::from(spec.is_legume));
            Dynamic::from_map(m)
        })
        .collect();

    // Build `farm` map
    let mut farm_map = Map::new();
    farm_map.insert("id".into(), Dynamic::from(farm.pack.meta.id.clone()));
    farm_map.insert("slope".into(), Dynamic::from_float(farm.pack.meta.slope));
    farm_map.insert("ph".into(), Dynamic::from_float(farm.soil_ph));
    farm_map.insert("soc".into(), Dynamic::from_float(farm.soil_soc_g_kg));
    farm_map.insert("awc".into(), Dynamic::from_float(farm.soil_awc_mm));

    // Build `profile` map
    let mut profile_map = Map::new();
    profile_map.insert("avgCostPerHa".into(), Dynamic::from_float(avg_cost_per_ha));
    profile_map.insert(
        "maxCostPerHa".into(),
        Dynamic::from_float(constraints.max_cost_per_ha.unwrap_or(999_999.0)),
    );

    for script_def in scripts {
        if let Ok(ast) = engine.compile(&script_def.script) {
            let mut scope = Scope::new();
            let call_res: Result<Map, _> = engine.call_fn(
                &mut scope,
                &ast,
                "apply",
                (
                    rot_arr.clone(),
                    Dynamic::from_map(farm_map.clone()),
                    Dynamic::from_map(profile_map.clone()),
                ),
            );
            if let Ok(res_map) = call_res {
                let exclude = res_map
                    .get("exclude")
                    .and_then(|v| v.as_bool().ok())
                    .unwrap_or(false);
                let delta = res_map
                    .get("delta")
                    .and_then(|v| v.as_int().ok())
                    .unwrap_or(0) as i32;
                let reason = res_map
                    .get("reason")
                    .and_then(|v| v.clone().into_string().ok())
                    .unwrap_or_default();

                if exclude || delta != 0 {
                    if exclude && excluded_by.is_none() {
                        *excluded_by = Some(script_def.id.clone());
                    }
                    hits.push(RuleHit {
                        id: script_def.id.clone(),
                        delta,
                        reason,
                        exclude,
                    });
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{prepare_farm, FarmPack};

    #[test]
    fn test_legume_before_cereal_bonus_and_equipment_filter() {
        let farm = prepare_farm(FarmPack::default());
        let rot = vec![
            RotationStep::new("wheat", false),
            RotationStep::new("sorghum", false),
            RotationStep::new("pea", true),
        ];
        let opts = SimOpts::default();
        let constraints = Constraints {
            max_cost_per_ha: Some(800.0),
            max_investment: None,
            equipment: vec!["grain_drill".to_string(), "row_planter".to_string()],
            sellable: vec![
                "wheat".to_string(),
                "sorghum".to_string(),
                "pea".to_string(),
            ],
        };

        let eval = evaluate_rules(&farm, &rot, &opts, &constraints, &[]);
        assert!(eval.excluded_by.is_none());
        assert!(eval.fits_budget);
        assert!(eval.rules.iter().any(|r| r.id == "legume_before_cereal"));
        assert!(eval.total_delta > 0);
    }

    #[test]
    fn test_custom_rhai_rule_script() {
        let farm = prepare_farm(FarmPack::default());
        let rot = vec![
            RotationStep::new("maize", false),
            RotationStep::new("soybean", false),
        ];
        let script = RhaiRuleScript {
            id: "custom_contract_bonus".to_string(),
            script: r#"
                fn apply(rot, farm, profile) {
                    #{ exclude: false, delta: 5, reason: "local processor contract bonus" }
                }
            "#
            .to_string(),
        };
        let eval = evaluate_rules(
            &farm,
            &rot,
            &SimOpts::default(),
            &Constraints::default(),
            &[script],
        );
        assert!(eval
            .rules
            .iter()
            .any(|r| r.id == "custom_contract_bonus" && r.delta == 5));
    }
}
