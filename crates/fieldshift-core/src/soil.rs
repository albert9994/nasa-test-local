use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Raw C1 soil layer from SoilGrids (`layers/<farm>/soil.json`).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RawSoilLayer {
    #[serde(default)]
    pub sand: HashMap<String, DepthValue>,
    #[serde(default)]
    pub clay: HashMap<String, DepthValue>,
    #[serde(default)]
    pub silt: HashMap<String, DepthValue>,
    #[serde(default)]
    pub soc: HashMap<String, DepthValue>,
    #[serde(default)]
    pub bdod: HashMap<String, DepthValue>,
    #[serde(default)]
    pub phh2o: HashMap<String, DepthValue>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DepthValue {
    pub mean: Option<f32>,
}

/// Processed physical and chemical soil profile derived via Saxton & Rawls (2006).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoilProfile {
    pub sand_pct: f32,
    pub clay_pct: f32,
    pub silt_pct: f32,
    pub soc_g_kg: f32,
    pub bdod_g_cm3: f32,
    pub ph: f32,
    pub texture_class: String,
    /// Permanent wilting point volumetric moisture (m3/m3)
    pub theta_wp: f32,
    /// Field capacity volumetric moisture (m3/m3)
    pub theta_fc: f32,
    /// Saturation volumetric moisture (m3/m3)
    pub theta_sat: f32,
    /// Total Available Water capacity per meter of root depth (mm/m)
    pub taw_mm_per_m: f32,
    /// Slope-adjusted SCS Curve Number (CN2)
    pub cn2: f32,
    /// RUSLE soil erodibility factor K (t ha h / (ha MJ mm))
    pub rusle_k: f32,
    /// Initial soil organic carbon stock in top 30 cm (t C/ha)
    pub initial_soc_t_ha: f32,
    /// True if derived from real SoilGrids data, false if using default loam fallback
    pub has_observed_soil: bool,
}

const DEPTH_WEIGHTS: [(&str, f32); 5] = [
    ("0-5cm", 0.05),
    ("5-15cm", 0.10),
    ("15-30cm", 0.15),
    ("30-60cm", 0.30),
    ("60-100cm", 0.40),
];

fn weighted_prop(prop: &HashMap<String, DepthValue>, default_val: f32) -> (f32, bool) {
    let mut sum = 0.0;
    let mut w_sum = 0.0;
    for (depth, w) in DEPTH_WEIGHTS {
        if let Some(dv) = prop.get(depth) {
            if let Some(v) = dv.mean {
                if v.is_finite() && v > 0.0 {
                    sum += v * w;
                    w_sum += w;
                }
            }
        }
    }
    if w_sum > 0.0 {
        (sum / w_sum, true)
    } else {
        (default_val, false)
    }
}

