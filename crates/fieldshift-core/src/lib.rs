pub mod crops;
pub mod explain;
pub mod optimize;
pub mod quant;
pub mod rotation;
pub mod score;
pub mod season;
pub mod soil;
pub mod soil_health;
pub mod stress;

use crops::{get_crop, normalize_crop_id};
use serde::{Deserialize, Serialize};
use soil::{RawSoilLayer, SoilProfile};
use std::collections::{BTreeMap, HashMap};
use stress::ScenarioPoint;

/// Returns the A1 smoke greeting used to verify the Rust/WASM pipeline.
pub fn hello() -> String {
    "hello from Rust".to_string()
}

/// C2 Rotation step (`{ crop: "maize", cover: false }`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationStep {
    pub crop: String,
    #[serde(default)]
    pub cover: bool,
}

/// C2 Simulation options (`opts`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimOptions {
    #[serde(default, rename = "dT")]
    pub d_t: f32,
    #[serde(default, rename = "dP")]
    pub d_p: f32,
    #[serde(default)]
    pub sow_shift: i32,
    #[serde(default = "default_one")]
    pub maturity: f32,
    #[serde(default)]
    pub irrig_cap: f32,
    #[serde(default = "default_one")]
    pub field_factor: f32,
    #[serde(default)]
    pub fail_net: f32,
    #[serde(default = "default_fail_share")]
    pub fail_share: f32,
    #[serde(default)]
    pub prices: HashMap<String, f32>,
    #[serde(default)]
    pub costs: HashMap<String, f32>,
}

fn default_one() -> f32 {
    1.0
}
fn default_fail_share() -> f32 {
    0.20
}

impl Default for SimOptions {
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
            prices: HashMap::new(),
            costs: HashMap::new(),
        }
    }
}

/// C2 Priority weights (`weights`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriorityWeights {
    #[serde(default = "default_three")]
    pub profit: f32,
    #[serde(default = "default_three")]
    pub stability: f32,
    #[serde(default = "default_two")]
    pub soil: f32,
    #[serde(default = "default_one")]
    pub water: f32,
}

fn default_three() -> f32 {
    3.0
}
fn default_two() -> f32 {
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

/// C3 Optimizer constraints (`constraints`).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationConstraints {
    #[serde(default)]
    pub max_cost_per_ha: Option<f32>,
    #[serde(default)]
    pub max_investment: Option<f32>,
    #[serde(default)]
    pub equipment: Vec<String>,
    #[serde(default)]
    pub sellable: Vec<String>,
}

/// C1 Farm pack metadata (`meta`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FarmMeta {
    #[serde(default = "default_farm_id")]
    pub id: String,
    #[serde(default = "default_farm_name")]
    pub name: String,
    #[serde(default = "default_iowa_lat")]
    pub lat: f32,
    #[serde(default = "default_iowa_lon")]
    pub lon: f32,
    #[serde(default = "default_elev")]
    pub elev: f32,
    #[serde(default = "default_slope")]
    pub slope: f32,
    #[serde(default)]
    pub rotation: Vec<String>,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub crop_pool: Vec<String>,
    #[serde(default)]
    pub costs: HashMap<String, f32>,
    #[serde(default)]
    pub prices: HashMap<String, f32>,
    #[serde(default)]
    pub calib: HashMap<String, f32>,
}

fn default_farm_id() -> String {
    "iowa".to_string()
}
fn default_farm_name() -> String {
    "Story County, Iowa (USA)".to_string()
}
fn default_iowa_lat() -> f32 {
    42.03
}
fn default_iowa_lon() -> f32 {
    -93.62
}
fn default_elev() -> f32 {
    310.0
}
fn default_slope() -> f32 {
    2.0
}

impl Default for FarmMeta {
    fn default() -> Self {
        Self {
            id: default_farm_id(),
            name: default_farm_name(),
            lat: default_iowa_lat(),
            lon: default_iowa_lon(),
            elev: default_elev(),
            slope: default_slope(),
            rotation: vec!["maize".to_string(), "soybean".to_string()],
            note: "Corn Belt; 2012 drought".to_string(),
            crop_pool: vec![
                "maize".to_string(),
                "soybean".to_string(),
                "wheat".to_string(),
                "sorghum".to_string(),
                "pea".to_string(),
                "barley".to_string(),
                "fallow".to_string(),
            ],
            costs: HashMap::new(),
            prices: HashMap::new(),
            calib: HashMap::new(),
        }
    }
}

