//! Hybrid FieldShift Score (C12): simulator + risk + rules + data confidence + a bounded LLM adjustment.

use crate::rotation::{simulate_resolved, RotationResult};
use crate::rules::{evaluate_rules, RuleHit, RulesEvaluation};
use crate::stress::{adaptation_margin_with, STRESS_DP_FRAC, STRESS_DT_C};
use crate::{
    round3, Constraints, PreparedFarm, ResolvedRotation, Result, RotationStep, SimOptions, Weights,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// The six 0..=100 sub-scores.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subscores {
    pub climate: i32,
    pub financial_risk: i32,
    pub profit: i32,
    pub soil: i32,
    pub water: i32,
    pub feasibility: i32,
}

/// Bounded qualitative adjustment proposed by the LLM (C12): `delta` must be within ±10 with a reason.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LlmAdjustment {
    #[serde(alias = "adjust")]
    pub delta: i32,
    pub reason: String,
    #[serde(default = "medium")]
    pub confidence: String,
}

fn medium() -> String {
    "medium".to_string()
}

impl LlmAdjustment {
    /// Out of `[-10, 10]` or no justification -> `delta = 0`.
    pub fn validated(mut self) -> Self {
        if !(-10..=10).contains(&self.delta) || self.reason.trim().is_empty() {
            self.delta = 0;
            if self.reason.trim().is_empty() {
                self.reason = "adjustment reset to 0 (missing justification)".to_string();
            }
        }
        let c = self.confidence.to_lowercase();
        self.confidence = if matches!(c.as_str(), "low" | "medium" | "high") {
            c
        } else {
            medium()
        };
        self
    }

    /// Parses raw LLM JSON; anything malformed is a neutral adjustment (never an error).
    pub fn from_json(raw: &str) -> Option<Self> {
        serde_json::from_str::<LlmAdjustment>(raw)
            .ok()
            .map(LlmAdjustment::validated)
    }
}

/// C12 `ScoreResult`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreResult {
    pub rotation: String,
    pub score: i32,
    pub confidence: String,
    pub subscores: Subscores,
    pub weights: BTreeMap<String, f64>,
    pub base: i32,
    pub rules: Vec<RuleHit>,
    pub excluded_by: Option<String>,
    pub llm: Option<LlmAdjustment>,
    pub waterfall: Vec<(String, i32)>,
}

/// Splits the four UI priority sliders into the six score weights (sum to 1).
pub fn normalize_weights(p: &Weights) -> BTreeMap<String, f64> {
    let stab = p.stability.max(0.1);
    let prof = p.profit.max(0.1);
    let soil = p.soil.max(0.1);
    let water = p.water.max(0.1);
    // stability = physical climate resilience (55 %) + financial tail risk (45 %); 5 % is reserved for feasibility
    let raw = [
        ("climate", stab * 0.55),
        ("financialRisk", stab * 0.45),
        ("profit", prof),
        ("soil", soil),
        ("water", water * 0.5),
    ];
    let sum: f64 = raw.iter().map(|(_, v)| v).sum::<f64>().max(1e-3);
    let mut out: BTreeMap<String, f64> = raw
        .iter()
        .map(|(k, v)| ((*k).to_string(), round3(v * 0.95 / sum)))
        .collect();
    out.insert("feasibility".to_string(), 0.05);
    out
}

/// `low` / `medium` / `high` from how many real data layers the pack carries.
pub fn data_confidence(farm: &PreparedFarm) -> String {
    let signals = 1 // daily weather is always real (prepare_farm refuses packs without it)
        + usize::from(farm.soil.has_observed_soil)
        + usize::from(farm.has_ndvi)
        + usize::from(farm.has_scenarios);
    match signals {
        4 => "high",
        2..=3 => "medium",
        _ => "low",
    }
    .to_string()
}

