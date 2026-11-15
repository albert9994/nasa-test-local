//! Hotar core engine (contracts C1, C2, C3, C10, C12).
//!
//! One crate, three front-ends: `hotar-wasm` (browser / Tauri), `hotar-server` (Axum) and the tests.
//! All numbers are `f64`; all JSON is camelCase and matches `apps/web/lib/engine/types.ts` exactly.

pub mod climate;
pub mod co2;
pub mod crops;
pub mod et0;
pub mod explain;
pub mod optimize;
pub mod quant;
pub mod rotation;
pub mod rules;
pub mod score;
pub mod season;
pub mod soil;
pub mod soil_health;
pub mod stress;
pub mod validate;

/// Structured, language-neutral companion of an engine-produced English reason string: a stable `code` plus its
/// variables (camelCase keys, flattened next to `code`). The UI renders it through i18n and falls back to the English text.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ReasonCode {
    pub code: String,
    #[serde(flatten)]
    pub vars: std::collections::BTreeMap<String, serde_json::Value>,
}

impl ReasonCode {
    pub fn new(code: &str, vars: &[(&str, serde_json::Value)]) -> Self {
        Self {
            code: code.to_string(),
            vars: vars
                .iter()
                .map(|(k, v)| ((*k).to_string(), v.clone()))
                .collect(),
        }
    }
}

use climate::{month_of, MonthlyShift};
use crops::{canonical_id, season_crop, SeasonCrop};
use serde::{Deserialize, Serialize};
use soil::{RawSoilLayer, SoilProfile};
use std::collections::{BTreeMap, HashMap};

/// Errors surfaced by the engine. The engine never panics on user input.
#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("unknown crop id: {0}")]
    UnknownCrop(String),
    #[error("rotation is empty")]
    EmptyRotation,
    #[error("farm pack has no usable daily weather (need >= 60 days per year)")]
    NoWeather,
    #[error("no weather for year {0}")]
    UnknownYear(i32),
    #[error("invalid data: {0}")]
    Data(String),
}

pub type Result<T> = std::result::Result<T, EngineError>;

// ============================================================================
// C2 · rotation, options, weights, constraints
// ============================================================================

/// C2 rotation step (`{ crop: "maize", cover: false }`).
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

/// C2 simulation options (`opts`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimOptions {
    /// Warming added to daily Tmax/Tmin, °C.
    #[serde(default, rename = "dT")]
    pub d_t: f64,
    /// Rain change as a fraction (-0.2 = 20 % less rain).
    #[serde(default, rename = "dP")]
    pub d_p: f64,
    #[serde(default)]
    pub sow_shift: i32,
    #[serde(default = "one")]
    pub maturity: f64,
    #[serde(default)]
    pub irrig_cap: f64,
    #[serde(default = "one")]
    pub field_factor: f64,
    /// A year is "bad" when the farm net is below this ($/ha).
    #[serde(default)]
    pub fail_net: f64,
    /// Tolerated share of bad years.
    #[serde(default = "default_fail_share")]
    pub fail_share: f64,
    #[serde(default)]
    pub prices: HashMap<String, f64>,
    #[serde(default)]
    pub costs: HashMap<String, f64>,
    /// Atmospheric CO2 in ppm (default: today, 420 = no fertilisation effect). See `co2.rs`.
    #[serde(default, rename = "co2ppm")]
    pub co2_ppm: Option<f64>,
    /// Extra calendar-month shifts on top of `dT` / `dP` (CMIP6 monthly deltas). See `climate.rs`.
    #[serde(default)]
    pub monthly: Option<MonthlyShift>,
    /// Scenario the caller is exploring (`"ssp245"` / `"ssp585"`): selects the pack's monthly shape and CO2 pathway.
    #[serde(default)]
    pub ssp: Option<String>,
}

fn one() -> f64 {
    1.0
}
fn default_fail_share() -> f64 {
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
            co2_ppm: None,
            monthly: None,
            ssp: None,
        }
    }
}

impl SimOptions {
    /// Temperature shift (°C) of calendar month `m` (0..=11): uniform `dT` plus the monthly delta.
    #[inline]
    pub fn d_t_month(&self, m: usize) -> f64 {
        self.d_t + self.monthly.as_ref().map_or(0.0, |s| s.d_t[m])
    }