/// Daily weather arrays for one calendar year in a C1 `FarmPack`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RawWeatherYear {
    #[serde(default)]
    pub tmax: Vec<f32>,
    #[serde(default)]
    pub tmin: Vec<f32>,
    #[serde(default)]
    pub prcp: Vec<f32>,
    #[serde(default)]
    pub gwet: Vec<f32>,
    #[serde(default)]
    pub rad: Vec<f32>,
    #[serde(default)]
    pub rh: Vec<f32>,
    #[serde(default)]
    pub wind: Vec<f32>,
}

/// Raw C1 Farm Pack JSON object.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FarmPack {
    #[serde(default)]
    pub meta: FarmMeta,
    #[serde(default)]
    pub weather: BTreeMap<String, RawWeatherYear>,
    #[serde(default)]
    pub soil: Option<RawSoilLayer>,
    #[serde(default)]
    pub ndvi: Option<serde_json::Value>,
    #[serde(default)]
    pub scenarios: Option<serde_json::Value>,
    #[serde(default)]
    pub smap: Option<serde_json::Value>,
    #[serde(default)]
    pub esi: Option<serde_json::Value>,
}

/// Pre-allocated, sanitized daily weather vectors for a single year (365 or 366 days).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherYear {
    pub year: i32,
    pub tmax: Vec<f32>,
    pub tmin: Vec<f32>,
    pub prcp: Vec<f32>,
    pub gwet: Vec<f32>,
    pub rad: Vec<f32>,
    pub rh: Vec<f32>,
    pub wind: Vec<f32>,
}

impl WeatherYear {
    #[inline]
    pub fn days(&self) -> usize {
        self.tmax.len()
    }

    /// Sum of off-season precipitation (Jan–Mar + Oct–Dec) in mm.
    #[inline]
    pub fn off_season_precip_mm(&self) -> f32 {
        let n = self.prcp.len();
        let early: f32 = self.prcp.iter().take(85.min(n)).sum();
        let late: f32 = if n > 275 {
            self.prcp[275..].iter().sum()
        } else {
            0.0
        };
        early + late
    }
}

/// Prepared, pre-allocated farm representation created once by `prepare_farm(pack)`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedFarm {
    pub meta: FarmMeta,
    pub soil: SoilProfile,
    pub years: Vec<i32>,
    pub weather_by_year: HashMap<i32, WeatherYear>,
    pub mean_gwet: f32,
    pub has_ndvi_layer: bool,
    pub scenarios_raw: Option<serde_json::Value>,
}

impl PreparedFarm {
    #[inline]
    pub fn get_weather_year(&self, year: i32) -> &WeatherYear {
        self.weather_by_year
            .get(&year)
            .or_else(|| self.years.first().and_then(|y| self.weather_by_year.get(y)))
            .expect("PreparedFarm always has at least one weather year")
    }

    #[inline]
    pub fn year_mean_gwet_anomaly(&self, year: i32) -> f32 {
        let wy = self.get_weather_year(year);
        let spring_slice = &wy.gwet[60.min(wy.gwet.len())..130.min(wy.gwet.len())];
        if spring_slice.is_empty() {
            return 0.0;
        }
        let mean = spring_slice.iter().sum::<f32>() / (spring_slice.len() as f32);
        (mean - self.mean_gwet).clamp(-0.35, 0.35)
    }

    #[inline]
    pub fn crop_price(&self, crop_id: &str, opts: &SimOptions) -> f32 {
        let cid = normalize_crop_id(crop_id);
        opts.prices
            .get(cid)
            .or_else(|| opts.prices.get(crop_id))
            .or_else(|| self.meta.prices.get(cid))
            .or_else(|| self.meta.prices.get(crop_id))
            .copied()
            .unwrap_or_else(|| get_crop(cid).default_price_usd_t)
    }

