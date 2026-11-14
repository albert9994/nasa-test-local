//! I3 · Climate & Market Stress Testing (`stress.rs`, Contract C3)
//!
//! Implements:
//! - `adaptation_margin`: 8-step bisection on ΔT ∈ [0, 6] °C and rain cut ∈ [0, 70 %]
//! - `frontier`: 11×11 failure surface (ΔT 0–5 °C × ΔP 0 to −50 %)
//! - `market_shock`: price and input cost shock wrapper over `simulate_rotation`
//! - `margin_year`: year when rotation crosses the farmer's failure threshold along a CMIP6 series

use crate::{
    default_crop_pool, resolve_crop_cost, resolve_crop_price, simulate_rotation, Farm,
    RotationResult, RotationStep, ScenarioPoint, SimOpts,
};
use serde::{Deserialize, Serialize};

pub const MAX_DT_C: f64 = 6.0;
pub const MAX_RAIN_CUT: f64 = 0.70; // 70% rain reduction -> dP = -0.70
pub const BISECTION_STEPS: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AdaptationMarginResult {
    pub already: bool,
    pub base_p_fail: f64,
    #[serde(rename = "dT")]
    pub d_t: f64,
    #[serde(rename = "dTcapped")]
    pub d_t_capped: bool,
    #[serde(rename = "dP")]
    pub d_p: f64,
    #[serde(rename = "dPcapped")]
    pub d_p_capped: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FrontierResult {
    #[serde(rename = "dTs")]
    pub d_ts: Vec<f64>,
    #[serde(rename = "dPs")]
    pub d_ps: Vec<f64>,
    pub grid: Vec<Vec<f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MarketShockParams {
    /// Crop price change in percent (e.g. -30.0 for -30%, or -0.30 as a fraction).
    #[serde(default)]
    pub price_pct: f64,
    /// Input cost change in percent (e.g. 40.0 for +40%, or 0.40 as a fraction).
    #[serde(default)]
    pub input_pct: f64,
}

/// Represents `{ year: 2043 | null | "now" }` in Contract C3 `marginYear`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MarginYearValue {
    Now,
    Year(i32),
    Never,
}

impl Serialize for MarginYearValue {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            MarginYearValue::Now => serializer.serialize_str("now"),
            MarginYearValue::Year(y) => serializer.serialize_i32(*y),
            MarginYearValue::Never => serializer.serialize_none(),
        }
    }
}

