// Rule 12: Summer Drought Escape Phenology Bonus (Winter Cereal + Deep-Rooted/C4 Summer Crop)
// Agronomic basis: In drought-prone continental steppes (Romania 2024, Kansas 2012/2022), winter wheat/barley
// flowers in May and is harvested before July–August heat waves, while sorghum/sunflower/millet withstand late summer drought.

fn crop_name(item) {
    if type_of(item) == "string" { item } else { item.crop }
}

fn apply(rot, farm, profile) {
    let n = rot.len();
    if n < 2 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    let has_early_summer_harvest = false;
    let has_drought_hardy_summer = false;

    for i in 0..n {
        let c = crop_name(rot[i]);
        if c == "wheat" || c == "barley" || c == "pea" {
            has_early_summer_harvest = true;
        }
        if c == "sorghum" || c == "sunflower" || c == "millet" {
            has_drought_hardy_summer = true;
        }
    }

    if has_early_summer_harvest && has_drought_hardy_summer {
        return #{
            exclude: false,
            delta: 5,
            reason: "Spreads climate risk across seasons: winter/spring crop harvests before July heatwaves while drought-tolerant summer crop handles dry Augusts"
        };
    }

    #{ exclude: false, delta: 0, reason: "" }
}
