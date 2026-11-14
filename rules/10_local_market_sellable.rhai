// Rule 10: Local Elevator / Market Sellability Filter
// Agronomic basis: A crop rotation only works in real life if local elevators/crushers buy every crop in it.

fn crop_name(item) {
    if type_of(item) == "string" { item } else { item.crop }
}

fn apply(rot, farm, profile) {
    let sellable = [];
    if type_of(profile) == "map" && "sellable" in profile && type_of(profile.sellable) == "array" {
        sellable = profile.sellable;
    } else if type_of(farm) == "map" && "cropPool" in farm && type_of(farm.cropPool) == "array" {
        sellable = farm.cropPool;
    }

    if sellable.len() == 0 {
        return #{ exclude: false, delta: 0, reason: "" };
    }

    for i in 0..rot.len() {
        let c = crop_name(rot[i]);
        if c != "fallow" && !sellable.contains(c) {
            return #{
                exclude: true,
                delta: -20,
                code: "not_sellable",
                vars: #{ crop: c },
                reason: c + " is not in the farmer's locally sellable crop pool"
            };
        }
    }

    #{ exclude: false, delta: 0, reason: "" }
}