    /// Rain multiplier of calendar month `m`: `(1 + dP) * (1 + monthly dP)`, never negative.
    #[inline]
    pub fn p_mult_month(&self, m: usize) -> f64 {
        ((1.0 + self.d_p) * (1.0 + self.monthly.as_ref().map_or(0.0, |s| s.d_p[m]))).max(0.0)
    }

    /// CO2 concentration in ppm used by the crop model.
    #[inline]
    pub fn co2(&self) -> f64 {
        self.co2_ppm.unwrap_or(co2::CO2_REFERENCE_PPM)
    }

    /// Same options with the monthly shape replaced (uniform `dT` / `dP` are kept).
    pub fn with_monthly(&self, shape: Option<MonthlyShift>) -> SimOptions {
        let mut o = self.clone();
        o.monthly = shape;
        o
    }

    /// Composes an additional climate shift on top of the options: temperatures add, rain multiplies.
    pub fn shifted(&self, d_t: f64, d_p: f64) -> SimOptions {
        let mut o = self.clone();
        o.d_t += d_t;
        o.d_p = (1.0 + self.d_p) * (1.0 + d_p) - 1.0;
        o
    }
}

/// C2 priority weights.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Weights {
    #[serde(default = "three")]
    pub profit: f64,
    #[serde(default = "three")]
    pub stability: f64,
    #[serde(default = "two")]
    pub soil: f64,
    #[serde(default = "one")]
    pub water: f64,
}

fn three() -> f64 {
    3.0
}
fn two() -> f64 {
    2.0
}

impl Default for Weights {
    fn default() -> Self {
        Self {
            profit: 3.0,
            stability: 3.0,
            soil: 2.0,
            water: 1.0,
        }
    }
}

/// C3 optimizer constraints.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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

/// `{ year, dT, dP }` point of a CMIP6 trajectory (C1 `scenarios.*.series`, C3 `marginYear.path`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ScenarioPoint {
    pub year: i32,
    #[serde(rename = "dT", default)]
    pub d_t: f64,
    #[serde(rename = "dP", default)]
    pub d_p: f64,
}

// ============================================================================
// C1 · farm pack
// ============================================================================

/// C1 `meta`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FarmMeta {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
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
    #[serde(default)]
    pub crop_pool: Vec<String>,
    #[serde(default)]
    pub costs: HashMap<String, f64>,
    #[serde(default)]
    pub prices: HashMap<String, f64>,
    #[serde(default)]
    pub calib: HashMap<String, f64>,
    #[serde(default)]
    pub sources: BTreeMap<String, String>,
    /// ISO country code when known (read by the CAP rule).
    #[serde(default)]
    pub country: Option<String>,
    /// GRACE-FO terrestrial water storage trend, cm LWE/yr (read by the groundwater rule).
    #[serde(default)]
    pub grace_trend_cm_yr: Option<f64>,
}

fn default_slope() -> f64 {
    2.0
}

impl Default for FarmMeta {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            lat: 0.0,
            lon: 0.0,
            elev: 0.0,
            slope: default_slope(),
            rotation: Vec::new(),
            note: String::new(),
            crop_pool: Vec::new(),
            costs: HashMap::new(),
            prices: HashMap::new(),
            calib: HashMap::new(),
            sources: BTreeMap::new(),
            country: None,
            grace_trend_cm_yr: None,
        }
    }
}

/// Daily weather arrays of one calendar year in a C1 pack.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RawWeatherYear {
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

/// Raw C1 farm pack. Only `meta` and `weather` are required; soil, NDVI and scenarios sharpen results when present.
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
}

/// One day of weather. `rh` / `wind` are NaN when the pack has no such series.
#[derive(Debug, Clone, Copy)]
pub struct DayWeather {
    pub tmax: f64,
    pub tmin: f64,
    pub prcp: f64,
    pub rad: f64,
    pub rh: f64,
    pub wind: f64,
}

