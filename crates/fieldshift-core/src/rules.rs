//! Agronomy and feasibility rules (C12).
//!
//! The 13 Rhai rule files in `/rules` are embedded at compile time and run through one shared engine.
//! Each file defines `fn apply(rot, farm, profile) -> #{ exclude, delta, reason }`:
//!
//! * `rot`     array of `{ crop, cover, family, legume }`
//! * `farm`    `{ id, slope, ph, country, cropPool, soc, awc }` (+ `graceTrendCmYr` when the pack has it)
//! * `profile` `{ equipment, maxInvestment, maxCostPerHa, sellable }` (`sellable` only when the farmer set it,
//!   so rule 10 can fall back to `farm.cropPool`)
//!
//! Besides the scripts, this module computes the numeric feasibility facts the UI needs (`fitsBudget`,
//! `missingEquipment`, average input cost) and the single native `over_budget` rule.

use crate::crops::{missing_equipment, COVER_CROP_COST_USD_HA};
use crate::{Constraints, PreparedFarm, ResolvedRotation, SimOptions};
use once_cell::sync::Lazy;
use rhai::{Array, Dynamic, Engine, Map, Scope, AST};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

macro_rules! embedded_rules {
    ($($name:literal),* $(,)?) => {
        const RULE_SOURCES: &[(&str, &str)] = &[
            $(($name, include_str!(concat!("../../../rules/", $name, ".rhai")))),*
        ];
    };
}

embedded_rules!(
    "01_sunflower_break",
    "02_pea_root_rot_break",
    "03_continuous_corn",
    "04_legume_before_cereal",
    "05_same_family_back_to_back",
    "06_eu_cap_gaec7_diversification",
    "07_cover_crop_erosion_shield",
    "08_bare_fallow_slope_penalty",
    "09_equipment_fit",
    "10_local_market_sellable",
    "11_soil_ph_limits",
    "12_drought_escape_phenology",
    "13_groundwater_irrigation_risk",
);

/// One fired rule (`{ id, delta, reason }` in C12).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuleHit {
    pub id: String,
    pub delta: i32,
    pub reason: String,
    /// Stable code of this rule branch (e.g. `continuous_maize`), for i18n; the UI falls back to `reason`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    /// Variables of the reason text (slope, crop, ph, ...).
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub vars: BTreeMap<String, serde_json::Value>,
    /// Rule excludes the rotation outright (surfaces as `excludedBy`).
    #[serde(skip)]
    pub exclude: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RulesEvaluation {
    pub rules: Vec<RuleHit>,
    pub total_delta: i32,
    pub excluded_by: Option<String>,
    pub fits_budget: bool,
    pub missing_equipment: Vec<String>,
    pub avg_cost_per_ha: f64,
}

struct Compiled {
    engine: Engine,
    scripts: Vec<(&'static str, Result<AST, String>)>,
}

static RULES: Lazy<Compiled> = Lazy::new(|| {
    let mut engine = Engine::new();
    engine.set_max_operations(2_000_000);
    engine.set_max_call_levels(32);
    engine.set_max_expr_depths(128, 64);
    let scripts = RULE_SOURCES
        .iter()
        .map(|&(id, src)| (id, engine.compile(src).map_err(|e| e.to_string())))
        .collect();
    Compiled { engine, scripts }
});

/// Ids of the embedded rules, in evaluation order.
pub fn rule_ids() -> Vec<&'static str> {
    RULE_SOURCES.iter().map(|(id, _)| *id).collect()
}

/// Compile errors of embedded rules (empty when all 13 parse).
pub fn rule_compile_errors() -> Vec<String> {
    RULES
        .scripts
        .iter()
        .filter_map(|(id, r)| r.as_ref().err().map(|e| format!("{id}: {e}")))
        .collect()
}

fn str_array(items: &[String]) -> Array {
    items.iter().map(|s| Dynamic::from(s.clone())).collect()
}

fn farm_map(farm: &PreparedFarm) -> Map {
    let mut m = Map::new();
    m.insert("id".into(), Dynamic::from(farm.meta.id.clone()));
    m.insert("slope".into(), Dynamic::from_float(farm.meta.slope));
    m.insert("ph".into(), Dynamic::from_float(farm.soil.ph));
    m.insert(
        "country".into(),
        Dynamic::from(farm.meta.country.clone().unwrap_or_default()),
    );
    m.insert(
        "cropPool".into(),
        Dynamic::from(str_array(&farm.meta.crop_pool)),
    );
    if let Some(g) = farm.meta.grace_trend_cm_yr {
        m.insert("graceTrendCmYr".into(), Dynamic::from_float(g));
    }
    m.insert("soc".into(), Dynamic::from_float(farm.soil.soc_top_g_kg));
    m.insert("awc".into(), Dynamic::from_float(farm.soil.taw_mm_per_m));
    m
}

