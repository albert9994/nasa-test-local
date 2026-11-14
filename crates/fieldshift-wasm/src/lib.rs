use fieldshift_core::explain::build_fact_sheet;
use fieldshift_core::optimize::{
    optimize as core_optimize, pick_three as core_pick_three, OptimizeCandidate, PickedRotation,
};
use fieldshift_core::quant::{quant_simulate as core_quant_simulate, QuantParams, QuantSimConfig};
use fieldshift_core::rotation::simulate_rotation as core_simulate_rotation;
use fieldshift_core::season::simulate_season as core_simulate_season;
use fieldshift_core::stress::{
    adaptation_margin as core_adaptation_margin, frontier as core_frontier,
    margin_year as core_margin_year, market_shock as core_market_shock, MarketShockParams,
    ScenarioPoint,
};
use fieldshift_core::{
    builtin_demo_farm, prepare_farm as core_prepare_farm, FarmPack, PreparedFarm, PriorityWeights,
    RotationConstraints, RotationStep, SimOptions,
};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};

static NEXT_HANDLE: AtomicU32 = AtomicU32::new(1);
static FARM_STORE: Lazy<Mutex<HashMap<u32, PreparedFarm>>> = Lazy::new(|| {
    let mut m = HashMap::new();
    m.insert(0, builtin_demo_farm("iowa"));
    Mutex::new(m)
});

fn get_farm(handle: u32) -> PreparedFarm {
    let store = FARM_STORE.lock();
    store
        .get(&handle)
        .cloned()
        .unwrap_or_else(|| builtin_demo_farm("iowa"))
}

/// A1 smoke export: returns `"hello from Rust"`.
#[allow(non_snake_case)]
pub fn hello() -> String {
    fieldshift_core::hello()
}

/// C3 `fs.prepareFarm(pack) -> farmHandle`
#[allow(non_snake_case)]
pub fn prepareFarm(pack_json: &str) -> Result<u32, String> {
    // Support passing either a full C1 pack JSON object or a bare demo farm id string
    let trimmed = pack_json.trim().trim_matches('"');
    let prepared = if matches!(
        trimmed,
        "iowa" | "kansas" | "cordoba" | "baragan" | "parana"
    ) {
        builtin_demo_farm(trimmed)
    } else {
        let pack: FarmPack =
            serde_json::from_str(pack_json).map_err(|e| format!("invalid FarmPack JSON: {e}"))?;
        core_prepare_farm(pack)
    };
    let handle = NEXT_HANDLE.fetch_add(1, Ordering::Relaxed);
    FARM_STORE.lock().insert(handle, prepared);
    Ok(handle)
}

/// C3 `fs.simulateSeason(farmHandle, cropId, year, opts, trace)`
#[allow(non_snake_case)]
pub fn simulateSeason(
    farm_handle: u32,
    crop_id: &str,
    year: i32,
    opts_json: &str,
    trace: bool,
) -> Result<String, String> {
    let farm = get_farm(farm_handle);
    let opts: SimOptions = if opts_json.trim().is_empty() {
        SimOptions::default()
    } else {
        serde_json::from_str(opts_json).map_err(|e| format!("invalid SimOptions JSON: {e}"))?
    };
    let res = core_simulate_season(&farm, crop_id, year, &opts, trace);
    serde_json::to_string(&res).map_err(|e| e.to_string())
}

/// C3 `fs.simulateRotation(farmHandle, rotation, opts, traceYear?)`
#[allow(non_snake_case)]
pub fn simulateRotation(
    farm_handle: u32,
    rotation_json: &str,
    opts_json: &str,
    trace_year: Option<i32>,
) -> Result<String, String> {
    let farm = get_farm(farm_handle);
    let rotation: Vec<RotationStep> =
        serde_json::from_str(rotation_json).map_err(|e| format!("invalid rotation JSON: {e}"))?;
    let opts: SimOptions = if opts_json.trim().is_empty() {
        SimOptions::default()
    } else {
        serde_json::from_str(opts_json).map_err(|e| format!("invalid SimOptions JSON: {e}"))?
    };
    let res = core_simulate_rotation(&farm, &rotation, &opts, trace_year);
    serde_json::to_string(&res).map_err(|e| e.to_string())
}

/// C3 `fs.adaptationMargin(farmHandle, rotation, opts)`
#[allow(non_snake_case)]
pub fn adaptationMargin(
    farm_handle: u32,
    rotation_json: &str,
    opts_json: &str,
) -> Result<String, String> {
    let farm = get_farm(farm_handle);
    let rotation: Vec<RotationStep> =
        serde_json::from_str(rotation_json).map_err(|e| format!("invalid rotation JSON: {e}"))?;
    let opts: SimOptions = if opts_json.trim().is_empty() {
        SimOptions::default()
    } else {
        serde_json::from_str(opts_json).map_err(|e| format!("invalid SimOptions JSON: {e}"))?
    };
    let res = core_adaptation_margin(&farm, &rotation, &opts);
    serde_json::to_string(&res).map_err(|e| e.to_string())
}

