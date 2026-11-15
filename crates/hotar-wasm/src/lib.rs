//! wasm-bindgen bindings for the Hotar engine (contract C3, camelCase JS names).
//!
//! `prepareFarm(pack)` parses the pack once and keeps it in a thread-local registry; every other call
//! takes the returned numeric handle, so no farm data is cloned or re-parsed per call. Inputs and outputs
//! are plain JS objects (serde-wasm-bindgen) with exactly the shapes of `apps/web/lib/engine/types.ts`.

use hotar_core::explain::{build_fact_sheet, FactSheet};
use hotar_core::optimize::{optimize, pick_three, PickResult, RankedRotation};
use hotar_core::quant::{quant_simulate, QuantConfig, QuantModel, QuantResult};
use hotar_core::rotation::{simulate_rotation, RotationResult};
use hotar_core::score::{compute_score, LlmAdjustment, ScoreResult};
use hotar_core::season::{simulate_season, SeasonResult};
use hotar_core::stress::{
    adaptation_margin, frontier, margin_year, market_shock, FrontierResult, MarginResult,
    MarginYearResult, MarketShockParams,
};
use hotar_core::validate::{validate, CropValidation, ObservedYields};
use hotar_core::{
    prepare_farm, Constraints, EngineError, FarmPack, PreparedFarm, RotationStep, ScenarioPoint,
    SimOptions, Weights,
};
use serde::{de::DeserializeOwned, Serialize};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

#[derive(Default)]
struct Registry {
    next: u32,
    farms: HashMap<u32, Rc<PreparedFarm>>,
}

thread_local! {
    static REGISTRY: RefCell<Registry> = RefCell::new(Registry::default());
}

fn err(e: impl std::fmt::Display) -> JsError {
    JsError::new(&e.to_string())
}

fn farm(handle: u32) -> Result<Rc<PreparedFarm>, JsError> {
    REGISTRY.with(|r| {
        r.borrow()
            .farms
            .get(&handle)
            .cloned()
            .ok_or_else(|| err(format!("unknown farm handle {handle}")))
    })
}

fn de<T: DeserializeOwned>(v: JsValue, what: &str) -> Result<T, JsError> {
    serde_wasm_bindgen::from_value(v).map_err(|e| err(format!("invalid {what}: {e}")))
}

fn out<T: Serialize>(v: &T) -> Result<JsValue, JsError> {
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(err)
}

fn core<T>(r: Result<T, EngineError>) -> Result<T, JsError> {
    r.map_err(err)
}

/// Parses and prepares a C1 farm pack; returns a numeric handle.
#[wasm_bindgen(js_name = prepareFarm)]
pub fn prepare_farm_js(pack: JsValue) -> Result<u32, JsError> {
    let pack: FarmPack = de(pack, "farm pack")?;
    let prepared = core(prepare_farm(pack))?;
    Ok(REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        r.next += 1;
        let h = r.next;
        r.farms.insert(h, Rc::new(prepared));
        h
    }))
}

/// Frees a prepared farm.
#[wasm_bindgen(js_name = releaseFarm)]
pub fn release_farm(handle: u32) {
    REGISTRY.with(|r| {
        r.borrow_mut().farms.remove(&handle);
    });
}

#[wasm_bindgen(js_name = simulateSeason)]
pub fn simulate_season_js(
    handle: u32,
    crop: &str,
    year: i32,
    opts: JsValue,
    trace: Option<bool>,
) -> Result<JsValue, JsError> {
    let f = farm(handle)?;
    let opts: SimOptions = de(opts, "opts")?;
    let r: SeasonResult = core(simulate_season(
        &f,
        crop,
        year,
        &opts,
        trace.unwrap_or(false),
    ))?;
    out(&r)
}

#[wasm_bindgen(js_name = simulateRotation)]
pub fn simulate_rotation_js(
    handle: u32,
    rot: JsValue,
    opts: JsValue,
    trace_year: Option<i32>,
) -> Result<JsValue, JsError> {
    let f = farm(handle)?;
    let rot: Vec<RotationStep> = de(rot, "rotation")?;
    let opts: SimOptions = de(opts, "opts")?;
    let r: RotationResult = core(simulate_rotation(&f, &rot, &opts, trace_year))?;
    out(&r)
}

#[wasm_bindgen(js_name = adaptationMargin)]
pub fn adaptation_margin_js(handle: u32, rot: JsValue, opts: JsValue) -> Result<JsValue, JsError> {
    let f = farm(handle)?;
    let rot: Vec<RotationStep> = de(rot, "rotation")?;
    let opts: SimOptions = de(opts, "opts")?;
    let r: MarginResult = core(adaptation_margin(&f, &rot, &opts))?;
    out(&r)
}

#[wasm_bindgen(js_name = frontier)]
pub fn frontier_js(handle: u32, rot: JsValue, opts: JsValue) -> Result<JsValue, JsError> {
    let f = farm(handle)?;
    let rot: Vec<RotationStep> = de(rot, "rotation")?;
    let opts: SimOptions = de(opts, "opts")?;
    let r: FrontierResult = core(frontier(&f, &rot, &opts))?;
    out(&r)
}

#[wasm_bindgen(js_name = optimize)]
pub fn optimize_js(
    handle: u32,
    pool: JsValue,
    opts: JsValue,
    weights: JsValue,
    baseline: JsValue,
    constraints: JsValue,
) -> Result<JsValue, JsError> {
    let f = farm(handle)?;
    let pool: Vec<String> = de(pool, "crop pool")?;
    let opts: SimOptions = de(opts, "opts")?;
    let weights: Weights = de(weights, "weights")?;
    let baseline: Vec<RotationStep> = de(baseline, "baseline rotation")?;
    let constraints: Constraints = de(constraints, "constraints")?;
    let r: Vec<RankedRotation> = core(optimize(
        &f,
        &pool,
        &opts,
        &weights,
        &baseline,
        &constraints,
    ))?;
    out(&r)
}

