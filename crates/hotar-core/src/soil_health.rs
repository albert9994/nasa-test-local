//! M6: Soil-health formulas (`crates/hotar-core/src/soil_health.rs`)
//!
//! Computes:
//! 1. Soil organic carbon trend (`soc_change_pct` %/yr) from crop residue + root C inputs
//!    + cover-crop sequestration (Poeplau & Don 2015) vs temperature-dependent decay (Q10 = 2.0).
//! 2. Annual water erosion (`erosion` t/ha/yr) via RUSLE (`R * K * LS * C * P`).
//! 3. Composite `soil_score` (0..=100) combining carbon trend, erosion control,
//!    botanical diversity + legume share, and living winter ground cover.

use serde::{Deserialize, Serialize};

/// Input descriptor for one phase of a crop rotation in soil-health evaluation.
#[derive(Debug, Clone)]
pub struct RotationPhaseSoilInput<'a> {
    pub crop_id: &'a str,
    pub family: &'a str,
    pub is_legume: bool,
    pub is_winter: bool,
    /// Whether winter cereal rye cover crop follows this cash crop.
    pub cover: bool,
    /// Mean grain/seed yield achieved by this crop across simulated years (t/ha dry/market weight).
    pub mean_yield_t_ha: f64,
    /// Crop residue-to-grain ratio ((1 - HI)/HI or tabulated).
    pub residue_ratio: f64,
    /// Root-to-shoot biomass ratio.
    pub root_shoot_ratio: f64,
    /// Base RUSLE cover-management factor C for this crop (0.0..=1.0).
    pub rusle_c: f64,
}

/// Site soil & climate parameters needed by the soil-health model.
#[derive(Debug, Clone, Copy)]
pub struct SiteSoilClimate {
    /// Topsoil (0–30 cm) sand fraction (% by weight, e.g. 20.0).
    pub sand_pct: f64,
    /// Topsoil (0–30 cm) silt fraction (% by weight, e.g. 50.0).
    pub silt_pct: f64,
    /// Topsoil (0–30 cm) clay fraction (% by weight, e.g. 30.0).
    pub clay_pct: f64,
    /// Topsoil soil organic carbon concentration (g C / kg soil, e.g. 18.0 = 1.8% SOC).
    pub soc_g_kg: f64,
    /// Topsoil bulk density (g / cm³, e.g. 1.32).
    pub bdod_g_cm3: f64,
    /// Field slope gradient (%, e.g. 2.0 for flat/gently rolling, 6.5 for Moldavian plateau).
    pub slope_pct: f64,
    /// Mean annual precipitation (mm/yr, e.g. 520.0).
    pub mean_annual_prcp_mm: f64,
    /// Mean annual air temperature (°C, e.g. 11.5).
    pub mean_annual_temp_c: f64,
}

impl Default for SiteSoilClimate {
    fn default() -> Self {
        Self {
            sand_pct: 22.0,
            silt_pct: 48.0,
            clay_pct: 30.0,
            soc_g_kg: 18.0,
            bdod_g_cm3: 1.32,
            slope_pct: 2.0,
            mean_annual_prcp_mm: 650.0,
            mean_annual_temp_c: 11.0,
        }
    }
}

/// Output metrics returned by `compute_soil_health` (matches C3 `simulateRotation` contract).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoilHealthResult {
    /// Composite soil health score on a 0–100 scale.
    pub soil_score: u8,
    /// Annual relative change in topsoil organic carbon stock (%/yr, e.g. -0.45 or +0.38).
    pub soc_change_pct: f64,
    /// Estimated annual soil loss by water erosion from RUSLE (t/ha/yr).
    pub erosion: f64,
    /// Sub-score breakdown for transparency and explainability.
    pub carbon_subscore: f64,
    pub erosion_subscore: f64,
    pub diversity_subscore: f64,
    pub cover_subscore: f64,
}

/// Computes RUSLE rainfall erosivity factor `R` (MJ mm ha⁻¹ h⁻¹ yr⁻¹) from mean annual rainfall
/// using the Renard & Freimund (1994) continental equation: `R = 0.0483 * P^1.61`.
pub fn rusle_r_factor(mean_annual_prcp_mm: f64) -> f64 {
    let p = mean_annual_prcp_mm.clamp(150.0, 2500.0);
    0.0483 * p.powf(1.61)
}

