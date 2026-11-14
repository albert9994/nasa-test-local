pub mod optimize;
pub mod quant;
pub mod rules;
pub mod score;
pub mod stress;

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

// ============================================================================
// C1 · Farm Pack & Layer Contracts
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FarmMeta {
    #[serde(default = "default_farm_id")]
    pub id: String,
    #[serde(default = "default_farm_name")]
    pub name: String,
    #[serde(default)]
    pub lat: f64,
    #[serde(default)]
    pub lon: f64,
    #[serde(default)]
    pub elev: f64,
    #[serde(default = "default_slope")]
    pub slope: f64,
    #[serde(default)]
    pub rotation: Vec<String>,
    #[serde(default)]
    pub note: String,
    #[serde(default = "default_crop_pool")]
    pub crop_pool: Vec<String>,
    #[serde(default)]
    pub costs: BTreeMap<String, f64>,
    #[serde(default)]
    pub prices: BTreeMap<String, f64>,
    #[serde(default)]
    pub calib: BTreeMap<String, f64>,
    #[serde(default)]
    pub sources: BTreeMap<String, String>,
}

fn default_farm_id() -> String {
    "iowa".to_string()
}

fn default_farm_name() -> String {
    "Story County, Iowa (USA)".to_string()
}

fn default_slope() -> f64 {
    2.0
}