impl SoilProfile {
    /// Builds a `SoilProfile` from optional C1 `RawSoilLayer` and terrain slope (%).
    /// Uses Saxton & Rawls (2006) pedotransfer equations.
    pub fn from_raw(raw: Option<&RawSoilLayer>, slope_pct: f32) -> Self {
        // Default Iowa fertile silt loam fallback when soil layer is absent
        let (mut sand, has_sand) = raw
            .map(|r| weighted_prop(&r.sand, 18.0))
            .unwrap_or((18.0, false));
        let (mut clay, has_clay) = raw
            .map(|r| weighted_prop(&r.clay, 24.0))
            .unwrap_or((24.0, false));
        let (mut silt, _) = raw
            .map(|r| weighted_prop(&r.silt, 58.0))
            .unwrap_or((58.0, false));
        let (soc_g_kg, _) = raw
            .map(|r| weighted_prop(&r.soc, 22.0))
            .unwrap_or((22.0, false));
        let (bdod, _) = raw
            .map(|r| weighted_prop(&r.bdod, 1.32))
            .unwrap_or((1.32, false));
        let (ph, _) = raw
            .map(|r| weighted_prop(&r.phh2o, 6.5))
            .unwrap_or((6.5, false));

        // Normalize sand + clay + silt to 100%
        let total = (sand + clay + silt).max(1.0);
        sand = (sand / total * 100.0).clamp(2.0, 92.0);
        clay = (clay / total * 100.0).clamp(2.0, 75.0);
        silt = (100.0 - sand - clay).max(2.0);

        let s = sand / 100.0;
        let c = clay / 100.0;
        // Organic matter % = SOC (g/kg) / 10 * 1.724
        let om = ((soc_g_kg / 10.0) * 1.724).clamp(0.4, 8.0);

        // Saxton & Rawls (2006) equations (Soil Sci. Soc. Am. J. 70:1569-1578)
        let theta_1500t = -0.024 * s + 0.487 * c + 0.006 * om + 0.005 * (s * om) - 0.013 * (c * om)
            + 0.068 * (s * c)
            + 0.031;
        let theta_wp = (theta_1500t + (0.14 * theta_1500t - 0.02)).clamp(0.04, 0.38);

        let theta_33t = -0.251 * s + 0.195 * c + 0.011 * om + 0.006 * (s * om) - 0.027 * (c * om)
            + 0.452 * (s * c)
            + 0.299;
        let theta_fc = (theta_33t + (1.283 * theta_33t * theta_33t - 0.374 * theta_33t - 0.015))
            .clamp(theta_wp + 0.07, 0.52);

        let theta_s33t = 0.278 * s + 0.034 * c + 0.022 * om
            - 0.018 * (s * om)
            - 0.027 * (c * om)
            - 0.584 * (s * c)
            + 0.078;
        let theta_s33 = (theta_s33t + (0.636 * theta_s33t - 0.107)).max(0.04);
        let theta_sat = (theta_fc + theta_s33 - 0.097 * s + 0.043).clamp(theta_fc + 0.05, 0.62);

        let taw_mm_per_m = ((theta_fc - theta_wp) * 1000.0).clamp(70.0, 240.0);

        // Hydrologic group base Curve Number (CN2) + slope adjustment
        let base_cn2 = 72.0 + 0.22 * clay - 0.18 * sand - 1.2 * om;
        let slope_clamped = slope_pct.clamp(0.2, 25.0);
        let cn2 = (base_cn2 + (slope_clamped - 2.0) * 0.65).clamp(58.0, 91.0);

        // RUSLE K factor (Williams 1995 EPIC formulation, metric units ~0.015 - 0.055)
        let sil = silt / 100.0;
        let org_c = (soc_g_kg / 10.0).clamp(0.2, 5.0);
        let f_csand = 0.2 + 0.3 * (-0.256 * sand * (1.0 - sil)).exp();
        let f_cl_si = (sil / (c + sil).max(0.01)).powf(0.3);
        let f_orgc = 1.0 - (0.25 * org_c) / (org_c + (3.72 - 2.95 * org_c).exp());
        let sn1 = 1.0 - s;
        let f_hisand = 1.0 - (0.7 * sn1) / (sn1 + (-5.51 + 22.9 * sn1).exp());
        let rusle_k = (0.1317 * f_csand * f_cl_si * f_orgc * f_hisand).clamp(0.012, 0.058);

        // Initial SOC stock in 0-30 cm (t C / ha) = SOC(g/kg) * BD(g/cm3) * 3.0 m*10
        let bd_clamped = bdod.clamp(0.95, 1.75);
        let initial_soc_t_ha = (soc_g_kg * bd_clamped * 3.0).clamp(20.0, 140.0);

        let texture_class = classify_texture(sand, clay, silt);

        Self {
            sand_pct: (sand * 10.0).round() / 10.0,
            clay_pct: (clay * 10.0).round() / 10.0,
            silt_pct: (silt * 10.0).round() / 10.0,
            soc_g_kg: (soc_g_kg * 10.0).round() / 10.0,
            bdod_g_cm3: (bd_clamped * 100.0).round() / 100.0,
            ph: (ph * 10.0).round() / 10.0,
            texture_class,
            theta_wp,
            theta_fc,
            theta_sat,
            taw_mm_per_m: (taw_mm_per_m * 10.0).round() / 10.0,
            cn2: (cn2 * 10.0).round() / 10.0,
            rusle_k: (rusle_k * 1000.0).round() / 1000.0,
            initial_soc_t_ha: (initial_soc_t_ha * 10.0).round() / 10.0,
            has_observed_soil: has_sand && has_clay,
        }
    }
}

fn classify_texture(sand: f32, clay: f32, silt: f32) -> String {
    if clay >= 40.0 {
        if silt >= 40.0 {
            "silty clay".to_string()
        } else {
            "clay".to_string()
        }
    } else if clay >= 27.0 {
        if sand <= 20.0 {
            "silty clay loam".to_string()
        } else if sand <= 45.0 {
            "clay loam".to_string()
        } else {
            "sandy clay loam".to_string()
        }
    } else if silt >= 50.0 {
        "silt loam".to_string()
    } else if sand >= 52.0 {
        "sandy loam".to_string()
    } else {
        "loam".to_string()
    }
}
