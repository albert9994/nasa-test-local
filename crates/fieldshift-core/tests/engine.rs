//! End-to-end tests on the real mock packs (NASA POWER daily weather, SoilGrids soil).

use fieldshift_core::explain::{
    build_fact_sheet, render_template_explanation, verify_numbers_in_text,
};
use fieldshift_core::optimize::{optimize, pick_three};
use fieldshift_core::quant::{quant_simulate, QuantConfig};
use fieldshift_core::rotation::simulate_rotation;
use fieldshift_core::score::compute_score;
use fieldshift_core::season::simulate_season;
use fieldshift_core::stress::{
    adaptation_margin, frontier, margin_year, market_shock, MarketShockParams,
};
use fieldshift_core::*;
use serde_json::Value;
use std::collections::BTreeSet;

fn load(id: &str) -> PreparedFarm {
    let p = format!(
        "{}/../../apps/web/public/data/mock/farms/{id}.json",
        env!("CARGO_MANIFEST_DIR")
    );
    prepare_farm_json(&std::fs::read_to_string(p).expect("mock pack")).expect("prepare")
}

fn rot(spec: &[(&str, bool)]) -> Vec<RotationStep> {
    spec.iter().map(|&(c, v)| RotationStep::new(c, v)).collect()
}

fn keys(v: &Value) -> BTreeSet<String> {
    v.as_object().expect("object").keys().cloned().collect()
}

fn set(names: &[&str]) -> BTreeSet<String> {
    names.iter().map(|s| (*s).to_string()).collect()
}

#[test]
fn iowa_2012_is_among_the_four_worst_years() {
    let f = load("iowa");
    let r = simulate_rotation(
        &f,
        &rot(&[("maize", false), ("soybean", false)]),
        &SimOptions::default(),
        None,
    )
    .unwrap();
    let mut idx: Vec<usize> = (0..r.years.len()).collect();
    idx.sort_by(|&a, &b| r.farm_net[a].total_cmp(&r.farm_net[b]));
    let worst4: Vec<i32> = idx[..4].iter().map(|&i| r.years[i]).collect();
    assert!(worst4.contains(&2012), "{worst4:?}");
    assert_eq!(r.worst_year, 2012);
    let maize_mean: f64 = r.yield_by_crop["maize"].iter().sum::<f64>() / r.years.len() as f64;
    assert!((8.0..13.5).contains(&maize_mean), "maize {maize_mean}");
    assert_eq!(r.yield_by_crop["maize"].len(), r.years.len());
    assert!(r.traced.is_none());
}

#[test]
fn trace_year_returns_one_season_per_phase() {
    let f = load("iowa");
    let o = SimOptions::default();
    let r = simulate_rotation(
        &f,
        &rot(&[("maize", false), ("soybean", true)]),
        &o,
        Some(2012),
    )
    .unwrap();
    let t = r.traced.expect("traced");
    assert_eq!(t.len(), 2);
    assert!(t.iter().all(|s| s.trace.is_some() && s.year == 2012));
}

#[test]
fn margin_is_positive_and_capped_at_six() {
    let f = load("iowa");
    let m = adaptation_margin(
        &f,
        &rot(&[("maize", false), ("soybean", false)]),
        &SimOptions::default(),
    )
    .unwrap();
    assert!(!m.already);
    assert!(m.d_t > 0.0 && m.d_t <= 6.0, "{m:?}");
    assert!(m.d_p < 0.0 && m.d_p >= -0.7, "{m:?}");
}

#[test]
fn frontier_is_11x11_rain_by_temperature_and_monotone_ish() {
    let f = load("iowa");
    let o = SimOptions {
        fail_net: 200.0,
        ..Default::default()
    };
    let fr = frontier(&f, &rot(&[("maize", false), ("soybean", false)]), &o).unwrap();
    assert_eq!((fr.d_ts.len(), fr.d_ps.len(), fr.grid.len()), (11, 11, 11));
    assert!(fr.grid.iter().all(|r| r.len() == 11));
    assert_eq!(fr.d_ps[0], 0.0);
    assert!(fr.d_ps[10] < -0.49);
    // grid[dP][dT]: hotter and drier is never safer than the origin
    assert!(fr.grid[10][10] >= fr.grid[0][0]);
    assert!(fr.grid[0][10] >= fr.grid[0][0]);
    assert!(fr.grid[10][0] >= fr.grid[0][0]);
    // along each row warming does not reduce failures (allow one year of noise)
    for row in &fr.grid {
        for w in row.windows(2) {
            assert!(w[1] + 0.05 >= w[0], "{row:?}");
        }
    }
}