/// Sanitized daily weather for one year (365 / 366 days, all vectors the same length).
///
/// `rh` / `wind` are empty when the pack carries none (the simulator then falls back to Hargreaves ET0).
/// `head` holds the first days of the *next* calendar year (southern hemisphere only), so a season that
/// starts in October can run into the following March.
#[derive(Debug, Clone)]
pub struct WeatherYear {
    pub year: i32,
    pub tmax: Vec<f64>,
    pub tmin: Vec<f64>,
    pub prcp: Vec<f64>,
    pub gwet: Vec<f64>,
    pub rad: Vec<f64>,
    pub rh: Vec<f64>,
    pub wind: Vec<f64>,
    pub head: Vec<DayWeather>,
}

/// Days of the following year appended to southern-hemisphere years.
const HEAD_DAYS: usize = 300;

impl WeatherYear {
    #[inline]
    pub fn days(&self) -> usize {
        self.tmax.len()
    }

    /// Days available to a season: the year plus the continuation into the next year (if any).
    #[inline]
    pub fn span_days(&self) -> usize {
        self.tmax.len() + self.head.len()
    }

    #[inline]
    pub fn is_leap(&self) -> bool {
        self.days() >= 366
    }

    /// Weather of 0-based season day `d` (`d >= days()` reads the next year's head).
    #[inline]
    pub fn day(&self, d: usize) -> DayWeather {
        let n = self.tmax.len();
        if d < n {
            DayWeather {
                tmax: self.tmax[d],
                tmin: self.tmin[d],
                prcp: self.prcp[d],
                rad: self.rad[d],
                rh: self.rh.get(d).copied().unwrap_or(f64::NAN),
                wind: self.wind.get(d).copied().unwrap_or(f64::NAN),
            }
        } else {
            self.head[(d - n).min(self.head.len().saturating_sub(1))]
        }
    }

    /// Calendar month 0..=11 of 0-based season day `d` (days past the year end continue in the next year).
    #[inline]
    pub fn month(&self, d: usize) -> usize {
        let n = self.days();
        if d < n {
            month_of(d, self.is_leap())
        } else {
            month_of(d - n, false)
        }
    }

    /// Off-season precipitation (Jan–Mar + Oct–Dec), mm.
    pub fn off_season_precip_mm(&self) -> f64 {
        let n = self.prcp.len();
        let early: f64 = self.prcp.iter().take(85.min(n)).sum();
        let late: f64 = if n > 275 {
            self.prcp[275..].iter().sum()
        } else {
            0.0
        };
        early + late
    }

    /// Off-season precipitation after the caller's rain shifts (uniform `dP` and monthly deltas).
    pub fn off_season_precip_shifted(&self, opts: &SimOptions) -> f64 {
        let n = self.prcp.len();
        (0..n)
            .filter(|&d| !(85..275).contains(&d))
            .map(|d| self.prcp[d] * opts.p_mult_month(self.month(d)))
            .sum()
    }

    /// Mean of the daily ET0 over the whole year with FAO-56 Penman-Monteith (Hargreaves when RH/wind are missing).
    pub fn mean_et0(&self, lat: f64, elev: f64) -> f64 {
        let n = self.days().max(1);
        (0..self.days())
            .map(|d| {
                let w = self.day(d);
                et0::et0_day(w.tmax, w.tmin, w.rad, w.rh, w.wind, lat, elev, d + 1)
            })
            .sum::<f64>()
            / n as f64
    }
}

/// A farm prepared once (`prepareFarm`) and then reused by every call.
#[derive(Debug, Clone)]
pub struct PreparedFarm {
    pub meta: FarmMeta,
    pub soil: SoilProfile,
    pub years: Vec<i32>,
    pub weather_by_year: HashMap<i32, WeatherYear>,
    pub mean_gwet: f64,
    pub has_ndvi: bool,
    pub has_scenarios: bool,
    pub scenarios_raw: Option<serde_json::Value>,
}

