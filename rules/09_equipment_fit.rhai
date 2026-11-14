// Rule 09: Farm Machinery / Equipment Fit
// Agronomic basis: A farmer cannot harvest sunflower without a sunflower header/pans or maize without a corn header,
// nor plant small grains without a grain drill, unless custom hire / investment fits their budget.

fn crop_name(item) {
    if type_of(item) == "string" { item } else { item.crop }
}

fn apply(rot, farm, profile) {
    if type_of(profile) != "map" || !("equipment" in profile) {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let owned = profile.equipment;
    if type_of(owned) != "array" || owned.len() == 0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let max_inv = if "maxInvestment" in profile { profile.maxInvestment } else { 0 };
    let missing = [];

    for i in 0..rot.len() {
        let c = crop_name(rot[i]);
        if c == "maize" {
            if !owned.contains("row_planter") && !missing.contains("row_planter") { missing.push("row_planter"); }
            if !owned.contains("corn_header") && !missing.contains("corn_header") { missing.push("corn_header"); }
        } else if c == "sunflower" {
            if !owned.contains("row_planter") && !missing.contains("row_planter") { missing.push("row_planter"); }
            if !owned.contains("sunflower_header") && !missing.contains("sunflower_header") { missing.push("sunflower_header"); }
        } else if c == "wheat" || c == "barley" || c == "pea" || c == "millet" {
            if !owned.contains("grain_drill") && !missing.contains("grain_drill") { missing.push("grain_drill"); }
        } else if c == "soybean" || c == "sorghum" {
            if !owned.contains("row_planter") && !owned.contains("grain_drill") && !missing.contains("row_planter") {
                missing.push("row_planter");
            }
        }
    }

    if missing.len() == 0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    // If farmer has no investment budget for new attachments, exclude or penalize for custom-hire need
    if max_inv <= 0 {
        return #{
            exclude: true,
            delta: -15,
            reason: "Missing required farm machinery (" + missing[0] + ") and investment budget is $0"
        };
    }

    #{
        exclude: false,
        delta: -4,
        reason: "Requires custom harvesting/seeding or attachment purchase (" + missing[0] + ")"
    }
}
