// Rule 13: NASA GRACE / GRACE-FO Groundwater Depletion & Irrigation Sustainability Check
// Agronomic basis: When NASA GRACE-FO terrestrial water storage shows rapid aquifer decline (< -1.0 cm LWE/yr,
// e.g. Ogallala Aquifer in Western Kansas at -2.15 cm/yr or Moldavian Plateau hills at -1.18 cm/yr),
// water-intensive crops (maize, soybean) face severe groundwater pumping risk and well depletion.

fn crop_name(item) {
    if type_of(item) == "string" { item } else { item.crop }
}

fn is_thirsty(c) {
    c == "maize" || c == "soybean"
}

fn apply(rot, farm, profile) {
    let n = rot.len();
    if n == 0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let grace_trend = 0.0;
    if type_of(farm) == "map" && "graceTrendCmYr" in farm {
        grace_trend = farm.graceTrendCmYr;
    } else if type_of(farm) == "map" && "id" in farm {
        if farm.id == "kansas" { grace_trend = -2.15; }
        else if farm.id == "moldova" { grace_trend = -1.18; }
        else if farm.id == "baragan" { grace_trend = -0.92; }
    }

    if grace_trend >= -1.0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let thirsty_count = 0;
    for i in 0..n {
        if is_thirsty(crop_name(rot[i])) {
            thirsty_count += 1;
        }
    }

    if thirsty_count * 2 > n {
        return #{
            exclude: false,
            delta: -7,
            code: "groundwater_decline",
            vars: #{ trend: grace_trend },
            reason: "NASA GRACE-FO shows regional groundwater declining (" + grace_trend + " cm/yr); water-intensive crops risk aquifer/moisture exhaustion"
        };
    }

    #{ exclude: false, delta: 0, reason: "" }
}