/// Computes RUSLE soil erodibility factor `K` (t ha h ha⁻¹ MJ⁻¹ mm⁻¹) using the
/// EPIC / Williams (1995) equation from sand, silt, clay (%) and SOC (g/kg).
pub fn rusle_k_factor(sand_pct: f64, silt_pct: f64, clay_pct: f64, soc_g_kg: f64) -> f64 {
    let san = sand_pct.clamp(1.0, 95.0);
    let sil = silt_pct.clamp(1.0, 95.0);
    let cla = clay_pct.clamp(1.0, 90.0);
    let org_c_pct = (soc_g_kg * 0.1).clamp(0.2, 8.0);
    let sn1 = 1.0 - san / 100.0;

    let f_csand = 0.2 + 0.3 * (-0.0256 * san * (1.0 - sil / 100.0)).exp();
    let f_cl_si = (sil / (cla + sil).max(1.0)).powf(0.3);
    let f_orgc = 1.0 - (0.25 * org_c_pct) / (org_c_pct + (3.72 - 2.95 * org_c_pct).exp());
    let f_hisand = 1.0 - (0.7 * sn1) / (sn1 + (-5.51 + 22.9 * sn1).exp());

    // Convert US customary K to SI metric units (* 0.1317)
    let k_si = 0.1317 * f_csand * f_cl_si * f_orgc * f_hisand;
    k_si.clamp(0.012, 0.065)
}

/// Computes RUSLE topographic factor `LS` from slope gradient (%) and a representative
/// 60 m field slope length (McCool et al., 1987; Renard et al., 1997).
pub fn rusle_ls_factor(slope_pct: f64) -> f64 {
    let s = slope_pct.clamp(0.2, 35.0);
    let theta = (s / 100.0).atan();
    let sin_theta = theta.sin();

    // Rill-to-interrill ratio beta and slope-length exponent m
    let beta = (sin_theta / 0.0896) / (3.0 * sin_theta.powf(0.8) + 0.56);
    let m = beta / (1.0 + beta);
    let slope_length_m = 60.0_f64;
    let l_factor = (slope_length_m / 22.13).powf(m);

    let s_factor = if s < 9.0 {
        10.8 * sin_theta + 0.03
    } else {
        16.8 * sin_theta - 0.50
    };

    (l_factor * s_factor).clamp(0.08, 12.0)
}