/// C3 `fs.frontier(farmHandle, rotation, opts)`
#[allow(non_snake_case)]
pub fn frontier(farm_handle: u32, rotation_json: &str, opts_json: &str) -> Result<String, String> {
    let farm = get_farm(farm_handle);
    let rotation: Vec<RotationStep> =
        serde_json::from_str(rotation_json).map_err(|e| format!("invalid rotation JSON: {e}"))?;
    let opts: SimOptions = if opts_json.trim().is_empty() {
        SimOptions::default()
    } else {
        serde_json::from_str(opts_json).map_err(|e| format!("invalid SimOptions JSON: {e}"))?
    };
    let res = core_frontier(&farm, &rotation, &opts);
    serde_json::to_string(&res).map_err(|e| e.to_string())
}

/// C3 `fs.optimize(farmHandle, cropPool, opts, weights, baselineRot, constraints)`
#[allow(non_snake_case)]
pub fn optimize(
    farm_handle: u32,
    crop_pool_json: &str,
    opts_json: &str,
    weights_json: &str,
    baseline_rot_json: &str,
    constraints_json: &str,
) -> Result<String, String> {
    let farm = get_farm(farm_handle);
    let pool: Vec<String> = if crop_pool_json.trim().is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(crop_pool_json).map_err(|e| format!("invalid cropPool JSON: {e}"))?
    };
    let opts: SimOptions = if opts_json.trim().is_empty() {
        SimOptions::default()
    } else {
        serde_json::from_str(opts_json).map_err(|e| format!("invalid SimOptions JSON: {e}"))?
    };
    let weights: PriorityWeights = if weights_json.trim().is_empty() {
        PriorityWeights::default()
    } else {
        serde_json::from_str(weights_json).map_err(|e| format!("invalid weights JSON: {e}"))?
    };
    let baseline: Vec<RotationStep> = if baseline_rot_json.trim().is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(baseline_rot_json)
            .map_err(|e| format!("invalid baselineRot JSON: {e}"))?
    };
    let constraints: RotationConstraints = if constraints_json.trim().is_empty() {
        RotationConstraints::default()
    } else {
        serde_json::from_str(constraints_json)
            .map_err(|e| format!("invalid constraints JSON: {e}"))?
    };

    let res = core_optimize(&farm, &pool, &opts, &weights, &baseline, &constraints);
    serde_json::to_string(&res).map_err(|e| e.to_string())
}

/// C3 `fs.pickThree(ranked, baselineRot)`
#[allow(non_snake_case)]
pub fn pickThree(ranked_json: &str, baseline_rot_json: &str) -> Result<String, String> {
    let ranked: Vec<OptimizeCandidate> =
        serde_json::from_str(ranked_json).map_err(|e| format!("invalid ranked JSON: {e}"))?;
    let baseline: Vec<RotationStep> = if baseline_rot_json.trim().is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(baseline_rot_json)
            .map_err(|e| format!("invalid baselineRot JSON: {e}"))?
    };
    let picks = core_pick_three(&ranked, &baseline);
    serde_json::to_string(&picks).map_err(|e| e.to_string())
}

/// C3 `fs.marginYear(farmHandle, rotation, opts, series)`
#[allow(non_snake_case)]
pub fn marginYear(
    farm_handle: u32,
    rotation_json: &str,
    opts_json: &str,
    series_json: &str,
) -> Result<String, String> {
    let farm = get_farm(farm_handle);
    let rotation: Vec<RotationStep> =
        serde_json::from_str(rotation_json).map_err(|e| format!("invalid rotation JSON: {e}"))?;
    let opts: SimOptions = if opts_json.trim().is_empty() {
        SimOptions::default()
    } else {
        serde_json::from_str(opts_json).map_err(|e| format!("invalid SimOptions JSON: {e}"))?
    };
    let series: Vec<ScenarioPoint> = if series_json.trim().is_empty() {
        farm.scenario_series("ssp245")
    } else {
        serde_json::from_str(series_json).map_err(|e| format!("invalid series JSON: {e}"))?
    };
    let res = core_margin_year(&farm, &rotation, &opts, &series);
    serde_json::to_string(&res).map_err(|e| e.to_string())
}

