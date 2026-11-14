// Rule 11: Topsoil pH Suitability for Nodulating Legumes
// Agronomic basis: Rhizobium nodulation in pea and soybean drops sharply below pH 5.6 or above pH 8.0,
// whereas sorghum, rye, and winter wheat tolerate wider pH ranges.

fn crop_name(item) {
    if type_of(item) == "string" { item } else { item.crop }
}

fn apply(rot, farm, profile) {
    let ph = if type_of(farm) == "map" && "ph" in farm { farm.ph } else { 6.6 };

    if ph >= 5.6 && ph <= 8.0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    for i in 0..rot.len() {
        let c = crop_name(rot[i]);
        if (c == "pea" || c == "soybean") && ph < 5.6 {
            return #{
                exclude: false,
                delta: -7,
                code: "acidic_ph",
                vars: #{ ph: ph, crop: c },
                reason: "Acidic topsoil (pH " + ph + " < 5.6) inhibits Rhizobium nodulation in " + c + " without liming"
            };
        }
        if (c == "pea" || c == "soybean") && ph > 8.0 {
            return #{
                exclude: false,
                delta: -6,
                code: "alkaline_ph",
                vars: #{ ph: ph, crop: c },
                reason: "Alkaline soil (pH " + ph + " > 8.0) triggers iron chlorosis in " + c
            };
        }
    }

    #{ exclude: false, delta: 0, reason: "" }
}