    #[inline]
    pub fn crop_cost(&self, crop_id: &str, opts: &SimOptions) -> f32 {
        let cid = normalize_crop_id(crop_id);
        opts.costs
            .get(cid)
            .or_else(|| opts.costs.get(crop_id))
            .or_else(|| self.meta.costs.get(cid))
            .or_else(|| self.meta.costs.get(crop_id))
            .copied()
            .unwrap_or_else(|| get_crop(cid).default_cost_usd_ha)
    }

    #[inline]
    pub fn crop_calib(&self, crop_id: &str) -> f32 {
        let cid = normalize_crop_id(crop_id);
        self.meta
            .calib
            .get(cid)
            .or_else(|| self.meta.calib.get(crop_id))
            .copied()
            .unwrap_or(1.0)
            .clamp(0.4, 2.2)
    }

    pub fn mean_annual_precip_mm(&self) -> f32 {
        if self.years.is_empty() {
            return 600.0;
        }
        let sum: f32 = self
            .years
            .iter()
            .filter_map(|y| self.weather_by_year.get(y))
            .map(|wy| wy.prcp.iter().sum::<f32>())
            .sum();
        sum / (self.years.len() as f32)
    }

    pub fn mean_annual_temp_c(&self) -> f32 {
        if self.years.is_empty() {
            return 11.0;
        }
        let mut t_sum = 0.0_f32;
        let mut days = 0.0_f32;
        for y in &self.years {
            if let Some(wy) = self.weather_by_year.get(y) {
                for i in 0..wy.days() {
                    t_sum += 0.5 * (wy.tmax[i] + wy.tmin[i]);
                    days += 1.0;
                }
            }
        }
        if days > 0.0 {
            t_sum / days
        } else {
            11.0
        }
    }

    pub fn has_ndvi(&self) -> bool {
        self.has_ndvi_layer
    }

    pub fn scenario_delta_2050(&self, ssp: &str) -> Option<(f32, f32, f32)> {
        let sc = self.scenarios_raw.as_ref()?;
        let ssp_obj = sc.get(ssp)?;
        let y2050 = ssp_obj.get("2050")?;
        let dt = y2050.get("dT")?.as_f64()? as f32;
        let dp = y2050.get("dP")?.as_f64()? as f32;
        let p10 = y2050
            .get("dT_p10")
            .and_then(|v| v.as_f64())
            .map(|v| v as f32)
            .unwrap_or(dt - 0.5);
        let p90 = y2050
            .get("dT_p90")
            .and_then(|v| v.as_f64())
            .map(|v| v as f32)
            .unwrap_or(dt + 0.6);
        let spread = ((p90 - p10) / 2.56).max(0.25);
        Some((dt, dp, spread))
    }

    pub fn scenario_series(&self, ssp: &str) -> Vec<ScenarioPoint> {
        if let Some(sc) = &self.scenarios_raw {
            if let Some(arr) = sc
                .get(ssp)
                .and_then(|o| o.get("series"))
                .and_then(|s| s.as_array())
            {
                let parsed: Vec<ScenarioPoint> = arr
                    .iter()
                    .filter_map(|v| serde_json::from_value(v.clone()).ok())
                    .collect();
                if !parsed.is_empty() {
                    return parsed;
                }
            }
        }
        // Default CMIP6 decadal series when scenario layer is not yet merged
        let is_585 = ssp.eq_ignore_ascii_case("ssp585");
        (2030..=2090)
            .step_by(10)
            .map(|yr| {
                let frac = (yr - 2020) as f32 / 30.0;
                if is_585 {
                    ScenarioPoint {
                        year: yr,
                        d_t: (2.6 * frac * 100.0).round() / 100.0,
                        d_p: (-0.08 * frac * 100.0).round() / 100.0,
                    }
                } else {
                    ScenarioPoint {
                        year: yr,
                        d_t: (1.9 * frac * 100.0).round() / 100.0,
                        d_p: (-0.04 * frac * 100.0).round() / 100.0,
                    }
                }
            })
            .collect()
    }
}

/// Sanitizes a raw daily series (replacing NASA POWER `-999` missing values with previous day's value).
fn sanitize_series(raw: &[f32], len: usize, default_val: f32) -> Vec<f32> {
    let mut out = Vec::with_capacity(len);
    let mut prev = default_val;
    for i in 0..len {
        let v = raw.get(i).copied().unwrap_or(prev);
        let clean = if !v.is_finite() || v <= -900.0 {
            prev
        } else {
            v
        };
        out.push(clean);
        prev = clean;
    }
    out
}