/// C3 `fs.marketShock(farmHandle, rotation, opts, { pricePct, inputPct })`
#[allow(non_snake_case)]
pub fn marketShock(
    farm_handle: u32,
    rotation_json: &str,
    opts_json: &str,
    shock_json: &str,
) -> Result<String, String> {
    let farm = get_farm(farm_handle);
    let rotation: Vec<RotationStep> =
        serde_json::from_str(rotation_json).map_err(|e| format!("invalid rotation JSON: {e}"))?;
    let opts: SimOptions = if opts_json.trim().is_empty() {
        SimOptions::default()
    } else {
        serde_json::from_str(opts_json).map_err(|e| format!("invalid SimOptions JSON: {e}"))?
    };
    let shock: MarketShockParams =
        serde_json::from_str(shock_json).map_err(|e| format!("invalid shock JSON: {e}"))?;
    let res = core_market_shock(&farm, &rotation, &opts, &shock);
    serde_json::to_string(&res).map_err(|e| e.to_string())
}

/// C3 `fs.quantSimulate(farmHandle, rotations, opts, cfg, quantParams)`
#[allow(non_snake_case)]
pub fn quantSimulate(
    farm_handle: u32,
    rotations_json: &str,
    opts_json: &str,
    cfg_json: &str,
    quant_params_json: &str,
) -> Result<String, String> {
    let farm = get_farm(farm_handle);
    let rotations: Vec<Vec<RotationStep>> =
        serde_json::from_str(rotations_json).map_err(|e| format!("invalid rotations JSON: {e}"))?;
    let opts: SimOptions = if opts_json.trim().is_empty() {
        SimOptions::default()
    } else {
        serde_json::from_str(opts_json).map_err(|e| format!("invalid SimOptions JSON: {e}"))?
    };
    let cfg: QuantSimConfig = if cfg_json.trim().is_empty() {
        QuantSimConfig::default()
    } else {
        serde_json::from_str(cfg_json).map_err(|e| format!("invalid QuantSimConfig JSON: {e}"))?
    };
    let qp: Option<QuantParams> = if quant_params_json.trim().is_empty() {
        None
    } else {
        Some(
            serde_json::from_str(quant_params_json)
                .map_err(|e| format!("invalid QuantParams JSON: {e}"))?,
        )
    };
    let res = core_quant_simulate(&farm, &rotations, &opts, &cfg, qp.as_ref());
    serde_json::to_string(&res).map_err(|e| e.to_string())
}

/// C3 `fs.factSheet(farmHandle, rotation, opts, picks)`
#[allow(non_snake_case)]
pub fn factSheet(
    farm_handle: u32,
    rotation_json: &str,
    opts_json: &str,
    picks_json: &str,
) -> Result<String, String> {
    let farm = get_farm(farm_handle);
    let rotation: Vec<RotationStep> =
        serde_json::from_str(rotation_json).map_err(|e| format!("invalid rotation JSON: {e}"))?;
    let opts: SimOptions = if opts_json.trim().is_empty() {
        SimOptions::default()
    } else {
        serde_json::from_str(opts_json).map_err(|e| format!("invalid SimOptions JSON: {e}"))?
    };
    let picks: Vec<PickedRotation> = if picks_json.trim().is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(picks_json).map_err(|e| format!("invalid picks JSON: {e}"))?
    };
    let sheet = build_fact_sheet(&farm, &rotation, &opts, &picks);
    serde_json::to_string(&sheet).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wasm_c3_exports_end_to_end() {
        assert_eq!(hello(), "hello from Rust");
        let handle = prepareFarm("\"iowa\"").expect("prepareFarm iowa");
        let rot = r#"[{"crop":"maize","cover":false},{"crop":"soybean","cover":true}]"#;
        let opts = r#"{"dT":0.0,"dP":0.0,"failNet":0.0,"failShare":0.2}"#;

        let season_json = simulateSeason(handle, "maize", 2012, opts, true).unwrap();
        assert!(season_json.contains("\"crop\":\"maize\""));

        let rot_json = simulateRotation(handle, rot, opts, Some(2012)).unwrap();
        assert!(rot_json.contains("\"worstYear\":2012"));

        let margin_json = adaptationMargin(handle, rot, opts).unwrap();
        assert!(margin_json.contains("\"dT\":"));

        let front_json = frontier(handle, rot, opts).unwrap();
        assert!(front_json.contains("\"grid\":"));

        let opt_json = optimize(handle, "[]", opts, "", rot, "").unwrap();
        let picks_json = pickThree(&opt_json, rot).unwrap();
        assert!(picks_json.contains("Best balance"));

        let my_json = marginYear(handle, rot, opts, "").unwrap();
        assert!(my_json.contains("\"path\":"));

        let shock_json =
            marketShock(handle, rot, opts, r#"{"pricePct":-30,"inputPct":20}"#).unwrap();
        assert!(shock_json.contains("\"meanNet\":"));

        let quant_json =
            quantSimulate(handle, &format!("[{rot}]"), opts, r#"{"paths":100}"#, "").unwrap();
        assert!(quant_json.contains("\"cvar95\":"));

        let fact_json = factSheet(handle, rot, opts, &picks_json).unwrap();
        assert!(fact_json.contains("\"sources\":"));
    }
}