/// Replaces `-999` / non-finite values with the previous day and pads to `len`.
fn sanitize_series(raw: &[f64], len: usize, default_val: f64) -> Vec<f64> {
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

/// Like `sanitize_series` for optional channels: empty when the pack has no valid value at all, otherwise
/// invalid days take the previous valid value and everything is clamped to `[lo, hi]`.
fn sanitize_optional(raw: &[f64], len: usize, lo: f64, hi: f64) -> Vec<f64> {
    let valid = |v: f64| v.is_finite() && v > -900.0;
    let Some(first) = raw.iter().copied().find(|&v| valid(v)) else {
        return Vec::new();
    };
    if raw.len() < len {
        return Vec::new();
    }
    let mut prev = first;
    raw.iter()
        .take(len)
        .map(|&v| {
            if valid(v) {
                prev = v;
            }
            prev.clamp(lo, hi)
        })
        .collect()
}

/// Parses and prepares a pack once. Fails (rather than inventing weather) when the pack has no real daily data.
pub fn prepare_farm(pack: FarmPack) -> Result<PreparedFarm> {
    let soil = SoilProfile::from_raw(pack.soil.as_ref(), pack.meta.slope);
    let mut years = Vec::new();
    let mut weather_by_year = HashMap::new();
    let (mut gwet_sum, mut gwet_cnt) = (0.0_f64, 0.0_f64);

    for (yr_str, rwy) in &pack.weather {
        let Ok(yr) = yr_str.trim().parse::<i32>() else {
            continue;
        };
        let n = rwy.tmax.len().min(rwy.tmin.len()).min(rwy.prcp.len());
        if n < 60 {
            continue;
        }
        let tmax = sanitize_series(&rwy.tmax, n, 20.0);
        let tmin = sanitize_series(&rwy.tmin, n, 8.0);
        let prcp: Vec<f64> = sanitize_series(&rwy.prcp, n, 0.0)
            .into_iter()
            .map(|p| p.max(0.0))
            .collect();
        let gwet: Vec<f64> = sanitize_series(&rwy.gwet, n, 0.62)
            .into_iter()
            .map(|g| g.clamp(0.05, 1.0))
            .collect();
        let rad: Vec<f64> = sanitize_series(&rwy.rad, n, 16.5)
            .into_iter()
            .map(|r| r.clamp(1.0, 38.0))
            .collect();
        for &g in &gwet {
            gwet_sum += g;
            gwet_cnt += 1.0;
        }
        let rh = sanitize_optional(&rwy.rh, n, 5.0, 100.0);
        let wind = sanitize_optional(&rwy.wind, n, 0.0, 40.0);
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
                head: Vec::new(),
            },
        );
    }
    if years.is_empty() {
        return Err(EngineError::NoWeather);
    }
    years.sort_unstable();

    // southern hemisphere: a season sown in spring (Sep-Nov) ends in the next calendar year
    if pack.meta.lat < 0.0 {
        let heads: Vec<(i32, Vec<DayWeather>)> = years
            .iter()
            .filter_map(|y| {
                let next = weather_by_year.get(&(y + 1))?;
                let k = HEAD_DAYS.min(next.days());
                Some((*y, (0..k).map(|d| next.day(d)).collect()))
            })
            .collect();
        for (y, h) in heads {
            if let Some(w) = weather_by_year.get_mut(&y) {
                w.head = h;
            }
        }
    }

    // the last season of a southern pack has no continuation: drop it rather than simulate a truncated season
    if pack.meta.lat < 0.0 && years.len() > 1 {
        if let Some(&last) = years.last() {
            if weather_by_year
                .get(&last)
                .is_some_and(|w| w.head.is_empty())
            {
                weather_by_year.remove(&last);
                years.pop();
            }
        }
    }

    let mut meta = pack.meta;
    if meta.name.is_empty() {
        meta.name = meta.id.clone();
    }
    Ok(PreparedFarm {
        meta,
        soil,
        years,
        weather_by_year,
        mean_gwet: if gwet_cnt > 0.0 {
            gwet_sum / gwet_cnt
        } else {
            0.62
        },
        has_ndvi: pack.ndvi.is_some(),
        has_scenarios: pack.scenarios.is_some(),
        scenarios_raw: pack.scenarios,
    })
}

/// Parses a pack from JSON text and prepares it.
pub fn prepare_farm_json(json: &str) -> Result<PreparedFarm> {
    let pack: FarmPack =
        serde_json::from_str(json).map_err(|e| EngineError::Data(format!("farm pack: {e}")))?;
    prepare_farm(pack)
}

/// CMIP6 decadal fallback used when a pack carries no scenario series.
pub fn default_cmip6_series() -> Vec<ScenarioPoint> {
    [
        (2030, 0.9, -0.01),
        (2040, 1.4, -0.03),
        (2050, 2.0, -0.04),
        (2060, 2.4, -0.05),
        (2070, 2.8, -0.06),
        (2080, 3.1, -0.07),
        (2090, 3.4, -0.08),
    ]
    .iter()
    .map(|&(year, d_t, d_p)| ScenarioPoint { year, d_t, d_p })
    .collect()
}

