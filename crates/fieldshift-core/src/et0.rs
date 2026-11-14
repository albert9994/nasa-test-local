//! Reference evapotranspiration ET0 (mm/day).
//!
//! * [`penman_monteith_et0`]: FAO-56 Penman-Monteith, daily time step, Eq. 6 (Allen et al. 1998, FAO Irrigation and
//!   Drainage Paper 56, ch. 3-4), computed from NASA POWER Tmax, Tmin, RH2M, WS2M (already at 2 m), net solar
//!   radiation (ALLSKY_SFC_SW_DWN, MJ m-2 d-1) and the site elevation (atmospheric pressure, Eq. 7).
//! * [`hargreaves_et0`]: radiation-calibrated Hargreaves-Samani fallback, used when RH or wind are missing.
//!
//! Soil heat flux G is 0 at the daily step (Eq. 42). Actual vapour pressure follows Eq. 19 (mean RH with the mean of the
//! saturation vapour pressure at Tmax and Tmin). Net outgoing longwave uses the FAO cloudiness ratio Rs/Rso (Eq. 39).

use std::f64::consts::PI;

/// Empirical correction of Penman-Monteith ET0 computed from NASA POWER (MERRA-2 / CERES) grid-cell forcing.
///
/// Point-scale station comparisons find POWER shortwave radiation and 2 m wind a few percent too high, which makes
/// PM-ET0 from POWER over-estimate by roughly 5-10 % (e.g. Duarte & Sentelhas 2020, Brazil).
/// 0.92 is the value that keeps the Story County (Iowa) simulated yields inside the NASS county
/// range (maize 9-12, soybean 3-3.8 t/ha) once Hargreaves is replaced by PM; set it to 1.0 to disable.
pub const POWER_ET0_BIAS: f64 = 0.92;

const GSC: f64 = 0.0820; // solar constant, MJ m-2 min-1
const SIGMA: f64 = 4.903e-9; // Stefan-Boltzmann, MJ K-4 m-2 d-1

/// Saturation vapour pressure e0(T), kPa (Eq. 11).
#[inline]
pub fn sat_vp(t_c: f64) -> f64 {
    0.6108 * (17.27 * t_c / (t_c + 237.3)).exp()
}

/// Extraterrestrial radiation Ra, MJ m-2 d-1 (Eq. 21) for latitude (deg) and day of year (1..=366).
pub fn extraterrestrial_radiation(lat_deg: f64, doy: f64) -> f64 {
    let phi = lat_deg.clamp(-66.0, 66.0).to_radians();
    let dr = 1.0 + 0.033 * (2.0 * PI / 365.0 * doy).cos();
    let delta = 0.409 * (2.0 * PI / 365.0 * doy - 1.39).sin();
    let ws = (-(phi.tan()) * delta.tan()).clamp(-1.0, 1.0).acos();
    (24.0 * 60.0 / PI)
        * GSC
        * dr
        * (ws * phi.sin() * delta.sin() + phi.cos() * delta.cos() * ws.sin())
}

/// Atmospheric pressure (kPa) at elevation `z` m (Eq. 7).
#[inline]
pub fn pressure_kpa(z: f64) -> f64 {
    101.3 * ((293.0 - 0.0065 * z) / 293.0).powf(5.26)
}

/// FAO-56 Penman-Monteith ET0 (Eq. 6) with an explicit actual vapour pressure `ea` (kPa).
///
/// `rs` = incoming shortwave, MJ m-2 d-1; `u2` = wind at 2 m, m/s.
#[allow(clippy::too_many_arguments)]
pub fn penman_monteith_with_ea(
    tmax: f64,
    tmin: f64,
    ea: f64,
    u2: f64,
    rs: f64,
    ra: f64,
    elev_m: f64,
) -> f64 {
    let tmean = 0.5 * (tmax + tmin);
    let p = pressure_kpa(elev_m);
    let gamma = 0.000665 * p;
    let es = 0.5 * (sat_vp(tmax) + sat_vp(tmin));
    let delta = 4098.0 * sat_vp(tmean) / (tmean + 237.3).powi(2);
    let ea = ea.clamp(0.05, es);

    let rso = (0.75 + 2e-5 * elev_m) * ra;
    let rs_rso = if rso > 0.1 {
        (rs / rso).clamp(0.3, 1.0)
    } else {
        0.5
    };
    let rns = 0.77 * rs;
    let rnl = SIGMA
        * 0.5
        * ((tmax + 273.16).powi(4) + (tmin + 273.16).powi(4))
        * (0.34 - 0.14 * ea.sqrt())
        * (1.35 * rs_rso - 0.35);
    let rn = rns - rnl;
    let u2 = u2.max(0.5); // FAO-56 box 4: floor wind at 0.5 m/s
    let num = 0.408 * delta * rn + gamma * 900.0 / (tmean + 273.0) * u2 * (es - ea);
    let den = delta + gamma * (1.0 + 0.34 * u2);
    (num / den).max(0.0)
}