/// Parses and prepares a `FarmPack` once into a high-performance `PreparedFarm` (`fs.prepareFarm(pack)`).
pub fn prepare_farm(pack: FarmPack) -> PreparedFarm {
    let soil = SoilProfile::from_raw(pack.soil.as_ref(), pack.meta.slope);
    let mut years = Vec::new();
    let mut weather_by_year = HashMap::new();
    let mut gwet_sum = 0.0_f32;
    let mut gwet_cnt = 0.0_f32;

    for (yr_str, rwy) in &pack.weather {
        if let Ok(yr) = yr_str.parse::<i32>() {
            let n = rwy.tmax.len().max(rwy.tmin.len()).max(rwy.prcp.len());
            if n < 60 {
                continue;
            }
            let tmax = sanitize_series(&rwy.tmax, n, 20.0);
            let tmin = sanitize_series(&rwy.tmin, n, 8.0);
            let prcp = sanitize_series(&rwy.prcp, n, 0.0)
                .into_iter()
                .map(|p| p.max(0.0))
                .collect::<Vec<_>>();
            let gwet = sanitize_series(&rwy.gwet, n, 0.62)
                .into_iter()
                .map(|g| g.clamp(0.05, 1.0))
                .collect::<Vec<_>>();
            let rad = sanitize_series(&rwy.rad, n, 16.5)
                .into_iter()
                .map(|r| r.clamp(1.0, 38.0))
                .collect::<Vec<_>>();
            let rh = sanitize_series(&rwy.rh, n, 65.0);
            let wind = sanitize_series(&rwy.wind, n, 3.2);

            for &g in &gwet {
                gwet_sum += g;
                gwet_cnt += 1.0;
            }

            years.push(yr);
            weather_by_year.insert(
                yr,
                WeatherYear {
                    year: yr,
                    tmax,
                    tmin,
                    prcp,
                    gwet,
                    rad,
                    rh,
                    wind,
                },
            );
        }
    }

    years.sort_unstable();

    // If weather map was empty, synthesize realistic 24-year agro-climatic series for the farm's coordinates
    if years.is_empty() {
        return builtin_demo_farm(&pack.meta.id);
    }

    let mean_gwet = if gwet_cnt > 0.0 {
        gwet_sum / gwet_cnt
    } else {
        0.62
    };

    PreparedFarm {
        meta: pack.meta,
        soil,
        years,
        weather_by_year,
        mean_gwet,
        has_ndvi_layer: pack.ndvi.is_some(),
        scenarios_raw: pack.scenarios,
    }
}

