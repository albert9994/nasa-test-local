// Rule 03: Continuous maize penalty (Western corn rootworm Diabrotica & allelopathy/stover drag)
// Agronomic basis: Gentry et al. (2013) show 10–15% yield drag and higher N + insecticide costs in continuous corn.

fn crop_name(item) {
    if type_of(item) == "string" { item } else { item.crop }
}

fn apply(rot, farm, profile) {
    let n = rot.len();
    if n == 0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let all_maize = true;
    let back_to_back_maize = false;

    for i in 0..n {
        let c = crop_name(rot[i]);
        let next_c = crop_name(rot[(i + 1) % n]);
        if c != "maize" {
            all_maize = false;
        }
        if n > 1 && c == "maize" && next_c == "maize" {
            back_to_back_maize = true;
        }
    }

    if all_maize {
        return #{
            exclude: false,
            delta: -12,
            code: "continuous_maize",
            vars: #{  },
            reason: "Continuous maize suffers 12% yield drag, Western corn rootworm (Diabrotica) pressure, and full N fertilizer cost"
        };
    }

    if back_to_back_maize {
        return #{
            exclude: false,
            delta: -7,
            code: "back_to_back_maize",
            vars: #{  },
            reason: "Back-to-back maize phases increase rootworm larval damage and nitrogen input requirements"
        };
    }

    #{ exclude: false, delta: 0, reason: "" }
}