impl<'de> Deserialize<'de> for MarginYearValue {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let val = Option::<serde_json::Value>::deserialize(deserializer)?;
        match val {
            None | Some(serde_json::Value::Null) => Ok(MarginYearValue::Never),
            Some(serde_json::Value::String(s)) if s.eq_ignore_ascii_case("now") => {
                Ok(MarginYearValue::Now)
            }
            Some(serde_json::Value::Number(n)) => {
                if let Some(y) = n.as_i64() {
                    Ok(MarginYearValue::Year(y as i32))
                } else {
                    Err(serde::de::Error::custom("invalid margin year number"))
                }
            }
            _ => Err(serde::de::Error::custom(
                "expected 'now', integer year, or null",
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MarginTrajectoryPoint {
    pub year: i32,
    #[serde(rename = "dT")]
    pub d_t: f64,
    #[serde(rename = "dP")]
    pub d_p: f64,
    pub p_fail: f64,
    pub mean_net: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MarginYearResult {
    pub year: MarginYearValue,
    pub path: Vec<MarginTrajectoryPoint>,
}

/// Evaluates `p_fail` at a specific `(dT, dP)` shift using the provided simulator function.
pub fn eval_p_fail_with<F>(
    farm: &Farm,
    rotation: &[RotationStep],
    base_opts: &SimOpts,
    d_t: f64,
    d_p: f64,
    sim_fn: &F,
) -> f64
where
    F: Fn(&Farm, &[RotationStep], &SimOpts, Option<i32>) -> RotationResult,
{
    let mut shifted = base_opts.clone();
    shifted.d_t = d_t;
    shifted.d_p = d_p;
    sim_fn(farm, rotation, &shifted, None).p_fail
}

/// Computes the Adaptation Margin (`dT` in °C and `dP` rain fraction) using 8-step bisection (Contract C3).
pub fn adaptation_margin(
    farm: &Farm,
    rotation: &[RotationStep],
    opts: &SimOpts,
) -> AdaptationMarginResult {
    adaptation_margin_with(farm, rotation, opts, &simulate_rotation)
}

pub fn adaptation_margin_with<F>(
    farm: &Farm,
    rotation: &[RotationStep],
    opts: &SimOpts,
    sim_fn: &F,
) -> AdaptationMarginResult
where
    F: Fn(&Farm, &[RotationStep], &SimOpts, Option<i32>) -> RotationResult,
{
    let limit = opts.fail_share.clamp(0.0, 1.0);
    let base_p_fail = eval_p_fail_with(farm, rotation, opts, opts.d_t, opts.d_p, sim_fn);

    if base_p_fail > limit {
        return AdaptationMarginResult {
            already: true,
            base_p_fail: round3(base_p_fail),
            d_t: 0.0,
            d_t_capped: false,
            d_p: 0.0,
            d_p_capped: false,
        };
    }

    // 1. Bisection on ΔT ∈ [0, 6] °C (holding dP = 0)
    let p_at_max_t = eval_p_fail_with(farm, rotation, opts, MAX_DT_C, 0.0, sim_fn);
    let (d_t, d_t_capped) = if p_at_max_t <= limit {
        (MAX_DT_C, true)
    } else {
        let mut lo = 0.0;
        let mut hi = MAX_DT_C;
        for _ in 0..BISECTION_STEPS {
            let mid = 0.5 * (lo + hi);
            let pf = eval_p_fail_with(farm, rotation, opts, mid, 0.0, sim_fn);
            if pf <= limit {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        (lo, false)
    };

    // 2. Bisection on rain cut ∈ [0, 70 %] -> dP ∈ [0.0, -0.70] (holding dT = 0)
    let p_at_max_cut = eval_p_fail_with(farm, rotation, opts, 0.0, -MAX_RAIN_CUT, sim_fn);
    let (d_p, d_p_capped) = if p_at_max_cut <= limit {
        (-MAX_RAIN_CUT, true)
    } else {
        let mut lo_cut = 0.0;
        let mut hi_cut = MAX_RAIN_CUT;
        for _ in 0..BISECTION_STEPS {
            let mid_cut = 0.5 * (lo_cut + hi_cut);
            let pf = eval_p_fail_with(farm, rotation, opts, 0.0, -mid_cut, sim_fn);
            if pf <= limit {
                lo_cut = mid_cut;
            } else {
                hi_cut = mid_cut;
            }
        }
        (-lo_cut, false)
    };

    AdaptationMarginResult {
        already: false,
        base_p_fail: round3(base_p_fail),
        d_t: round2(d_t),
        d_t_capped,
        d_p: round3(d_p),
        d_p_capped,
    }
}

/// Computes the 11×11 failure frontier grid: ΔT ∈ [0, 5] °C (step 0.5 °C) × ΔP ∈ [0, −0.50] (step −0.05).
pub fn frontier(farm: &Farm, rotation: &[RotationStep], opts: &SimOpts) -> FrontierResult {
    frontier_with(farm, rotation, opts, &simulate_rotation)
}

pub fn frontier_with<F>(
    farm: &Farm,
    rotation: &[RotationStep],
    opts: &SimOpts,
    sim_fn: &F,
) -> FrontierResult
where
    F: Fn(&Farm, &[RotationStep], &SimOpts, Option<i32>) -> RotationResult,
{
    let d_ts: Vec<f64> = (0..=10).map(|i| i as f64 * 0.5).collect();
    let d_ps: Vec<f64> = (0..=10).map(|j| -(j as f64 * 0.05)).collect();

    let mut grid = Vec::with_capacity(d_ts.len());
    for &dt in &d_ts {
        let mut row = Vec::with_capacity(d_ps.len());
        for &dp in &d_ps {
            let pf = eval_p_fail_with(farm, rotation, opts, dt, dp, sim_fn);
            row.push(round3(pf));
        }
        grid.push(row);
    }

    FrontierResult { d_ts, d_ps, grid }
}

/// Applies a market shock (`pricePct` and `inputPct`) and returns a `simulateRotation`-shaped result (Contract C3).
pub fn market_shock(
    farm: &Farm,
    rotation: &[RotationStep],
    opts: &SimOpts,
    shock: &MarketShockParams,
) -> RotationResult {
    market_shock_with(farm, rotation, opts, shock, &simulate_rotation)
}

pub fn market_shock_with<F>(
    farm: &Farm,
    rotation: &[RotationStep],
    opts: &SimOpts,
    shock: &MarketShockParams,
    sim_fn: &F,
) -> RotationResult
where
    F: Fn(&Farm, &[RotationStep], &SimOpts, Option<i32>) -> RotationResult,
{
    let price_frac = normalize_pct_or_frac(shock.price_pct);
    let input_frac = normalize_pct_or_frac(shock.input_pct);

    let mut shocked_opts = opts.clone();
    let mut crops = default_crop_pool();
    for step in rotation {
        if !crops.contains(&step.crop) {
            crops.push(step.crop.clone());
        }
    }

    for crop_id in crops {
        let base_price = resolve_crop_price(farm, opts, &crop_id);
        let base_cost = resolve_crop_cost(farm, opts, &crop_id, false);
        shocked_opts
            .prices
            .insert(crop_id.clone(), (base_price * (1.0 + price_frac)).max(0.0));
        shocked_opts
            .costs
            .insert(crop_id, (base_cost * (1.0 + input_frac)).max(0.0));
    }

    sim_fn(farm, rotation, &shocked_opts, None)
}

/// Computes the year when a rotation crosses `opts.fail_share` along a CMIP6 decadal series (Contract C3).
pub fn margin_year(
    farm: &Farm,
    rotation: &[RotationStep],
    opts: &SimOpts,
    series: &[ScenarioPoint],
) -> MarginYearResult {
    margin_year_with(farm, rotation, opts, series, &simulate_rotation)
}

pub fn margin_year_with<F>(
    farm: &Farm,
    rotation: &[RotationStep],
    opts: &SimOpts,
    series: &[ScenarioPoint],
    sim_fn: &F,
) -> MarginYearResult
where
    F: Fn(&Farm, &[RotationStep], &SimOpts, Option<i32>) -> RotationResult,
{
    let limit = opts.fail_share.clamp(0.0, 1.0);
    let base_res = sim_fn(farm, rotation, opts, None);

    let default_series = default_cmip6_series();
    let pts: &[ScenarioPoint] = if series.is_empty() {
        &default_series
    } else {
        series
    };

    let mut anchors = Vec::with_capacity(pts.len() + 1);
    if pts.first().map(|p| p.year).unwrap_or(2030) > 2025 {
        anchors.push(ScenarioPoint {
            year: 2025,
            d_t: opts.d_t,
            d_p: opts.d_p,
        });
    }
    anchors.extend_from_slice(pts);
    anchors.sort_by_key(|p| p.year);

    let mut path = Vec::with_capacity(anchors.len());
    for pt in &anchors {
        let mut step_opts = opts.clone();
        step_opts.d_t = pt.d_t;
        step_opts.d_p = pt.d_p;
        let res = sim_fn(farm, rotation, &step_opts, None);
        path.push(MarginTrajectoryPoint {
            year: pt.year,
            d_t: round2(pt.d_t),
            d_p: round3(pt.d_p),
            p_fail: round3(res.p_fail),
            mean_net: round2(res.mean_net),
        });
    }

    if base_res.p_fail > limit {
        return MarginYearResult {
            year: MarginYearValue::Now,
            path,
        };
    }

    // Interpolate between consecutive decadal anchors to find the exact crossing year
    for window in anchors.windows(2) {
        let a = &window[0];
        let b = &window[1];
        let span = (b.year - a.year).max(1);
        for yr in a.year..=b.year {
            let frac = (yr - a.year) as f64 / (span as f64);
            let dt = a.d_t + frac * (b.d_t - a.d_t);
            let dp = a.d_p + frac * (b.d_p - a.d_p);
            let pf = eval_p_fail_with(farm, rotation, opts, dt, dp, sim_fn);
            if pf > limit {
                if yr <= 2026 {
                    return MarginYearResult {
                        year: MarginYearValue::Now,
                        path,
                    };
                }
                return MarginYearResult {
                    year: MarginYearValue::Year(yr),
                    path,
                };
            }
        }
    }

    MarginYearResult {
        year: MarginYearValue::Never,
        path,
    }
}

pub fn default_cmip6_series() -> Vec<ScenarioPoint> {
    vec![
        ScenarioPoint {
            year: 2030,
            d_t: 1.0,
            d_p: -0.02,
        },
        ScenarioPoint {
            year: 2040,
            d_t: 1.5,
            d_p: -0.05,
        },
        ScenarioPoint {
            year: 2050,
            d_t: 2.1,
            d_p: -0.09,
        },
        ScenarioPoint {
            year: 2060,
            d_t: 2.5,
            d_p: -0.12,
        },
        ScenarioPoint {
            year: 2070,
            d_t: 2.8,
            d_p: -0.15,
        },
        ScenarioPoint {
            year: 2080,
            d_t: 3.0,
            d_p: -0.18,
        },
        ScenarioPoint {
            year: 2090,
            d_t: 3.2,
            d_p: -0.20,
        },
    ]
}

fn normalize_pct_or_frac(val: f64) -> f64 {
    if val.abs() > 1.0 {
        val / 100.0
    } else {
        val
    }
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

fn round3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{prepare_farm, FarmPack};

    #[test]
    fn test_adaptation_margin_and_bisection() {
        let farm = prepare_farm(FarmPack::default());
        let rot = vec![
            RotationStep::new("maize", false),
            RotationStep::new("soybean", false),
        ];
        let opts = SimOpts {
            fail_net: 150.0,
            fail_share: 0.25,
            ..SimOpts::default()
        };

        let margin = adaptation_margin(&farm, &rot, &opts);
        assert!((0.0..=MAX_DT_C).contains(&margin.d_t));
        assert!((-MAX_RAIN_CUT..=0.0).contains(&margin.d_p));
        if !margin.already {
            assert!(margin.base_p_fail <= opts.fail_share);
        }
    }

    #[test]
    fn test_frontier_11x11_shape_and_monotonicity() {
        let farm = prepare_farm(FarmPack::default());
        let rot = vec![
            RotationStep::new("maize", false),
            RotationStep::new("soybean", false),
        ];
        let opts = SimOpts {
            fail_net: 200.0,
            ..SimOpts::default()
        };

        let f = frontier(&farm, &rot, &opts);
        assert_eq!(f.d_ts.len(), 11);
        assert_eq!(f.d_ps.len(), 11);
        assert_eq!(f.grid.len(), 11);
        for row in &f.grid {
            assert_eq!(row.len(), 11);
        }
        // Extreme corner (+5°C, -50% rain) must have >= failure rate than (0°C, 0% rain)
        assert!(f.grid[10][10] >= f.grid[0][0]);
    }

    #[test]
    fn test_market_shock_reduces_net_on_price_drop() {
        let farm = prepare_farm(FarmPack::default());
        let rot = vec![
            RotationStep::new("maize", false),
            RotationStep::new("soybean", false),
        ];
        let opts = SimOpts::default();
        let base = simulate_rotation(&farm, &rot, &opts, None);
        let shocked = market_shock(
            &farm,
            &rot,
            &opts,
            &MarketShockParams {
                price_pct: -30.0,
                input_pct: 40.0,
            },
        );
        assert!(shocked.mean_net < base.mean_net);
        assert!(shocked.p_fail >= base.p_fail);
    }

    #[test]
    fn test_margin_year_serialization() {
        let farm = prepare_farm(FarmPack::default());
        let rot = vec![RotationStep::new("maize", false)];
        let opts = SimOpts {
            fail_net: 350.0,
            fail_share: 0.20,
            ..SimOpts::default()
        };
        let res = margin_year(&farm, &rot, &opts, &[]);
        let json = serde_json::to_value(&res).unwrap();
        assert!(json.get("year").is_some());
        assert!(!res.path.is_empty());
    }
}