fn profile_map(constraints: &Constraints) -> Map {
    let mut m = Map::new();
    m.insert(
        "equipment".into(),
        Dynamic::from(str_array(&constraints.equipment)),
    );
    m.insert(
        "maxInvestment".into(),
        Dynamic::from_float(constraints.max_investment.unwrap_or(0.0)),
    );
    m.insert(
        "maxCostPerHa".into(),
        Dynamic::from_float(constraints.max_cost_per_ha.unwrap_or(1.0e9)),
    );
    if !constraints.sellable.is_empty() {
        m.insert(
            "sellable".into(),
            Dynamic::from(str_array(&constraints.sellable)),
        );
    }
    m
}

fn rot_array(rot: &ResolvedRotation) -> Array {
    rot.steps
        .iter()
        .zip(&rot.crops)
        .map(|(s, c)| {
            let mut m = Map::new();
            m.insert("crop".into(), Dynamic::from(c.id.to_string()));
            m.insert("cover".into(), Dynamic::from(s.cover));
            m.insert("family".into(), Dynamic::from(c.family.clone()));
            m.insert("legume".into(), Dynamic::from(c.legume));
            Dynamic::from_map(m)
        })
        .collect()
}

fn dynamic_to_json(v: &Dynamic) -> Option<serde_json::Value> {
    if let Ok(i) = v.as_int() {
        Some(serde_json::json!(i))
    } else if let Ok(f) = v.as_float() {
        Some(serde_json::json!((f * 100.0).round() / 100.0))
    } else if let Ok(b) = v.as_bool() {
        Some(serde_json::json!(b))
    } else {
        v.clone().into_string().ok().map(serde_json::Value::String)
    }
}