#[test]
fn quant_is_reproducible_and_shares_worlds() {
    let f = load("iowa");
    let a = rot(&[("maize", false), ("soybean", false)]);
    let b = rot(&[("wheat", false), ("sorghum", false)]);
    let cfg = QuantConfig {
        paths: 200,
        seed: 7,
        ..Default::default()
    };
    let o = SimOptions {
        fail_net: 200.0,
        ..Default::default()
    };
    let r1 = quant_simulate(&f, &[a.clone(), b.clone()], &o, &cfg, None).unwrap();
    let r2 = quant_simulate(&f, &[a.clone(), b.clone()], &o, &cfg, None).unwrap();
    assert_eq!(r1, r2);
    // the first rotation does not depend on which other rotations are requested
    let alone = quant_simulate(&f, &[a], &o, &cfg, None).unwrap();
    assert_eq!(alone[0], r1[0]);
    let other = quant_simulate(
        &f,
        &[b],
        &o,
        &QuantConfig {
            seed: 8,
            ..cfg.clone()
        },
        None,
    )
    .unwrap();
    assert_ne!(other[0].income.p50, r1[1].income.p50);
    let q = &r1[0];
    assert_eq!(q.years.len(), 25);
    assert!(q.income.p10[3] <= q.income.p50[3] && q.income.p50[3] <= q.income.p90[3]);
    assert!(q.cvar95 <= q.var95);
}

