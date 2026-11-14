//! Climate and market stress tests (C3): adaptation margin, failure frontier, market shock, margin year.
//!
//! Every function is generic over a simulator closure `sim(&opts) -> RotationResult` (`*_with`), so the
//! same logic runs on the real daily simulator and on test doubles. Climate shifts are *composed* with the
//! caller's options (`SimOptions::shifted`): temperatures add, rain multiplies. The reference point of every
//! search is the unshifted options, so base P(fail) and the bisection always use the same options.

use crate::rotation::{simulate_resolved, RotationResult};
use crate::{
    default_cmip6_series, par_map, round2, round3, PreparedFarm, ResolvedRotation, Result,
    RotationStep, ScenarioPoint, SimOptions,
};
use serde::{Deserialize, Serialize};

pub const MAX_DT_C: f64 = 6.0;
/// Largest rain cut searched (70 %).
pub const MAX_RAIN_CUT: f64 = 0.70;
pub const BISECTION_STEPS: usize = 8;
/// Reference climate stress used by the optimizer and the score: +2 °C and 20 % less rain.
pub const STRESS_DT_C: f64 = 2.0;
pub const STRESS_DP_FRAC: f64 = -0.20;

/// Simulator closure used by the `*_with` entry points.
pub type SimFn<'a> = &'a (dyn Fn(&SimOptions) -> RotationResult + Sync);

/// C3 `MarginResult`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarginResult {
    pub already: bool,
    pub base_p_fail: f64,
    #[serde(rename = "dT")]
    pub d_t: f64,
    #[serde(rename = "dTcapped")]
    pub d_t_capped: bool,
    /// Rain change as a negative fraction (-0.2 = 20 % less rain).
    #[serde(rename = "dP")]
    pub d_p: f64,
    #[serde(rename = "dPcapped")]
    pub d_p_capped: bool,
}

/// C3 `FrontierResult`: `grid[dP index][dT index]` = P(fail).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FrontierResult {
    #[serde(rename = "dTs")]
    pub d_ts: Vec<f64>,
    #[serde(rename = "dPs")]
    pub d_ps: Vec<f64>,
    pub grid: Vec<Vec<f64>>,
}

/// `marketShock` input: price and input-cost changes in percent (-30 = 30 % lower).
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketShockParams {
    #[serde(default)]
    pub price_pct: f64,
    #[serde(default)]
    pub input_pct: f64,
}

/// `{ year: 2043 | null | "now" }`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarginYearValue {
    Now,
    Year(i32),
    Never,
}

impl Serialize for MarginYearValue {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        match self {
            MarginYearValue::Now => serializer.serialize_str("now"),
            MarginYearValue::Year(y) => serializer.serialize_i32(*y),
            MarginYearValue::Never => serializer.serialize_none(),
        }
    }
}

impl<'de> Deserialize<'de> for MarginYearValue {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        match Option::<serde_json::Value>::deserialize(d)? {
            None | Some(serde_json::Value::Null) => Ok(MarginYearValue::Never),
            Some(serde_json::Value::String(s)) if s.eq_ignore_ascii_case("now") => {
                Ok(MarginYearValue::Now)
            }
            Some(serde_json::Value::Number(n)) => n
                .as_i64()
                .map(|y| MarginYearValue::Year(y as i32))
                .ok_or_else(|| serde::de::Error::custom("invalid margin year")),
            _ => Err(serde::de::Error::custom(
                "expected \"now\", a year, or null",
            )),
        }
    }
}

/// C3 `MarginYearResult`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MarginYearResult {
    pub year: MarginYearValue,
    pub path: Vec<ScenarioPoint>,
}

fn p_fail_at(sim: SimFn, opts: &SimOptions, d_t: f64, d_p: f64) -> f64 {
    sim(&opts.shifted(d_t, d_p)).p_fail
}

/// Largest `x in [0, hi]` with `p(x) <= limit` (bisection), and whether `hi` itself is still safe.
fn bisect_safe(limit: f64, hi: f64, p: impl Fn(f64) -> f64) -> (f64, bool) {
    if p(hi) <= limit {
        return (hi, true);
    }
    let (mut lo, mut h) = (0.0, hi);
    for _ in 0..BISECTION_STEPS {
        let mid = 0.5 * (lo + h);
        if p(mid) <= limit {
            lo = mid;
        } else {
            h = mid;
        }
    }
    (lo, false)
}

