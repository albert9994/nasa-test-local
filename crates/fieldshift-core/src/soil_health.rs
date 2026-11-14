use crate::crops::{get_crop, normalize_crop_id};
use crate::{PreparedFarm, RotationStep};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoilHealthMetrics {
    pub soil_score: f32,
    pub soc_change_pct: f32,
    pub erosion: f32,
}

/// Computes RUSLE soil erosion (t/ha/yr), annual SOC change (%/yr), and composite `soilScore` (0-100).
pub fn evaluate_soil_health(farm: &PreparedFarm, rotation: &[RotationStep]) -> SoilHealthMetrics {
    if rotation.is_empty() {
        return SoilHealthMetrics {
            soil_score: 50.0,
            soc_change_pct: 0.0,
            erosion: 2.0,
        };
    }

    let mean_rain_mm = farm.mean_annual_precip_mm();
    let mean_temp_c = farm.mean_annual_temp_c();

    // RUSLE R factor (Renard & Freimund 1994 approximation from mean annual precipitation)
    let r_factor = if mean_rain_mm <= 850.0 {
        0.0483 * mean_rain_mm.powf(1.61)
    } else {
        587.8 - 1.219 * mean_rain_mm + 0.004105 * mean_rain_mm * mean_rain_mm
    }
    .clamp(25.0, 450.0);

    // RUSLE LS factor from terrain slope (%) assuming 60 m field slope length
    let slope_pct = farm.meta.slope.clamp(0.3, 20.0);
    let theta = (slope_pct / 100.0).atan();
    let m_exp = (0.3 + 0.2 * (slope_pct / 5.0)).clamp(0.2, 0.5);
    let ls_factor = ((60.0_f32 / 22.13).powf(m_exp) * (10.8 * theta.sin() + 0.03).clamp(0.08, 3.5))
        .clamp(0.12, 4.5);

    let k_factor = farm.soil.rusle_k;

    let mut c_sum = 0.0_f32;
    let mut c_input_sum = 0.0_f32;
    let mut cover_frac = 0.0_f32;
    let mut legume_frac = 0.0_f32;
    let mut distinct_crops = HashSet::new();
    let mut distinct_families = HashSet::new();

    for step in rotation {
        let cid = normalize_crop_id(&step.crop);
        let crop = get_crop(cid);
        distinct_crops.insert(cid.to_string());
        if crop.family != "none" {
            distinct_families.insert(crop.family.clone());
        }

        // Cover crop reduces effective RUSLE C factor by protecting winter/spring bare soil
        let step_c = if step.cover {
            crop.rusle_c * 0.52
        } else {
            crop.rusle_c
        };
        c_sum += step_c;

        // Carbon input (t C/ha/yr) from crop residue + roots + winter rye cover crop (+0.38 t C/ha)
        let mut step_c_in = crop.residue_carbon_t_ha;
        if step.cover {
            step_c_in += 0.55;
            cover_frac += 1.0;
        }
        if crop.winter {
            cover_frac += 0.6;
        }
        if crop.legume {
            legume_frac += 1.0;
            step_c_in += 0.18;
        }
        c_input_sum += step_c_in;
    }

    let n = rotation.len() as f32;
    let mean_c = c_sum / n;
    let mean_c_input = c_input_sum / n;
    cover_frac = (cover_frac / n).clamp(0.0, 1.2);
    legume_frac = (legume_frac / n).clamp(0.0, 1.0);

    // RUSLE A = R * K * LS * C * P (P = 0.90 for contour/modern cultivation, scaled to field t/ha/yr)
    let erosion = (r_factor * k_factor * ls_factor * mean_c * 0.42).clamp(0.15, 25.0);

    // Temperature-dependent SOC mineralization (Q10 ~ 1.8) vs humified carbon input
    let temp_decay_mult = 1.8_f32.powf((mean_temp_c - 11.0) / 10.0).clamp(0.55, 2.1);
    let baseline_decay_t_ha = 1.32 * temp_decay_mult * (0.85 + 0.30 * mean_c);
    let net_soc_t_ha_yr = mean_c_input - baseline_decay_t_ha;
    let soc_change_pct =
        ((net_soc_t_ha_yr / farm.soil.initial_soc_t_ha.max(25.0)) * 100.0).clamp(-1.80, 1.80);

    // Sub-components of soilScore (0..100)
    let carbon_score = ((soc_change_pct + 0.80) / 1.60 * 100.0).clamp(5.0, 100.0);
    let erosion_score = ((10.0 - erosion) / 9.5 * 100.0).clamp(5.0, 100.0);
    let diversity_score = ((distinct_crops.len() as f32 * 22.0)
        + (distinct_families.len() as f32 * 18.0)
        + legume_frac * 20.0)
        .clamp(10.0, 100.0);
    let cover_score = (25.0 + cover_frac * 65.0).clamp(15.0, 100.0);

    let soil_score =
        (0.35 * carbon_score + 0.30 * erosion_score + 0.20 * diversity_score + 0.15 * cover_score)
            .clamp(5.0, 99.0);

    SoilHealthMetrics {
        soil_score: (soil_score * 10.0).round() / 10.0,
        soc_change_pct: (soc_change_pct * 100.0).round() / 100.0,
        erosion: (erosion * 100.0).round() / 100.0,
    }
}
