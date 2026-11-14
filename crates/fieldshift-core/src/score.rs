//! I4 · Hybrid FieldShift Score (`score.rs`, Contract C12)
//!
//! Combines 6 sources into a transparent 0–100 score with a waterfall breakdown:
//! 1. Physical simulator (`climate`, `profit`, `water`)
//! 2. Quant / stress risk metrics (`financialRisk`)
//! 3. Agronomy & feasibility rules (`rules.rs` -> `feasibility`, `soil`, rule deltas/exclusions)
//! 4. Satellite/climate data signals (`confidence`: low / medium / high)
//! 5. Bounded LLM qualitative adjustment (`±10` points max, schema-validated)

use crate::rules::{evaluate_rules, RhaiRuleScript, RuleHit, RulesEvaluation};
use crate::stress::adaptation_margin;
use crate::{
    simulate_rotation, Constraints, Farm, PriorityWeights, RotationResult, RotationStep, SimOpts,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScoreSubscores {
    pub climate: i32,
    pub financial_risk: i32,
    pub profit: i32,
    pub soil: i32,
    pub water: i32,
    pub feasibility: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedScoreWeights {
    pub climate: f64,
    pub financial_risk: f64,
    pub profit: f64,
    pub soil: f64,
    pub water: f64,
    pub feasibility: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LlmScoreAdjustment {
    #[serde(alias = "adjust")]
    pub delta: i32,
    pub reason: String,
    #[serde(default = "default_confidence")]
    pub confidence: String,
}

fn default_confidence() -> String {
    "medium".to_string()
}

impl Default for LlmScoreAdjustment {
    fn default() -> Self {
        Self {
            delta: 0,
            reason: "no contextual override applied".to_string(),
            confidence: "medium".to_string(),
        }
    }
}

impl LlmScoreAdjustment {
    /// Validates and enforces the C12 rule: out of `[-10, 10]` or empty reason -> `delta: 0`.
    pub fn validated(mut self) -> Self {
        if !(-10..=10).contains(&self.delta) || self.reason.trim().is_empty() {
            self.delta = 0;
            if self.reason.trim().is_empty() {
                self.reason = "adjustment reset to 0 (missing justification or out of bounds)"
                    .to_string();
            }
        }
        let conf = self.confidence.to_lowercase();
        self.confidence = match conf.as_str() {
            "low" | "medium" | "high" => conf,
            _ => "medium".to_string(),
        };
        self
    }

    /// Parses raw JSON returned by an LLM and validates it per C12 (`delta` in `-10..=10`).
    pub fn from_llm_json(raw_json: &str) -> Self {
        serde_json::from_str::<LlmScoreAdjustment>(raw_json)
            .map(LlmScoreAdjustment::validated)
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FieldShiftScoreResult {
    pub rotation: String,
    pub score: i32,
    pub confidence: String,
    pub subscores: ScoreSubscores,
    pub weights: NormalizedScoreWeights,
    pub base: i32,
    pub rules: Vec<RuleHit>,
    pub excluded_by: Option<String>,
    pub llm: LlmScoreAdjustment,
    pub waterfall: Vec<(String, i32)>,
}

/// Formats a slice of `RotationStep` as `"maize → soybean (rye cover)"`.
pub fn format_rotation_label(rotation: &[RotationStep]) -> String {
    if rotation.is_empty() {
        return "empty".to_string();
    }
    rotation
        .iter()
        .map(|s| {
            let name = if s.crop.eq_ignore_ascii_case("wheat") {
                "winter wheat"
            } else {
                s.crop.as_str()
            };
            if s.cover {
                format!("{name} + rye")
            } else {
                name.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" → ")
}

/// Normalizes the farmer's 4 UI priority sliders (`profit`, `stability`, `soil`, `water` ∈ 0..=5)
/// into the 6 C12 subscore weights (`climate`, `financialRisk`, `profit`, `soil`, `water`, `feasibility`).
pub fn normalize_weights(priorities: &PriorityWeights) -> NormalizedScoreWeights {
    let p_stab = priorities.stability.max(0.1);
    let p_prof = priorities.profit.max(0.1);
    let p_soil = priorities.soil.max(0.1);
    let p_wat = priorities.water.max(0.1);

    // Split `stability` priority between physical climate resilience (55%) and financial tail risk (45%),
    // and reserve 5% for practical farm feasibility (equipment & budget fit).
    let raw_climate = p_stab * 0.55;
    let raw_fin_risk = p_stab * 0.45;
    let raw_profit = p_prof;
    let raw_soil = p_soil;
    let raw_water = p_wat * 0.5;
    let raw_sum = (raw_climate + raw_fin_risk + raw_profit + raw_soil + raw_water).max(0.001);

    let scale = 0.95 / raw_sum;
    NormalizedScoreWeights {
        climate: round3(raw_climate * scale),
        financial_risk: round3(raw_fin_risk * scale),
        profit: round3(raw_profit * scale),
        soil: round3(raw_soil * scale),
        water: round3(raw_water * scale),
        feasibility: 0.05,
    }
}

/// Computes the full C12 `FieldShiftScoreResult` for a single rotation.
pub fn compute_fieldshift_score(
    farm: &Farm,
    rotation: &[RotationStep],
    opts: &SimOpts,
    priorities: &PriorityWeights,
    constraints: &Constraints,
    custom_scripts: &[RhaiRuleScript],
    llm_adjustment: Option<LlmScoreAdjustment>,
) -> FieldShiftScoreResult {
    let base_sim = simulate_rotation(farm, rotation, opts, None);
    let mut stress_opts = opts.clone();
    stress_opts.d_t += 2.0;
    stress_opts.d_p -= 0.20;
    let stress_sim = simulate_rotation(farm, rotation, &stress_opts, None);

    let rules_eval = evaluate_rules(farm, rotation, opts, constraints, custom_scripts);
    let margin = adaptation_margin(farm, rotation, opts);

    compute_score_from_precomputed(
        farm,
        rotation,
        opts,
        priorities,
        &base_sim,
        &stress_sim,
        Some(margin.d_t),
        &rules_eval,
        llm_adjustment,
    )
}

#[allow(clippy::too_many_arguments)]
pub fn compute_score_from_precomputed(
    farm: &Farm,
    rotation: &[RotationStep],
    opts: &SimOpts,
    priorities: &PriorityWeights,
    base_sim: &RotationResult,
    stress_sim: &RotationResult,
    margin_dt: Option<f64>,
    rules_eval: &RulesEvaluation,
    llm_adjustment: Option<LlmScoreAdjustment>,
) -> FieldShiftScoreResult {
    // 1. Subscores (0..=100)
    // Climate resilience: combines survival under +2°C/-20% rain and adaptation margin dT
    let stress_survival = (1.0 - stress_sim.p_fail).clamp(0.0, 1.0) * 70.0;
    let margin_bonus = margin_dt
        .unwrap_or_else(|| ((1.0 - stress_sim.p_fail) * 3.5).clamp(0.0, 6.0))
        .clamp(0.0, 6.0)
        * 5.0;
    let climate_sub = (stress_survival + margin_bonus).round().clamp(0.0, 100.0) as i32;

    // Financial risk: low failure probability today + bounded worst-year loss (`min_net`)
    let today_survival = (1.0 - base_sim.p_fail).clamp(0.0, 1.0) * 60.0;
    let downside_cushion =
        ((base_sim.min_net - opts.fail_net + 250.0) / 600.0).clamp(0.0, 1.0) * 40.0;
    let financial_risk_sub = (today_survival + downside_cushion)
        .round()
        .clamp(0.0, 100.0) as i32;

    // Profit: mean annual net income mapped onto 0..100 ($0/ha -> 30, $600/ha -> 95)
    let profit_sub = (30.0 + (base_sim.mean_net / 650.0) * 65.0)
        .round()
        .clamp(0.0, 100.0) as i32;

    // Soil health: direct from `soil_score`
    let soil_sub = base_sim.soil_score.round().clamp(0.0, 100.0) as i32;

    // Water efficiency: lower seasonal ET water use (~250 mm -> 90, ~580 mm -> 40)
    let water_sub = (100.0 - ((base_sim.water_use - 200.0).max(0.0) / 420.0) * 65.0)
        .round()
        .clamp(10.0, 100.0) as i32;

    // Feasibility: starts at 95 if budget & equipment match, drops sharply if violated
    let mut feasibility_sub = 95i32;
    if !rules_eval.fits_budget {
        feasibility_sub -= 45;
    }
    if !rules_eval.missing_equipment.is_empty() {
        feasibility_sub -= (rules_eval.missing_equipment.len() as i32) * 25;
    }
    if rules_eval.excluded_by.is_some() {
        feasibility_sub = feasibility_sub.min(35);
    }
    feasibility_sub = feasibility_sub.clamp(0, 100);

    let subscores = ScoreSubscores {
        climate: climate_sub,
        financial_risk: financial_risk_sub,
        profit: profit_sub,
        soil: soil_sub,
        water: water_sub,
        feasibility: feasibility_sub,
    };

    let weights = normalize_weights(priorities);
    let weighted_base = (subscores.climate as f64) * weights.climate
        + (subscores.financial_risk as f64) * weights.financial_risk
        + (subscores.profit as f64) * weights.profit
        + (subscores.soil as f64) * weights.soil
        + (subscores.water as f64) * weights.water
        + (subscores.feasibility as f64) * weights.feasibility;

    let base_score = weighted_base.round().clamp(0.0, 100.0) as i32;
    let rules_delta = rules_eval.total_delta;
    let llm = llm_adjustment.unwrap_or_default().validated();
    let final_score = (base_score + rules_delta + llm.delta).clamp(0, 100);

    let confidence = determine_data_confidence(farm);

    let waterfall = vec![
        ("base".to_string(), base_score),
        ("rules".to_string(), rules_delta),
        ("llm".to_string(), llm.delta),
        ("final".to_string(), final_score),
    ];

    FieldShiftScoreResult {
        rotation: format_rotation_label(rotation),
        score: final_score,
        confidence,
        subscores,
        weights,
        base: base_score,
        rules: rules_eval.rules.clone(),
        excluded_by: rules_eval.excluded_by.clone(),
        llm,
        waterfall,
    }
}

pub fn determine_data_confidence(farm: &Farm) -> String {
    let mut signals = 0usize;
    if !farm.pack.weather.is_empty() {
        signals += 1;
    }
    if farm.pack.soil.is_some() {
        signals += 1;
    }
    if farm.pack.ndvi.is_some() {
        signals += 1;
    }
    if farm.pack.scenarios.is_some() {
        signals += 1;
    }
    match signals {
        3..=4 => "high".to_string(),
        1..=2 => "medium".to_string(),
        _ => "medium".to_string(),
    }
}

fn round3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{prepare_farm, FarmPack};

    #[test]
    fn test_fieldshift_score_waterfall_and_llm_clamping() {
        let farm = prepare_farm(FarmPack::default());
        let rot = vec![
            RotationStep::new("wheat", false),
            RotationStep::new("sorghum", false),
            RotationStep::new("pea", false),
        ];
        let opts = SimOpts::default();
        let priorities = PriorityWeights::default();
        let constraints = Constraints::default();

        // Out-of-bounds LLM delta (+25) must be reset to 0 per Contract C12
        let invalid_llm = LlmScoreAdjustment {
            delta: 25,
            reason: "excessive boost".to_string(),
            confidence: "high".to_string(),
        };
        let res = compute_fieldshift_score(
            &farm,
            &rot,
            &opts,
            &priorities,
            &constraints,
            &[],
            Some(invalid_llm),
        );
        assert_eq!(res.llm.delta, 0);
        assert_eq!(res.waterfall.len(), 4);
        assert_eq!(res.waterfall[0].0, "base");
        assert_eq!(res.waterfall[3].1, res.score);

        // Valid LLM delta (-3)
        let valid_llm = LlmScoreAdjustment {
            delta: -3,
            reason: "farmer reports compacted soil; first-year sorghum may lag".to_string(),
            confidence: "medium".to_string(),
        };
        let res2 = compute_fieldshift_score(
            &farm,
            &rot,
            &opts,
            &priorities,
            &constraints,
            &[],
            Some(valid_llm),
        );
        assert_eq!(res2.llm.delta, -3);
        assert_eq!(
            res2.score,
            (res2.base + res2.waterfall[1].1 - 3).clamp(0, 100)
        );
    }
}
