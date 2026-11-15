//! M2 & M3: Crop library and agronomic carry-over rules (`crates/hotar-core/src/crops.rs`).
//! Reads `../data/crops.json` at compile time via `include_str!`.

use crate::EngineError;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const CROPS_JSON: &str = include_str!("../data/crops.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KcStages {
    pub ini: f64,
    pub mid: f64,
    pub end: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageKy {
    pub veg: f64,
    pub flower: f64,
    pub fill: f64,
    pub ripen: f64,
    pub season: f64,
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
    pub t_base: f64,
    pub t_upper: f64,
    pub gdd_maturity: f64,
    pub sow_temp: f64,
    pub sow_window: [u16; 2],
    pub kc: KcStages,
    pub root_depth_ini: f64,
    pub root_depth_max: f64,
    pub depletion_p: f64,
    pub stage_ky: StageKy,
    pub flower_heat_threshold: f64,
    pub flower_heat_max: f64,
    pub extreme_heat_threshold: f64,
    pub extreme_heat_slope: f64,
    pub frost_limit: f64,
    pub attainable_yield: f64,
    pub harvest_index: f64,
    pub rusle_c: f64,
    pub residue_ratio: f64,
    pub root_shoot_ratio: f64,
    pub same_crop_penalty: f64,
    pub min_break_years: u8,
    pub n_credit_next_yield_bonus: f64,
    pub n_credit_fert_saving_usd_ha: f64,
    pub optimal_ph_range: [f64; 2],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverCropParams {
    pub id: String,
    pub name: String,
    pub name_ro: String,
    pub family: String,
    pub t_base: f64,
    pub kc_off_season: f64,
    pub biomass_dry_matter_t_ha: f64,
    pub carbon_input_t_ha_yr: f64,
    pub rusle_c_multiplier: f64,
    pub infiltration_bonus_fraction: f64,
    pub spring_transpiration_drawdown_mm: f64,
    pub semi_arid_threshold_prcp_mm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegumeCarryOver {
    pub next_crop_yield_bonus_fraction: f64,
    pub next_crop_fert_savings_usd_ha: f64,
    pub soil_water_carry_over_bonus_mm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FallowCarryOver {
    pub precipitation_storage_efficiency: f64,
    pub max_extra_available_water_mm: f64,
    pub next_crop_yield_bonus_in_dry_years: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationRulesConfig {
    pub legume_carry_over: HashMap<String, LegumeCarryOver>,
    pub same_crop_penalty: HashMap<String, f64>,
    pub same_family_back_to_back_penalty: f64,
    pub diversity_bonus_per_distinct_family: f64,
    pub max_diversity_bonus: f64,
    pub fallow_carry_over: FallowCarryOver,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageGddFractions {
    pub vegetative_end: f64,
    pub flowering_end: f64,
    pub grain_fill_end: f64,
    pub ripening_end: f64,
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
    pub yield_multiplier: f64,
    /// Fertilizer cost reduction ($/ha) from preceding legume N fixation.
    pub cost_delta_usd_ha: f64,
    /// Extra starting plant-available soil water (mm) from fallow / pea / cover infiltration.
    pub starting_water_delta_mm: f64,
}

impl CropLibrary {
    /// Parses a crop library from JSON (an object with a `crops` array, see `data/crops.json`).
    pub fn from_json(json: &str) -> Result<Self, EngineError> {
        serde_json::from_str(json).map_err(|e| EngineError::Data(format!("crops.json: {e}")))
    }

    /// The embedded library. Parsing is validated by a unit test; a failure surfaces as an error, never a panic.
    pub fn load() -> Result<&'static CropLibrary, EngineError> {
        static LIB: Lazy<Result<CropLibrary, String>> =
            Lazy::new(|| CropLibrary::from_json(CROPS_JSON).map_err(|e| e.to_string()));
        LIB.as_ref().map_err(|e| EngineError::Data(e.clone()))
    }

    pub fn get(&self, crop_id: &str) -> Option<&CropParams> {
        let normalized = canonical_id(crop_id).ok()?;
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
        annual_prcp_mm: f64,
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

        let mut yield_mult = 1.0_f64;
        let mut cost_delta = 0.0_f64;
        let mut water_delta = 0.0_f64;

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
            let bonus = ((distinct_families_in_rotation - 1) as f64
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

// ============================================================================
// Shim: flat season-simulator view of the crop library
// ============================================================================

/// Agronomic cost of a winter-rye cover crop (seed + establishment), $/ha.
pub const COVER_CROP_COST_USD_HA: f64 = 65.0;

/// Canonical crop ids understood by the engine.
pub const CROP_IDS: [&str; 9] = [
    "maize",
    "soybean",
    "wheat",
    "barley",
    "sorghum",
    "sunflower",
    "pea",
    "millet",
    "fallow",
];

/// Maps common aliases to the canonical crop id. Unknown ids are an error (never silently maize).
pub fn canonical_id(raw: &str) -> Result<&'static str, EngineError> {
    let key = raw.trim().to_ascii_lowercase().replace(['-', ' '], "_");
    let id = match key.as_str() {
        "maize" | "corn" | "grain_maize" => "maize",
        "soybean" | "soybeans" | "soy" => "soybean",
        "wheat" | "winter_wheat" | "wheat_(winter)" => "wheat",
        "barley" | "spring_barley" | "winter_barley" => "barley",
        "sorghum" | "grain_sorghum" | "milo" => "sorghum",
        "sunflower" => "sunflower",
        "pea" | "peas" | "field_pea" => "pea",
        "millet" | "proso_millet" | "pearl_millet" => "millet",
        "fallow" | "bare_fallow" => "fallow",
        _ => return Err(EngineError::UnknownCrop(raw.to_string())),
    };
    Ok(id)
}

/// Human readable crop name as used in `rotationLabel` (lower case).
pub fn display_name(id: &str) -> &str {
    match id {
        "wheat" => "winter wheat",
        other => other,
    }
}

/// Default (price $/t, cost $/ha, required equipment) when neither the options nor the farm pack set them.
fn economics(id: &str) -> (f64, f64, &'static [&'static str]) {
    match id {
        "maize" => (190.0, 950.0, &["row_planter", "corn_header"]),
        "soybean" => (420.0, 620.0, &["row_planter"]),
        "wheat" => (230.0, 700.0, &["grain_drill"]),
        "barley" => (200.0, 600.0, &["grain_drill"]),
        "sorghum" => (175.0, 580.0, &["row_planter"]),
        "sunflower" => (430.0, 540.0, &["row_planter", "sunflower_header"]),
        "pea" => (300.0, 500.0, &["grain_drill"]),
        "millet" => (260.0, 340.0, &["grain_drill"]),
        _ => (0.0, 60.0, &[]),
    }
}

/// Upper bound on season length (days after sowing) for non-winter crops.
fn max_season_days(id: &str) -> usize {
    match id {
        "maize" => 175,
        "soybean" => 160,
        "barley" => 140,
        "sorghum" => 160,
        "sunflower" => 160,
        "pea" => 125,
        "millet" => 125,
        _ => 150,
    }
}

/// Flat per-crop parameters consumed by `season.rs` (derived from `crops.json`).
#[derive(Debug, Clone)]
pub struct SeasonCrop {
    pub id: &'static str,
    pub family: String,
    pub legume: bool,
    pub winter: bool,
    pub t_base: f64,
    pub t_upper: f64,
    pub gdd_maturity: f64,
    pub sow_temp: f64,
    pub sow_start_doy: usize,
    pub sow_end_doy: usize,
    pub max_season_days: usize,
    pub kc_ini: f64,
    pub kc_mid: f64,
    pub kc_end: f64,
    pub init_root_m: f64,
    pub max_root_depth_m: f64,
    pub depletion_p: f64,
    pub ky: [f64; 4],
    pub heat_flower_threshold_c: f64,
    pub heat_flower_slope: f64,
    pub extreme_heat_threshold_c: f64,
    pub extreme_heat_slope: f64,
    pub frost_kill_c: f64,
    pub attainable_yield_t_ha: f64,
    pub rusle_c: f64,
    pub residue_ratio: f64,
    pub root_shoot_ratio: f64,
    pub default_price_usd_t: f64,
    pub default_cost_usd_ha: f64,
    pub equipment: &'static [&'static str],
}

static SEASON_CROPS: Lazy<Result<HashMap<&'static str, SeasonCrop>, String>> = Lazy::new(|| {
    let lib = CropLibrary::load().map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    for id in CROP_IDS {
        let c = lib
            .crops
            .iter()
            .find(|c| c.id == id)
            .ok_or_else(|| format!("crops.json is missing crop {id}"))?;
        let (price, cost, equipment) = economics(id);
        let heat_span = (c.flower_heat_max - c.flower_heat_threshold).max(2.0);
        map.insert(
            id,
            SeasonCrop {
                id,
                family: c.family.clone(),
                legume: c.legume,
                winter: c.is_winter,
                t_base: c.t_base,
                t_upper: c.t_upper,
                gdd_maturity: c.gdd_maturity,
                sow_temp: c.sow_temp,
                sow_start_doy: c.sow_window[0] as usize,
                sow_end_doy: c.sow_window[1] as usize,
                max_season_days: max_season_days(id),
                kc_ini: c.kc.ini,
                kc_mid: c.kc.mid,
                kc_end: c.kc.end,
                init_root_m: if c.is_winter {
                    c.root_depth_ini.max(0.35)
                } else {
                    c.root_depth_ini.max(0.15)
                },
                max_root_depth_m: c.root_depth_max,
                depletion_p: c.depletion_p,
                ky: [
                    c.stage_ky.veg,
                    c.stage_ky.flower,
                    c.stage_ky.fill,
                    c.stage_ky.ripen,
                ],
                heat_flower_threshold_c: c.flower_heat_threshold,
                heat_flower_slope: 0.3 / heat_span,
                extreme_heat_threshold_c: c.extreme_heat_threshold,
                extreme_heat_slope: c.extreme_heat_slope,
                frost_kill_c: c.frost_limit,
                attainable_yield_t_ha: c.attainable_yield,
                rusle_c: c.rusle_c,
                residue_ratio: c.residue_ratio,
                root_shoot_ratio: c.root_shoot_ratio,
                default_price_usd_t: price,
                default_cost_usd_ha: cost,
                equipment,
            },
        );
    }
    Ok(map)
});

/// Looks up the flat season parameters for a crop id (aliases accepted, unknown ids are errors).
pub fn season_crop(crop_id: &str) -> Result<&'static SeasonCrop, EngineError> {
    let id = canonical_id(crop_id)?;
    let map = SEASON_CROPS
        .as_ref()
        .map_err(|e| EngineError::Data(e.clone()))?;
    map.get(id)
        .ok_or_else(|| EngineError::UnknownCrop(crop_id.to_string()))
}

/// Equipment still missing for `crop_id` given the owned list (empty `owned` = no filter).
/// Soybean / sorghum accept either a row planter or a grain drill.
pub fn missing_equipment(crop_id: &str, owned: &[String]) -> Vec<String> {
    let Ok(id) = canonical_id(crop_id) else {
        return Vec::new();
    };
    if owned.is_empty() {
        return Vec::new();
    }
    let has = |e: &str| owned.iter().any(|o| o.eq_ignore_ascii_case(e));
    let mut out = Vec::new();
    match id {
        "soybean" | "sorghum" => {
            if !has("row_planter") && !has("grain_drill") {
                out.push("row_planter".to_string());
            }
        }
        _ => {
            for e in economics(id).2 {
                if !has(e) {
                    out.push((*e).to_string());
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_library_parses_and_covers_all_crops() {
        let lib = CropLibrary::load().expect("library");
        assert!(lib.crops.len() >= 9);
        for id in CROP_IDS {
            assert!(season_crop(id).is_ok(), "{id}");
        }
    }

    #[test]
    fn unknown_crop_is_an_error_not_maize() {
        assert!(matches!(
            season_crop("quinoa"),
            Err(EngineError::UnknownCrop(_))
        ));
        assert_eq!(canonical_id("Corn").ok(), Some("maize"));
        assert_eq!(canonical_id("winter wheat").ok(), Some("wheat"));
    }
}