/// Adaptation margin: how much warming (and, separately, how much drying) the rotation tolerates before
/// P(fail) exceeds `opts.fail_share`.
pub fn adaptation_margin_with(opts: &SimOptions, sim: SimFn) -> MarginResult {
    let limit = opts.fail_share.clamp(0.0, 1.0);
    let base = p_fail_at(sim, opts, 0.0, 0.0);
    if base > limit {
        return MarginResult {
            already: true,
            base_p_fail: round3(base),
            d_t: 0.0,
            d_t_capped: false,
            d_p: 0.0,
            d_p_capped: false,
        };
    }
    let (d_t, d_t_capped) = bisect_safe(limit, MAX_DT_C, |x| p_fail_at(sim, opts, x, 0.0));
    let (cut, d_p_capped) = bisect_safe(limit, MAX_RAIN_CUT, |x| p_fail_at(sim, opts, 0.0, -x));
    MarginResult {
        already: false,
        base_p_fail: round3(base),
        d_t: round2(d_t),
        d_t_capped,
        d_p: round3(-cut),
        d_p_capped,
    }
}

/// 11 x 11 failure surface: dT 0..5 °C (step 0.5) x dP 0..-50 % (step -5 %), `grid[dP][dT]`.
pub fn frontier_with(opts: &SimOptions, sim: SimFn) -> FrontierResult {
    let d_ts: Vec<f64> = (0..=10).map(|i| f64::from(i) * 0.5).collect();
    let d_ps: Vec<f64> = (0..=10).map(|j| round2(-f64::from(j) * 0.05)).collect();
    let cells: Vec<(f64, f64)> = d_ps
        .iter()
        .flat_map(|&dp| d_ts.iter().map(move |&dt| (dt, dp)))
        .collect();
    let flat = par_map(&cells, |&(dt, dp)| round3(p_fail_at(sim, opts, dt, dp)));
    let grid = flat.chunks(d_ts.len()).map(<[f64]>::to_vec).collect();
    FrontierResult { d_ts, d_ps, grid }
}

/// Market shock: re-prices the rotation's crops and returns a normal `RotationResult`.
pub fn market_shock_with(
    opts: &SimOptions,
    crops: &[(String, f64, f64)],
    shock: &MarketShockParams,
    sim: SimFn,
) -> RotationResult {
    let mut o = opts.clone();
    for (id, price, cost) in crops {
        o.prices.insert(
            id.clone(),
            (price * (1.0 + shock.price_pct / 100.0)).max(0.0),
        );
        o.costs.insert(
            id.clone(),
            (cost * (1.0 + shock.input_pct / 100.0)).max(0.0),
        );
    }
    sim(&o)
}

/// Linear interpolation of a trajectory anchored at 2020 = no change.
pub fn interp_series(series: &[ScenarioPoint], year: i32) -> ScenarioPoint {
    let mut pts = vec![ScenarioPoint {
        year: 2020,
        d_t: 0.0,
        d_p: 0.0,
    }];
    let mut s = series.to_vec();
    s.sort_by_key(|p| p.year);
    pts.extend(s);
    for w in pts.windows(2) {
        let (a, b) = (w[0], w[1]);
        if year <= b.year {
            let t =
                (f64::from(year - a.year) / f64::from((b.year - a.year).max(1))).clamp(0.0, 1.0);
            return ScenarioPoint {
                year,
                d_t: a.d_t + t * (b.d_t - a.d_t),
                d_p: a.d_p + t * (b.d_p - a.d_p),
            };
        }
    }
    let last = pts[pts.len() - 1];
    ScenarioPoint { year, ..last }
}

/// First year in 2026..=2090 where P(fail) along the trajectory exceeds the tolerated share.
pub fn margin_year_with(
    opts: &SimOptions,
    series: &[ScenarioPoint],
    sim: SimFn,
) -> MarginYearResult {
    margin_year_core(opts, series, &|_, p| opts.shifted(p.d_t, p.d_p), sim)
}

/// `margin_year_with` where `options_at(year, trajectory point)` builds the options of each year (so a caller can
/// add the monthly CMIP6 shape and the CO2 of that year to the annual-mean shift).
pub fn margin_year_core(
    opts: &SimOptions,
    series: &[ScenarioPoint],
    options_at: &(dyn Fn(i32, ScenarioPoint) -> SimOptions + Sync),
    sim: SimFn,
) -> MarginYearResult {
    let limit = opts.fail_share.clamp(0.0, 1.0);
    let path: Vec<ScenarioPoint> = if series.is_empty() {
        default_cmip6_series()
    } else {
        series.to_vec()
    };
    if sim(opts).p_fail > limit {
        return MarginYearResult {
            year: MarginYearValue::Now,
            path,
        };
    }
    for year in 2026..=2090 {
        let p = interp_series(&path, year);
        if sim(&options_at(year, p)).p_fail > limit {
            return MarginYearResult {
                year: MarginYearValue::Year(year),
                path,
            };
        }
    }
    MarginYearResult {
        year: MarginYearValue::Never,
        path,
    }
}