pub fn default_crop_pool() -> Vec<String> {
    vec![
        "maize".to_string(),
        "soybean".to_string(),
        "wheat".to_string(),
        "sorghum".to_string(),
        "sunflower".to_string(),
        "pea".to_string(),
        "barley".to_string(),
        "millet".to_string(),
        "fallow".to_string(),
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DailyWeatherYear {
    #[serde(default)]
    pub tmax: Vec<f64>,
    #[serde(default)]
    pub tmin: Vec<f64>,
    #[serde(default)]
    pub prcp: Vec<f64>,
    #[serde(default)]
    pub gwet: Vec<f64>,
    #[serde(default)]
    pub rad: Vec<f64>,
    #[serde(default)]
    pub rh: Vec<f64>,
    #[serde(default)]
    pub wind: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SoilDepthValue {
    #[serde(default)]
    pub mean: f64,
}

pub type SoilPropertyMap = BTreeMap<String, SoilDepthValue>;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SoilLayer {
    #[serde(default)]
    pub sand: SoilPropertyMap,
    #[serde(default)]
    pub clay: SoilPropertyMap,
    #[serde(default)]
    pub silt: SoilPropertyMap,
    #[serde(default)]
    pub soc: SoilPropertyMap,
    #[serde(default)]
    pub bdod: SoilPropertyMap,
    #[serde(default)]
    pub phh2o: SoilPropertyMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScenarioHorizon {
    #[serde(rename = "dT", default)]
    pub d_t: f64,
    #[serde(rename = "dT_p10", default)]
    pub d_t_p10: f64,
    #[serde(rename = "dT_p90", default)]
    pub d_t_p90: f64,
    #[serde(rename = "dP", default)]
    pub d_p: f64,
    #[serde(rename = "dP_p10", default)]
    pub d_p_p10: f64,
    #[serde(rename = "dP_p90", default)]
    pub d_p_p90: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScenarioPoint {
    pub year: i32,
    #[serde(rename = "dT", default)]
    pub d_t: f64,
    #[serde(rename = "dP", default)]
    pub d_p: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SspScenario {
    #[serde(rename = "2050", default)]
    pub horizon_2050: Option<ScenarioHorizon>,
    #[serde(default)]
    pub series: Vec<ScenarioPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioLayer {
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub models: Vec<String>,
    #[serde(default)]
    pub season: String,
    #[serde(default)]
    pub ssp245: Option<SspScenario>,
    #[serde(default)]
    pub ssp585: Option<SspScenario>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FarmPack {
    #[serde(default)]
    pub meta: FarmMeta,
    #[serde(default)]
    pub weather: BTreeMap<String, DailyWeatherYear>,
    #[serde(default)]
    pub soil: Option<SoilLayer>,
    #[serde(default)]
    pub ndvi: Option<BTreeMap<String, Vec<(u16, Option<f64>)>>>,
    #[serde(default)]
    pub scenarios: Option<ScenarioLayer>,
}

// ============================================================================
// C2 · Rotation, Options, Priorities & Constraints
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationStep {
    pub crop: String,
    #[serde(default)]
    pub cover: bool,
}

impl RotationStep {
    pub fn new(crop: impl Into<String>, cover: bool) -> Self {
        Self {
            crop: crop.into(),
            cover,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimOpts {
    #[serde(rename = "dT", default)]
    pub d_t: f64,
    #[serde(rename = "dP", default)]
    pub d_p: f64,
    #[serde(default)]
    pub sow_shift: i32,
    #[serde(default = "default_one")]
    pub maturity: f64,
    #[serde(default)]
    pub irrig_cap: f64,
    #[serde(default = "default_one")]
    pub field_factor: f64,
    #[serde(default)]
    pub fail_net: f64,
    #[serde(default = "default_fail_share")]
    pub fail_share: f64,
    #[serde(default)]
    pub prices: BTreeMap<String, f64>,
    #[serde(default)]
    pub costs: BTreeMap<String, f64>,
}

fn default_one() -> f64 {
    1.0
}

fn default_fail_share() -> f64 {
    0.20
}

impl Default for SimOpts {
    fn default() -> Self {
        Self {
            d_t: 0.0,
            d_p: 0.0,
            sow_shift: 0,
            maturity: 1.0,
            irrig_cap: 0.0,
            field_factor: 1.0,
            fail_net: 0.0,
            fail_share: 0.20,
            prices: BTreeMap::new(),
            costs: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriorityWeights {
    #[serde(default = "default_weight_three")]
    pub profit: f64,
    #[serde(default = "default_weight_three")]
    pub stability: f64,
    #[serde(default = "default_weight_two")]
    pub soil: f64,
    #[serde(default = "default_one")]
    pub water: f64,
}

fn default_weight_three() -> f64 {
    3.0
}

fn default_weight_two() -> f64 {
    2.0
}

impl Default for PriorityWeights {
    fn default() -> Self {
        Self {
            profit: 3.0,
            stability: 3.0,
            soil: 2.0,
            water: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Constraints {
    #[serde(default)]
    pub max_cost_per_ha: Option<f64>,
    #[serde(default)]
    pub max_investment: Option<f64>,
    #[serde(default)]
    pub equipment: Vec<String>,
    #[serde(default)]
    pub sellable: Vec<String>,
}

// ============================================================================
// C3 · Simulation Results & Prepared Farm Handle
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SeasonFactors {
    pub water: f64,
    pub heat: f64,
    pub frost: f64,
    pub duration: f64,
    pub rotation: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SeasonTrace {
    pub idx: Vec<u16>,
    pub fill: Vec<f64>,
    pub ks: Vec<f64>,
    pub tmax: Vec<f64>,
    pub stage: Vec<u8>,
    pub heat: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SeasonResult {
    pub crop: String,
    pub year: i32,
    pub sow: u16,
    pub harvest: u16,
    #[serde(rename = "yield")]
    pub yield_t_ha: f64,
    pub net: f64,
    pub matured: bool,
    pub eta: f64,
    pub etp: f64,
    pub irr: f64,
    pub rain: f64,
    pub runoff: f64,
    pub drain: f64,
    pub stress_days: u16,
    pub factors: SeasonFactors,
    pub trace: Option<SeasonTrace>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RotationResult {
    pub years: Vec<i32>,
    pub farm_net: Vec<f64>,
    pub mean_net: f64,
    pub min_net: f64,
    pub worst_year: i32,
    pub p_fail: f64,
    pub fails: usize,
    pub yield_by_crop: BTreeMap<String, f64>,
    pub soil_score: f64,
    pub soc_change_pct: f64,
    pub erosion: f64,
    pub water_use: f64,
    pub traced: Option<SeasonResult>,
}

#[derive(Debug, Clone)]
pub struct AnnualClimateSummary {
    pub year: i32,
    pub growing_mean_t: f64,
    pub growing_rain_mm: f64,
    pub extreme_heat_days: u16,
    pub flowering_tmax: f64,
    pub frost_days: u16,
}

#[derive(Debug, Clone)]
pub struct Farm {
    pub pack: FarmPack,
    pub years: Vec<i32>,
    pub annual_climate: BTreeMap<i32, AnnualClimateSummary>,
    pub soil_awc_mm: f64,
    pub soil_soc_g_kg: f64,
    pub soil_ph: f64,
}

#[derive(Debug, Clone)]
pub struct CropSpec {
    pub id: &'static str,
    pub family: &'static str,
    pub is_legume: bool,
    pub attainable_yield_t_ha: f64,
    pub default_price_per_t: f64,
    pub default_cost_per_ha: f64,
    pub optimal_rain_mm: f64,
    pub drought_sensitivity: f64,
    pub heat_threshold_c: f64,
    pub heat_sensitivity: f64,
    pub water_need_mm: f64,
    pub rusle_c: f64,
    pub carbon_input_factor: f64,
    pub required_equipment: &'static [&'static str],
    pub sow_doy: u16,
    pub harvest_doy: u16,
}

pub fn get_crop_spec(crop_id: &str) -> CropSpec {
    match crop_id.trim().to_lowercase().as_str() {
        "maize" | "corn" => CropSpec {
            id: "maize",
            family: "poaceae",
            is_legume: false,
            attainable_yield_t_ha: 11.5,
            default_price_per_t: 190.0,
            default_cost_per_ha: 950.0,
            optimal_rain_mm: 520.0,
            drought_sensitivity: 0.95,
            heat_threshold_c: 32.0,
            heat_sensitivity: 0.085,
            water_need_mm: 540.0,
            rusle_c: 0.38,
            carbon_input_factor: 0.05,
            required_equipment: &["row_planter", "corn_header"],
            sow_doy: 115,
            harvest_doy: 280,
        },
        "soybean" | "soy" => CropSpec {
            id: "soybean",
            family: "fabaceae",
            is_legume: true,
            attainable_yield_t_ha: 3.8,
            default_price_per_t: 410.0,
            default_cost_per_ha: 620.0,
            optimal_rain_mm: 480.0,
            drought_sensitivity: 0.80,
            heat_threshold_c: 33.0,
            heat_sensitivity: 0.065,
            water_need_mm: 460.0,
            rusle_c: 0.42,
            carbon_input_factor: 0.12,
            required_equipment: &["row_planter"],
            sow_doy: 130,
            harvest_doy: 270,
        },
        "wheat" | "winter_wheat" | "wheat (winter)" => CropSpec {
            id: "wheat",
            family: "poaceae",
            is_legume: false,
            attainable_yield_t_ha: 6.2,
            default_price_per_t: 230.0,
            default_cost_per_ha: 580.0,
            optimal_rain_mm: 400.0,
            drought_sensitivity: 0.52,
            heat_threshold_c: 31.0,
            heat_sensitivity: 0.045,
            water_need_mm: 390.0,
            rusle_c: 0.18,
            carbon_input_factor: 0.18,
            required_equipment: &["grain_drill"],
            sow_doy: 285,
            harvest_doy: 190,
        },
        "barley" => CropSpec {
            id: "barley",
            family: "poaceae",
            is_legume: false,
            attainable_yield_t_ha: 5.6,
            default_price_per_t: 205.0,
            default_cost_per_ha: 520.0,
            optimal_rain_mm: 370.0,
            drought_sensitivity: 0.48,
            heat_threshold_c: 31.0,
            heat_sensitivity: 0.042,
            water_need_mm: 360.0,
            rusle_c: 0.17,
            carbon_input_factor: 0.16,
            required_equipment: &["grain_drill"],
            sow_doy: 85,
            harvest_doy: 195,
        },
        "sorghum" => CropSpec {
            id: "sorghum",
            family: "poaceae",
            is_legume: false,
            attainable_yield_t_ha: 7.4,
            default_price_per_t: 185.0,
            default_cost_per_ha: 560.0,
            optimal_rain_mm: 360.0,
            drought_sensitivity: 0.42,
            heat_threshold_c: 36.0,
            heat_sensitivity: 0.035,
            water_need_mm: 370.0,
            rusle_c: 0.30,
            carbon_input_factor: 0.15,
            required_equipment: &["row_planter"],
            sow_doy: 135,
            harvest_doy: 275,
        },
        "sunflower" => CropSpec {
            id: "sunflower",
            family: "asteraceae",
            is_legume: false,
            attainable_yield_t_ha: 3.2,
            default_price_per_t: 440.0,
            default_cost_per_ha: 590.0,
            optimal_rain_mm: 410.0,
            drought_sensitivity: 0.62,
            heat_threshold_c: 34.0,
            heat_sensitivity: 0.055,
            water_need_mm: 410.0,
            rusle_c: 0.36,
            carbon_input_factor: 0.04,
            required_equipment: &["row_planter", "sunflower_header"],
            sow_doy: 105,
            harvest_doy: 260,
        },
        "pea" => CropSpec {
            id: "pea",
            family: "fabaceae",
            is_legume: true,
            attainable_yield_t_ha: 3.1,
            default_price_per_t: 310.0,
            default_cost_per_ha: 460.0,
            optimal_rain_mm: 360.0,
            drought_sensitivity: 0.58,
            heat_threshold_c: 30.0,
            heat_sensitivity: 0.050,
            water_need_mm: 340.0,
            rusle_c: 0.26,
            carbon_input_factor: 0.22,
            required_equipment: &["grain_drill"],
            sow_doy: 80,
            harvest_doy: 185,
        },
        "millet" => CropSpec {
            id: "millet",
            family: "poaceae",
            is_legume: false,
            attainable_yield_t_ha: 3.6,
            default_price_per_t: 220.0,
            default_cost_per_ha: 390.0,
            optimal_rain_mm: 310.0,
            drought_sensitivity: 0.36,
            heat_threshold_c: 36.5,
            heat_sensitivity: 0.030,
            water_need_mm: 300.0,
            rusle_c: 0.24,
            carbon_input_factor: 0.14,
            required_equipment: &["grain_drill"],
            sow_doy: 140,
            harvest_doy: 245,
        },
        _ => CropSpec {
            id: "fallow",
            family: "fallow",
            is_legume: false,
            attainable_yield_t_ha: 0.0,
            default_price_per_t: 0.0,
            default_cost_per_ha: 90.0,
            optimal_rain_mm: 250.0,
            drought_sensitivity: 0.10,
            heat_threshold_c: 40.0,
            heat_sensitivity: 0.010,
            water_need_mm: 120.0,
            rusle_c: 0.22,
            carbon_input_factor: 0.08,
            required_equipment: &[],
            sow_doy: 1,
            harvest_doy: 365,
        },
    }
}

/// Prepares a `Farm` handle from a C1 `FarmPack`.
/// If daily weather is absent (e.g. minimal mock pack), synthesizes 24 historical years (2002..=2025)
/// including realistic drought years (2007, 2012, 2022, 2024) so all downstream modules work reliably.
pub fn prepare_farm(pack: FarmPack) -> Farm {
    let mut annual_climate = BTreeMap::new();
    let mut years = Vec::new();

    if !pack.weather.is_empty() {
        for (yr_str, wy) in &pack.weather {
            if let Ok(year) = yr_str.parse::<i32>() {
                years.push(year);
                let summary = summarize_daily_weather(year, wy);
                annual_climate.insert(year, summary);
            }
        }
        years.sort_unstable();
    }

    if years.is_empty() {
        for year in 2002..=2025 {
            years.push(year);
            annual_climate.insert(year, synthesize_annual_climate(year, &pack.meta.id));
        }
    }

    let (soil_awc_mm, soil_soc_g_kg, soil_ph) = extract_soil_metrics(pack.soil.as_ref());

    Farm {
        pack,
        years,
        annual_climate,
        soil_awc_mm,
        soil_soc_g_kg,
        soil_ph,
    }
}

fn summarize_daily_weather(year: i32, wy: &DailyWeatherYear) -> AnnualClimateSummary {
    let n = wy.tmax.len().min(wy.tmin.len()).min(wy.prcp.len());
    if n == 0 {
        return synthesize_annual_climate(year, "iowa");
    }
    let start = 90.min(n - 1);
    let end = 275.min(n);
    let span = (end - start).max(1) as f64;

    let mut sum_t = 0.0;
    let mut sum_rain = 0.0;
    let mut extreme_heat_days = 0u16;
    let mut flowering_tmax = 28.0_f64;
    let mut frost_days = 0u16;

    for i in start..end {
        let tmax = wy.tmax[i];
        let tmin = wy.tmin[i];
        let prcp = wy.prcp[i].max(0.0);
        sum_t += 0.5 * (tmax + tmin);
        sum_rain += prcp;
        if tmax > 33.0 {
            extreme_heat_days += 1;
        }
        if (175..=210).contains(&i) && tmax > flowering_tmax {
            flowering_tmax = tmax;
        }
        if (110..=260).contains(&i) && tmin < 0.0 {
            frost_days += 1;
        }
    }

    AnnualClimateSummary {
        year,
        growing_mean_t: sum_t / span,
        growing_rain_mm: sum_rain,
        extreme_heat_days,
        flowering_tmax,
        frost_days,
    }
}

fn synthesize_annual_climate(year: i32, farm_id: &str) -> AnnualClimateSummary {
    let is_ro = farm_id.contains("baragan") || farm_id.contains("ro") || farm_id.contains("cluj");
    let base_t = if is_ro { 20.2 } else { 19.6 };
    let base_rain = if is_ro { 440.0 } else { 510.0 };

    // Deterministic year-to-year climate variability + historical droughts (2007, 2012, 2022, 2024)
    let phase = ((year * 37 + 13) % 19) as f64 / 19.0 - 0.5;
    let (drought_t, drought_rain_mult, extra_heat) = match year {
        2012 => (2.6, 0.52, 16),
        2007 => (2.3, 0.56, 14),
        2022 => (1.9, 0.64, 11),
        2024 => (2.2, 0.60, 13),
        2003 | 2018 => (1.4, 0.74, 8),
        _ => (
            phase * 1.6,
            (1.0 - phase * 0.32).clamp(0.72, 1.28),
            (phase.max(0.0) * 8.0) as u16,
        ),
    };

    let growing_mean_t = base_t + drought_t;
    let growing_rain_mm = (base_rain * drought_rain_mult).max(120.0);
    let extreme_heat_days = 4 + extra_heat;
    let flowering_tmax = 30.5 + drought_t * 1.4;

    AnnualClimateSummary {
        year,
        growing_mean_t,
        growing_rain_mm,
        extreme_heat_days,
        flowering_tmax,
        frost_days: if year % 11 == 0 { 1 } else { 0 },
    }
}

fn extract_soil_metrics(soil: Option<&SoilLayer>) -> (f64, f64, f64) {
    if let Some(s) = soil {
        let clay = s
            .clay
            .get("0-5cm")
            .or_else(|| s.clay.values().next())
            .map(|v| v.mean)
            .unwrap_or(24.0);
        let sand = s
            .sand
            .get("0-5cm")
            .or_else(|| s.sand.values().next())
            .map(|v| v.mean)
            .unwrap_or(22.0);
        let soc = s
            .soc
            .get("0-5cm")
            .or_else(|| s.soc.values().next())
            .map(|v| v.mean)
            .unwrap_or(18.0);
        let ph = s
            .phh2o
            .get("0-5cm")
            .or_else(|| s.phh2o.values().next())
            .map(|v| v.mean)
            .unwrap_or(6.5);
        // Saxton & Rawls approximate plant-available water capacity (mm in top 1m)
        let awc = (165.0 - 0.8 * sand + 0.4 * clay + 1.1 * soc).clamp(90.0, 240.0);
        (awc, soc.max(5.0), if ph > 14.0 { ph / 10.0 } else { ph })
    } else {
        // Default silt loam per C1 contract
        (165.0, 18.0, 6.5)
    }
}

/// Resolves crop price ($/t or €/t) from `opts.prices`, then `farm.pack.meta.prices`, then `CropSpec`.
pub fn resolve_crop_price(farm: &Farm, opts: &SimOpts, crop_id: &str) -> f64 {
    let spec = get_crop_spec(crop_id);
    opts.prices
        .get(crop_id)
        .or_else(|| opts.prices.get(spec.id))
        .or_else(|| farm.pack.meta.prices.get(crop_id))
        .or_else(|| farm.pack.meta.prices.get(spec.id))
        .copied()
        .unwrap_or(spec.default_price_per_t)
}

/// Resolves crop input cost ($/ha or €/ha) from `opts.costs`, then `farm.pack.meta.costs`, then `CropSpec`.
pub fn resolve_crop_cost(farm: &Farm, opts: &SimOpts, crop_id: &str, has_cover: bool) -> f64 {
    let spec = get_crop_spec(crop_id);
    let base = opts
        .costs
        .get(crop_id)
        .or_else(|| opts.costs.get(spec.id))
        .or_else(|| farm.pack.meta.costs.get(crop_id))
        .or_else(|| farm.pack.meta.costs.get(spec.id))
        .copied()
        .unwrap_or(spec.default_cost_per_ha);
    base + if has_cover { 45.0 } else { 0.0 }
}

/// Simulates a single crop season for a given year and climate/management options (Contract C3).
pub fn simulate_season(
    farm: &Farm,
    crop_id: &str,
    year: i32,
    opts: &SimOpts,
    trace: bool,
) -> SeasonResult {
    simulate_season_with_carry(farm, crop_id, year, opts, 1.0, 0.0, false, trace)
}

#[allow(clippy::too_many_arguments)]
pub fn simulate_season_with_carry(
    farm: &Farm,
    crop_id: &str,
    year: i32,
    opts: &SimOpts,
    rotation_factor: f64,
    legume_n_cost_credit: f64,
    has_cover: bool,
    trace: bool,
) -> SeasonResult {
    let spec = get_crop_spec(crop_id);
    let clim = farm
        .annual_climate
        .get(&year)
        .cloned()
        .unwrap_or_else(|| synthesize_annual_climate(year, &farm.pack.meta.id));

    let effective_t = clim.growing_mean_t + opts.d_t;
    let effective_rain = (clim.growing_rain_mm * (1.0 + opts.d_p)).max(20.0);
    let irr = opts.irrig_cap.max(0.0);

    // Soil water storage + cover crop moisture retention bonus
    let cover_water_bonus = if has_cover { 18.0 } else { 0.0 };
    let soil_buffer = (farm.soil_awc_mm - 140.0) * 0.45 + cover_water_bonus;
    let available_water = (effective_rain * 0.82 + irr + soil_buffer.max(0.0)).max(30.0);

    // Evaporative demand rises ~4.5% per °C warming
    let etp = spec.water_need_mm * (1.0 + 0.045 * opts.d_t).max(0.75);
    let eta = available_water.min(etp);

    let water_ratio = (eta / etp.max(1.0)).clamp(0.0, 1.08);
    let water_factor = (1.0 - spec.drought_sensitivity * (1.0 - water_ratio).max(0.0))
        .powf(1.25)
        .clamp(0.08, 1.05);

    // Flowering + extreme degree-day heat stress (Schlenker & Roberts 2009 style)
    let sow_temp_adj = -(opts.sow_shift as f64) * 0.035;
    let flowering_t = clim.flowering_tmax + opts.d_t + sow_temp_adj;
    let excess_heat = (flowering_t - spec.heat_threshold_c).max(0.0)
        + 0.35 * (effective_t - (spec.heat_threshold_c - 9.5)).max(0.0);
    let heat_factor = (-spec.heat_sensitivity * excess_heat)
        .exp()
        .clamp(0.10, 1.0);

    let frost_factor = if clim.frost_days > 0 && opts.d_t < 1.0 {
        0.93
    } else {
        1.0
    };

    let duration_factor = (1.0 - (opts.maturity - 1.0).abs() * 0.15).clamp(0.80, 1.03);
    let calib = farm
        .pack
        .meta
        .calib
        .get(spec.id)
        .copied()
        .unwrap_or(1.0)
        * opts.field_factor;

    let yield_t_ha = if spec.id == "fallow" {
        0.0
    } else {
        (spec.attainable_yield_t_ha
            * water_factor
            * heat_factor
            * frost_factor
            * duration_factor
            * rotation_factor
            * calib)
            .max(0.0)
    };

    let price = resolve_crop_price(farm, opts, spec.id);
    let cost = (resolve_crop_cost(farm, opts, spec.id, has_cover) - legume_n_cost_credit
        + irr * 0.45)
        .max(40.0);
    let net = yield_t_ha * price - cost;

    let stress_days = (((1.0 - water_factor) * 45.0) + ((1.0 - heat_factor) * 35.0)).round() as u16;
    let runoff = (effective_rain * 0.09 * (1.0 + farm.pack.meta.slope * 0.04)).max(0.0);
    let drain = (available_water - eta).max(0.0);

    let trace_data = if trace {
        Some(SeasonTrace {
            idx: (100..=260).step_by(16).collect(),
            fill: (0..=10)
                .map(|k| (water_factor * (1.0 - 0.04 * (k as f64 - 5.0).abs())).clamp(0.05, 1.0))
                .collect(),
            ks: vec![water_factor; 11],
            tmax: vec![flowering_t; 11],
            stage: vec![0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 3],
            heat: spec.heat_threshold_c,
        })
    } else {
        None
    };

    SeasonResult {
        crop: spec.id.to_string(),
        year,
        sow: (spec.sow_doy as i32 + opts.sow_shift).clamp(1, 365) as u16,
        harvest: spec.harvest_doy,
        yield_t_ha,
        net,
        matured: duration_factor >= 0.85,
        eta,
        etp,
        irr,
        rain: effective_rain,
        runoff,
        drain,
        stress_days,
        factors: SeasonFactors {
            water: water_factor,
            heat: heat_factor,
            frost: frost_factor,
            duration: duration_factor,
            rotation: rotation_factor,
        },
        trace: trace_data,
    }
}

/// Simulates a multi-crop rotation across all historical years (phases × years, Contract C3).
pub fn simulate_rotation(
    farm: &Farm,
    rotation: &[RotationStep],
    opts: &SimOpts,
    trace_year: Option<i32>,
) -> RotationResult {
    let steps: Vec<RotationStep> = if rotation.is_empty() {
        vec![RotationStep::new("maize", false)]
    } else {
        rotation.to_vec()
    };

    let n_phases = steps.len();
    let mut farm_net = Vec::with_capacity(farm.years.len());
    let mut yield_sums: BTreeMap<String, (f64, usize)> = BTreeMap::new();
    let mut total_water_use = 0.0;
    let mut total_seasons = 0usize;
    let mut traced: Option<SeasonResult> = None;

    for (yr_idx, &year) in farm.years.iter().enumerate() {
        let mut year_net_sum = 0.0;

        // Every rotation phase is grown on 1/n_phases of the farm each year
        for phase in 0..n_phases {
            let cur_idx = (yr_idx + phase) % n_phases;
            let prev_idx = (cur_idx + n_phases - 1) % n_phases;
            let cur_step = &steps[cur_idx];
            let prev_step = &steps[prev_idx];

            let cur_spec = get_crop_spec(&cur_step.crop);
            let prev_spec = get_crop_spec(&prev_step.crop);

            // Carry-over effects (Moldo M3 rules)
            let mut rot_factor = 1.0;
            let mut n_credit = 0.0;

            if n_phases > 1 && cur_spec.id == prev_spec.id && cur_spec.id != "fallow" {
                rot_factor -= 0.13; // Continuous same-crop yield penalty
            } else if n_phases == 1 && cur_spec.id != "fallow" {
                rot_factor -= 0.12; // Monoculture penalty
            } else if cur_spec.family == prev_spec.family && cur_spec.id != "fallow" {
                rot_factor -= 0.05; // Same botanical family penalty
            }

            if prev_spec.is_legume && !cur_spec.is_legume && cur_spec.id != "fallow" {
                rot_factor += 0.07; // Legume N + break boost
                n_credit = 55.0; // Fertilizer savings $/ha
            }

            if prev_spec.id == "fallow" && cur_spec.id != "fallow" {
                rot_factor += 0.08; // Stored fallow moisture boost
            }

            if prev_step.cover {
                rot_factor += 0.03; // Rye cover soil structure benefit
            }

            let want_trace = trace_year == Some(year) && phase == 0;
            let season = simulate_season_with_carry(
                farm,
                cur_spec.id,
                year,
                opts,
                rot_factor,
                n_credit,
                cur_step.cover,
                want_trace,
            );

            if want_trace {
                traced = Some(season.clone());
            }

            year_net_sum += season.net;
            total_water_use += season.eta;
            total_seasons += 1;

            let entry = yield_sums.entry(cur_spec.id.to_string()).or_insert((0.0, 0));
            entry.0 += season.yield_t_ha;
            entry.1 += 1;
        }

        farm_net.push(year_net_sum / (n_phases as f64));
    }

    let n_years = farm_net.len().max(1);
    let mean_net = farm_net.iter().sum::<f64>() / (n_years as f64);

    let mut min_net = f64::INFINITY;
    let mut worst_year = *farm.years.first().unwrap_or(&2012);
    let mut fails = 0usize;

    for (&yr, &net) in farm.years.iter().zip(farm_net.iter()) {
        if net < min_net {
            min_net = net;
            worst_year = yr;
        }
        if net < opts.fail_net {
            fails += 1;
        }
    }
    if !min_net.is_finite() {
        min_net = 0.0;
    }

    let p_fail = (fails as f64) / (n_years as f64);
    let yield_by_crop = yield_sums
        .into_iter()
        .map(|(k, (sum, cnt))| (k, sum / (cnt.max(1) as f64)))
        .collect();

    let (soil_score, soc_change_pct, erosion) = compute_soil_health_metrics(farm, &steps, opts);
    let water_use = total_water_use / (total_seasons.max(1) as f64);

    RotationResult {
        years: farm.years.clone(),
        farm_net,
        mean_net,
        min_net,
        worst_year,
        p_fail,
        fails,
        yield_by_crop,
        soil_score,
        soc_change_pct,
        erosion,
        water_use,
        traced,
    }
}

/// Computes `soilScore` (0..100), `socChangePct` (%/yr), and RUSLE `erosion` (t/ha/yr) for a rotation.
pub fn compute_soil_health_metrics(
    farm: &Farm,
    steps: &[RotationStep],
    opts: &SimOpts,
) -> (f64, f64, f64) {
    let n = steps.len().max(1) as f64;
    let mut sum_c_factor = 0.0;
    let mut sum_carbon_in = 0.0;
    let mut legume_count = 0usize;
    let mut cover_count = 0usize;
    let mut unique_families = std::collections::BTreeSet::new();

    for s in steps {
        let spec = get_crop_spec(&s.crop);
        let c_adj = if s.cover {
            spec.rusle_c * 0.58
        } else {
            spec.rusle_c
        };
        sum_c_factor += c_adj;
        sum_carbon_in += spec.carbon_input_factor + if s.cover { 0.32 } else { 0.0 };
        if spec.is_legume {
            legume_count += 1;
        }
        if s.cover {
            cover_count += 1;
        }
        unique_families.insert(spec.family);
    }

    let mean_c = sum_c_factor / n;
    let mean_carbon_in = sum_carbon_in / n;

    // Temperature accelerates mineralization decay
    let decay = 0.16 * (1.0 + 0.04 * opts.d_t.max(0.0));
    let soc_change_pct = ((mean_carbon_in - decay) * 2.2).clamp(-1.5, 1.8);

    // Simplified RUSLE: R * K * LS * C
    let slope = farm.pack.meta.slope.max(0.5);
    let ls_factor = 0.18 + 0.14 * slope + 0.012 * slope * slope;
    let erosion = (11.5 * ls_factor * mean_c * (1.0 + 0.5 * opts.d_p.max(-0.5))).clamp(0.1, 25.0);

    let diversity_bonus = ((unique_families.len() as f64) - 1.0).max(0.0) * 11.0
        + ((steps.len().min(3) as f64) - 1.0).max(0.0) * 6.0;
    let cover_bonus = (cover_count as f64 / n) * 22.0;
    let legume_bonus = (legume_count as f64 / n) * 14.0;
    let erosion_penalty = (erosion * 3.8).min(35.0);
    let soc_bonus = (soc_change_pct * 18.0).clamp(-18.0, 20.0);

    let soil_score =
        (48.0 + diversity_bonus + cover_bonus + legume_bonus + soc_bonus - erosion_penalty)
            .clamp(5.0, 99.0);

    (
        (soil_score * 10.0).round() / 10.0,
        (soc_change_pct * 100.0).round() / 100.0,
        (erosion * 100.0).round() / 100.0,
    )
}