/// Evaluates soil carbon trend, RUSLE erosion, and composite `soilScore` (0–100) for a rotation.
pub fn compute_soil_health(
    phases: &[RotationPhaseSoilInput<'_>],
    site: &SiteSoilClimate,
) -> SoilHealthResult {
    if phases.is_empty() {
        return SoilHealthResult {
            soil_score: 50,
            soc_change_pct: 0.0,
            erosion: 0.0,
            carbon_subscore: 50.0,
            erosion_subscore: 50.0,
            diversity_subscore: 50.0,
            cover_subscore: 50.0,
        };
    }

    let n = phases.len() as f64;

    // 1. Initial topsoil (0–30 cm) SOC stock (t C / ha):
    // depth = 0.30 m => mass of soil = 3000 * bdod (t/ha); SOC (t/ha) = mass * (soc_g_kg / 1000) = 3.0 * bdod * soc_g_kg
    let soc_stock_t_ha =
        (3.0 * site.bdod_g_cm3.clamp(0.9, 1.7) * site.soc_g_kg.clamp(4.0, 60.0)).clamp(25.0, 180.0);

    // 2. Annual humified C inputs vs mineralisation decay
    // Dry biomass is ~45% carbon; humification coefficient: ~12% for above-ground stover, ~28% for roots (Rasse et al. 2005)
    // Cover crop (winter rye) adds +0.32 t C/ha/yr net sequestered C (Poeplau & Don 2015)
    let mut sum_humified_c_t_ha = 0.0_f64;
    let mut sum_effective_c_factor = 0.0_f64;
    let mut cover_or_winter_count = 0.0_f64;
    let mut legume_count = 0.0_f64;
    let mut bare_fallow_count = 0.0_f64;

    let mut distinct_crops: Vec<&str> = Vec::new();
    let mut distinct_families: Vec<&str> = Vec::new();

    for p in phases {
        if p.crop_id != "fallow" && !distinct_crops.contains(&p.crop_id) {
            distinct_crops.push(p.crop_id);
        }
        if p.family != "none" && !distinct_families.contains(&p.family) {
            distinct_families.push(p.family);
        }

        if p.is_legume {
            legume_count += 1.0;
        }
        if p.crop_id == "fallow" && !p.cover {
            bare_fallow_count += 1.0;
        }

        // Above-ground residue dry matter (t/ha) & root dry matter (t/ha)
        let dry_yield = p.mean_yield_t_ha.max(0.0) * 0.87;
        let residue_dm = dry_yield * p.residue_ratio.max(0.0);
        let root_dm = (dry_yield + residue_dm) * p.root_shoot_ratio.max(0.0);

        let stover_c_humified = residue_dm * 0.45 * 0.12;
        let root_c_humified = root_dm * 0.45 * 0.28;
        let cover_c_humified = if p.cover { 0.34 } else { 0.0 };

        sum_humified_c_t_ha += stover_c_humified + root_c_humified + cover_c_humified;

        // RUSLE C-factor adjusted for winter cover crop (×0.55) and high residue
        let mut phase_c = p.rusle_c.clamp(0.05, 0.60);
        if p.cover {
            phase_c *= 0.55;
            cover_or_winter_count += 1.0;
        } else if p.is_winter {
            cover_or_winter_count += 0.85;
        }
        sum_effective_c_factor += phase_c;
    }

    let mean_humified_c_t_ha = sum_humified_c_t_ha / n;
    let mean_c_factor = sum_effective_c_factor / n;

    // Temperature and moisture scalar on active/slow SOC pool mineralisation (Q10 = 2.0 relative to 10°C)
    let temp_factor = 2.0_f64
        .powf((site.mean_annual_temp_c - 10.0) / 10.0)
        .clamp(0.5, 2.2);
    let moist_factor = (site.mean_annual_prcp_mm / 650.0).clamp(0.55, 1.25);
    let clay_protection = (1.0 - 0.006 * site.clay_pct.clamp(5.0, 60.0)).clamp(0.64, 0.97);

    // Tillage / bare fallow disturbance accelerates oxidation
    let disturbance_factor =
        1.0 + 0.22 * (bare_fallow_count / n) - 0.12 * (cover_or_winter_count / n);

    // Baseline annual mineralisation rate of the labile/intermediate pool (~1.15% of total SOC stock at T=10°C)
    let annual_c_loss_t_ha = soc_stock_t_ha
        * 0.0115
        * temp_factor
        * moist_factor
        * clay_protection
        * disturbance_factor.clamp(0.80, 1.30);

    let net_c_change_t_ha_yr = mean_humified_c_t_ha - annual_c_loss_t_ha;
    let soc_change_pct = ((net_c_change_t_ha_yr / soc_stock_t_ha) * 100.0).clamp(-2.5, 2.0);

    // 3. RUSLE water erosion (t/ha/yr): A = R * K * LS * C * P
    let r = rusle_r_factor(site.mean_annual_prcp_mm);
    let k = rusle_k_factor(site.sand_pct, site.silt_pct, site.clay_pct, site.soc_g_kg);
    let ls = rusle_ls_factor(site.slope_pct);
    let p_factor = 1.0_f64;
    let erosion = (r * k * ls * mean_c_factor * p_factor).clamp(0.05, 45.0);

    // 4. Sub-scores (0..=100) and weighted composite `soil_score`
    // (a) Carbon sub-score (35% weight): 0% change -> 62 pts; +0.6%/yr -> 95 pts; -1.0%/yr -> 15 pts
    let carbon_subscore = (62.0 + soc_change_pct * 55.0).clamp(5.0, 100.0);

    // (b) Erosion sub-score (30% weight): <=1 t/ha/yr -> ~95 pts; 5 t/ha/yr (tolerable T) -> ~68 pts; >=15 t/ha/yr -> 10 pts
    let erosion_subscore = (100.0 - erosion * 6.2).clamp(5.0, 100.0);

    // (c) Diversity & legume sub-score (20% weight)
    let crop_div_pts = ((distinct_crops.len().min(4) as f64 - 1.0) * 18.0).clamp(0.0, 54.0);
    let fam_div_pts = ((distinct_families.len().min(3) as f64 - 1.0) * 13.0).clamp(0.0, 26.0);
    let legume_pts = if legume_count > 0.0 { 20.0 } else { 0.0 };
    let diversity_subscore = (crop_div_pts + fam_div_pts + legume_pts).clamp(10.0, 100.0);

    // (d) Living winter cover sub-score (15% weight)
    let cover_ratio = (cover_or_winter_count / n).clamp(0.0, 1.0);
    let cover_subscore =
        (20.0 + 80.0 * cover_ratio - 25.0 * (bare_fallow_count / n)).clamp(5.0, 100.0);

    let composite = 0.35 * carbon_subscore
        + 0.30 * erosion_subscore
        + 0.20 * diversity_subscore
        + 0.15 * cover_subscore;

    SoilHealthResult {
        soil_score: composite.round().clamp(1.0, 100.0) as u8,
        soc_change_pct: (soc_change_pct * 100.0).round() / 100.0,
        erosion: (erosion * 100.0).round() / 100.0,
        carbon_subscore: (carbon_subscore * 10.0).round() / 10.0,
        erosion_subscore: (erosion_subscore * 10.0).round() / 10.0,
        diversity_subscore: (diversity_subscore * 10.0).round() / 10.0,
        cover_subscore: (cover_subscore * 10.0).round() / 10.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cover_crops_and_legumes_raise_soil_score_and_cut_erosion() {
        let baragan_site = SiteSoilClimate {
            sand_pct: 18.0,
            silt_pct: 52.0,
            clay_pct: 30.0,
            soc_g_kg: 19.5,
            bdod_g_cm3: 1.30,
            slope_pct: 2.2,
            mean_annual_prcp_mm: 525.0,
            mean_annual_temp_c: 12.2,
        };

        // Baseline: maize -> sunflower without cover crops
        let baseline = vec![
            RotationPhaseSoilInput {
                crop_id: "maize",
                family: "poaceae",
                is_legume: false,
                is_winter: false,
                cover: false,
                mean_yield_t_ha: 6.2,
                residue_ratio: 1.0,
                root_shoot_ratio: 0.18,
                rusle_c: 0.38,
            },
            RotationPhaseSoilInput {
                crop_id: "sunflower",
                family: "asteraceae",
                is_legume: false,
                is_winter: false,
                cover: false,
                mean_yield_t_ha: 2.6,
                residue_ratio: 1.65,
                root_shoot_ratio: 0.19,
                rusle_c: 0.40,
            },
        ];

        // Soil builder: winter wheat (+rye cover) -> sorghum (+rye cover) -> pea
        let soil_builder = vec![
            RotationPhaseSoilInput {
                crop_id: "wheat",
                family: "poaceae",
                is_legume: false,
                is_winter: true,
                cover: true,
                mean_yield_t_ha: 5.4,
                residue_ratio: 1.22,
                root_shoot_ratio: 0.22,
                rusle_c: 0.15,
            },
            RotationPhaseSoilInput {
                crop_id: "sorghum",
                family: "poaceae",
                is_legume: false,
                is_winter: false,
                cover: true,
                mean_yield_t_ha: 5.8,
                residue_ratio: 1.15,
                root_shoot_ratio: 0.22,
                rusle_c: 0.32,
            },
            RotationPhaseSoilInput {
                crop_id: "pea",
                family: "fabaceae",
                is_legume: true,
                is_winter: false,
                cover: true,
                mean_yield_t_ha: 2.8,
                residue_ratio: 1.25,
                root_shoot_ratio: 0.15,
                rusle_c: 0.34,
            },
        ];

        let base_res = compute_soil_health(&baseline, &baragan_site);
        let builder_res = compute_soil_health(&soil_builder, &baragan_site);

        assert!(
            builder_res.soil_score > base_res.soil_score + 15,
            "Expected soil builder ({}) to score significantly higher than baseline ({})",
            builder_res.soil_score,
            base_res.soil_score
        );
        assert!(
            builder_res.soc_change_pct > base_res.soc_change_pct,
            "Expected cover crops to improve SOC trend: {} vs {}",
            builder_res.soc_change_pct,
            base_res.soc_change_pct
        );
        assert!(
            builder_res.erosion < base_res.erosion * 0.65,
            "Expected winter wheat + cover crops to cut erosion: {} vs {}",
            builder_res.erosion,
            base_res.erosion
        );
    }

    #[test]
    fn sloped_moldova_has_higher_erosion_than_flat_baragan() {
        let phase = vec![RotationPhaseSoilInput {
            crop_id: "maize",
            family: "poaceae",
            is_legume: false,
            is_winter: false,
            cover: false,
            mean_yield_t_ha: 6.0,
            residue_ratio: 1.0,
            root_shoot_ratio: 0.18,
            rusle_c: 0.38,
        }];

        let flat = SiteSoilClimate {
            slope_pct: 1.2,
            ..Default::default()
        };
        let sloped = SiteSoilClimate {
            slope_pct: 6.5,
            ..Default::default()
        };

        let res_flat = compute_soil_health(&phase, &flat);
        let res_sloped = compute_soil_health(&phase, &sloped);

        assert!(
            res_sloped.erosion > res_flat.erosion * 2.5,
            "Sloped field erosion ({}) should be >2.5x flat field erosion ({})",
            res_sloped.erosion,
            res_flat.erosion
        );
    }
}