// ---- farm-level wrappers (validate the rotation once) ----

pub fn adaptation_margin(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
) -> Result<MarginResult> {
    let rot = ResolvedRotation::new(rotation)?;
    Ok(adaptation_margin_with(opts, &|o| {
        simulate_resolved(farm, &rot, o, None)
    }))
}

pub fn frontier(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
) -> Result<FrontierResult> {
    let rot = ResolvedRotation::new(rotation)?;
    Ok(frontier_with(opts, &|o| {
        simulate_resolved(farm, &rot, o, None)
    }))
}

pub fn market_shock(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
    shock: &MarketShockParams,
) -> Result<RotationResult> {
    let rot = ResolvedRotation::new(rotation)?;
    let crops: Vec<(String, f64, f64)> = rot
        .crops
        .iter()
        .map(|c| {
            (
                c.id.to_string(),
                farm.crop_price(c, opts),
                farm.crop_cost(c, opts),
            )
        })
        .collect();
    Ok(market_shock_with(opts, &crops, shock, &|o| {
        simulate_resolved(farm, &rot, o, None)
    }))
}

pub fn margin_year(
    farm: &PreparedFarm,
    rotation: &[RotationStep],
    opts: &SimOptions,
    series: &[ScenarioPoint],
) -> Result<MarginYearResult> {
    let rot = ResolvedRotation::new(rotation)?;
    // with `opts.ssp` the pack's monthly CMIP6 shape and the SSP CO2 of each year are applied along the trajectory
    let ssp = opts.ssp.clone();
    let shape = ssp
        .as_deref()
        .and_then(|s| farm.scenario_monthly(s))
        .or_else(|| opts.monthly.clone());
    let at = |year: i32, p: ScenarioPoint| -> SimOptions {
        let mut o = opts.shifted(0.0, 0.0);
        match &shape {
            Some(sh) => o.monthly = Some(sh.scaled_to(p.d_t, p.d_p)),
            None => o = opts.shifted(p.d_t, p.d_p),
        }
        if let (None, Some(s)) = (opts.co2_ppm, ssp.as_deref()) {
            o.co2_ppm = Some(crate::co2::ssp_co2_ppm(s, year));
        }
        o
    };
    Ok(margin_year_core(opts, series, &at, &|o| {
        simulate_resolved(farm, &rot, o, None)
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fake simulator whose P(fail) grows with dT and with rain loss.
    fn fake(o: &SimOptions) -> RotationResult {
        let p = (0.02 + 0.1 * o.d_t.max(0.0) - 0.5 * o.d_p.min(0.0)).clamp(0.0, 1.0);
        RotationResult {
            p_fail: p,
            ..Default::default()
        }
    }

    #[test]
    fn margin_bisects_on_composed_options() {
        let opts = SimOptions::default();
        let m = adaptation_margin_with(&opts, &fake);
        assert!(!m.already);
        // 0.02 + 0.1 dT = 0.2 -> dT = 1.8
        assert!((m.d_t - 1.8).abs() < 0.05, "{m:?}");
        // 0.02 + 0.5 cut = 0.2 -> cut = 0.36
        assert!((m.d_p + 0.36).abs() < 0.01, "{m:?}");
    }

    #[test]
    fn base_uses_the_same_options_as_bisection() {
        // options already warm by +1.7: base 0.19 is fine, margin must be the *remaining* 0.1 °C
        let opts = SimOptions {
            d_t: 1.7,
            ..Default::default()
        };
        let m = adaptation_margin_with(&opts, &fake);
        assert!(!m.already);
        assert!(m.d_t < 0.2, "{m:?}");
    }

    #[test]
    fn frontier_is_rain_by_temperature() {
        let f = frontier_with(&SimOptions::default(), &fake);
        assert_eq!((f.grid.len(), f.grid[0].len()), (11, 11));
        // rows = rain, cols = temperature
        assert!(f.grid[0][10] > f.grid[0][0]);
        assert!(f.grid[10][0] > f.grid[0][0]);
    }

    #[test]
    fn margin_year_serialises_like_the_ts_union() {
        let r = margin_year_with(&SimOptions::default(), &[], &fake);
        let v = serde_json::to_value(&r).unwrap();
        assert!(v["year"].is_number() || v["year"].is_null() || v["year"] == "now");
        assert!(v["path"][0].get("dT").is_some());
    }
}
