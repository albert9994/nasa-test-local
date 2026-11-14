// Rule 06: EU Common Agricultural Policy (CAP) GAEC 7 Crop Rotation & Eco-Scheme Bonus
// Agronomic basis: For EU farms (Romania: baragan, moldova), CAP GAEC 7 requires crop rotation/diversification,
// and Eco-Scheme PD-04 rewards >=10% nitrogen-fixing legumes + winter soil cover.

fn crop_name(item) {
    if type_of(item) == "string" { item } else { item.crop }
}

fn has_cover(item) {
    if type_of(item) == "map" && "cover" in item { item.cover } else { false }
}

fn apply(rot, farm, profile) {
    let n = rot.len();
    if n == 0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let farm_id = if type_of(farm) == "map" && "id" in farm { farm.id } else { "" };
    let country = if type_of(farm) == "map" && "country" in farm { farm.country } else { "" };
    let is_eu = country == "RO" || country == "EU" || farm_id == "baragan" || farm_id == "moldova";

    if !is_eu {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let distinct = [];
    let has_leg = false;
    let has_winter_or_cover = false;

    for i in 0..n {
        let c = crop_name(rot[i]);
        if !distinct.contains(c) && c != "fallow" {
            distinct.push(c);
        }
        if c == "pea" || c == "soybean" {
            has_leg = true;
        }
        if c == "wheat" || has_cover(rot[i]) {
            has_winter_or_cover = true;
        }
    }

    if distinct.len() <= 1 {
        return #{
            exclude: false,
            delta: -10,
            code: "gaec7_violation",
            vars: #{  },
            reason: "Violates EU CAP GAEC 7 crop-rotation conditionality (monoculture risks losing APIA direct subsidy)"
        };
    }

    if distinct.len() >= 3 && has_leg && has_winter_or_cover {
        return #{
            exclude: false,
            delta: 5,
            code: "gaec7_qualifies",
            vars: #{  },
            reason: "Qualifies for EU CAP GAEC 7 and APIA PD-04 eco-scheme subsidy (3+ crops with legume + winter cover)"
        };
    }

    #{ exclude: false, delta: 0, reason: "" }
}
