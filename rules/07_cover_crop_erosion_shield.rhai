// Rule 07: Winter Rye Cover Crop Erosion Shield on Sloped Fields
// Agronomic basis: On fields with slope >= 3% (e.g. Moldavian Plateau at 6.5%), leaving wide-row stubble
// (maize, sunflower, soybean) bare over winter causes severe rill erosion; winter rye cuts RUSLE C by 45%.

fn crop_name(item) {
    if type_of(item) == "string" { item } else { item.crop }
}

fn has_cover(item) {
    if type_of(item) == "map" && "cover" in item { item.cover } else { false }
}

fn is_wide_row(c) {
    c == "maize" || c == "sunflower" || c == "soybean" || c == "sorghum"
}

fn apply(rot, farm, profile) {
    let n = rot.len();
    if n == 0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let slope = if type_of(farm) == "map" && "slope" in farm { farm.slope } else { 2.0 };
    if slope < 3.0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let wide_row_count = 0;
    let covered_wide_row = 0;

    for i in 0..n {
        let c = crop_name(rot[i]);
        if is_wide_row(c) {
            wide_row_count += 1;
            if has_cover(rot[i]) {
                covered_wide_row += 1;
            }
        }
    }

    if wide_row_count == 0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    if covered_wide_row > 0 {
        return #{
            exclude: false,
            delta: 6,
            reason: "Winter rye cover crop protects sloped soil (" + slope + "% gradient) after row crops, cutting winter runoff and erosion by ~45%"
        };
    }

    if wide_row_count == n {
        return #{
            exclude: false,
            delta: -6,
            reason: "All wide-row crops without winter cover on a " + slope + "% slope expose topsoil to spring snowmelt and rainstorm erosion"
        };
    }

    #{ exclude: false, delta: 0, reason: "" }
}
