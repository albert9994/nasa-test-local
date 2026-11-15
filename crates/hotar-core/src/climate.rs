//! Climate shifts: uniform sliders, monthly CMIP6 deltas, per-model trajectories.
//!
//! Pack layout (optional additions to C4, all backward compatible):
//! ```json
//! "ssp245": { "2050": {...}, "series": [...],
//!   "monthly": { "dT": [12 values, Jan..Dec, deg C], "dP": [12 values, fractions] },   // 2050 anchor vs 2001-2020
//!   "perModel": { "ACCESS-CM2": { "dT": 2.4, "dP": -0.03, "series": [{year,dT,dP}], "monthly": {...} } } }
//! ```
//! `monthly` shapes are scaled along the trajectory: the annual-mean ΔT / ΔP of any year comes from `series`
//! (or a model's own trajectory) and the monthly pattern redistributes it over the calendar (Schlenker & Roberts 2009
//! stress is about *when* the heat arrives, not only its annual mean).

use crate::ScenarioPoint;
use serde::{Deserialize, Serialize};

/// Cumulative days before each month in a non-leap year.
const CUM: [usize; 13] = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

/// Month index 0..=11 of a 0-based day-of-year.
#[inline]
pub fn month_of(day0: usize, leap: bool) -> usize {
    let d = if leap && day0 >= 59 { day0 - 1 } else { day0 };
    let mut m = 0;
    while m < 11 && d >= CUM[m + 1] {
        m += 1;
    }
    m
}

/// Calendar-month climate deltas: ΔT in °C added to Tmax/Tmin, ΔP as a fraction of monthly rain.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MonthlyShift {
    #[serde(rename = "dT")]
    pub d_t: [f64; 12],
    #[serde(rename = "dP")]
    pub d_p: [f64; 12],
}

impl MonthlyShift {
    pub fn mean_d_t(&self) -> f64 {
        self.d_t.iter().sum::<f64>() / 12.0
    }
    pub fn mean_d_p(&self) -> f64 {
        self.d_p.iter().sum::<f64>() / 12.0
    }

    /// Rescales the pattern so its annual means equal `(d_t, d_p)`. A flat pattern becomes uniform.
    pub fn scaled_to(&self, d_t: f64, d_p: f64) -> MonthlyShift {
        let (mt, mp) = (self.mean_d_t(), self.mean_d_p());
        let mut out = self.clone();
        for m in 0..12 {
            out.d_t[m] = if mt.abs() > 0.05 {
                (self.d_t[m] * d_t / mt).clamp(-3.0 * d_t.abs().max(1.0), 3.0 * d_t.abs().max(1.0))
            } else {
                d_t
            };
            out.d_p[m] = if mp.abs() > 0.004 {
                (self.d_p[m] * d_p / mp).clamp(-0.9, 1.5)
            } else {
                d_p
            };
        }
        out
    }

    /// Uniform shift expressed as a monthly one.
    pub fn uniform(d_t: f64, d_p: f64) -> MonthlyShift {
        MonthlyShift {
            d_t: [d_t; 12],
            d_p: [d_p; 12],
        }
    }

    /// Parses `{ "dT": [12], "dP": [12] }` or an array of 12 `{ "dT", "dP" }` objects.
    pub fn from_json(v: &serde_json::Value) -> Option<MonthlyShift> {
        let arr12 = |x: &serde_json::Value| -> Option<[f64; 12]> {
            let a = x.as_array()?;
            if a.len() != 12 {
                return None;
            }
            let mut o = [0.0; 12];
            for (i, e) in a.iter().enumerate() {
                o[i] = e.as_f64().filter(|f| f.is_finite())?;
            }
            Some(o)
        };
        if let Some(a) = v.as_array() {
            if a.len() != 12 {
                return None;
            }
            let (mut t, mut p) = ([0.0; 12], [0.0; 12]);
            for (i, e) in a.iter().enumerate() {
                t[i] = e.get("dT")?.as_f64()?;
                p[i] = e.get("dP").and_then(|x| x.as_f64()).unwrap_or(0.0);
            }
            return Some(MonthlyShift { d_t: t, d_p: p });
        }
        Some(MonthlyShift {
            d_t: arr12(v.get("dT")?)?,
            d_p: v.get("dP").and_then(arr12).unwrap_or([0.0; 12]),
        })
    }
}

