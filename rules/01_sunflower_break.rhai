// Rule 01: Sunflower phytosanitary break (Sclerotinia white mold & Orobanche broomrape)
// Agronomic basis: Sunflower must not be grown back-to-back, and ideally <= 1 year in 4–5.

fn crop_name(item) {
    if type_of(item) == "string" { item } else { item.crop }
}

fn apply(rot, farm, profile) {
    let n = rot.len();
    if n == 0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let sf_count = 0;
    let consecutive = false;

    for i in 0..n {
        let c = crop_name(rot[i]);
        let next_c = crop_name(rot[(i + 1) % n]);
        if c == "sunflower" {
            sf_count += 1;
            if n > 1 && next_c == "sunflower" {
                consecutive = true;
            }
        }
    }

    if sf_count == 0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    if consecutive || (n == 1 && sf_count == 1) {
        return #{
            exclude: true,
            delta: -25,
            reason: "Back-to-back sunflower causes severe Sclerotinia white mold and Orobanche (broomrape) infestation"
        };
    }

    // If sunflower is 1 in 2 years (50% share) or > 33% of rotation
    if sf_count * 3 > n {
        return #{
            exclude: false,
            delta: -10,
            reason: "Sunflower grown every 2nd year increases Sclerotinia stalk rot and broomrape pressure (recommended break: 4+ years)"
        };
    }

    if sf_count * 4 > n {
        return #{
            exclude: false,
            delta: -4,
            reason: "Sunflower every 3rd year carries moderate Sclerotinia carry-over risk; 4-year break is optimal"
        };
    }

    #{ exclude: false, delta: 0, reason: "" }
}
