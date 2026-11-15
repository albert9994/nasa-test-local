//! Calibration report: simulated yields vs observed county yields (C5, `validation/<farm>.json`).
//!
//! `validate` never changes `meta.calib`: it only reports Pearson r, RMSE and bias (simulated minus observed, t/ha)
//! per crop over the years both series share, using each crop grown every year (its own single-crop rotation).

use crate::rotation::simulate_rotation;
use crate::{PreparedFarm, Result, RotationStep, SimOptions};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// C5 county yields: `{ "crops": { "maize": { "years": { "2002": 10.9 } } } }` (extra fields ignored).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ObservedYields {
    #[serde(default)]
    pub crops: BTreeMap<String, ObservedCrop>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ObservedCrop {
    #[serde(default)]
    pub years: BTreeMap<String, f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CropValidation {
    pub n: usize,
    pub r: f64,
    pub rmse: f64,
    /// Mean of (simulated - observed), t/ha.
    pub bias: f64,
    /// Mean observed / mean simulated: the calibration factor that would remove the bias (informational only).
    pub calib: f64,
    /// `[year, observed, simulated]`
    pub pairs: Vec<[f64; 3]>,
}

fn pearson(x: &[f64], y: &[f64]) -> f64 {
    let n = x.len() as f64;
    if x.len() < 3 {
        return 0.0;
    }
    let (mx, my) = (x.iter().sum::<f64>() / n, y.iter().sum::<f64>() / n);
    let (mut sxy, mut sxx, mut syy) = (0.0, 0.0, 0.0);
    for (a, b) in x.iter().zip(y) {
        sxy += (a - mx) * (b - my);
        sxx += (a - mx).powi(2);
        syy += (b - my).powi(2);
    }
    if sxx <= 1e-12 || syy <= 1e-12 {
        0.0
    } else {
        sxy / (sxx.sqrt() * syy.sqrt())
    }
}

fn r3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

/// Compares simulated yields with `observed`, per crop. Crops the engine does not know are skipped.
pub fn validate(
    farm: &PreparedFarm,
    observed: &ObservedYields,
    opts: &SimOptions,
) -> Result<BTreeMap<String, CropValidation>> {
    let mut out = BTreeMap::new();
    for (crop, obs) in &observed.crops {
        let Ok(res) =
            simulate_rotation(farm, &[RotationStep::new(crop.clone(), false)], opts, None)
        else {
            continue;
        };
        let canon = res.yield_by_crop.keys().next().cloned().unwrap_or_default();
        let Some(sim) = res.yield_by_crop.get(&canon) else {
            continue;
        };
        let (mut o, mut s, mut pairs) = (vec![], vec![], vec![]);
        for (ys, v) in &obs.years {
            let Ok(y) = ys.trim().parse::<i32>() else {
                continue;
            };
            if let Some(i) = res.years.iter().position(|&yy| yy == y) {
                if v.is_finite() {
                    o.push(*v);
                    s.push(sim[i]);
                    pairs.push([f64::from(y), *v, sim[i]]);
                }
            }
        }
        if o.is_empty() {
            continue;
        }
        let n = o.len() as f64;
        let bias = s.iter().zip(&o).map(|(a, b)| a - b).sum::<f64>() / n;
        let rmse = (s.iter().zip(&o).map(|(a, b)| (a - b).powi(2)).sum::<f64>() / n).sqrt();
        let (mo, ms) = (o.iter().sum::<f64>() / n, s.iter().sum::<f64>() / n);
        out.insert(
            canon,
            CropValidation {
                n: o.len(),
                r: r3(pearson(&s, &o)),
                rmse: r3(rmse),
                bias: r3(bias),
                calib: if ms > 1e-6 { r3(mo / ms) } else { 0.0 },
                pairs,
            },
        );
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pearson_basics() {
        assert!((pearson(&[1.0, 2.0, 3.0, 4.0], &[2.0, 4.0, 6.0, 8.0]) - 1.0).abs() < 1e-12);
        assert!((pearson(&[1.0, 2.0, 3.0, 4.0], &[8.0, 6.0, 4.0, 2.0]) + 1.0).abs() < 1e-12);
        assert_eq!(pearson(&[1.0, 1.0, 1.0], &[1.0, 2.0, 3.0]), 0.0);
    }
}
