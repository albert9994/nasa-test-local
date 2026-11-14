// Rule 08: Bare Fallow Penalty in Humid or Sloped Environments
// Agronomic basis: Summer fallow conserves moisture in semi-arid High Plains (<480 mm rain, flat),
// but on sloped (>4%) or humid (>600 mm) fields it wastes a revenue year, oxidizes soil carbon, and triggers erosion.

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

    let fallow_count = 0;
    let bare_fallow = false;

    for i in 0..n {
        let c = crop_name(rot[i]);
        if c == "fallow" {
            fallow_count += 1;
            if !has_cover(rot[i]) {
                bare_fallow = true;
            }
        }
    }

    if fallow_count == 0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let slope = if type_of(farm) == "map" && "slope" in farm { farm.slope } else { 2.0 };
    let farm_id = if type_of(farm) == "map" && "id" in farm { farm.id } else { "" };

    if slope >= 4.0 && bare_fallow {
        return #{
            exclude: false,
            delta: -9,
            code: "bare_fallow_slope",
            vars: #{ slope: slope },
            reason: "Bare summer fallow on a " + slope + "% slope accelerates humus mineralization and severe sheet/rill erosion"
        };
    }

    if farm_id == "iowa" {
        return #{
            exclude: false,
            delta: -8,
            code: "fallow_uneconomic",
            vars: #{  },
            reason: "Summer fallow is uneconomic in high-rainfall Corn Belt soils where profile recharges naturally over winter"
        };
    }

    #{ exclude: false, delta: 0, reason: "" }
}
