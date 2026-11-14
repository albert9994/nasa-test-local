// Rule 02: Field pea root-rot break (Aphanomyces euteiches & Fusarium root complex)
// Agronomic basis: Peas cannot be planted back-to-back; oospores persist in soil for 4–6 years.

fn crop_name(item) {
    if type_of(item) == "string" { item } else { item.crop }
}

fn apply(rot, farm, profile) {
    let n = rot.len();
    if n == 0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let pea_count = 0;
    let consecutive = false;

    for i in 0..n {
        let c = crop_name(rot[i]);
        let next_c = crop_name(rot[(i + 1) % n]);
        if c == "pea" {
            pea_count += 1;
            if n > 1 && next_c == "pea" {
                consecutive = true;
            }
        }
    }

    if pea_count == 0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    if consecutive || (n == 1 && pea_count == 1) {
        return #{
            exclude: true,
            delta: -20,
            code: "pea_continuous",
            vars: #{  },
            reason: "Continuous field pea builds lethal Aphanomyces and Fusarium root rot"
        };
    }

    if pea_count * 2 >= n {
        return #{
            exclude: false,
            delta: -8,
            code: "pea_every_2",
            vars: #{  },
            reason: "Pea grown every 2nd year risks root-rot buildup; keep at least a 3-year break between pea crops"
        };
    }

    #{ exclude: false, delta: 0, reason: "" }
}
