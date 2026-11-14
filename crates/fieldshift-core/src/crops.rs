use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const CROPS_JSON: &str = include_str!("../data/crops.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropParams {
    pub id: String,
    pub name: String,
    pub family: String,
    pub legume: bool,
    pub winter: bool,
    pub t_base: f32,
    pub t_upper: f32,
    pub gdd_maturity: f32,
    pub sow_temp: f32,
    pub sow_start_doy: usize,
    pub sow_end_doy: usize,
    pub max_season_days: usize,
    pub kc_ini: f32,
    pub kc_mid: f32,
    pub kc_end: f32,
    pub max_root_depth_m: f32,
    pub depletion_p: f32,
    pub ky_veg: f32,
    pub ky_flower: f32,
    pub ky_fill: f32,
    pub ky_ripen: f32,
    pub heat_flower_threshold_c: f32,
    pub heat_flower_slope: f32,
    pub extreme_heat_threshold_c: f32,
    pub extreme_heat_slope: f32,
    pub frost_kill_c: f32,
    pub attainable_yield_t_ha: f32,
    pub harvest_index: f32,
    pub rusle_c: f32,
    pub residue_carbon_t_ha: f32,
    pub default_price_usd_t: f32,
    pub default_cost_usd_ha: f32,
    pub equipment: Vec<String>,
    pub source: String,
}

static CROP_LIBRARY: Lazy<HashMap<String, CropParams>> = Lazy::new(|| {
    let list: Vec<CropParams> =
        serde_json::from_str(CROPS_JSON).expect("valid embedded crops.json");
    let mut map = HashMap::with_capacity(list.len());
    for crop in list {
        map.insert(crop.id.clone(), crop);
    }
    map
});

/// Normalizes common crop aliases (e.g. "winter wheat" -> "wheat", "corn" -> "maize").
pub fn normalize_crop_id(raw: &str) -> &str {
    match raw.trim().to_ascii_lowercase().as_str() {
        "winter wheat" | "winter_wheat" | "wheat (winter)" | "wheat" => "wheat",
        "corn" | "grain maize" | "maize" => "maize",
        "soy" | "soybeans" | "soybean" => "soybean",
        "barley" | "spring barley" | "winter barley" => "barley",
        "sorghum" | "grain sorghum" | "milo" => "sorghum",
        "sunflower" => "sunflower",
        "pea" | "peas" | "field pea" => "pea",
        "millet" | "proso millet" | "pearl millet" => "millet",
        "fallow" | "bare fallow" => "fallow",
        "rye" | "winter rye" | "cover" => "rye",
        _ => "maize",
    }
}

pub fn get_crop(crop_id: &str) -> &'static CropParams {
    let canonical = normalize_crop_id(crop_id);
    CROP_LIBRARY
        .get(canonical)
        .or_else(|| CROP_LIBRARY.get("maize"))
        .expect("maize must exist in crop library")
}

pub fn all_crops() -> Vec<&'static CropParams> {
    let order = [
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
    order
        .iter()
        .filter_map(|id| CROP_LIBRARY.get(*id))
        .collect()
}