/// Generates realistic, deterministic 2001–2024 daily weather + soil profiles for the 4 demo farms
/// (`iowa`, `kansas`, `cordoba`, `baragan`) plus Southern Hemisphere (`parana`).
pub fn builtin_demo_farm(farm_id: &str) -> PreparedFarm {
    let id = farm_id.trim().to_ascii_lowercase();
    let (meta, base_temp, temp_amp, annual_rain_mm, drought_years): (
        FarmMeta,
        f32,
        f32,
        f32,
        &[i32],
    ) = match id.as_str() {
        "kansas" => (
            FarmMeta {
                id: "kansas".to_string(),
                name: "Thomas County (Colby), Kansas (USA)".to_string(),
                lat: 39.39,
                lon: -101.05,
                elev: 960.0,
                slope: 1.5,
                rotation: vec![
                    "wheat".to_string(),
                    "sorghum".to_string(),
                    "fallow".to_string(),
                ],
                note: "US High Plains dryland; 2012-2013 & 2022 droughts".to_string(),
                crop_pool: vec![
                    "wheat".to_string(),
                    "sorghum".to_string(),
                    "maize".to_string(),
                    "sunflower".to_string(),
                    "millet".to_string(),
                    "pea".to_string(),
                    "fallow".to_string(),
                ],
                costs: HashMap::new(),
                prices: HashMap::new(),
                calib: HashMap::new(),
            },
            11.8,
            15.5,
            470.0,
            &[2002, 2012, 2013, 2022][..],
        ),
        "cordoba" | "spain" => (
            FarmMeta {
                id: "cordoba".to_string(),
                name: "Campiña de Córdoba, Andalusia (Spain)".to_string(),
                lat: 37.85,
                lon: -4.78,
                elev: 145.0,
                slope: 3.2,
                rotation: vec!["wheat".to_string(), "sunflower".to_string()],
                note: "Mediterranean dryland; extreme summer heatwaves".to_string(),
                crop_pool: vec![
                    "wheat".to_string(),
                    "barley".to_string(),
                    "sunflower".to_string(),
                    "pea".to_string(),
                    "sorghum".to_string(),
                    "fallow".to_string(),
                ],
                costs: HashMap::new(),
                prices: HashMap::new(),
                calib: HashMap::new(),
            },
            17.6,
            11.5,
            515.0,
            &[2005, 2012, 2017, 2022, 2023][..],
        ),
        "baragan" | "romania" | "calarasi" => (
            FarmMeta {
                id: "baragan".to_string(),
                name: "Bărăgan Plain (Călărași), Romania".to_string(),
                lat: 44.55,
                lon: 27.45,
                elev: 48.0,
                slope: 1.2,
                rotation: vec![
                    "maize".to_string(),
                    "wheat".to_string(),
                    "sunflower".to_string(),
                ],
                note: "Home region chernozem; severe 2007, 2020, 2022, 2024 summer droughts"
                    .to_string(),
                crop_pool: vec![
                    "maize".to_string(),
                    "wheat".to_string(),
                    "sunflower".to_string(),
                    "barley".to_string(),
                    "soybean".to_string(),
                    "pea".to_string(),
                    "sorghum".to_string(),
                    "fallow".to_string(),
                ],
                costs: HashMap::new(),
                prices: HashMap::new(),
                calib: HashMap::new(),
            },
            12.6,
            14.2,
            520.0,
            &[2007, 2012, 2020, 2022, 2024][..],
        ),
        "parana" | "brazil" => (
            FarmMeta {
                id: "parana".to_string(),
                name: "Londrina, Paraná (Brazil)".to_string(),
                lat: -23.31,
                lon: -51.16,
                elev: 580.0,
                slope: 3.5,
                rotation: vec!["soybean".to_string(), "maize".to_string()],
                note: "Southern Hemisphere subtropical rain-fed benchmark".to_string(),
                crop_pool: vec![
                    "soybean".to_string(),
                    "maize".to_string(),
                    "wheat".to_string(),
                    "sorghum".to_string(),
                ],
                costs: HashMap::new(),
                prices: HashMap::new(),
                calib: HashMap::new(),
            },
            21.0,
            6.5,
            1150.0,
            &[2021][..],
        ),
        _ => (FarmMeta::default(), 9.2, 13.5, 920.0, &[2012][..]),
    };

    let mut pack = FarmPack {
        meta,
        ..Default::default()
    };

    let is_south = pack.meta.lat < 0.0;
    for year in 2001..=2024 {
        let is_severe_drought = drought_years.contains(&year);
        // Deterministic year-specific anomaly
        let yr_hash =
            ((year.wrapping_mul(1_103_515_245).wrapping_add(12_345)) & 0x7fff) as f32 / 32768.0;
        let yr_temp_anom = if is_severe_drought {
            3.2
        } else {
            (yr_hash - 0.5) * 1.2
        };
        let yr_rain_mult = if is_severe_drought {
            0.40
        } else {
            0.92 + yr_hash * 0.24
        };

        let mut tmax = Vec::with_capacity(365);
        let mut tmin = Vec::with_capacity(365);
        let mut prcp = Vec::with_capacity(365);
        let mut gwet = Vec::with_capacity(365);
        let mut rad = Vec::with_capacity(365);
        let mut rh = Vec::with_capacity(365);
        let mut wind = Vec::with_capacity(365);

        for d in 0..365 {
            let phase_day = if is_south { (d + 182) % 365 } else { d };
            let angle = ((phase_day as f32 - 198.0) / 365.0) * std::f32::consts::TAU;
            let seasonal = angle.cos();

            // Deterministic daily weather wave
            let wave = (((d as i32 * 37 + year * 13) as f32) * 0.23).sin() * 1.6;
            let summer_heat_spike = if is_severe_drought && (180..=222).contains(&phase_day) {
                4.8
            } else {
                0.0
            };

            let tmean = base_temp + temp_amp * seasonal + yr_temp_anom + wave + summer_heat_spike;
            let diurnal = 4.4 + 0.6 * seasonal.max(0.0) + if is_severe_drought { 1.6 } else { 0.0 };
            tmax.push(((tmean + diurnal) * 10.0).round() / 10.0);
            tmin.push(((tmean - diurnal) * 10.0).round() / 10.0);

            // Rain events every ~4-5 days, severely curtailed in July-August during drought years
            let is_rain_day = (d + (year as usize % 5)).is_multiple_of(4)
                || (d + (year as usize % 7)).is_multiple_of(9);
            let summer_drought_cut = if is_severe_drought && (160..=235).contains(&phase_day) {
                0.18
            } else {
                1.0
            };
            let seasonal_rain_weight = 1.0 + 0.50 * seasonal;
            let daily_p = if is_rain_day {
                let raw_p = (annual_rain_mm / 92.0)
                    * yr_rain_mult
                    * seasonal_rain_weight
                    * summer_drought_cut;
                (raw_p * 10.0).round() / 10.0
            } else {
                0.0
            };
            prcp.push(daily_p);

            let gw = if is_severe_drought {
                (0.45 - 0.18 * seasonal.max(0.0)).clamp(0.18, 0.70)
            } else {
                (0.66 - 0.12 * seasonal.max(0.0) + (yr_rain_mult - 1.0) * 0.25).clamp(0.30, 0.90)
            };
            gwet.push((gw * 100.0).round() / 100.0);

            let r = (15.5 + 9.5 * seasonal + if is_severe_drought { 2.0 } else { 0.0 })
                .clamp(3.5, 30.0);
            rad.push((r * 10.0).round() / 10.0);
            rh.push(if is_severe_drought { 48.0 } else { 66.0 });
            wind.push(3.4);
        }

        pack.weather.insert(
            year.to_string(),
            RawWeatherYear {
                tmax,
                tmin,
                prcp,
                gwet,
                rad,
                rh,
                wind,
            },
        );
    }

    prepare_farm(pack)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::explain::{build_fact_sheet, render_template_explanation, verify_numbers_in_text};
    use crate::optimize::{optimize, pick_three};
    use crate::quant::{quant_simulate, QuantSimConfig};
    use crate::rotation::simulate_rotation;
    use crate::score::compute_score;
    use crate::season::simulate_season;
    use crate::stress::{adaptation_margin, frontier};

    #[test]
    fn test_a1_hello() {
        assert_eq!(hello(), "hello from Rust");
    }

    #[test]
    fn test_a7_iowa_season_and_2012_drought() {
        let iowa = builtin_demo_farm("iowa");
        let opts = SimOptions::default();

        let normal_2014 = simulate_season(&iowa, "maize", 2014, &opts, false);
        let drought_2012 = simulate_season(&iowa, "maize", 2012, &opts, true);

        // Normal Iowa maize yield should be believable (8.5 - 13.5 t/ha)
        assert!(
            normal_2014.yield_t_ha >= 8.0 && normal_2014.yield_t_ha <= 14.0,
            "unexpected normal 2014 maize yield: {}",
            normal_2014.yield_t_ha
        );
        // 2012 drought must sharply drop yield and net income compared to normal years
        assert!(
            drought_2012.yield_t_ha < normal_2014.yield_t_ha * 0.65,
            "2012 drought yield ({}) should be well below 2014 ({})",
            drought_2012.yield_t_ha,
            normal_2014.yield_t_ha
        );
        assert!(drought_2012.trace.is_some());
    }

    #[test]
    fn test_a8_rotation_carry_over_and_all_demo_farms() {
        for farm_id in ["iowa", "kansas", "cordoba", "baragan", "parana"] {
            let farm = builtin_demo_farm(farm_id);
            let rot: Vec<RotationStep> = farm
                .meta
                .rotation
                .iter()
                .map(|c| RotationStep {
                    crop: c.clone(),
                    cover: false,
                })
                .collect();
            let opts = SimOptions::default();
            let res = simulate_rotation(&farm, &rot, &opts, None);
            assert_eq!(res.years.len(), 24);
            assert_eq!(res.farm_net.len(), 24);
            assert!(res.traced.is_some());
            if farm_id == "iowa" {
                assert_eq!(
                    res.worst_year, 2012,
                    "Iowa worst year should be 2012 drought"
                );
            }
        }

        // Verify legume N carry-over: soybean -> maize beats continuous maize->maize
        let iowa = builtin_demo_farm("iowa");
        let opts = SimOptions::default();
        let mono_maize = simulate_rotation(
            &iowa,
            &[
                RotationStep {
                    crop: "maize".to_string(),
                    cover: false,
                },
                RotationStep {
                    crop: "maize".to_string(),
                    cover: false,
                },
            ],
            &opts,
            None,
        );
        let soy_maize = simulate_rotation(
            &iowa,
            &[
                RotationStep {
                    crop: "soybean".to_string(),
                    cover: true,
                },
                RotationStep {
                    crop: "maize".to_string(),
                    cover: true,
                },
            ],
            &opts,
            None,
        );
        let mono_y = mono_maize.yield_by_crop.get("maize").unwrap().mean;
        let rot_y = soy_maize.yield_by_crop.get("maize").unwrap().mean;
        assert!(
            rot_y > mono_y,
            "maize after soybean ({}) must exceed continuous maize ({})",
            rot_y,
            mono_y
        );
        assert!(
            soy_maize.soil_score > mono_maize.soil_score,
            "cover crop + legume rotation must have higher soilScore"
        );
    }

    #[test]
    fn test_stress_optimize_quant_score_and_explain() {
        let baragan = builtin_demo_farm("baragan");
        let rot = vec![
            RotationStep {
                crop: "maize".to_string(),
                cover: false,
            },
            RotationStep {
                crop: "wheat".to_string(),
                cover: false,
            },
        ];
        let opts = SimOptions::default();
        let margin = adaptation_margin(&baragan, &rot, &opts);
        assert!(margin.d_t >= 0.0 && margin.d_t <= 6.0);

        let grid = frontier(&baragan, &rot, &opts);
        assert_eq!(grid.d_ts.len(), 11);
        assert_eq!(grid.d_ps.len(), 11);
        assert_eq!(grid.grid.len(), 11);

        let weights = PriorityWeights::default();
        let constraints = RotationConstraints::default();
        let ranked = optimize(&baragan, &[], &opts, &weights, &rot, &constraints);
        assert!(!ranked.is_empty());
        let picks = pick_three(&ranked, &rot);
        assert_eq!(picks.len(), 3);

        // Quant determinism check
        let q_cfg = QuantSimConfig {
            paths: 200,
            ..Default::default()
        };
        let q1 = quant_simulate(&baragan, std::slice::from_ref(&rot), &opts, &q_cfg, None);
        let q2 = quant_simulate(&baragan, std::slice::from_ref(&rot), &opts, &q_cfg, None);
        assert_eq!(q1[0].cvar95, q2[0].cvar95);
        assert_eq!(q1[0].income.p50, q2[0].income.p50);

        // Score C12 check
        let score = compute_score(&baragan, &rot, &opts, &weights, &constraints, None);
        assert!((0..=100).contains(&score.score));
        assert_eq!(score.waterfall.len(), 4);

        // Fact sheet C10 & strict number verification check
        let sheet = build_fact_sheet(&baragan, &rot, &opts, &picks);
        for lang in ["ro", "en"] {
            for mode in ["short", "plan", "chat"] {
                let text = render_template_explanation(&sheet, lang, mode, Some("De ce?"));
                let (valid, used) = verify_numbers_in_text(&sheet, &text);
                assert!(
                    valid,
                    "Template explanation failed number check ({lang}/{mode}): {text}\nused={used:?}"
                );
                assert!(text.contains("planning aid, not a guarantee"));
            }
        }

        // Fabricated number must be rejected by verify_numbers_in_text
        let bad_text = "Yield was 98765.43 t/ha, planning aid, not a guarantee.";
        let (valid_bad, _) = verify_numbers_in_text(&sheet, bad_text);
        assert!(!valid_bad, "Fabricated number should fail verification");
    }
}
