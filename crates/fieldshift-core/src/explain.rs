use crate::crops::normalize_crop_id;
use crate::optimize::PickedRotation;
use crate::quant::{quant_simulate, QuantSimConfig};
use crate::rotation::simulate_rotation;
use crate::season::{round1, round2};
use crate::stress::{adaptation_margin, margin_year, market_shock, MarketShockParams};
use crate::{PreparedFarm, RotationStep, SimOptions};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactFarm {
    pub name: String,
    pub lat: f32,
    pub lon: f32,
    pub soil: String,
    pub climate: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactRule {
    pub bad_year: String,
    pub tolerance: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactToday {
    pub bad_years: String,
    pub mean_net: f32,
    pub worst_year: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactSafeUntil {
    pub ssp245: serde_json::Value,
    pub ssp585: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactMargin {
    #[serde(rename = "dT")]
    pub d_t: f32,
    #[serde(rename = "dP")]
    pub d_p: f32,
    pub status: String,
    pub safe_until: FactSafeUntil,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactAltMargin {
    #[serde(rename = "dT")]
    pub d_t: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactAlternative {
    pub label: String,
    pub rotation: String,
    pub bad_years: String,
    pub delta_net: f32,
    pub margin: FactAltMargin,
    pub soil_score: f32,
    pub fits_budget: bool,
    pub missing_equipment: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactSoil {
    pub score: f32,
    pub carbon_trend_pct_yr: f32,
    pub erosion_t_ha_yr: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactMarket {
    pub price_pct: i32,
    pub bad_years_under_shock: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactQuant {
    pub paths: usize,
    pub horizon: String,
    pub p_bad_year2035: f32,
    pub cvar95: f32,
    pub p_ruin: f32,
    pub margin_year_p50: Option<i32>,
}

/// Contract C10 LLM Fact Sheet structure (`fs.factSheet(...)`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactSheet {
    pub farm: FactFarm,
    pub rotation: String,
    pub rule: FactRule,
    pub today: FactToday,
    pub margin: FactMargin,
    pub worst_year_why: Vec<String>,
    pub alternatives: Vec<FactAlternative>,
    pub soil: FactSoil,
    pub market: FactMarket,
    pub quant: FactQuant,
    pub sources: Vec<String>,
}

pub fn format_rotation_label(rot: &[RotationStep]) -> String {
    rot.iter()
        .map(|s| {
            let cid = normalize_crop_id(&s.crop);
            let base = if cid == "wheat" { "winter wheat" } else { cid };
            if s.cover {
                format!("{} (+rye)", base)
            } else {
                base.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" → ")
}

/// Builds the complete C10 `FactSheet` from deterministic simulation outputs.
pub fn build_fact_sheet(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
    picks: &[PickedRotation],
) -> FactSheet {
    let base_sim = simulate_rotation(farm, rotation, opts, None);
    let margin = adaptation_margin(farm, rotation, opts);
    let n_years = base_sim.years.len().max(1);

    let ssp245_series = farm.scenario_series("ssp245");
    let ssp585_series = farm.scenario_series("ssp585");
    let safe_245 = margin_year(farm, rotation, opts, &ssp245_series).year;
    let safe_585 = margin_year(farm, rotation, opts, &ssp585_series).year;

    let status = if margin.already {
        "already_over".to_string()
    } else if margin.d_t < 1.5 || margin.d_p.abs() < 0.15 {
        "tight".to_string()
    } else {
        "safe".to_string()
    };

    let mut alternatives = Vec::with_capacity(picks.len());
    for p in picks {
        let alt_margin = adaptation_margin(farm, &p.rot, opts);
        alternatives.push(FactAlternative {
            label: p.label.clone(),
            rotation: format_rotation_label(&p.rot),
            bad_years: format!("{}/{}", p.base.fails, n_years),
            delta_net: round1(p.base.mean_net - base_sim.mean_net),
            margin: FactAltMargin {
                d_t: alt_margin.d_t,
            },
            soil_score: p.base.soil_score,
            fits_budget: p.fits_budget,
            missing_equipment: p.missing_equipment.clone(),
        });
    }

    let shocked = market_shock(
        farm,
        rotation,
        opts,
        &MarketShockParams {
            price_pct: -30.0,
            input_pct: 0.0,
        },
    );

    let q_cfg = QuantSimConfig {
        paths: 1000,
        from_year: 2026,
        to_year: 2050,
        ssp: "ssp245".to_string(),
        cash_reserve: 500.0,
        seed: 42,
    };
    let q_res = quant_simulate(farm, &[rotation.to_vec()], opts, &q_cfg, None);
    let q_first = q_res.first();
    let idx_2035 = (2035 - 2026) as usize;
    let p_bad_2035 = q_first
        .and_then(|q| q.p_bad_year.get(idx_2035).copied())
        .unwrap_or(base_sim.p_fail);

    let tol_denom = (1.0 / opts.fail_share.max(0.05)).round() as i32;

    FactSheet {
        farm: FactFarm {
            name: farm.meta.name.clone(),
            lat: round2(farm.meta.lat),
            lon: round2(farm.meta.lon),
            soil: farm.soil.texture_class.clone(),
            climate: format!(
                "{:.1} °C, {:.0} mm/yr",
                farm.mean_annual_temp_c(),
                farm.mean_annual_precip_mm()
            ),
        },
        rotation: format_rotation_label(rotation),
        rule: FactRule {
            bad_year: format!("net < {:.0} $/ha", opts.fail_net),
            tolerance: format!("1 year in {}", tol_denom.max(1)),
        },
        today: FactToday {
            bad_years: format!("{}/{}", base_sim.fails, n_years),
            mean_net: base_sim.mean_net,
            worst_year: base_sim.worst_year,
        },
        margin: FactMargin {
            d_t: margin.d_t,
            d_p: round2(margin.d_p * 100.0),
            status,
            safe_until: FactSafeUntil {
                ssp245: safe_245,
                ssp585: safe_585,
            },
        },
        worst_year_why: base_sim.worst_year_reasons.clone(),
        alternatives,
        soil: FactSoil {
            score: base_sim.soil_score,
            carbon_trend_pct_yr: base_sim.soc_change_pct,
            erosion_t_ha_yr: base_sim.erosion,
        },
        market: FactMarket {
            price_pct: -30,
            bad_years_under_shock: format!("{}/{}", shocked.fails, n_years),
        },
        quant: FactQuant {
            paths: 1000,
            horizon: "2026–2050".to_string(),
            p_bad_year2035: p_bad_2035,
            cvar95: q_first.map(|q| q.cvar95).unwrap_or(-250.0),
            p_ruin: q_first.map(|q| q.p_ruin).unwrap_or(0.10),
            margin_year_p50: q_first.and_then(|q| q.margin_year.p50),
        },
        sources: vec![
            "NASA POWER".to_string(),
            "SoilGrids".to_string(),
            "MODIS NDVI".to_string(),
            "NEX-GDDP-CMIP6".to_string(),
        ],
    }
}

/// Extracts all numbers appearing anywhere in a string (supporting negative and decimal numbers).
pub fn parse_numbers_from_str(s: &str) -> Vec<f64> {
    let mut nums = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        let is_neg = (b == b'-' || b == b'+')
            && i + 1 < bytes.len()
            && bytes[i + 1].is_ascii_digit()
            && (i == 0 || !bytes[i - 1].is_ascii_alphanumeric());

        if b.is_ascii_digit() || is_neg {
            let start = i;
            if is_neg {
                i += 1;
            }
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            if i + 1 < bytes.len() && bytes[i] == b'.' && bytes[i + 1].is_ascii_digit() {
                i += 1;
                while i < bytes.len() && bytes[i].is_ascii_digit() {
                    i += 1;
                }
            }
            if let Ok(val) = s[start..i].parse::<f64>() {
                if val.is_finite() {
                    nums.push(val);
                }
            }
        } else {
            i += 1;
        }
    }
    nums
}

/// Collects all legitimate numbers present in the `FactSheet` (including percentage equivalents of decimals).
pub fn allowed_numbers_from_fact_sheet(sheet: &FactSheet) -> Vec<f64> {
    let json_str = serde_json::to_string(sheet).unwrap_or_default();
    let mut raw = parse_numbers_from_str(&json_str);
    // Also permit absolute values and 100x percentage forms of 0..1 probabilities (e.g. 0.31 -> 31, 0.18 -> 18)
    let snapshot = raw.clone();
    for v in snapshot {
        raw.push(v.abs());
        raw.push(v.round());
        if v.abs() <= 1.0 {
            raw.push((v * 100.0).round());
            raw.push((v.abs() * 100.0).round());
        }
    }
    // Allow small structural step indices (1, 2, 3)
    raw.extend_from_slice(&[1.0, 2.0, 3.0]);
    raw
}

/// Verifies that every number present in `answer_text` exists in `sheet` (C10 verification rule).
/// Returns `(all_valid, used_numbers)`.
pub fn verify_numbers_in_text(sheet: &FactSheet, answer_text: &str) -> (bool, Vec<f64>) {
    let allowed = allowed_numbers_from_fact_sheet(sheet);
    let used = parse_numbers_from_str(answer_text);

    for &u in &used {
        let matched = allowed
            .iter()
            .any(|&a| (u - a).abs() <= 0.051 || (u.abs() - a.abs()).abs() <= 0.051);
        if !matched {
            return (false, used);
        }
    }
    (true, used)
}

/// Deterministic fallback explanation generator (`C10`) in Romanian (`"ro"`) or English (`"en"`),
/// supporting modes `"short"`, `"plan"`, and `"chat"`. Uses strictly numbers from `sheet`.
pub fn render_template_explanation(
    sheet: &FactSheet,
    lang: &str,
    mode: &str,
    question: Option<&str>,
) -> String {
    let is_ro = lang.trim().to_ascii_lowercase().starts_with("ro");
    let why_joined = if sheet.worst_year_why.is_empty() {
        "water stress".to_string()
    } else {
        sheet.worst_year_why.join(", ")
    };

    let alt_sentence = if let Some(alt) = sheet.alternatives.first() {
        if is_ro {
            format!(
                "Alternativa {} ({}) reduce anii proști la {}, modifică venitul mediu cu {:+.1} $/ha, oferă o marjă de {:+.1} °C și un scor de sol de {:.1}.",
                alt.label, alt.rotation, alt.bad_years, alt.delta_net, alt.margin.d_t, alt.soil_score
            )
        } else {
            format!(
                "The {} option ({}) cuts bad years to {}, shifts mean net income by {:+.1} $/ha, provides a {:+.1} °C margin, and reaches a {:.1} soil score.",
                alt.label, alt.rotation, alt.bad_years, alt.delta_net, alt.margin.d_t, alt.soil_score
            )
        }
    } else {
        String::new()
    };

    if mode.eq_ignore_ascii_case("plan") {
        if is_ro {
            format!(
                "Plan de adaptare pentru {} ({}, {}, climă {}):\n\
                1. Diagnostic actual: rotația {} înregistrează {} ani proști (prag {}, toleranță {}), cu un venit mediu de {:.1} $/ha și cel mai greu an în {} ({}). Marja termică este {:.1} °C ({:.1}% ploaie).\n\
                2. Sănătatea solului și risc: scorul solului este {:.1} (trend carbon {:+.2}%/an, eroziune {:.2} t/ha/an). Pe {} traiectorii ({}), riscul de an prost în 2035 este {:.2}, CVaR95 este {:.1} $/ha, iar probabilitatea de epuizare a rezervei este {:.2}.\n\
                3. Pași recomandați: {} La un șoc de preț de {}%, anii proști devin {}.\n\
                Acest document este un instrument de planificare (planning aid, not a guarantee).",
                sheet.farm.name,
                sheet.farm.lat,
                sheet.farm.lon,
                sheet.farm.climate,
                sheet.rotation,
                sheet.today.bad_years,
                sheet.rule.bad_year,
                sheet.rule.tolerance,
                sheet.today.mean_net,
                sheet.today.worst_year,
                why_joined,
                sheet.margin.d_t,
                sheet.margin.d_p,
                sheet.soil.score,
                sheet.soil.carbon_trend_pct_yr,
                sheet.soil.erosion_t_ha_yr,
                sheet.quant.paths,
                sheet.quant.horizon,
                sheet.quant.p_bad_year2035,
                sheet.quant.cvar95,
                sheet.quant.p_ruin,
                alt_sentence,
                sheet.market.price_pct,
                sheet.market.bad_years_under_shock
            )
        } else {
            format!(
                "Adaptation Plan for {} ({}, {}, climate {}):\n\
                1. Current baseline: rotation {} experiences {} bad years (rule {}, tolerance {}), with mean net income {:.1} $/ha and worst year in {} ({}). Warming margin is {:.1} °C ({:.1}% rain).\n\
                2. Soil health & future risk: soil score is {:.1} (carbon trend {:+.2}%/yr, erosion {:.2} t/ha/yr). Across {} paths ({}), P(bad year) in 2035 is {:.2}, CVaR95 is {:.1} $/ha, and ruin probability is {:.2}.\n\
                3. Recommended actions: {} Under a {}% price shock, bad years reach {}.\n\
                This output is a planning aid, not a guarantee.",
                sheet.farm.name,
                sheet.farm.lat,
                sheet.farm.lon,
                sheet.farm.climate,
                sheet.rotation,
                sheet.today.bad_years,
                sheet.rule.bad_year,
                sheet.rule.tolerance,
                sheet.today.mean_net,
                sheet.today.worst_year,
                why_joined,
                sheet.margin.d_t,
                sheet.margin.d_p,
                sheet.soil.score,
                sheet.soil.carbon_trend_pct_yr,
                sheet.soil.erosion_t_ha_yr,
                sheet.quant.paths,
                sheet.quant.horizon,
                sheet.quant.p_bad_year2035,
                sheet.quant.cvar95,
                sheet.quant.p_ruin,
                alt_sentence,
                sheet.market.price_pct,
                sheet.market.bad_years_under_shock
            )
        }
    } else {
        let q_prefix = match question {
            Some(q) if !q.trim().is_empty() => {
                if is_ro {
                    "Răspuns bazat pe fișa de fapte: "
                } else {
                    "Fact-sheet answer: "
                }
            }
            _ => "",
        };

        if is_ro {
            format!(
                "{}Pentru ferma {} ({}, {}), rotația {} are {} ani proști (venit mediu {:.1} $/ha, cel mai greu an {} din cauza: {}) și o marjă de adaptare de {:.1} °C ({:.1}% ploaie). Scorul solului este {:.1} ({:+.2}%/an carbon, {:.2} t/ha/an eroziune). {} Acest rezultat este un instrument de planificare (planning aid, not a guarantee).",
                q_prefix,
                sheet.farm.name,
                sheet.farm.lat,
                sheet.farm.lon,
                sheet.rotation,
                sheet.today.bad_years,
                sheet.today.mean_net,
                sheet.today.worst_year,
                why_joined,
                sheet.margin.d_t,
                sheet.margin.d_p,
                sheet.soil.score,
                sheet.soil.carbon_trend_pct_yr,
                sheet.soil.erosion_t_ha_yr,
                alt_sentence
            )
        } else {
            format!(
                "{}For {} ({}, {}), rotation {} has {} bad years (mean net {:.1} $/ha, worst year {} due to: {}) and an Adaptation Margin of {:.1} °C ({:.1}% rain). Soil health score is {:.1} ({:+.2}%/yr carbon trend, {:.2} t/ha/yr erosion). {} This result is a planning aid, not a guarantee.",
                q_prefix,
                sheet.farm.name,
                sheet.farm.lat,
                sheet.farm.lon,
                sheet.rotation,
                sheet.today.bad_years,
                sheet.today.mean_net,
                sheet.today.worst_year,
                why_joined,
                sheet.margin.d_t,
                sheet.margin.d_p,
                sheet.soil.score,
                sheet.soil.carbon_trend_pct_yr,
                sheet.soil.erosion_t_ha_yr,
                alt_sentence
            )
        }
    }
}
