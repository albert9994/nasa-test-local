// Rule 05: Same botanical family back-to-back penalty (Poaceae -> Poaceae cereal bridge)
// Agronomic basis: Planting wheat -> barley or maize -> sorghum back-to-back bridges Fusarium head blight,
// take-all (Gaeumannomyces graminis), and grassy weeds (Bromus, Setaria).

fn crop_name(item) {
    if type_of(item) == "string" { item } else { item.crop }
}

fn is_poaceae(c) {
    c == "maize" || c == "wheat" || c == "barley" || c == "sorghum" || c == "millet"
}

fn apply(rot, farm, profile) {
    let n = rot.len();
    if n < 2 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let grass_to_grass = 0;
    for i in 0..n {
        let c = crop_name(rot[i]);
        let next_c = crop_name(rot[(i + 1) % n]);
        if c != next_c && is_poaceae(c) && is_poaceae(next_c) {
            grass_to_grass += 1;
        }
    }

    if grass_to_grass > 0 && grass_to_grass == n {
        return #{
            exclude: false,
            delta: -6,
            code: "all_cereal",
            vars: #{  },
            reason: "All-cereal (Poaceae) rotation without a broadleaf or legume break increases grassy weeds and Fusarium carry-over"
        };
    }

    if grass_to_grass > 0 {
        return #{
            exclude: false,
            delta: -3,
            code: "grass_back_to_back",
            vars: #{  },
            reason: "Back-to-back grass crops share root pathogens and grass-weed herbicide pressures"
        };
    }

    #{ exclude: false, delta: 0, reason: "" }
}