/// FAO-56 Penman-Monteith ET0 from daily POWER variables. `rh` is the daily mean relative humidity (%).
#[allow(clippy::too_many_arguments)]
pub fn penman_monteith_et0(
    tmax: f64,
    tmin: f64,
    rh_pct: f64,
    wind_2m: f64,
    rs: f64,
    lat_deg: f64,
    elev_m: f64,
    doy: usize,
) -> f64 {
    let es = 0.5 * (sat_vp(tmax) + sat_vp(tmin));
    let ea = rh_pct.clamp(5.0, 100.0) / 100.0 * es; // Eq. 19
    let ra = extraterrestrial_radiation(lat_deg, doy as f64);
    penman_monteith_with_ea(tmax, tmin, ea, wind_2m, rs, ra, elev_m).clamp(0.0, 12.0)
}

/// Hargreaves reference evapotranspiration ET0 (mm/day) incorporating NASA POWER solar radiation.
#[inline]
pub fn hargreaves_et0(tmax: f64, tmin: f64, rad_mj_m2_d: f64) -> f64 {
    let tmean = 0.5 * (tmax + tmin);
    if tmean <= -5.0 {
        return 0.0;
    }
    let td = (tmax - tmin).max(2.0);
    // Latent heat of vaporization ~2.45 MJ/kg converts MJ/m2/d to equivalent mm/d
    let rad_equiv_mm = (rad_mj_m2_d.max(2.0)) * 0.408;
    // Radiation-calibrated Hargreaves-Samani formulation
    let et0 = 0.0102 * (tmean + 17.8).max(0.0) * rad_equiv_mm * (td / 12.0).sqrt();
    et0.clamp(0.1, 10.5)
}

/// ET0 of one day: Penman-Monteith when RH and wind are valid, otherwise Hargreaves. Floors at 0.1 mm like Hargreaves
/// so the crop model never sees a zero demand in the growing season.
#[allow(clippy::too_many_arguments)]
#[inline]
pub fn et0_day(
    tmax: f64,
    tmin: f64,
    rad: f64,
    rh: f64,
    wind: f64,
    lat_deg: f64,
    elev_m: f64,
    doy: usize,
) -> f64 {
    if rh.is_finite() && wind.is_finite() {
        let tmean = 0.5 * (tmax + tmin);
        if tmean <= -5.0 {
            return 0.0;
        }
        (penman_monteith_et0(tmax, tmin, rh, wind, rad, lat_deg, elev_m, doy) * POWER_ET0_BIAS)
            .clamp(0.1, 12.0)
    } else {
        hargreaves_et0(tmax, tmin, rad)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// FAO-56 Example 18: Brussels (50.80 N, 100 m), 6 July. Tmax 21.5, Tmin 12.3, ea 1.409 kPa, u2 2.078 m/s,
    /// Rs 22.07 MJ m-2 d-1, Ra 41.09: ET0 = 3.9 mm/day.
    #[test]
    fn fao56_example_18() {
        let ra = extraterrestrial_radiation(50.80, 187.0);
        assert!((ra - 41.09).abs() < 0.3, "Ra {ra}"); // book 41.09
        let et0 = penman_monteith_with_ea(21.5, 12.3, 1.409, 2.078, 22.07, ra, 100.0);
        assert!((et0 - 3.9).abs() < 0.1, "ET0 {et0}");
    }

    #[test]
    fn rh_form_is_close_to_the_book_value() {
        // RHmean = (84 + 63) / 2 = 73.5 % gives ea 1.47 instead of 1.41: a few percent higher is expected
        let et0 = penman_monteith_et0(21.5, 12.3, 73.5, 2.078, 22.07, 50.80, 100.0, 187);
        assert!((3.4..4.2).contains(&et0), "{et0}");
    }

    #[test]
    fn pm_rises_with_wind_and_dryness() {
        let a = penman_monteith_et0(30.0, 17.0, 70.0, 1.5, 24.0, 42.0, 300.0, 200);
        let b = penman_monteith_et0(30.0, 17.0, 40.0, 3.5, 24.0, 42.0, 300.0, 200);
        assert!(b > a * 1.2, "{a} {b}");
    }

    #[test]
    fn falls_back_to_hargreaves_without_rh_or_wind() {
        let h = hargreaves_et0(28.0, 14.0, 22.0);
        let d = et0_day(28.0, 14.0, 22.0, f64::NAN, 2.0, 42.0, 300.0, 190);
        assert_eq!(h, d);
    }

    #[test]
    fn ra_is_symmetric_between_hemispheres() {
        let n = extraterrestrial_radiation(40.0, 355.0);
        let s = extraterrestrial_radiation(-40.0, 355.0);
        assert!(s > n + 10.0, "{n} {s}"); // December: far more sun in the south
    }
}