/// One CMIP6 model's trajectory (its own series, or the ensemble series shifted to its 2050 anchor).
#[derive(Debug, Clone)]
pub struct ModelTrajectory {
    pub name: String,
    pub series: Vec<ScenarioPoint>,
    pub monthly: Option<MonthlyShift>,
}

/// Deterministic piecewise normal/triangular sample from p10 / p50 / p90 and a uniform `u` in (0,1):
/// quantile-matching skewed distribution (linear between quantiles, normal-like tails beyond).
pub fn quantile_sample(p10: f64, p50: f64, p90: f64, u: f64) -> f64 {
    let z = inv_norm(u.clamp(1e-6, 1.0 - 1e-6));
    let z90 = 1.2815515655446004;
    if z >= 0.0 {
        p50 + (p90 - p50) / z90 * z
    } else {
        p50 + (p50 - p10) / z90 * z
    }
}

/// Standard normal quantile (Acklam's rational approximation, |error| < 1.2e-9).
#[allow(clippy::excessive_precision)]
pub fn inv_norm(p: f64) -> f64 {
    const A: [f64; 6] = [
        -3.969683028665376e1,
        2.209460984245205e2,
        -2.759285104469687e2,
        1.383577518672690e2,
        -3.066479806614716e1,
        2.506628277459239,
    ];
    const B: [f64; 5] = [
        -5.447609879822406e1,
        1.615858368580409e2,
        -1.556989798598866e2,
        6.680131188771972e1,
        -1.328068155288572e1,
    ];
    const C: [f64; 6] = [
        -7.784894002430293e-3,
        -3.223964580411365e-1,
        -2.400758277161838,
        -2.549732539343734,
        4.374664141464968,
        2.938163982698783,
    ];
    const D: [f64; 4] = [
        7.784695709041462e-3,
        3.224671290700398e-1,
        2.445134137142996,
        3.754408661907416,
    ];
    let plow = 0.02425;
    if p < plow {
        let q = (-2.0 * p.ln()).sqrt();
        (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5])
            / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0)
    } else if p <= 1.0 - plow {
        let q = p - 0.5;
        let r = q * q;
        (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q
            / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1.0)
    } else {
        -inv_norm(1.0 - p)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn month_lookup() {
        assert_eq!(month_of(0, false), 0);
        assert_eq!(month_of(30, false), 0);
        assert_eq!(month_of(31, false), 1);
        assert_eq!(month_of(364, false), 11);
        assert_eq!(month_of(365, true), 11);
        assert_eq!(month_of(59, true), 1); // 29 Feb
        assert_eq!(month_of(60, true), 2); // 1 Mar
    }

    #[test]
    fn scaling_keeps_the_annual_mean() {
        let m = MonthlyShift {
            d_t: [1.0, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 3.5, 3.0, 2.0, 1.5, 1.0],
            d_p: [
                0.1, 0.1, 0.05, 0.0, -0.05, -0.1, -0.2, -0.2, -0.1, 0.0, 0.05, 0.1,
            ],
        };
        let s = m.scaled_to(4.0, -0.08);
        assert!((s.mean_d_t() - 4.0).abs() < 1e-9);
        assert!((s.mean_d_p() + 0.08).abs() < 1e-3);
        assert!(s.d_t[6] > s.d_t[0]);
    }

    #[test]
    fn parses_both_layouts() {
        let a = serde_json::json!({"dT":[1,1,1,1,1,1,1,1,1,1,1,1],"dP":[0,0,0,0,0,0,0,0,0,0,0,0]});
        assert!(MonthlyShift::from_json(&a).is_some());
        let b = serde_json::Value::Array(
            (0..12)
                .map(|i| serde_json::json!({"dT": i, "dP": 0.01}))
                .collect(),
        );
        assert_eq!(MonthlyShift::from_json(&b).unwrap().d_t[11], 11.0);
        assert!(MonthlyShift::from_json(&serde_json::json!({"dT":[1,2]})).is_none());
    }

    #[test]
    fn quantile_sample_hits_the_quantiles() {
        let q = |u| quantile_sample(1.5, 2.1, 2.8, u);
        assert!((q(0.5) - 2.1).abs() < 1e-6);
        assert!((q(0.9) - 2.8).abs() < 1e-3);
        assert!((q(0.1) - 1.5).abs() < 1e-3);
    }
}