#[wasm_bindgen(js_name = pickThree)]
pub fn pick_three_js(ranked: JsValue, baseline: JsValue) -> Result<JsValue, JsError> {
    let ranked: Vec<RankedRotation> = de(ranked, "ranked rotations")?;
    let baseline: Vec<RotationStep> = de(baseline, "baseline rotation")?;
    let r: Vec<PickResult> = pick_three(&ranked, &baseline);
    out(&r)
}

#[wasm_bindgen(js_name = marginYear)]
pub fn margin_year_js(
    handle: u32,
    rot: JsValue,
    opts: JsValue,
    series: JsValue,
) -> Result<JsValue, JsError> {
    let f = farm(handle)?;
    let rot: Vec<RotationStep> = de(rot, "rotation")?;
    let opts: SimOptions = de(opts, "opts")?;
    let series: Vec<ScenarioPoint> = if series.is_undefined() || series.is_null() {
        Vec::new()
    } else {
        de(series, "series")?
    };
    let r: MarginYearResult = core(margin_year(&f, &rot, &opts, &series))?;
    out(&r)
}

#[wasm_bindgen(js_name = marketShock)]
pub fn market_shock_js(
    handle: u32,
    rot: JsValue,
    opts: JsValue,
    shock: JsValue,
) -> Result<JsValue, JsError> {
    let f = farm(handle)?;
    let rot: Vec<RotationStep> = de(rot, "rotation")?;
    let opts: SimOptions = de(opts, "opts")?;
    let shock: MarketShockParams = de(shock, "shock")?;
    let r: RotationResult = core(market_shock(&f, &rot, &opts, &shock))?;
    out(&r)
}

/// `quantParams` (C11 `quant_params.json` as an object) is optional; literature defaults otherwise.
#[wasm_bindgen(js_name = quantSimulate)]
pub fn quant_simulate_js(
    handle: u32,
    rots: JsValue,
    opts: JsValue,
    params: JsValue,
    quant_params: JsValue,
) -> Result<JsValue, JsError> {
    let f = farm(handle)?;
    let rots: Vec<Vec<RotationStep>> = de(rots, "rotations")?;
    let opts: SimOptions = de(opts, "opts")?;
    let params: QuantConfig = de(params, "quant params")?;
    let model: Option<QuantModel> = if quant_params.is_undefined() || quant_params.is_null() {
        None
    } else {
        let v: serde_json::Value = de(quant_params, "C11 quant parameters")?;
        Some(core(QuantModel::from_json(&v.to_string()))?)
    };
    let r: Vec<QuantResult> = core(quant_simulate(&f, &rots, &opts, &params, model.as_ref()))?;
    out(&r)
}

/// Calibration report: simulated vs observed county yields (C5 shape `{ crops: { maize: { years: {..} } } }`),
/// `{ crop: { n, r, rmse, bias, calib, pairs } }`. Never changes the farm's calibration.
#[wasm_bindgen(js_name = validate)]
pub fn validate_js(handle: u32, observed: JsValue, opts: JsValue) -> Result<JsValue, JsError> {
    let f = farm(handle)?;
    let observed: ObservedYields = de(observed, "observed yields")?;
    let opts: SimOptions = if opts.is_undefined() || opts.is_null() {
        SimOptions::default()
    } else {
        de(opts, "opts")?
    };
    let r: std::collections::BTreeMap<String, CropValidation> =
        core(validate(&f, &observed, &opts))?;
    out(&r)
}

/// `constraints` is optional (fills `fitsBudget` / `missingEquipment` of the alternatives).
#[wasm_bindgen(js_name = factSheet)]
pub fn fact_sheet_js(
    handle: u32,
    rot: JsValue,
    opts: JsValue,
    picks: JsValue,
    constraints: JsValue,
) -> Result<JsValue, JsError> {
    let f = farm(handle)?;
    let rot: Vec<RotationStep> = de(rot, "rotation")?;
    let opts: SimOptions = de(opts, "opts")?;
    let picks: Vec<PickResult> = de(picks, "picks")?;
    let constraints: Option<Constraints> = if constraints.is_undefined() || constraints.is_null() {
        None
    } else {
        Some(de(constraints, "constraints")?)
    };
    let r: FactSheet = core(build_fact_sheet(
        &f,
        &rot,
        &opts,
        &picks,
        constraints.as_ref(),
    ))?;
    out(&r)
}

/// C12 score. `weights`, `constraints` and `llm` are optional (`null` / `undefined`).
#[wasm_bindgen(js_name = score)]
pub fn score_js(
    handle: u32,
    rot: JsValue,
    opts: JsValue,
    weights: JsValue,
    constraints: JsValue,
    llm: JsValue,
) -> Result<JsValue, JsError> {
    let f = farm(handle)?;
    let rot: Vec<RotationStep> = de(rot, "rotation")?;
    let opts: SimOptions = de(opts, "opts")?;
    let weights: Weights = if weights.is_undefined() || weights.is_null() {
        Weights::default()
    } else {
        de(weights, "weights")?
    };
    let constraints: Constraints = if constraints.is_undefined() || constraints.is_null() {
        Constraints::default()
    } else {
        de(constraints, "constraints")?
    };
    let llm: Option<LlmAdjustment> = if llm.is_undefined() || llm.is_null() {
        None
    } else {
        Some(de(llm, "llm adjustment")?)
    };
    let r: ScoreResult = core(compute_score(&f, &rot, &opts, &weights, &constraints, llm))?;
    out(&r)
}
