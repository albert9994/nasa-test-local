use crate::crops::{get_crop, normalize_crop_id};
use crate::rotation::{simulate_rotation, RotationResult};
use crate::season::{round1, round2};
use crate::{PreparedFarm, RotationStep, SimOptions};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarginResult {
    pub already: bool,
    pub base_p_fail: f32,
    #[serde(rename = "dT")]
    pub d_t: f32,
    #[serde(rename = "dTcapped")]
    pub d_t_capped: bool,
    #[serde(rename = "dP")]
    pub d_p: f32,
    #[serde(rename = "dPcapped")]
    pub d_p_capped: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontierResult {
    #[serde(rename = "dTs")]
    pub d_ts: Vec<f32>,
    #[serde(rename = "dPs")]
    pub d_ps: Vec<f32>,
    pub grid: Vec<Vec<f32>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioPoint {
    pub year: i32,
    #[serde(rename = "dT")]
    pub d_t: f32,
    #[serde(rename = "dP")]
    pub d_p: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarginYearPathPoint {
    pub year: i32,
    pub p_fail: f32,
    pub mean_net: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarginYearResult {
    /// Either a year integer (e.g. 2043), `"now"`, or `null` (safe past horizon)
    pub year: serde_json::Value,
    pub path: Vec<MarginYearPathPoint>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketShockParams {
    #[serde(default)]
    pub price_pct: f32,
    #[serde(default)]
    pub input_pct: f32,
}

/// Computes the Adaptation Margin (+°C warming and -% rainfall before `p_fail > opts.fail_share`)
/// via 8-step bisection on ΔT in [0, 6] °C and ΔP in [0, -0.70].
pub fn adaptation_margin(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
) -> MarginResult {
    let mut base_opts = opts.clone();
    base_opts.d_t = 0.0;
    base_opts.d_p = 0.0;

    let base_res = simulate_rotation(farm, rotation, &base_opts, None);
    let tol = opts.fail_share.clamp(0.01, 0.95);

    if base_res.p_fail > tol {
        return MarginResult {
            already: true,
            base_p_fail: base_res.p_fail,
            d_t: 0.0,
            d_t_capped: false,
            d_p: 0.0,
            d_p_capped: false,
        };
    }

    // Bisection on ΔT in [0.0, 6.0] °C with ΔP = 0
    let mut lo_t = 0.0_f32;
    let mut hi_t = 6.0_f32;
    let mut max_t_opts = base_opts.clone();
    max_t_opts.d_t = hi_t;
    let max_t_res = simulate_rotation(farm, rotation, &max_t_opts, None);
    let d_t_capped = max_t_res.p_fail <= tol;

    let d_t = if d_t_capped {
        6.0
    } else {
        for _ in 0..8 {
            let mid = 0.5 * (lo_t + hi_t);
            let mut test_opts = base_opts.clone();
            test_opts.d_t = mid;
            let r = simulate_rotation(farm, rotation, &test_opts, None);
            if r.p_fail <= tol {
                lo_t = mid;
            } else {
                hi_t = mid;
            }
        }
        round2(lo_t)
    };

    // Bisection on rain reduction fraction in [0.0, 0.70] (stored as negative dP)
    let mut lo_p = 0.0_f32;
    let mut hi_p = 0.70_f32;
    let mut max_p_opts = base_opts.clone();
    max_p_opts.d_p = -hi_p;
    let max_p_res = simulate_rotation(farm, rotation, &max_p_opts, None);
    let d_p_capped = max_p_res.p_fail <= tol;

    let d_p = if d_p_capped {
        -0.70
    } else {
        for _ in 0..8 {
            let mid = 0.5 * (lo_p + hi_p);
            let mut test_opts = base_opts.clone();
            test_opts.d_p = -mid;
            let r = simulate_rotation(farm, rotation, &test_opts, None);
            if r.p_fail <= tol {
                lo_p = mid;
            } else {
                hi_p = mid;
            }
        }
        round2(-lo_p)
    };

    MarginResult {
        already: false,
        base_p_fail: base_res.p_fail,
        d_t,
        d_t_capped,
        d_p,
        d_p_capped,
    }
}

/// Computes the 11×11 Failure Frontier grid across ΔT in [0..5 °C] and ΔP in [0..-50%].
pub fn frontier(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
) -> FrontierResult {
    let d_ts: Vec<f32> = (0..=10).map(|i| i as f32 * 0.5).collect();
    let d_ps: Vec<f32> = (0..=10).map(|j| round2(-(j as f32) * 0.05)).collect();

    let mut grid = Vec::with_capacity(d_ts.len());
    for &dt in &d_ts {
        let mut row = Vec::with_capacity(d_ps.len());
        for &dp in &d_ps {
            let mut cell_opts = opts.clone();
            cell_opts.d_t = dt;
            cell_opts.d_p = dp;
            let res = simulate_rotation(farm, rotation, &cell_opts, None);
            row.push(round2(res.p_fail));
        }
        grid.push(row);
    }

    FrontierResult { d_ts, d_ps, grid }
}

/// Finds the year along a CMIP6 decadal trajectory when `p_fail` crosses `opts.fail_share`.
pub fn margin_year(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
    series: &[ScenarioPoint],
) -> MarginYearResult {
    let tol = opts.fail_share.clamp(0.01, 0.95);
    let mut base_opts = opts.clone();
    base_opts.d_t = 0.0;
    base_opts.d_p = 0.0;
    let base_res = simulate_rotation(farm, rotation, &base_opts, None);

    let mut path = Vec::with_capacity(series.len() + 1);
    path.push(MarginYearPathPoint {
        year: 2025,
        p_fail: base_res.p_fail,
        mean_net: base_res.mean_net,
    });

    if base_res.p_fail > tol {
        for pt in series {
            let mut s_opts = opts.clone();
            s_opts.d_t = pt.d_t;
            s_opts.d_p = pt.d_p;
            let r = simulate_rotation(farm, rotation, &s_opts, None);
            path.push(MarginYearPathPoint {
                year: pt.year,
                p_fail: r.p_fail,
                mean_net: r.mean_net,
            });
        }
        return MarginYearResult {
            year: serde_json::Value::String("now".to_string()),
            path,
        };
    }

    let mut crossed_year: Option<i32> = None;
    let mut prev_year = 2025;
    let mut prev_p_fail = base_res.p_fail;

    for pt in series {
        let mut s_opts = opts.clone();
        s_opts.d_t = pt.d_t;
        s_opts.d_p = pt.d_p;
        let r = simulate_rotation(farm, rotation, &s_opts, None);
        if crossed_year.is_none() && r.p_fail > tol {
            let dp_diff = (r.p_fail - prev_p_fail).max(1e-4);
            let frac = ((tol - prev_p_fail) / dp_diff).clamp(0.0, 1.0);
            let interp_yr = prev_year + ((pt.year - prev_year) as f32 * frac).round() as i32;
            crossed_year = Some(interp_yr);
        }
        prev_year = pt.year;
        prev_p_fail = r.p_fail;
        path.push(MarginYearPathPoint {
            year: pt.year,
            p_fail: r.p_fail,
            mean_net: r.mean_net,
        });
    }

    let year_val = match crossed_year {
        Some(y) => serde_json::Value::Number(y.into()),
        None => serde_json::Value::Null,
    };

    MarginYearResult {
        year: year_val,
        path,
    }
}

/// Applies percentage shocks to crop prices (`pricePct`, e.g. -30.0) and input costs (`inputPct`, e.g. +40.0).
pub fn market_shock(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
    shock: &MarketShockParams,
) -> RotationResult {
    let mut shocked_opts = opts.clone();
    // Accept either percentage (-30.0) or fraction (-0.30)
    let p_frac = if shock.price_pct.abs() > 1.5 {
        shock.price_pct / 100.0
    } else {
        shock.price_pct
    };
    let c_frac = if shock.input_pct.abs() > 1.5 {
        shock.input_pct / 100.0
    } else {
        shock.input_pct
    };

    for step in rotation {
        let cid = normalize_crop_id(&step.crop);
        let base_price = farm.crop_price(cid, opts);
        let base_cost = farm.crop_cost(cid, opts);
        shocked_opts.prices.insert(
            cid.to_string(),
            round1((base_price * (1.0 + p_frac)).max(0.0)),
        );
        shocked_opts.costs.insert(
            cid.to_string(),
            round1((base_cost * (1.0 + c_frac)).max(0.0)),
        );
    }
    let _ = get_crop("maize");
    simulate_rotation(farm, rotation, &shocked_opts, None)
}