impl PreparedFarm {
    #[inline]
    pub fn weather(&self, year: i32) -> Result<&WeatherYear> {
        self.weather_by_year
            .get(&year)
            .ok_or(EngineError::UnknownYear(year))
    }

    /// Spring (days 60–130) groundwater-wetness anomaly of a year vs the farm mean.
    pub fn year_mean_gwet_anomaly(&self, wy: &WeatherYear) -> f64 {
        let lo = 60.min(wy.gwet.len());
        let hi = 130.min(wy.gwet.len());
        let slice = &wy.gwet[lo..hi];
        if slice.is_empty() {
            return 0.0;
        }
        let mean = slice.iter().sum::<f64>() / slice.len() as f64;
        (mean - self.mean_gwet).clamp(-0.35, 0.35)
    }

    pub fn crop_price(&self, crop: &SeasonCrop, opts: &SimOptions) -> f64 {
        opts.prices
            .get(crop.id)
            .or_else(|| self.meta.prices.get(crop.id))
            .copied()
            .unwrap_or(crop.default_price_usd_t)
    }

    pub fn crop_cost(&self, crop: &SeasonCrop, opts: &SimOptions) -> f64 {
        opts.costs
            .get(crop.id)
            .or_else(|| self.meta.costs.get(crop.id))
            .copied()
            .unwrap_or(crop.default_cost_usd_ha)
    }

    pub fn crop_calib(&self, crop: &SeasonCrop) -> f64 {
        self.meta
            .calib
            .get(crop.id)
            .copied()
            .unwrap_or(1.0)
            .clamp(0.4, 2.2)
    }

    pub fn mean_annual_precip_mm(&self) -> f64 {
        let sum: f64 = self
            .years
            .iter()
            .filter_map(|y| self.weather_by_year.get(y))
            .map(|w| w.prcp.iter().sum::<f64>())
            .sum();
        sum / self.years.len().max(1) as f64
    }

    pub fn mean_annual_temp_c(&self) -> f64 {
        let (mut t, mut n) = (0.0, 0.0);
        for w in self.weather_by_year.values() {
            for i in 0..w.days() {
                t += 0.5 * (w.tmax[i] + w.tmin[i]);
                n += 1.0;
            }
        }
        if n > 0.0 {
            t / n
        } else {
            11.0
        }
    }