/// Score from precomputed simulations (the optimizer already has them).
#[allow(clippy::too_many_arguments)]
pub fn score_from_parts(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
    priorities: &Weights,
    base: &RotationResult,
    stress: &RotationResult,
    margin_dt: Option<f64>,
    rules: &RulesEvaluation,
    llm: Option<LlmAdjustment>,
) -> ScoreResult {
    let stress_survival = (1.0 - stress.p_fail).clamp(0.0, 1.0) * 70.0;
    let margin_bonus = margin_dt
        .unwrap_or_else(|| ((1.0 - stress.p_fail) * 3.5).clamp(0.0, 6.0))
        .clamp(0.0, 6.0)
        * 5.0;
    let climate = (stress_survival + margin_bonus).round().clamp(0.0, 100.0) as i32;

    let today_survival = (1.0 - base.p_fail).clamp(0.0, 1.0) * 60.0;
    let cushion = ((base.min_net - opts.fail_net + 250.0) / 600.0).clamp(0.0, 1.0) * 40.0;
    let financial_risk = (today_survival + cushion).round().clamp(0.0, 100.0) as i32;

    let profit = (30.0 + (base.mean_net / 650.0) * 65.0)
        .round()
        .clamp(0.0, 100.0) as i32;
    let soil = base.soil_score.round().clamp(0.0, 100.0) as i32;
    let water = (100.0 - ((base.water_use - 200.0).max(0.0) / 420.0) * 65.0)
        .round()
        .clamp(10.0, 100.0) as i32;

    let mut feasibility = 95;
    if !rules.fits_budget {
        feasibility -= 45;
    }
    feasibility -= (rules.missing_equipment.len() as i32) * 25;
    if rules.excluded_by.is_some() {
        feasibility = feasibility.min(35);
    }
    let subscores = Subscores {
        climate,
        financial_risk,
        profit,
        soil,
        water,
        feasibility: feasibility.clamp(0, 100),
    };

    let weights = normalize_weights(priorities);
    let w = |k: &str| weights.get(k).copied().unwrap_or(0.0);
    let weighted = f64::from(subscores.climate) * w("climate")
        + f64::from(subscores.financial_risk) * w("financialRisk")
        + f64::from(subscores.profit) * w("profit")
        + f64::from(subscores.soil) * w("soil")
        + f64::from(subscores.water) * w("water")
        + f64::from(subscores.feasibility) * w("feasibility");
    let base_score = weighted.round().clamp(0.0, 100.0) as i32;

    let llm = llm.map(LlmAdjustment::validated);
    let llm_delta = llm.as_ref().map_or(0, |l| l.delta);
    let final_score = (base_score + rules.total_delta + llm_delta).clamp(0, 100);

    ScoreResult {
        rotation: crate::rotation_label(rotation),
        score: final_score,
        confidence: data_confidence(farm),
        subscores,
        weights,
        base: base_score,
        rules: rules.rules.clone(),
        excluded_by: rules.excluded_by.clone(),
        llm,
        waterfall: vec![
            ("base".to_string(), base_score),
            ("rules".to_string(), rules.total_delta),
            ("llm".to_string(), llm_delta),
            ("final".to_string(), final_score),
        ],
    }
}

/// C12 score of one rotation (runs today, +2 °C / -20 % rain, the adaptation margin and the rules).
pub fn compute_score(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
    priorities: &Weights,
    constraints: &Constraints,
    llm: Option<LlmAdjustment>,
) -> Result<ScoreResult> {
    let rot = ResolvedRotation::new(rotation)?;
    let sim = |o: &SimOptions| simulate_resolved(farm, &rot, o, None);
    let base = sim(opts);
    let stress = sim(&opts.shifted(STRESS_DT_C, STRESS_DP_FRAC));
    let margin = adaptation_margin_with(opts, &sim);
    let rules = evaluate_rules(farm, &rot, opts, constraints);
    Ok(score_from_parts(
        farm,
        &rot.steps,
        opts,
        priorities,
        &base,
        &stress,
        Some(margin.d_t),
        &rules,
        llm,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn llm_adjustment_is_bounded() {
        let bad = LlmAdjustment {
            delta: 25,
            reason: "boost".into(),
            confidence: "HIGH".into(),
        }
        .validated();
        assert_eq!((bad.delta, bad.confidence.as_str()), (0, "high"));
        let empty = LlmAdjustment {
            delta: 4,
            reason: "  ".into(),
            confidence: "x".into(),
        }
        .validated();
        assert_eq!(empty.delta, 0);
        assert!(LlmAdjustment::from_json("not json").is_none());
    }

    #[test]
    fn weights_sum_to_one() {
        let w = normalize_weights(&Weights::default());
        let s: f64 = w.values().sum();
        assert!((s - 1.0).abs() < 0.01, "{s}");
        assert_eq!(w.len(), 6);
    }
}
