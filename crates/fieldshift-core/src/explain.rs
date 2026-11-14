//! C10 fact sheet, number verification and the deterministic template explanation.
//! The LLM only ever sees the fact sheet; every number it writes must appear in it (`verify_numbers_in_text`).

use crate::optimize::PickResult;
use crate::quant::{quant_simulate, QuantConfig};
use crate::rotation::{simulate_resolved, simulate_rotation};
use crate::rules::evaluate_rules;
use crate::stress::{
    adaptation_margin_with, margin_year_with, market_shock, MarginYearValue, MarketShockParams,
};
use crate::{
    rotation_label, round1, round2, Constraints, PreparedFarm, ResolvedRotation, Result,
    RotationStep, SimOptions,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactFarm {
    pub name: String,
    pub lat: f64,
    pub lon: f64,
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
    pub mean_net: f64,
    pub worst_year: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactSafeUntil {
    pub ssp245: String,
    pub ssp585: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactMargin {
    #[serde(rename = "dT")]
    pub d_t: f64,
    /// Fraction (-0.2 = 20 % less rain).
    #[serde(rename = "dP")]
    pub d_p: f64,
    pub status: String,
    pub safe_until: FactSafeUntil,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactAltMargin {
    #[serde(rename = "dT")]
    pub d_t: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactAlternative {
    pub label: String,
    pub rotation: String,
    pub bad_years: String,
    pub delta_net: f64,
    pub margin: FactAltMargin,
    pub soil_score: f64,
    pub fits_budget: bool,
    pub missing_equipment: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactSoil {
    pub score: f64,
    pub carbon_trend_pct_yr: f64,
    pub erosion_t_ha_yr: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactMarket {
    pub price_pct: f64,
    pub bad_years_under_shock: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactQuant {
    pub paths: usize,
    pub horizon: String,
    #[serde(rename = "pBadYear2035")]
    pub p_bad_year_2035: f64,
    pub cvar95: f64,
    pub p_ruin: f64,
    pub margin_year_p50: Option<i32>,
}

/// C10 `FactSheet`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactSheet {
    pub farm: FactFarm,
    pub rotation: String,
    pub rule: FactRule,
    pub today: FactToday,
    pub margin: FactMargin,
    pub worst_year_why: Vec<String>,
    /// Same reasons as `worst_year_why`, structured (`drought` + `stressDays`, `heat_flowering` + `days`), for i18n.
    #[serde(default)]
    pub worst_year_why_codes: Vec<crate::ReasonCode>,
    pub alternatives: Vec<FactAlternative>,
    pub soil: FactSoil,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub market: Option<FactMarket>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quant: Option<FactQuant>,
    pub sources: Vec<String>,
}

fn year_text(y: MarginYearValue) -> String {
    match y {
        MarginYearValue::Now => "now".to_string(),
        MarginYearValue::Year(y) => y.to_string(),
        MarginYearValue::Never => "after 2090".to_string(),
    }
}

/// Builds the C10 fact sheet from deterministic simulation output (never from model text).
pub fn build_fact_sheet(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
    picks: &[PickResult],
    constraints: Option<&Constraints>,
) -> Result<FactSheet> {
    let rot = ResolvedRotation::new(rotation)?;
    let sim = |o: &SimOptions| simulate_resolved(farm, &rot, o, None);
    let base = sim(opts);
    let margin = adaptation_margin_with(opts, &sim);
    let n_years = base.years.len().max(1);

    // why was the worst year bad? read the traced seasons of that year
    let traced = simulate_rotation(farm, rotation, opts, Some(base.worst_year))?
        .traced
        .unwrap_or_default();
    let mut why = Vec::new();
    let mut why_codes = Vec::new();
    for s in &traced {
        if s.factors.water < 0.75 {
            why.push(format!(
                "{}: drought ({} stress days)",
                s.crop, s.stress_days
            ));
            why_codes.push(crate::ReasonCode::new(
                "drought",
                &[
                    ("crop", s.crop.to_string().into()),
                    ("stressDays", s.stress_days.into()),
                ],
            ));
        }
        if s.heat_days > 0 {
            why.push(format!(
                "{}: {} days of flowering heat",
                s.crop, s.heat_days
            ));
            why_codes.push(crate::ReasonCode::new(
                "heat_flowering",
                &[
                    ("crop", s.crop.to_string().into()),
                    ("days", s.heat_days.into()),
                ],
            ));
        }
    }
    why.truncate(3);
    why_codes.truncate(3);

    let safe = |ssp: &str| year_text(margin_year_with(opts, &farm.scenario_series(ssp), &sim).year);
    let status = if margin.already {
        "already_over"
    } else if margin.d_t < 1.0 {
        "tight"
    } else {
        "safe"
    };

    let default_c = Constraints::default();
    let c = constraints.unwrap_or(&default_c);
    let alternatives = picks
        .iter()
        .filter_map(|p| {
            let r = ResolvedRotation::new(&p.rot).ok()?;
            let m = adaptation_margin_with(opts, &|o| simulate_resolved(farm, &r, o, None));
            let ev = evaluate_rules(farm, &r, opts, c);
            Some(FactAlternative {
                label: p.label.clone(),
                rotation: rotation_label(&p.rot),
                bad_years: format!("{}/{}", p.base.fails, n_years),
                delta_net: round1(p.base.mean_net - base.mean_net),
                margin: FactAltMargin { d_t: m.d_t },
                soil_score: p.base.soil_score,
                fits_budget: ev.fits_budget,
                missing_equipment: ev.missing_equipment,
            })
        })
        .collect();

    let shocked = market_shock(
        farm,
        rotation,
        opts,
        &MarketShockParams {
            price_pct: -30.0,
            input_pct: 0.0,
        },
    )?;
    let cfg = QuantConfig {
        paths: 500,
        ..Default::default()
    };
    let q = quant_simulate(farm, &[rotation.to_vec()], opts, &cfg, None)?;
    let quant = q.first().map(|q| FactQuant {
        paths: cfg.paths,
        horizon: format!("{}-{}", cfg.from_year, cfg.to_year),
        p_bad_year_2035: q
            .years
            .iter()
            .position(|&y| y == 2035)
            .and_then(|i| q.p_bad_year.get(i).copied())
            .unwrap_or(base.p_fail),
        cvar95: q.cvar95,
        p_ruin: q.p_ruin,
        margin_year_p50: q.margin_year.p50,
    });

    Ok(FactSheet {
        farm: FactFarm {
            name: farm.meta.name.clone(),
            lat: farm.meta.lat,
            lon: farm.meta.lon,
            soil: farm.soil.texture_class.clone(),
            climate: format!(
                "{:.1} °C, {:.0} mm/yr",
                farm.mean_annual_temp_c(),
                farm.mean_annual_precip_mm()
            ),
        },
        rotation: rotation_label(rotation),
        rule: FactRule {
            bad_year: format!("net < {:.0} $/ha", opts.fail_net),
            tolerance: format!(
                "1 year in {}",
                (1.0 / opts.fail_share.max(0.05)).round() as i32
            ),
        },
        today: FactToday {
            bad_years: format!("{}/{}", base.fails, n_years),
            mean_net: base.mean_net,
            worst_year: base.worst_year,
        },
        margin: FactMargin {
            d_t: margin.d_t,
            d_p: margin.d_p,
            status: status.to_string(),
            safe_until: FactSafeUntil {
                ssp245: safe("ssp245"),
                ssp585: safe("ssp585"),
            },
        },
        worst_year_why: why,
        worst_year_why_codes: why_codes,
        alternatives,
        soil: FactSoil {
            score: base.soil_score,
            carbon_trend_pct_yr: base.soc_change_pct,
            erosion_t_ha_yr: base.erosion,
        },
        market: Some(FactMarket {
            price_pct: -30.0,
            bad_years_under_shock: format!("{}/{}", shocked.fails, n_years),
        }),
        quant,
        sources: ["NASA POWER", "SoilGrids", "MODIS NDVI", "NEX-GDDP-CMIP6"]
            .map(String::from)
            .to_vec(),
    })
}

/// Extracts every number in a string (negative and decimal included).
pub fn parse_numbers_from_str(s: &str) -> Vec<f64> {
    let b = s.as_bytes();
    let (mut nums, mut i) = (Vec::new(), 0);
    while i < b.len() {
        let neg = (b[i] == b'-' || b[i] == b'+')
            && i + 1 < b.len()
            && b[i + 1].is_ascii_digit()
            && (i == 0 || !b[i - 1].is_ascii_alphanumeric());
        if b[i].is_ascii_digit() || neg {
            let start = i;
            if neg {
                i += 1;
            }
            while i < b.len() && b[i].is_ascii_digit() {
                i += 1;
            }
            if i + 1 < b.len() && b[i] == b'.' && b[i + 1].is_ascii_digit() {
                i += 1;
                while i < b.len() && b[i].is_ascii_digit() {
                    i += 1;
                }
            }
            if let Ok(v) = s[start..i].parse::<f64>() {
                nums.push(v);
            }
        } else {
            i += 1;
        }
    }
    nums
}

/// Numbers the fact sheet allows (plus abs / rounded / percent forms of fractions).
pub fn allowed_numbers(sheet: &FactSheet) -> Vec<f64> {
    let json = serde_json::to_string(sheet).unwrap_or_default();
    let mut raw = parse_numbers_from_str(&json);
    for v in raw.clone() {
        raw.push(v.abs());
        raw.push(v.round());
        if v.abs() <= 1.0 {
            raw.push((v * 100.0).round());
            raw.push(round1(v * 100.0));
            raw.push((v.abs() * 100.0).round());
        }
    }
    raw.extend([1.0, 2.0, 3.0]);
    raw
}

/// C10 rule: every number in `text` must exist in the fact sheet. Returns `(ok, used numbers)`.
pub fn verify_numbers_in_text(sheet: &FactSheet, text: &str) -> (bool, Vec<f64>) {
    let allowed = allowed_numbers(sheet);
    let used = parse_numbers_from_str(text);
    let ok = used
        .iter()
        .all(|&u| allowed.iter().any(|&a| (u.abs() - a.abs()).abs() <= 0.051));
    (ok, used)
}

/// Crop vocabulary (EN + RO, diacritics folded, lower case): canonical id -> spellings a model might use.
const CROP_TERMS: &[(&str, &[&str])] = &[
    (
        "maize",
        &["maize", "corn", "porumb", "porumbul", "porumbului"],
    ),
    ("soybean", &["soybean", "soybeans", "soy", "soia", "soiei"]),
    ("wheat", &["wheat", "grau", "graul", "graului"]),
    ("barley", &["barley", "orz", "orzul", "orzului"]),
    ("sorghum", &["sorghum", "sorg", "sorgul", "sorgului"]),
    (
        "sunflower",
        &[
            "sunflower",
            "sunflowers",
            "floarea soarelui",
            "floarea-soarelui",
        ],
    ),
    ("pea", &["pea", "peas", "mazare", "mazarea", "mazarii"]),
    ("millet", &["millet", "mei", "meiul", "meiului"]),
    ("rye", &["rye", "secara", "secarei"]),
    ("rapeseed", &["rapeseed", "canola", "rapita", "rapitei"]),
    (
        "potato",
        &["potato", "potatoes", "cartof", "cartofi", "cartofii"],
    ),
    (
        "sugar_beet",
        &["sugar beet", "sugar beets", "sfecla", "sfecla de zahar"],
    ),
    ("oats", &["oat", "oats", "ovaz", "ovazul"]),
    ("alfalfa", &["alfalfa", "lucerna", "lucerne"]),
    ("cotton", &["cotton", "bumbac"]),
    ("rice", &["rice", "orez", "orezul"]),
];

fn fold_ascii(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'ă' | 'â' | 'Ă' | 'Â' => 'a',
            'î' | 'Î' => 'i',
            'ș' | 'ş' | 'Ș' | 'Ş' => 's',
            'ț' | 'ţ' | 'Ț' | 'Ţ' => 't',
            c => c.to_ascii_lowercase(),
        })
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect()
}

/// Canonical ids of crops named in `text` (EN/RO spellings, word-boundary match).
pub fn crops_mentioned(text: &str) -> Vec<&'static str> {
    let words: Vec<String> = fold_ascii(text)
        .split_whitespace()
        .map(str::to_string)
        .collect();
    let hay = format!(" {} ", words.join(" "));
    CROP_TERMS
        .iter()
        .filter(|(_, terms)| {
            terms.iter().any(|t| {
                let t = fold_ascii(t);
                let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
                hay.contains(&format!(" {t} "))
            })
        })
        .map(|(id, _)| *id)
        .collect()
}

/// Crops named in `text` that the fact sheet never mentions (rotation, alternatives, why-text). Empty = ok.
pub fn unverified_crops(sheet: &FactSheet, text: &str) -> Vec<&'static str> {
    let allowed = crops_mentioned(&serde_json::to_string(sheet).unwrap_or_default());
    crops_mentioned(text)
        .into_iter()
        .filter(|c| !allowed.contains(c))
        .collect()
}

/// Deterministic fallback explanation (`"ro"` / `"en"`; modes `short`, `plan`, `chat`).
pub fn render_template_explanation(
    sheet: &FactSheet,
    lang: &str,
    mode: &str,
    question: Option<&str>,
) -> String {
    let ro = lang.trim().to_ascii_lowercase().starts_with("ro");
    let why = if sheet.worst_year_why.is_empty() {
        "water stress".to_string()
    } else {
        sheet.worst_year_why.join(", ")
    };
    let alt = sheet.alternatives.first().map_or(String::new(), |a| {
        if ro {
            format!(
                "Alternativa {} ({}) are {} ani proști, schimbă venitul mediu cu {:+.1} $/ha, marjă {:+.1} °C, scor sol {:.1}.",
                a.label, a.rotation, a.bad_years, a.delta_net, a.margin.d_t, a.soil_score
            )
        } else {
            format!(
                "The {} option ({}) has {} bad years, shifts mean net by {:+.1} $/ha, margin {:+.1} °C, soil score {:.1}.",
                a.label, a.rotation, a.bad_years, a.delta_net, a.margin.d_t, a.soil_score
            )
        }
    });
    let rain = round2(sheet.margin.d_p * 100.0);
    let extra = match (&sheet.quant, &sheet.market) {
        (Some(q), Some(m)) => {
            if ro {
                format!(
                    "Pe {} traiectorii ({}): P(an prost 2035) {:.2}, CVaR95 {:.1} $/ha, risc de epuizare {:.2}. La preț {}%: {} ani proști.",
                    q.paths, q.horizon, q.p_bad_year_2035, q.cvar95, q.p_ruin, m.price_pct, m.bad_years_under_shock
                )
            } else {
                format!(
                    "Across {} paths ({}): P(bad year 2035) {:.2}, CVaR95 {:.1} $/ha, ruin probability {:.2}. At a {}% price shock: {} bad years.",
                    q.paths, q.horizon, q.p_bad_year_2035, q.cvar95, q.p_ruin, m.price_pct, m.bad_years_under_shock
                )
            }
        }
        _ => String::new(),
    };
    let prefix = match question {
        Some(q) if !q.trim().is_empty() => {
            if ro {
                "Răspuns bazat pe fișa de fapte: "
            } else {
                "Fact-sheet answer: "
            }
        }
        _ => "",
    };
    let long = mode.eq_ignore_ascii_case("plan");
    if ro {
        format!(
            "{prefix}Pentru {} ({:.2}, {:.2}), rotația {} are {} ani proști (venit mediu {:.1} $/ha, cel mai greu an {} din cauza: {}), marjă {:.1} °C ({:.1}% ploaie). Sol: scor {:.1} ({:+.2}%/an carbon, {:.2} t/ha/an eroziune). {} {} Acesta este un instrument de planificare (planning aid, not a guarantee).",
            sheet.farm.name, sheet.farm.lat, sheet.farm.lon, sheet.rotation, sheet.today.bad_years,
            sheet.today.mean_net, sheet.today.worst_year, why, sheet.margin.d_t, rain,
            sheet.soil.score, sheet.soil.carbon_trend_pct_yr, sheet.soil.erosion_t_ha_yr, alt,
            if long { &extra } else { "" }
        )
    } else {
        format!(
            "{prefix}For {} ({:.2}, {:.2}), rotation {} has {} bad years (mean net {:.1} $/ha, worst year {} due to: {}) and an adaptation margin of {:.1} °C ({:.1}% rain). Soil: score {:.1} ({:+.2}%/yr carbon, {:.2} t/ha/yr erosion). {} {} This is a planning aid, not a guarantee.",
            sheet.farm.name, sheet.farm.lat, sheet.farm.lon, sheet.rotation, sheet.today.bad_years,
            sheet.today.mean_net, sheet.today.worst_year, why, sheet.margin.d_t, rain,
            sheet.soil.score, sheet.soil.carbon_trend_pct_yr, sheet.soil.erosion_t_ha_yr, alt,
            if long { &extra } else { "" }
        )
    }
}

#[cfg(test)]
mod crop_tests {
    use super::*;

    #[test]
    fn finds_crops_in_both_languages() {
        assert_eq!(
            crops_mentioned("Plantează porumb și soia."),
            vec!["maize", "soybean"]
        );
        assert_eq!(
            crops_mentioned("Winter wheat then sugar-beet"),
            vec!["wheat", "sugar_beet"]
        );
        assert!(crops_mentioned("peak heat, cornerstone").is_empty());
    }
}
