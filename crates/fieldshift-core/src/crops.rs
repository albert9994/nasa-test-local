//! M2 & M3: Crop library and agronomic carry-over rules (`crates/fieldshift-core/src/crops.rs`).
//! Reads `../data/crops.json` at compile time via `include_str!`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const CROPS_JSON: &str = include_str!("../data/crops.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KcStages {
    pub ini: f32,
    pub mid: f32,
    pub end: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageKy {
    pub veg: f32,
    pub flower: f32,
    pub fill: f32,
    pub ripen: f32,
    pub season: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropParams {
    pub id: String,
    pub name: String,
    pub name_ro: String,
    pub family: String,
    pub legume: bool,
    pub is_winter: bool,
    pub t_base: f32,
    pub t_upper: f32,
    pub gdd_maturity: f32,
    pub sow_temp: f32,
    pub sow_window: [u16; 2],
    pub kc: KcStages,
    pub root_depth_ini: f32,
    pub root_depth_max: f32,
    pub depletion_p: f32,
    pub stage_ky: StageKy,
    pub flower_heat_threshold: f32,
    pub flower_heat_max: f32,
    pub extreme_heat_threshold: f32,
    pub extreme_heat_slope: f32,
    pub frost_limit: f32,
    pub attainable_yield: f32,
    pub harvest_index: f32,
    pub rusle_c: f32,
    pub residue_ratio: f32,
    pub root_shoot_ratio: f32,
    pub same_crop_penalty: f32,
    pub min_break_years: u8,
    pub n_credit_next_yield_bonus: f32,
    pub n_credit_fert_saving_usd_ha: f32,
    pub optimal_ph_range: [f32; 2],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverCropParams {
    pub id: String,
    pub name: String,
    pub name_ro: String,
    pub family: String,
    pub t_base: f32,
    pub kc_off_season: f32,
    pub biomass_dry_matter_t_ha: f32,
    pub carbon_input_t_ha_yr: f32,
    pub rusle_c_multiplier: f32,
    pub infiltration_bonus_fraction: f32,
    pub spring_transpiration_drawdown_mm: f32,
    pub semi_arid_threshold_prcp_mm: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegumeCarryOver {
    pub next_crop_yield_bonus_fraction: f32,
    pub next_crop_fert_savings_usd_ha: f32,
    pub soil_water_carry_over_bonus_mm: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FallowCarryOver {
    pub precipitation_storage_efficiency: f32,
    pub max_extra_available_water_mm: f32,
    pub next_crop_yield_bonus_in_dry_years: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationRulesConfig {
    pub legume_carry_over: HashMap<String, LegumeCarryOver>,
    pub same_crop_penalty: HashMap<String, f32>,
    pub same_family_back_to_back_penalty: f32,
    pub diversity_bonus_per_distinct_family: f32,
    pub max_diversity_bonus: f32,
    pub fallow_carry_over: FallowCarryOver,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageGddFractions {
    pub vegetative_end: f32,
    pub flowering_end: f32,
    pub grain_fill_end: f32,
    pub ripening_end: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropLibrary {
    pub version: String,
    pub stage_gdd_fractions: StageGddFractions,
    pub crops: Vec<CropParams>,
    pub cover_crop: CoverCropParams,
    pub rotation_rules: RotationRulesConfig,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CarryOverEffect {
    /// Multiplier on yield (e.g. 1.12 after soybean, 0.88 for continuous corn).
    pub yield_multiplier: f32,
    /// Fertilizer cost reduction ($/ha) from preceding legume N fixation.
    pub cost_delta_usd_ha: f32,
    /// Extra starting plant-available soil water (mm) from fallow / pea / cover infiltration.
    pub starting_water_delta_mm: f32,
}

impl CropLibrary {
    pub fn load() -> Self {
        serde_json::from_str(CROPS_JSON).expect("valid embedded crops.json")
    }

    pub fn get(&self, crop_id: &str) -> Option<&CropParams> {
        let normalized = match crop_id {
            "winter_wheat" => "wheat",
            other => other,
        };
        self.crops.iter().find(|c| c.id == normalized)
    }

    /// Computes the carry-over effect on `curr_crop_id` given `prev_crop_id`,
    /// whether `prev_had_cover` (winter rye after previous crop), the number of
    /// distinct botanical families in the rotation, and mean annual rainfall (mm).
    pub fn carry_over_effect(
        &self,
        prev_crop_id: &str,
        prev_had_cover: bool,
        curr_crop_id: &str,
        distinct_families_in_rotation: usize,
        annual_prcp_mm: f32,
    ) -> CarryOverEffect {
        let prev = match self.get(prev_crop_id) {
            Some(c) => c,
            None => {
                return CarryOverEffect {
                    yield_multiplier: 1.0,
                    cost_delta_usd_ha: 0.0,
                    starting_water_delta_mm: 0.0,
                }
            }
        };
        let curr = match self.get(curr_crop_id) {
            Some(c) => c,
            None => {
                return CarryOverEffect {
                    yield_multiplier: 1.0,
                    cost_delta_usd_ha: 0.0,
                    starting_water_delta_mm: 0.0,
                }
            }
        };

        if curr.id == "fallow" {
            return CarryOverEffect {
                yield_multiplier: 1.0,
                cost_delta_usd_ha: 0.0,
                starting_water_delta_mm: 0.0,
            };
        }

        let mut yield_mult = 1.0_f32;
        let mut cost_delta = 0.0_f32;
        let mut water_delta = 0.0_f32;

        // 1. Same-crop back-to-back penalty
        if prev.id == curr.id {
            yield_mult -= curr.same_crop_penalty;
        } else if prev.family != "none" && prev.family == curr.family {
            // 2. Same botanical family penalty (e.g., wheat -> barley, maize -> sorghum)
            yield_mult -= self.rotation_rules.same_family_back_to_back_penalty;
        }

        // 3. Legume N credit to following non-legume crop
        if prev.legume && !curr.legume {
            if let Some(leg_rule) = self.rotation_rules.legume_carry_over.get(&prev.id) {
                yield_mult += leg_rule.next_crop_yield_bonus_fraction;
                cost_delta -= leg_rule.next_crop_fert_savings_usd_ha;
                water_delta += leg_rule.soil_water_carry_over_bonus_mm;
            } else {
                yield_mult += prev.n_credit_next_yield_bonus;
                cost_delta -= prev.n_credit_fert_saving_usd_ha;
            }
        }

        // 4. Preceding fallow moisture conservation
        if prev.id == "fallow" {
            let extra_mm = (annual_prcp_mm
                * self
                    .rotation_rules
                    .fallow_carry_over
                    .precipitation_storage_efficiency)
                .min(
                    self.rotation_rules
                        .fallow_carry_over
                        .max_extra_available_water_mm,
                );
            water_delta += extra_mm;
            if annual_prcp_mm < 520.0 {
                yield_mult += self
                    .rotation_rules
                    .fallow_carry_over
                    .next_crop_yield_bonus_in_dry_years
                    * 0.5;
            }
        }

        // 5. Rotation diversity bonus (Bowles et al. 2020)
        if distinct_families_in_rotation >= 2 {
            let bonus = ((distinct_families_in_rotation - 1) as f32
                * self.rotation_rules.diversity_bonus_per_distinct_family)
                .min(self.rotation_rules.max_diversity_bonus);
            yield_mult += bonus;
        }

        // 6. Winter rye cover crop water trade-off
        if prev_had_cover {
            if annual_prcp_mm >= self.cover_crop.semi_arid_threshold_prcp_mm {
                // Better infiltration & snow trapping outweighs spring transpiration
                water_delta += 10.0;
            } else {
                // In semi-arid regions (<450 mm), rye uses precious spring moisture
                water_delta -= self.cover_crop.spring_transpiration_drawdown_mm;
            }
        }

        CarryOverEffect {
            yield_multiplier: yield_mult.clamp(0.55, 1.35),
            cost_delta_usd_ha: cost_delta,
            starting_water_delta_mm: water_delta,
        }
    }
}
