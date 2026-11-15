use crate::co2;
use crate::crops::{season_crop, SeasonCrop};
use crate::et0::et0_day;
pub use crate::et0::hargreaves_et0;
use crate::{round1, round2, PreparedFarm, Result, SimOptions, WeatherYear};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonFactors {
    pub water: f64,
    pub heat: f64,
    pub frost: f64,
    pub duration: f64,
    pub rotation: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonTrace {
    /// Day of year (1-based) of every simulated day.
    pub idx: Vec<usize>,
    /// Root-zone fill fraction 0..1.
    pub fill: Vec<f64>,
    /// FAO-56 water-stress coefficient Ks.
    pub ks: Vec<f64>,
    pub tmax: Vec<f64>,
    /// 0 vegetative, 1 flowering, 2 grain fill, 3 ripening.
    pub stage: Vec<u8>,
    /// Flowering heat threshold of the crop, °C.
    pub heat: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonResult {
    pub crop: String,
    pub year: i32,
    pub sow: usize,
    pub harvest: usize,
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
    pub stress_days: u32,
    /// Days above the crop's flowering heat threshold during flowering.
    pub heat_days: u32,
    pub factors: SeasonFactors,
    pub trace: Option<SeasonTrace>,
    #[serde(skip)]
    pub ending_fill_fraction: f64,
    #[serde(skip)]
    pub extreme_heat_days: u32,
    #[serde(skip)]
    pub flowering_drought: bool,
    /// Total cost charged in `net` ($/ha); lets the quant engine re-price a season.
    #[serde(skip)]
    pub cost: f64,
}

/// Carry-over context passed from the rotation layer into `simulate_season_ctx`.
#[derive(Debug, Clone, Copy)]
pub struct CarryOverContext {
    /// Initial soil water fill fraction (0.15..=0.95) at sowing
    pub initial_fill: f64,
    /// Yield multiplier from rotation history (legume N credit, monoculture penalty, diversity)
    pub rotation_factor: f64,
    /// Fertilizer / cover-crop cost adjustment ($/ha, negative = savings from prior legume)
    pub cost_delta_usd_ha: f64,
}

impl Default for CarryOverContext {
    fn default() -> Self {
        Self {
            initial_fill: 0.72,
            rotation_factor: 1.0,
            cost_delta_usd_ha: 0.0,
        }
    }
}

/// Public C3 entry point: one crop season in one calendar year (no rotation history).
pub fn simulate_season(
    farm: &PreparedFarm,
    crop_id: &str,
    year: i32,
    opts: &SimOptions,
    trace: bool,
) -> Result<SeasonResult> {
    let crop = season_crop(crop_id)?;
    let wy = farm.weather(year)?;
    let gwet_nudge = farm.year_mean_gwet_anomaly(wy);
    let ctx = CarryOverContext {
        initial_fill: (0.72 + 0.20 * gwet_nudge).clamp(0.30, 0.92),
        rotation_factor: 1.0,
        cost_delta_usd_ha: 0.0,
    };
    Ok(simulate_season_ctx(farm, crop, wy, opts, trace, ctx))
}

/// Core daily simulation loop (allocation-free when `trace == false`).
pub fn simulate_season_ctx(
    farm: &PreparedFarm,
    crop: &SeasonCrop,
    wy: &WeatherYear,
    opts: &SimOptions,
    trace: bool,
    ctx: CarryOverContext,
) -> SeasonResult {
    let canonical = crop.id;
    let year = wy.year;
    // southern hemisphere: the growing season sits in the second half of the calendar year
    let south_off: usize = if farm.meta.lat < 0.0 { 182 } else { 0 };
    // Handle managed fallow fast path
    if canonical == "fallow" {
        let mut rain_sum = 0.0_f64;
        let mut runoff_sum = 0.0_f64;
        let mut eta_sum = 0.0_f64;
        let mut etp_sum = 0.0_f64;
        let max_taw = farm.soil.taw_mm_per_m * 1.2;
        let mut sw = (ctx.initial_fill * max_taw).clamp(15.0, max_taw);

        let fallow_start = 90 + south_off;
        for d in fallow_start..(240 + south_off).min(wy.span_days()) {
            let w = wy.day(d);
            let m = wy.month(d);
            let dt = opts.d_t_month(m);
            let (tmax, tmin) = (w.tmax + dt, w.tmin + dt);
            let prcp = w.prcp * opts.p_mult_month(m);
            let et0 = et0_day(
                tmax,
                tmin,
                w.rad,
                w.rh,
                w.wind,
                farm.meta.lat,
                farm.meta.elev,
                doy_of(wy, d),
            );
            let etc = et0 * crop.kc_mid;
            let ro = scs_runoff(prcp, farm.soil.cn2);
            let infil = (prcp - ro).max(0.0);
            sw = (sw + infil).min(max_taw);
            let ea = etc.min(sw * 0.35);
            sw = (sw - ea).max(0.0);
            rain_sum += prcp;
            runoff_sum += ro;
            eta_sum += ea;
            etp_sum += etc;
        }
        let cost = farm.crop_cost(crop, opts) + ctx.cost_delta_usd_ha;
        return SeasonResult {
            crop: canonical.to_string(),
            year,
            sow: 90 + south_off,
            harvest: 240 + south_off,
            yield_t_ha: 0.0,
            net: round1(-cost),
            matured: true,
            eta: round1(eta_sum),
            etp: round1(etp_sum),
            irr: 0.0,
            rain: round1(rain_sum),
            runoff: round1(runoff_sum),
            drain: 0.0,
            stress_days: 0,
            heat_days: 0,
            cost,
            factors: SeasonFactors {
                water: 1.0,
                heat: 1.0,
                frost: 1.0,
                duration: 1.0,
                rotation: round2(ctx.rotation_factor),
            },
            trace: if trace {
                Some(SeasonTrace {
                    idx: vec![90 + south_off, 165 + south_off, 240 + south_off],
                    fill: vec![
                        round2(ctx.initial_fill),
                        round2(((sw / max_taw) + ctx.initial_fill) * 0.5),
                        round2((sw / max_taw).clamp(0.1, 0.95)),
                    ],
                    ks: vec![1.0, 1.0, 1.0],
                    tmax: vec![20.0, 26.0, 22.0],
                    stage: vec![0, 1, 3],
                    heat: crop.heat_flower_threshold_c,
                })
            } else {
                None
            },
            ending_fill_fraction: (sw / max_taw).clamp(0.25, 0.90),
            extreme_heat_days: 0,
            flowering_drought: false,
        };
    }

    let southern_shift = south_off as isize;
    let sow_shift = opts.sow_shift as isize + southern_shift;
    let co2_ppm = opts.co2();
    let etc_co2 = co2::etc_factor(canonical, co2_ppm);

    // 1. Determine sowing day-of-year (0-indexed internally, 1-indexed in output). Southern-hemisphere seasons run
    //    past 31 December into the next calendar year (`WeatherYear::head`).
    let n_days = wy.span_days();
    let sow_idx = if crop.winter {
        // Winter crop: autumn sowing is in the previous season; we simulate the active growth after the cold season
        // (late Feb in the north, late Aug in the south) plus the autumn-established water balance.
        let lo = 25 + southern_shift;
        let base_spring_doy = (55 + sow_shift).clamp(lo, 110 + southern_shift) as usize;
        base_spring_doy.min(n_days.saturating_sub(60))
    } else {
        let start_doy = ((crop.sow_start_doy as isize + sow_shift).clamp(15, 340) as usize)
            .min(n_days.saturating_sub(45));
        let end_doy = ((crop.sow_end_doy as isize + sow_shift).clamp(start_doy as isize + 5, 360)
            as usize)
            .min(n_days.saturating_sub(30));

        let mut chosen = end_doy;
        for d in start_doy..=end_doy {
            // 5-day mean temperature check
            let w_start = d.saturating_sub(4);
            let mut t_sum = 0.0_f64;
            let mut count = 0.0_f64;
            for k in w_start..=d {
                let w = wy.day(k);
                let tmean = 0.5 * (w.tmax + w.tmin) + opts.d_t_month(wy.month(k));
                t_sum += tmean;
                count += 1.0;
            }
            if t_sum / count >= crop.sow_temp {
                chosen = d;
                break;
            }
        }
        chosen
    };

    // 2. Initialize FAO-56 root zone + subsoil water store
    let max_root_m = crop.max_root_depth_m.max(0.4);
    let init_root_m = crop.init_root_m.min(max_root_m);
    let taw_per_m = farm.soil.taw_mm_per_m;

    let mut current_root_m = init_root_m;
    let mut root_taw = current_root_m * taw_per_m;
    let mut subsoil_depth_m = (max_root_m - current_root_m).max(0.0);
    let mut subsoil_taw = subsoil_depth_m * taw_per_m;

    let init_fill = ctx.initial_fill.clamp(0.18, 0.95);
    // Depletion in root zone (0 = at field capacity, root_taw = at wilting point)
    let mut dr = root_taw * (1.0 - init_fill);
    // Water stored in subsoil (mm available above wilting point)
    let mut subsoil_water = subsoil_taw * init_fill;

    let maturity_mult = opts.maturity.clamp(0.75, 1.25);
    let target_gdd = if crop.winter {
        // Active spring-to-harvest GDD after vernalization
        crop.gdd_maturity * 0.68 * maturity_mult
    } else {
        crop.gdd_maturity * maturity_mult
    };

    let mut gdd_accum = 0.0_f64;
    let mut irr_remaining = opts.irrig_cap.max(0.0);

    // Stage accumulators: [veg, flower, fill, ripen]
    let mut stage_eta = [0.0_f64; 4];
    let mut stage_etc = [0.0_f64; 4];

    let mut total_eta = 0.0_f64;
    let mut total_etp = 0.0_f64;
    let mut total_irr = 0.0_f64;
    let mut total_rain = 0.0_f64;
    let mut total_runoff = 0.0_f64;
    let mut total_drain = 0.0_f64;
    let mut stress_days = 0_u32;

    let mut flower_heat_excess = 0.0_f64;
    let mut flower_days = 0.0_f64;
    let mut heat_days = 0_u32;
    let mut extreme_degree_days = 0.0_f64;
    let mut extreme_heat_days = 0_u32;
    let mut frost_damage = 0.0_f64;

    let max_days = if crop.winter {
        165
    } else {
        crop.max_season_days
    };
    let end_limit = (sow_idx + max_days).min(n_days.saturating_sub(1));

    let mut trace_idx = Vec::new();
    let mut trace_fill = Vec::new();
    let mut trace_ks = Vec::new();
    let mut trace_tmax = Vec::new();
    let mut trace_stage = Vec::new();
    if trace {
        let cap = end_limit.saturating_sub(sow_idx) + 1;
        trace_idx.reserve(cap);
        trace_fill.reserve(cap);
        trace_ks.reserve(cap);
        trace_tmax.reserve(cap);
        trace_stage.reserve(cap);
    }

    let mut harvest_idx = end_limit;
    let mut matured = false;

    for d in sow_idx..=end_limit {
        let w = wy.day(d);
        let month = wy.month(d);
        let dt = opts.d_t_month(month);
        let tmax = w.tmax + dt;
        let tmin = w.tmin + dt;
        let tmean = 0.5 * (tmax + tmin);
        let prcp = w.prcp * opts.p_mult_month(month);

        // GDD accumulation: max(0, min(Tmean, Tupper) - Tbase)
        let daily_gdd = (tmean.min(crop.t_upper) - crop.t_base).max(0.0);
        gdd_accum += daily_gdd;
        let gdd_frac = (gdd_accum / target_gdd).clamp(0.0, 1.2);

        // Stage classification: 0=veg (<0.45), 1=flower (0.45..0.62), 2=fill (0.62..0.85), 3=ripen (>=0.85)
        let stage: usize = if gdd_frac < 0.45 {
            0
        } else if gdd_frac < 0.62 {
            1
        } else if gdd_frac < 0.85 {
            2
        } else {
            3
        };

        // Expand roots from init_root_m to max_root_m by mid-season (gdd_frac = 0.55)
        let root_progress = (gdd_frac / 0.55).clamp(0.0, 1.0);
        let new_root_m = init_root_m + (max_root_m - init_root_m) * root_progress;
        if new_root_m > current_root_m {
            let delta_m = new_root_m - current_root_m;
            let added_taw = delta_m * taw_per_m;
            // Take up water proportionally from the subsoil store as roots deepen
            let frac_of_subsoil = if subsoil_depth_m > 1e-4 {
                (delta_m / subsoil_depth_m).clamp(0.0, 1.0)
            } else {
                0.0
            };
            let absorbed_water = subsoil_water * frac_of_subsoil;
            subsoil_water = (subsoil_water - absorbed_water).max(0.0);
            subsoil_depth_m = (max_root_m - new_root_m).max(0.0);
            subsoil_taw = subsoil_depth_m * taw_per_m;

            let added_depletion = (added_taw - absorbed_water).max(0.0);
            current_root_m = new_root_m;
            root_taw = current_root_m * taw_per_m;
            dr = (dr + added_depletion).clamp(0.0, root_taw);
        }

        // Crop coefficient Kc interpolation across stages
        let kc = if gdd_frac < 0.20 {
            crop.kc_ini
        } else if gdd_frac < 0.45 {
            let f = (gdd_frac - 0.20) / 0.25;
            crop.kc_ini + f * (crop.kc_mid - crop.kc_ini)
        } else if gdd_frac < 0.80 {
            crop.kc_mid
        } else {
            let f = ((gdd_frac - 0.80) / 0.20).clamp(0.0, 1.0);
            crop.kc_mid + f * (crop.kc_end - crop.kc_mid)
        };

        // Reference ET0: FAO-56 Penman-Monteith from POWER T, RH, wind, radiation (Hargreaves if RH/wind are missing);
        // CO2 closes stomata, which lowers the transpiration demand (co2.rs)
        let et0 = et0_day(
            tmax,
            tmin,
            w.rad,
            w.rh,
            w.wind,
            farm.meta.lat,
            farm.meta.elev,
            doy_of(wy, d),
        );
        let etc = (et0 * kc * etc_co2).max(0.05);

        // Rain -> SCS Curve Number runoff -> infiltration
        let ro = scs_runoff(prcp, farm.soil.cn2);
        let infil = (prcp - ro).max(0.0);
        dr -= infil;

        // If root zone overflows field capacity (dr < 0), percolate into subsoil store
        if dr < 0.0 {
            let percolated = -dr;
            dr = 0.0;
            subsoil_water += percolated;
            if subsoil_water > subsoil_taw {
                let deep_drain = subsoil_water - subsoil_taw;
                subsoil_water = subsoil_taw;
                total_drain += deep_drain;
            }
        }

        // Readily available water threshold (RAW = p * TAW, adjusted slightly for high ETc per FAO-56)
        let p_adj = (crop.depletion_p + 0.04 * (5.0 - etc)).clamp(0.30, 0.75);
        let raw = p_adj * root_taw;

        // Apply supplemental irrigation if enabled and depletion exceeds RAW
        if irr_remaining > 0.0 && dr > raw {
            let needed = (dr - raw * 0.5).min(irr_remaining).min(25.0);
            dr -= needed;
            irr_remaining -= needed;
            total_irr += needed;
        }

        // Water stress coefficient Ks (FAO-56 Eq. 84)
        let ks = if dr <= raw {
            1.0
        } else if root_taw > raw + 1e-3 {
            ((root_taw - dr) / (root_taw - raw)).clamp(0.0, 1.0)
        } else {
            0.0
        };

        let eta = etc * ks;
        dr = (dr + eta).clamp(0.0, root_taw);

        // Capillary/deep root contribution from moist subsoil during stress
        if ks < 0.75 && subsoil_water > 2.0 {
            let upflux = ((1.0 - ks) * 1.6).min(subsoil_water * 0.15);
            dr = (dr - upflux).max(0.0);
            subsoil_water -= upflux;
        }

        if ks < 0.80 {
            stress_days += 1;
        }

        stage_eta[stage] += eta;
        stage_etc[stage] += etc;
        total_eta += eta;
        total_etp += etc;
        total_rain += prcp;
        total_runoff += ro;

        // Acute flowering heat stress & season-long Schlenker-Roberts extreme heat
        if stage == 1 {
            flower_days += 1.0;
            if tmax > crop.heat_flower_threshold_c {
                flower_heat_excess += tmax - crop.heat_flower_threshold_c;
                heat_days += 1;
            }
        }
        // Schlenker-Roberts degree-days are defined on hourly temperature; with daily data the
        // afternoon-weighted mean (Tmax + Tmean) / 2 reproduces their exposure instead of overcounting.
        let t_eff = 0.5 * (tmax + tmean);
        if t_eff > crop.extreme_heat_threshold_c {
            extreme_degree_days += t_eff - crop.extreme_heat_threshold_c;
            extreme_heat_days += 1;
        }

        // Unseasonable frost penalty after emergence
        if gdd_frac > 0.12 && gdd_frac < 0.95 && tmin < crop.frost_kill_c {
            let severity = ((crop.frost_kill_c - tmin) * 0.08).clamp(0.0, 0.55);
            frost_damage = (frost_damage + severity).clamp(0.0, 0.85);
        }

        if trace {
            let fill = (1.0 - dr / root_taw.max(1.0)).clamp(0.0, 1.0);
            trace_idx.push(d + 1);
            trace_fill.push(round2(fill));
            trace_ks.push(round2(ks));
            trace_tmax.push(round1(tmax));
            trace_stage.push(stage as u8);
        }

        if gdd_accum >= target_gdd && (d - sow_idx) >= 55 {
            harvest_idx = d;
            matured = true;
            break;
        }
    }

    // 3. Stage-wise FAO-33 water yield response: Π_s [1 - Ky_s * (1 - ETa_s / ETc_s)]
    let kys = crop.ky;
    let mut f_water = 1.0_f64;
    for s in 0..4 {
        if stage_etc[s] > 1.0 {
            let rel_deficit = (1.0 - stage_eta[s] / stage_etc[s]).clamp(0.0, 1.0);
            let stage_mult = (1.0 - kys[s] * rel_deficit).clamp(0.12, 1.0);
            f_water *= stage_mult;
        }
    }
    f_water = f_water.clamp(0.08, 1.0);

    let flower_rel_eta = if stage_etc[1] > 1.0 {
        stage_eta[1] / stage_etc[1]
    } else {
        1.0
    };
    let flowering_drought = flower_rel_eta < 0.72;

    // 4. Heat factor: acute flowering penalty × season-long Schlenker-Roberts EDD penalty
    let mean_flower_excess = if flower_days > 0.0 {
        flower_heat_excess / flower_days
    } else {
        0.0
    };
    let f_heat_flower = (1.0
        - crop.heat_flower_slope * flower_heat_excess * 0.25
        - crop.heat_flower_slope * mean_flower_excess * 1.4)
        .clamp(0.25, 1.0);
    let f_heat_edd = (-crop.extreme_heat_slope * extreme_degree_days)
        .exp()
        .clamp(0.25, 1.0);
    let f_heat = (f_heat_flower * f_heat_edd).clamp(0.15, 1.0);

    // 5. Frost and season-length (duration) factors
    let f_frost = (1.0 - frost_damage).clamp(0.15, 1.0);
    let final_gdd_frac = (gdd_accum / target_gdd).clamp(0.0, 1.0);
    let f_duration = if matured || final_gdd_frac >= 0.92 {
        1.0
    } else {
        ((final_gdd_frac - 0.45) / 0.47).clamp(0.15, 1.0)
    };

    // 6. Calibration + fieldFactor + rotation multiplier
    let calib = farm.crop_calib(crop) * opts.field_factor.clamp(0.4, 2.0);
    let yield_t_ha = (crop.attainable_yield_t_ha
        * f_water
        * f_heat
        * f_frost
        * f_duration
        * ctx.rotation_factor
        * co2::yield_factor(canonical, co2_ppm)
        * calib)
        .max(0.0);

    // 7. Economics ($/ha)
    let price = farm.crop_price(crop, opts);
    let base_cost = farm.crop_cost(crop, opts);
    let irr_cost = total_irr * 0.45; // pumping cost $/mm
    let total_cost = (base_cost + ctx.cost_delta_usd_ha + irr_cost).max(0.0);
    let net = yield_t_ha * price - total_cost;

    let ending_fill =
        ((root_taw - dr + subsoil_water) / (root_taw + subsoil_taw).max(1.0)).clamp(0.12, 0.95);

    SeasonResult {
        crop: canonical.to_string(),
        year,
        sow: sow_idx + 1,
        harvest: harvest_idx + 1,
        yield_t_ha: round2(yield_t_ha),
        net: round1(net),
        matured,
        eta: round1(total_eta),
        etp: round1(total_etp),
        irr: round1(total_irr),
        rain: round1(total_rain),
        runoff: round1(total_runoff),
        drain: round1(total_drain),
        stress_days,
        heat_days,
        cost: total_cost,
        factors: SeasonFactors {
            water: round2(f_water),
            heat: round2(f_heat),
            frost: round2(f_frost),
            duration: round2(f_duration),
            rotation: round2(ctx.rotation_factor),
        },
        trace: if trace {
            Some(SeasonTrace {
                idx: trace_idx,
                fill: trace_fill,
                ks: trace_ks,
                tmax: trace_tmax,
                stage: trace_stage,
                heat: crop.heat_flower_threshold_c,
            })
        } else {
            None
        },
        ending_fill_fraction: ending_fill,
        extreme_heat_days,
        flowering_drought,
    }
}

/// 1-based day of the calendar year of season day `d` (continues at 1 in the next year).
#[inline]
fn doy_of(wy: &WeatherYear, d: usize) -> usize {
    let n = wy.days();
    if d < n {
        d + 1
    } else {
        d - n + 1
    }
}

/// SCS Curve Number surface runoff (mm/day) from daily rainfall (mm) and CN2.
#[inline]
pub fn scs_runoff(prcp_mm: f64, cn2: f64) -> f64 {
    if prcp_mm <= 2.0 {
        return 0.0;
    }
    let s = (25400.0 / cn2.clamp(40.0, 96.0)) - 254.0;
    let ia = 0.2 * s;
    if prcp_mm <= ia {
        0.0
    } else {
        let num = prcp_mm - ia;
        ((num * num) / (prcp_mm + 0.8 * s)).clamp(0.0, prcp_mm * 0.85)
    }
}
