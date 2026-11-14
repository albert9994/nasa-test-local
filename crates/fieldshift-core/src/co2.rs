//! CO2 fertilisation and the SSP concentration pathways.
//!
//! * Yield (radiation-use efficiency) response of C3 crops: about +0.1 % per ppm above today's 420 ppm, capped at +15 %
//!   (FACE meta-analyses: Ainsworth & Long 2005 New Phytologist 165, Long et al. 2006 Science 312; the cap reflects the
//!   downward revision of FACE yield gains under field N and water limits, Kimball 2016).
//! * C4 crops (maize, sorghum, millet) have no direct photosynthetic gain; the benefit is water-use efficiency through
//!   stomatal closure, about +3 % at 550 ppm (Leakey 2009 Proc. R. Soc. B). It is applied to the transpiration demand
//!   (`etc_factor`), so it only matters in dry seasons.
//! * C3 crops also close stomata (about -5 % canopy ET at 550 ppm, Kimball & Idso 1983 / Ainsworth & Long 2005).
//!
//! Concentration pathways: harmonised SSP CO2 concentrations (Meinshausen et al. 2020, Geosci. Model Dev. 13) interpolated
//! linearly. These are the scenario values the CMIP6 deltas in the pack were produced with.

/// Atmospheric CO2 of the reference climate the crop parameters were calibrated for (ppm, about 2024).
pub const CO2_REFERENCE_PPM: f64 = 420.0;
/// Yield gain per ppm above the reference for C3 crops.
pub const C3_YIELD_PER_PPM: f64 = 0.001;
/// Cap of the C3 yield gain.
pub const C3_YIELD_CAP: f64 = 0.15;
/// Reduction of ETc per +130 ppm (550 ppm vs 420 ppm): C4 3 %, C3 5 %.
const C4_ET_PER_130: f64 = 0.03;
const C3_ET_PER_130: f64 = 0.05;

/// Maize, sorghum and millet photosynthesise through the C4 pathway.
pub fn is_c4(crop_id: &str) -> bool {
    matches!(crop_id, "maize" | "sorghum" | "millet")
}

/// Multiplier on attainable yield (RUE) at `ppm`. Exactly 1.0 at or below the reference.
pub fn yield_factor(crop_id: &str, ppm: f64) -> f64 {
    if is_c4(crop_id) || crop_id == "fallow" {
        return 1.0;
    }
    1.0 + ((ppm - CO2_REFERENCE_PPM) * C3_YIELD_PER_PPM).clamp(0.0, C3_YIELD_CAP)
}

/// Multiplier on crop evapotranspiration demand at `ppm` (stomatal closure). Exactly 1.0 at or below the reference.
pub fn etc_factor(crop_id: &str, ppm: f64) -> f64 {
    let per = if is_c4(crop_id) {
        C4_ET_PER_130
    } else {
        C3_ET_PER_130
    };
    1.0 - per * ((ppm - CO2_REFERENCE_PPM) / 130.0).clamp(0.0, 1.5)
}

/// SSP CO2 concentration (ppm) at the end of the year, `ssp` = `"ssp245"` / `"ssp585"` (anything else: SSP2-4.5).
pub fn ssp_co2_ppm(ssp: &str, year: i32) -> f64 {
    const SSP245: [(i32, f64); 7] = [
        (2020, 413.0),
        (2030, 440.0),
        (2040, 465.0),
        (2050, 487.0),
        (2060, 510.0),
        (2080, 560.0),
        (2100, 603.0),
    ];
    const SSP585: [(i32, f64); 7] = [
        (2020, 413.0),
        (2030, 449.0),
        (2040, 490.0),
        (2050, 541.0),
        (2060, 600.0),
        (2080, 810.0),
        (2100, 1135.0),
    ];
    let t: &[(i32, f64)] = if ssp.contains("585") || ssp.contains("370") {
        &SSP585
    } else {
        &SSP245
    };
    if year <= t[0].0 {
        return t[0].1;
    }
    for w in t.windows(2) {
        if year <= w[1].0 {
            let f = f64::from(year - w[0].0) / f64::from(w[1].0 - w[0].0);
            return w[0].1 + f * (w[1].1 - w[0].1);
        }
    }
    t[t.len() - 1].1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn neutral_at_reference() {
        assert_eq!(yield_factor("wheat", 420.0), 1.0);
        assert_eq!(etc_factor("maize", 420.0), 1.0);
        assert_eq!(yield_factor("wheat", 380.0), 1.0);
    }

    #[test]
    fn c3_gain_is_capped_and_c4_has_none() {
        assert!((yield_factor("soybean", 520.0) - 1.10).abs() < 1e-9);
        assert!((yield_factor("wheat", 900.0) - 1.15).abs() < 1e-9);
        assert_eq!(yield_factor("maize", 550.0), 1.0);
    }

    #[test]
    fn c4_water_use_efficiency_is_three_percent_at_550() {
        assert!((etc_factor("maize", 550.0) - 0.97).abs() < 1e-9);
        assert!((etc_factor("wheat", 550.0) - 0.95).abs() < 1e-9);
    }

    #[test]
    fn ssp_pathways_diverge() {
        assert!(ssp_co2_ppm("ssp585", 2050) > ssp_co2_ppm("ssp245", 2050) + 40.0);
        assert!((ssp_co2_ppm("ssp245", 2050) - 487.0).abs() < 1e-9);
        assert!(ssp_co2_ppm("ssp245", 2035) > 440.0);
    }
}