    /// The CMIP6 trajectory of the pack for `ssp` (`"ssp245"` / `"ssp585"`), or the decadal default.
    pub fn scenario_series(&self, ssp: &str) -> Vec<ScenarioPoint> {
        let parsed: Vec<ScenarioPoint> = self
            .scenarios_raw
            .as_ref()
            .and_then(|sc| sc.get(ssp))
            .and_then(|o| o.get("series"))
            .and_then(|s| s.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| serde_json::from_value(v.clone()).ok())
                    .collect()
            })
            .unwrap_or_default();
        if parsed.is_empty() {
            default_cmip6_series()
        } else {
            parsed
        }
    }

    fn ssp_node(&self, ssp: &str) -> Option<&serde_json::Value> {
        self.scenarios_raw.as_ref()?.get(ssp)
    }

    /// The pack's monthly ΔT / ΔP pattern for `ssp` (C4 `monthly`), when present.
    pub fn scenario_monthly(&self, ssp: &str) -> Option<MonthlyShift> {
        MonthlyShift::from_json(self.ssp_node(ssp)?.get("monthly")?)
    }

    /// Per-model CMIP6 trajectories of `ssp` (`perModel`). A model with only a 2050 anchor follows the ensemble
    /// series scaled to its anchor. Empty when the pack carries no per-model deltas.
    pub fn scenario_models(&self, ssp: &str) -> Vec<climate::ModelTrajectory> {
        let Some(node) = self.ssp_node(ssp) else {
            return Vec::new();
        };
        let Some(models) = node.get("perModel").and_then(|m| m.as_object()) else {
            return Vec::new();
        };
        let ens = self.scenario_series(ssp);
        let ens50 = climate_at(&ens, 2050);
        let mut out = Vec::new();
        for (name, v) in models {
            let own: Vec<ScenarioPoint> = v
                .get("series")
                .and_then(|s| s.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|p| serde_json::from_value(p.clone()).ok())
                        .collect()
                })
                .unwrap_or_default();
            let series = if own.len() >= 2 {
                own
            } else if let Some(dt) = v.get("dT").and_then(|x| x.as_f64()) {
                let dp = v.get("dP").and_then(|x| x.as_f64()).unwrap_or(0.0);
                let kt = if ens50.0.abs() > 0.05 {
                    dt / ens50.0
                } else {
                    1.0
                };
                let kp = if ens50.1.abs() > 0.004 {
                    dp / ens50.1
                } else {
                    1.0
                };
                ens.iter()
                    .map(|p| ScenarioPoint {
                        year: p.year,
                        d_t: p.d_t * kt,
                        d_p: p.d_p * kp,
                    })
                    .collect()
            } else {
                continue;
            };
            out.push(climate::ModelTrajectory {
                name: name.clone(),
                series,
                monthly: v.get("monthly").and_then(MonthlyShift::from_json),
            });
        }
        out
    }

    /// `(dT p10, dT p90, dP p10, dP p90)` of the 2050 horizon (inter-model spread), when the pack has it.
    pub fn scenario_spread_2050(&self, ssp: &str) -> Option<(f64, f64, f64, f64)> {
        let h = self.scenarios_raw.as_ref()?.get(ssp)?.get("2050")?;
        let g = |k: &str| h.get(k).and_then(|v| v.as_f64());
        let dt = g("dT")?;
        let dp = g("dP").unwrap_or(0.0);
        Some((
            g("dT_p10").unwrap_or(dt - 0.5),
            g("dT_p90").unwrap_or(dt + 0.6),
            g("dP_p10").unwrap_or(dp - 0.04),
            g("dP_p90").unwrap_or(dp + 0.04),
        ))
    }
}

/// `(dT, dP)` of a trajectory at `year` (linear, anchored at 2020 = no change).
fn climate_at(series: &[ScenarioPoint], year: i32) -> (f64, f64) {
    let p = stress::interp_series(series, year);
    (p.d_t, p.d_p)
}

// ============================================================================
// shared helpers
// ============================================================================

/// A rotation whose crop ids were validated and canonicalised once.
#[derive(Debug, Clone)]
pub struct ResolvedRotation {
    pub steps: Vec<RotationStep>,
    pub crops: Vec<&'static SeasonCrop>,
}

impl ResolvedRotation {
    pub fn new(rotation: &[RotationStep]) -> Result<Self> {
        if rotation.is_empty() {
            return Err(EngineError::EmptyRotation);
        }
        let mut steps = Vec::with_capacity(rotation.len());
        let mut crops = Vec::with_capacity(rotation.len());
        for s in rotation {
            let id = canonical_id(&s.crop)?;
            steps.push(RotationStep::new(id, s.cover));
            crops.push(season_crop(id)?);
        }
        Ok(Self { steps, crops })
    }
}

#[inline]
pub(crate) fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}
#[inline]
pub(crate) fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
#[inline]
pub(crate) fn round3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

/// Maps `f` over `items`, on the rayon pool when the `parallel` feature is on. Output order is preserved.
pub(crate) fn par_map<T, R, F>(items: &[T], f: F) -> Vec<R>
where
    T: Sync,
    R: Send,
    F: Fn(&T) -> R + Sync + Send,
{
    #[cfg(feature = "parallel")]
    {
        use rayon::prelude::*;
        items.par_iter().map(f).collect()
    }
    #[cfg(not(feature = "parallel"))]
    {
        items.iter().map(f).collect()
    }
}

/// `"maize → soybean + rye"`, the label used everywhere (`rotationLabel` in the TS mock).
pub fn rotation_label(rot: &[RotationStep]) -> String {
    rot.iter()
        .map(|s| {
            let name = canonical_id(&s.crop)
                .map(crops::display_name)
                .unwrap_or(&s.crop)
                .to_string();
            if s.cover {
                format!("{name} + rye")
            } else {
                name
            }
        })
        .collect::<Vec<_>>()
        .join(" → ")
}
