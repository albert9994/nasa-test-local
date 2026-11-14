// Rule 04: Legume preceding cereal / oilseed N-fixation bonus
// Agronomic basis: Zhao et al. (2022) & Bowles et al. (2020) — pea or soybean before wheat, maize, sorghum, or barley
// leaves 40–70 kg biological N/ha, breaks cereal root diseases, and saves $55–$68/ha in synthetic urea.

fn crop_name(item) {
    if type_of(item) == "string" { item } else { item.crop }
}

fn is_legume(c) {
    c == "soybean" || c == "pea"
}

fn is_cereal_or_oilseed(c) {
    c == "wheat" || c == "maize" || c == "sorghum" || c == "barley" || c == "millet" || c == "sunflower"
}

fn apply(rot, farm, profile) {
    let n = rot.len();
    if n < 2 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let transitions = 0;
    let leg_name = "";
    let next_name = "";

    for i in 0..n {
        let c = crop_name(rot[i]);
        let next_c = crop_name(rot[(i + 1) % n]);
        if is_legume(c) && is_cereal_or_oilseed(next_c) {
            transitions += 1;
            leg_name = c;
            next_name = next_c;
        }
    }

    if transitions > 0 {
        let bonus = if leg_name == "pea" && next_name == "wheat" { 6 } else { 5 };
        return #{
            exclude: false,
            delta: bonus,
            reason: leg_name + " fixes biological nitrogen ($55–68/ha fertilizer saved) and boosts the following " + next_name + " yield"
        };
    }

    #{ exclude: false, delta: 0, reason: "" }
}