#[test]
fn json_shapes_match_the_ts_contract() {
    let f = load("iowa");
    let r = rot(&[("maize", false), ("soybean", false)]);
    let o = SimOptions {
        fail_net: 200.0,
        ..Default::default()
    };

    let s = serde_json::to_value(simulate_season(&f, "maize", 2012, &o, true).unwrap()).unwrap();
    assert_eq!(
        keys(&s),
        set(&[
            "crop",
            "year",
            "sow",
            "harvest",
            "yield",
            "net",
            "matured",
            "eta",
            "etp",
            "irr",
            "rain",
            "runoff",
            "drain",
            "stressDays",
            "heatDays",
            "factors",
            "trace"
        ])
    );
    assert_eq!(
        keys(&s["factors"]),
        set(&["water", "heat", "frost", "duration", "rotation"])
    );
    assert_eq!(
        keys(&s["trace"]),
        set(&["idx", "fill", "ks", "tmax", "stage", "heat"])
    );

    let rr = simulate_rotation(&f, &r, &o, Some(2012)).unwrap();
    let v = serde_json::to_value(&rr).unwrap();
    assert_eq!(
        keys(&v),
        set(&[
            "years",
            "farmNet",
            "meanNet",
            "minNet",
            "worstYear",
            "pFail",
            "fails",
            "yieldByCrop",
            "soilScore",
            "socChangePct",
            "erosion",
            "waterUse",
            "traced"
        ])
    );
    assert!(v["yieldByCrop"]["maize"].is_array());
    assert!(v["traced"].is_array());
    assert!(
        serde_json::to_value(simulate_rotation(&f, &r, &o, None).unwrap()).unwrap()["traced"]
            .is_null()
    );

    let m = serde_json::to_value(adaptation_margin(&f, &r, &o).unwrap()).unwrap();
    assert_eq!(
        keys(&m),
        set(&["already", "basePFail", "dT", "dTcapped", "dP", "dPcapped"])
    );
    let fr = serde_json::to_value(frontier(&f, &r, &o).unwrap()).unwrap();
    assert_eq!(keys(&fr), set(&["dTs", "dPs", "grid"]));
    let my = serde_json::to_value(margin_year(&f, &r, &o, &[]).unwrap()).unwrap();
    assert_eq!(keys(&my), set(&["year", "path"]));
    assert_eq!(keys(&my["path"][0]), set(&["year", "dT", "dP"]));
    let ms = serde_json::to_value(
        market_shock(
            &f,
            &r,
            &o,
            &MarketShockParams {
                price_pct: -30.0,
                input_pct: 20.0,
            },
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(keys(&ms), keys(&v));

    let q = serde_json::to_value(
        &quant_simulate(
            &f,
            std::slice::from_ref(&r),
            &o,
            &QuantConfig {
                paths: 50,
                ..Default::default()
            },
            None,
        )
        .unwrap()[0],
    )
    .unwrap();
    // C3 fields are all present (extra additive fields are allowed)
    let c3 = set(&[
        "rotation",
        "years",
        "income",
        "pBadYear",
        "var95",
        "cvar95",
        "pRuin",
        "maxDrawdownP50",
        "marginYear",
        "meanAnnual",
        "sdAnnual",
        "riskAdjusted",
    ]);
    assert!(c3.is_subset(&keys(&q)), "{:?}", keys(&q));
    assert_eq!(keys(&q["income"]), set(&["p10", "p50", "p90"]));
    assert_eq!(keys(&q["marginYear"]), set(&["p10", "p50", "p90"]));

    let sc = serde_json::to_value(
        compute_score(
            &f,
            &r,
            &o,
            &Weights::default(),
            &Constraints::default(),
            None,
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        keys(&sc),
        set(&[
            "rotation",
            "score",
            "confidence",
            "subscores",
            "weights",
            "base",
            "rules",
            "excludedBy",
            "llm",
            "waterfall"
        ])
    );
    assert_eq!(
        keys(&sc["subscores"]),
        set(&[
            "climate",
            "financialRisk",
            "profit",
            "soil",
            "water",
            "feasibility"
        ])
    );
    assert!(sc["llm"].is_null());
    assert_eq!(sc["waterfall"].as_array().unwrap().len(), 4);
    assert_eq!(sc["waterfall"][0][0], "base");
}

#[test]
fn optimizer_ranks_and_picks_three_distinct_rotations() {
    let f = load("baragan");
    let base = rot(&[("maize", false), ("wheat", false)]);
    let o = SimOptions {
        fail_net: 200.0,
        ..Default::default()
    };
    let pool: Vec<String> = ["maize", "wheat", "sunflower", "soybean", "barley", "pea"]
        .map(String::from)
        .to_vec();
    let ranked = optimize(
        &f,
        &pool,
        &o,
        &Weights::default(),
        &base,
        &Constraints::default(),
    )
    .unwrap();
    assert!(ranked.len() > 50);
    assert!(
        ranked.iter().any(|r| r.rot.len() == 1),
        "single-crop candidates"
    );
    assert!(ranked.iter().any(|r| r.rot == base), "baseline included");
    let v = serde_json::to_value(&ranked[0]).unwrap();
    assert_eq!(
        keys(&v),
        set(&["rot", "base", "stress", "score", "parts", "viable"])
    );
    for k in ["profit", "stability", "soil", "water"] {
        assert!(v["parts"][k].is_number(), "{k}");
    }
    let picks = pick_three(&ranked, &base);
    assert_eq!(picks.len(), 3);
    let labels: Vec<&str> = picks.iter().map(|p| p.label.as_str()).collect();
    assert_eq!(labels, ["Best balance", "Drought shield", "Soil builder"]);
    let distinct: BTreeSet<String> = picks.iter().map(|p| rotation_label(&p.rot)).collect();
    assert_eq!(distinct.len(), 3);
    assert!(picks
        .iter()
        .all(|p| rotation_label(&p.rot) != rotation_label(&base)));
}

#[test]
fn sellable_and_equipment_constraints_exclude_via_rules() {
    let f = load("baragan");
    let c = Constraints {
        equipment: vec!["grain_drill".into()],
        sellable: vec!["wheat".into(), "barley".into()],
        ..Default::default()
    };
    let s = compute_score(
        &f,
        &rot(&[("maize", false), ("wheat", false)]),
        &SimOptions::default(),
        &Weights::default(),
        &c,
        None,
    )
    .unwrap();
    assert!(s.excluded_by.is_some());
    assert!(
        s.score <= 100
            && s.rules
                .iter()
                .any(|r| r.id.starts_with("10_") || r.id.starts_with("09_"))
    );
}

#[test]
fn fact_sheet_numbers_verify_and_have_ts_shape() {
    let f = load("baragan");
    let base = rot(&[("maize", false), ("wheat", false)]);
    let o = SimOptions {
        fail_net: 200.0,
        ..Default::default()
    };
    let ranked = optimize(
        &f,
        &[],
        &o,
        &Weights::default(),
        &base,
        &Constraints::default(),
    )
    .unwrap();
    let picks = pick_three(&ranked, &base);
    let sheet = build_fact_sheet(&f, &base, &o, &picks, None).unwrap();
    let v = serde_json::to_value(&sheet).unwrap();
    assert_eq!(
        keys(&v),
        set(&[
            "farm",
            "rotation",
            "rule",
            "today",
            "margin",
            "worstYearWhy",
            "alternatives",
            "soil",
            "market",
            "quant",
            "sources"
        ])
    );
    assert!(
        v["margin"]["dP"].as_f64().unwrap() <= 0.0 && v["margin"]["dP"].as_f64().unwrap() >= -0.7
    );
    assert!(v["margin"]["safeUntil"]["ssp245"].is_string());
    assert!(v["quant"]["pBadYear2035"].is_number());
    for lang in ["ro", "en"] {
        for mode in ["short", "plan", "chat"] {
            let t = render_template_explanation(&sheet, lang, mode, Some("why?"));
            let (ok, used) = verify_numbers_in_text(&sheet, &t);
            assert!(ok, "{lang}/{mode}: {used:?}\n{t}");
        }
    }
    assert!(!verify_numbers_in_text(&sheet, "yield was 98765.43 t/ha").0);
}

#[test]
fn bad_input_is_an_error_never_a_silent_default() {
    let f = load("iowa");
    let o = SimOptions::default();
    assert!(matches!(
        simulate_season(&f, "quinoa", 2012, &o, false),
        Err(EngineError::UnknownCrop(_))
    ));
    assert!(matches!(
        simulate_season(&f, "maize", 1800, &o, false),
        Err(EngineError::UnknownYear(1800))
    ));
    assert!(matches!(
        simulate_rotation(&f, &[], &o, None),
        Err(EngineError::EmptyRotation)
    ));
    assert!(matches!(
        prepare_farm(FarmPack::default()),
        Err(EngineError::NoWeather)
    ));
}

#[test]
fn farm_costs_and_prices_flow_through_options() {
    let f = load("baragan");
    let r = rot(&[("maize", false), ("wheat", false)]);
    let o = SimOptions::default();
    let base = simulate_rotation(&f, &r, &o, None).unwrap();
    let shock = market_shock(
        &f,
        &r,
        &o,
        &MarketShockParams {
            price_pct: -30.0,
            input_pct: 40.0,
        },
    )
    .unwrap();
    assert!(shock.mean_net < base.mean_net);
    assert!(shock.p_fail >= base.p_fail);
}

// ---- B4: Penman-Monteith, monthly CMIP6 shifts, CO2, southern hemisphere, validation ----

fn with_scenarios(id: &str, scenarios: Value) -> PreparedFarm {
    let p = format!(
        "{}/../../apps/web/public/data/mock/farms/{id}.json",
        env!("CARGO_MANIFEST_DIR")
    );
    let mut v: Value = serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap();
    v["scenarios"] = scenarios;
    prepare_farm_json(&v.to_string()).unwrap()
}

fn mean_yield(r: &fieldshift_core::rotation::RotationResult, crop: &str) -> f64 {
    r.yield_by_crop[crop].iter().sum::<f64>() / r.years.len() as f64
}

#[test]
fn iowa_and_baragan_stay_in_the_observed_yield_ranges() {
    let f = load("iowa");
    let r = simulate_rotation(
        &f,
        &rot(&[("maize", false), ("soybean", false)]),
        &SimOptions::default(),
        None,
    )
    .unwrap();
    let (m, s) = (mean_yield(&r, "maize"), mean_yield(&r, "soybean"));
    assert!((9.0..12.0).contains(&m), "maize {m}");
    assert!((3.0..3.8).contains(&s), "soybean {s}");
    let mut idx: Vec<usize> = (0..r.years.len()).collect();
    idx.sort_by(|&a, &b| r.farm_net[a].total_cmp(&r.farm_net[b]));
    assert!(
        idx[..3].iter().any(|&i| r.years[i] == 2012),
        "2012 in the 3 worst"
    );

    let b = load("baragan");
    let r = simulate_rotation(
        &b,
        &rot(&[("maize", false), ("wheat", false)]),
        &SimOptions::default(),
        None,
    )
    .unwrap();
    let w = mean_yield(&r, "wheat");
    assert!((4.0..6.0).contains(&w), "wheat {w}");
}

#[test]
fn co2_helps_wheat_and_leaves_maize_almost_unchanged_when_water_is_not_short() {
    let f = load("iowa");
    let base = SimOptions::default();
    let hi = SimOptions {
        co2_ppm: Some(550.0),
        ..Default::default()
    };
    let w0 = simulate_rotation(&f, &rot(&[("wheat", false)]), &base, None).unwrap();
    let w1 = simulate_rotation(&f, &rot(&[("wheat", false)]), &hi, None).unwrap();
    let gain = mean_yield(&w1, "wheat") / mean_yield(&w0, "wheat");
    assert!((1.10..1.20).contains(&gain), "wheat gain {gain}");
    let m0 = simulate_rotation(&f, &rot(&[("maize", false)]), &base, None).unwrap();
    let m1 = simulate_rotation(&f, &rot(&[("maize", false)]), &hi, None).unwrap();
    let mg = mean_yield(&m1, "maize") / mean_yield(&m0, "maize");
    assert!((1.0..1.06).contains(&mg), "maize gain {mg}");
}

#[test]
fn monthly_shift_shapes_the_season_and_a_flat_shape_equals_the_uniform_slider() {
    use fieldshift_core::climate::MonthlyShift;
    let f = load("iowa");
    let r = rot(&[("maize", false), ("soybean", false)]);
    let uniform = SimOptions {
        d_t: 2.0,
        d_p: -0.1,
        ..Default::default()
    };
    let flat = SimOptions {
        monthly: Some(MonthlyShift::uniform(2.0, -0.1)),
        ..Default::default()
    };
    let a = simulate_rotation(&f, &r, &uniform, None).unwrap();
    let b = simulate_rotation(&f, &r, &flat, None).unwrap();
    assert_eq!(a.farm_net, b.farm_net);
    // the same annual +2 C landing in July-August hurts maize flowering far more than in winter
    let mut summer = [0.0; 12];
    summer[6] = 8.0;
    summer[7] = 8.0;
    let mut winter = [0.0; 12];
    winter[0] = 8.0;
    winter[1] = 8.0;
    let hot = |t: [f64; 12]| SimOptions {
        monthly: Some(MonthlyShift {
            d_t: t,
            d_p: [0.0; 12],
        }),
        ..Default::default()
    };
    let s = simulate_rotation(&f, &r, &hot(summer), None).unwrap();
    let w = simulate_rotation(&f, &r, &hot(winter), None).unwrap();
    assert!(
        s.mean_net + 50.0 < w.mean_net,
        "{} vs {}",
        s.mean_net,
        w.mean_net
    );
}

#[test]
fn quant_follows_per_model_trajectories_and_monthly_shapes_from_the_pack() {
    let sc = serde_json::json!({
        "ssp245": {
            "2050": {"dT": 2.0, "dT_p10": 1.4, "dT_p90": 2.8, "dP": -0.04, "dP_p10": -0.15, "dP_p90": 0.06},
            "series": [{"year": 2030, "dT": 1.0, "dP": -0.01}, {"year": 2050, "dT": 2.0, "dP": -0.04}, {"year": 2090, "dT": 3.0, "dP": -0.06}],
            "monthly": {"dT": [1.5,1.5,1.8,2.0,2.2,2.6,3.0,3.0,2.6,2.0,1.8,1.5], "dP": [0.05,0.05,0.0,-0.02,-0.05,-0.1,-0.15,-0.15,-0.08,0.0,0.03,0.05]},
            "perModel": {
                "COOL": {"dT": 1.4, "dP": 0.03},
                "HOT": {"dT": 3.0, "dP": -0.12}
            }
        }
    });
    let f = with_scenarios("iowa", sc);
    assert_eq!(f.scenario_models("ssp245").len(), 2);
    assert!(f.scenario_monthly("ssp245").is_some());
    let cfg = QuantConfig {
        paths: 300,
        ..Default::default()
    };
    let q = quant_simulate(
        &f,
        &[rot(&[("maize", false), ("soybean", false)])],
        &SimOptions::default(),
        &cfg,
        None,
    )
    .unwrap();
    // two models: the mean warming at the end of the horizon is between theirs
    let end = q[0].mean_dt_end;
    assert!(end > 1.2 && end < 3.2, "{end}");
    assert!(
        q[0].mean_co2_end > 480.0 && q[0].mean_co2_end < 500.0,
        "{}",
        q[0].mean_co2_end
    );
    // margin year honours the monthly shape without breaking the contract
    let o = SimOptions {
        ssp: Some("ssp245".into()),
        ..Default::default()
    };
    let my = margin_year(
        &f,
        &rot(&[("maize", false), ("soybean", false)]),
        &o,
        &f.scenario_series("ssp245"),
    )
    .unwrap();
    let v = serde_json::to_value(&my).unwrap();
    assert!(v["year"].is_number() || v["year"].is_null() || v["year"] == "now");
}

#[test]
fn southern_hemisphere_seasons_cross_new_year() {
    // Mirror Iowa: shift the calendar by half a year and put the farm in the southern hemisphere.
    let p = format!(
        "{}/../../apps/web/public/data/mock/farms/iowa.json",
        env!("CARGO_MANIFEST_DIR")
    );
    let mut v: Value = serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap();
    v["meta"]["lat"] = serde_json::json!(-34.0);
    // southern year Y = Iowa Jul-Dec of Y followed by Iowa Jan-Jun of Y+1 (so day 283 = early April of Iowa = spring)
    let src = v["weather"].as_object().unwrap().clone();
    let mut out = serde_json::Map::new();
    for y in 2001..2025 {
        let (a, b) = (&src[&y.to_string()], &src[&(y + 1).to_string()]);
        let mut year = serde_json::Map::new();
        for k in ["tmax", "tmin", "prcp", "gwet", "rad", "rh", "wind"] {
            let (x, z) = (a[k].as_array().unwrap(), b[k].as_array().unwrap());
            let joined: Vec<Value> = x[182..365].iter().chain(z[..182].iter()).cloned().collect();
            year.insert(k.to_string(), Value::Array(joined));
        }
        out.insert(y.to_string(), Value::Object(year));
    }
    v["weather"] = Value::Object(out);
    let f = prepare_farm_json(&v.to_string()).unwrap();
    // the last year has no continuation and is dropped rather than simulated truncated
    assert_eq!(f.years.len(), 23);
    let s = simulate_season(&f, "maize", 2010, &SimOptions::default(), true).unwrap();
    assert!(s.sow > 250, "southern spring sowing, got day {}", s.sow);
    assert!(
        s.harvest > 365,
        "harvest runs into the next calendar year: {}",
        s.harvest
    );
    assert!(s.matured, "{s:?}");
    assert!(s.yield_t_ha > 3.0, "{}", s.yield_t_ha);
    let w = simulate_season(&f, "wheat", 2010, &SimOptions::default(), false).unwrap();
    assert!(w.sow > 200 && w.yield_t_ha > 2.0, "{w:?}");
}

#[test]
fn validate_reports_r_rmse_and_bias_and_never_touches_calibration() {
    use fieldshift_core::validate::{validate, ObservedYields};
    let f = load("iowa");
    let sim =
        simulate_rotation(&f, &rot(&[("maize", false)]), &SimOptions::default(), None).unwrap();
    // "observed" = simulated + 1 t/ha
    let years: serde_json::Map<String, Value> = sim
        .years
        .iter()
        .zip(&sim.yield_by_crop["maize"])
        .map(|(y, v)| (y.to_string(), serde_json::json!(v + 1.0)))
        .collect();
    let obs: ObservedYields = serde_json::from_value(
        serde_json::json!({ "crops": { "maize": { "years": years }, "tomato": {"years": {}} } }),
    )
    .unwrap();
    let rep = validate(&f, &obs, &SimOptions::default()).unwrap();
    assert_eq!(rep.len(), 1);
    let m = &rep["maize"];
    assert_eq!(m.n, 25);
    assert!(m.r > 0.99, "{}", m.r);
    assert!(
        (m.bias + 1.0).abs() < 0.02 && (m.rmse - 1.0).abs() < 0.02,
        "{m:?}"
    );
    assert!(f.meta.calib.is_empty());
}