/// Runs the 13 rule scripts plus the numeric feasibility checks for one rotation.
pub fn evaluate_rules(
    farm: &PreparedFarm,
    rot: &ResolvedRotation,
    opts: &SimOptions,
    constraints: &Constraints,
) -> RulesEvaluation {
    let n = rot.steps.len().max(1) as f64;
    let avg_cost_per_ha = rot
        .crops
        .iter()
        .zip(&rot.steps)
        .map(|(c, s)| farm.crop_cost(c, opts) + if s.cover { COVER_CROP_COST_USD_HA } else { 0.0 })
        .sum::<f64>()
        / n;

    let mut missing = BTreeSet::new();
    for c in &rot.crops {
        for e in missing_equipment(c.id, &constraints.equipment) {
            missing.insert(e);
        }
    }

    let mut hits: Vec<RuleHit> = Vec::new();
    let mut excluded_by: Option<String> = None;

    let fits_budget = constraints
        .max_cost_per_ha
        .is_none_or(|max| avg_cost_per_ha <= max + 1e-6);
    if !fits_budget {
        excluded_by = Some("over_budget".to_string());
        hits.push(RuleHit {
            id: "over_budget".to_string(),
            delta: -20,
            reason: format!(
                "average input cost ({avg_cost_per_ha:.0} $/ha) exceeds the farmer's budget ({:.0} $/ha)",
                constraints.max_cost_per_ha.unwrap_or(0.0)
            ),
            code: Some("over_budget".to_string()),
            vars: BTreeMap::from([
                ("cost".to_string(), serde_json::json!(avg_cost_per_ha.round())),
                (
                    "budget".to_string(),
                    serde_json::json!(constraints.max_cost_per_ha.unwrap_or(0.0).round()),
                ),
            ]),
            exclude: true,
        });
    }

    let rot_arr = rot_array(rot);
    let farm_m = farm_map(farm);
    let profile_m = profile_map(constraints);
    for (id, ast) in &RULES.scripts {
        let Ok(ast) = ast else { continue };
        let mut scope = Scope::new();
        let res = RULES.engine.call_fn::<Map>(
            &mut scope,
            ast,
            "apply",
            (
                rot_arr.clone(),
                Dynamic::from_map(farm_m.clone()),
                Dynamic::from_map(profile_m.clone()),
            ),
        );
        let Ok(map) = res else { continue };
        let exclude = map
            .get("exclude")
            .and_then(|v| v.as_bool().ok())
            .unwrap_or(false);
        let delta = map
            .get("delta")
            .and_then(|v| {
                v.as_int()
                    .ok()
                    .or_else(|| v.as_float().ok().map(|f| f.round() as i64))
            })
            .unwrap_or(0)
            .clamp(-100, 100) as i32;
        let reason = map
            .get("reason")
            .and_then(|v| v.clone().into_string().ok())
            .unwrap_or_default();
        let code = map
            .get("code")
            .and_then(|v| v.clone().into_string().ok())
            .filter(|c| !c.is_empty());
        let vars: BTreeMap<String, serde_json::Value> = map
            .get("vars")
            .and_then(|v| v.clone().try_cast::<Map>())
            .map(|m| {
                m.into_iter()
                    .filter_map(|(k, v)| dynamic_to_json(&v).map(|j| (k.to_string(), j)))
                    .collect()
            })
            .unwrap_or_default();
        if exclude || delta != 0 {
            if exclude && excluded_by.is_none() {
                excluded_by = Some((*id).to_string());
            }
            hits.push(RuleHit {
                id: (*id).to_string(),
                delta,
                reason,
                code,
                vars,
                exclude,
            });
        }
    }

    let total: i32 = hits.iter().map(|h| h.delta).sum();
    RulesEvaluation {
        rules: hits,
        total_delta: total.clamp(-40, 25),
        excluded_by,
        fits_budget,
        missing_equipment: missing.into_iter().collect(),
        avg_cost_per_ha,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{FarmMeta, FarmPack, RawWeatherYear, RotationStep};

    fn farm(id: &str, slope: f64) -> PreparedFarm {
        let mut pack = FarmPack {
            meta: FarmMeta {
                id: id.into(),
                slope,
                ..Default::default()
            },
            ..Default::default()
        };
        let year = RawWeatherYear {
            tmax: vec![20.0; 365],
            tmin: vec![8.0; 365],
            prcp: vec![1.0; 365],
            ..Default::default()
        };
        pack.weather.insert("2020".into(), year);
        crate::prepare_farm(pack).unwrap()
    }

    fn rot(spec: &[(&str, bool)]) -> ResolvedRotation {
        let steps: Vec<_> = spec.iter().map(|&(c, v)| RotationStep::new(c, v)).collect();
        ResolvedRotation::new(&steps).unwrap()
    }

    #[test]
    fn all_thirteen_rules_compile() {
        assert_eq!(rule_ids().len(), 13);
        assert!(
            rule_compile_errors().is_empty(),
            "{:?}",
            rule_compile_errors()
        );
    }

    #[test]
    fn continuous_corn_and_sunflower_rules_fire() {
        let f = farm("iowa", 2.0);
        let e = evaluate_rules(
            &f,
            &rot(&[("maize", false)]),
            &SimOptions::default(),
            &Constraints::default(),
        );
        assert!(e
            .rules
            .iter()
            .any(|r| r.id == "03_continuous_corn" && r.delta == -12));
        let e = evaluate_rules(
            &f,
            &rot(&[("sunflower", false), ("sunflower", false)]),
            &SimOptions::default(),
            &Constraints::default(),
        );
        assert_eq!(e.excluded_by.as_deref(), Some("01_sunflower_break"));
    }

    #[test]
    fn profile_keys_reach_the_scripts() {
        let f = farm("iowa", 2.0);
        let c = Constraints {
            equipment: vec!["grain_drill".into()],
            sellable: vec!["wheat".into()],
            ..Default::default()
        };
        let e = evaluate_rules(
            &f,
            &rot(&[("maize", false), ("wheat", false)]),
            &SimOptions::default(),
            &c,
        );
        // no maxInvestment -> equipment rule excludes; maize not sellable -> market rule excludes
        assert!(e
            .rules
            .iter()
            .any(|r| r.id == "09_equipment_fit" && r.exclude));
        assert!(e
            .rules
            .iter()
            .any(|r| r.id == "10_local_market_sellable" && r.exclude));
        assert!(e.missing_equipment.contains(&"corn_header".to_string()));
    }

    #[test]
    fn farm_keys_reach_the_scripts() {
        // bare fallow on a 5 % slope (slope), groundwater trend from the pack (graceTrendCmYr)
        let mut f = farm("steep", 5.0);
        let e = evaluate_rules(
            &f,
            &rot(&[("wheat", false), ("fallow", false)]),
            &SimOptions::default(),
            &Constraints::default(),
        );
        assert!(e
            .rules
            .iter()
            .any(|r| r.id == "08_bare_fallow_slope_penalty"));
        f.meta.grace_trend_cm_yr = Some(-2.0);
        let e = evaluate_rules(
            &f,
            &rot(&[("maize", false), ("soybean", false)]),
            &SimOptions::default(),
            &Constraints::default(),
        );
        assert!(e
            .rules
            .iter()
            .any(|r| r.id == "13_groundwater_irrigation_risk"));
    }
}
