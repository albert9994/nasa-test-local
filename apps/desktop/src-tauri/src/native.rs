//! Native engine commands: `fieldshift-core` (Rust, rayon) behind the same JSON contract as the WASM build.
//!
//! One Tauri command per method of the TypeScript `Engine` interface (packages/ui/src/lib/engine/types.ts). Arguments arrive as
//! one JSON `payload` object, results go back as JSON with exactly the camelCase shapes of `crates/fieldshift-wasm` (both
//! serialise the same `fieldshift-core` structs), so the UI adapter in packages/ui/src/lib/engine/tauri.ts is a thin forwarder.
//!
//! Prepared farms live in a registry in Tauri state (`Mutex<HashMap<u32, Arc<PreparedFarm>>>`); `prepare_farm` returns the
//! numeric handle every other call takes. Heavy calls run on `tauri::async_runtime::spawn_blocking`, so the webview never
//! freezes; inside them `fieldshift-core` parallelises frontier / optimize / quant on the rayon pool.

use fieldshift_core::optimize::{PickResult, RankedRotation};
use fieldshift_core::quant::{QuantConfig, QuantModel};
use fieldshift_core::score::LlmAdjustment;
use fieldshift_core::stress::MarketShockParams;
use fieldshift_core::validate::ObservedYields;
use fieldshift_core::{
    explain, optimize as core_optimize, prepare_farm as core_prepare_farm, quant, rotation,
    score as core_score, season, stress, validate as core_validate, Constraints, FarmPack,
    PreparedFarm, RotationStep, ScenarioPoint, SimOptions, Weights,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct Inner {
    next: u32,
    farms: HashMap<u32, Arc<PreparedFarm>>,
}

/// Farm registry kept in Tauri state (`app.manage(Registry::default())`). Cheap to clone (shared `Arc`).
#[derive(Clone, Default)]
pub struct Registry(Arc<Mutex<Inner>>);

impl Registry {
    fn insert(&self, farm: PreparedFarm) -> u32 {
        let mut g = self.0.lock().unwrap_or_else(|e| e.into_inner());
        g.next += 1;
        let h = g.next;
        g.farms.insert(h, Arc::new(farm));
        h
    }

    fn get(&self, handle: u32) -> Result<Arc<PreparedFarm>, String> {
        let g = self.0.lock().unwrap_or_else(|e| e.into_inner());
        g.farms
            .get(&handle)
            .cloned()
            .ok_or_else(|| format!("unknown farm handle {handle}"))
    }

    fn release(&self, handle: u32) {
        let mut g = self.0.lock().unwrap_or_else(|e| e.into_inner());
        g.farms.remove(&handle);
    }
}

/// Required field of the payload, deserialised from a borrowed `Value` (no copy of big packs).
fn req<T: DeserializeOwned>(p: &Value, key: &str) -> Result<T, String> {
    let v = p.get(key).ok_or_else(|| format!("missing {key}"))?;
    T::deserialize(v).map_err(|e| format!("invalid {key}: {e}"))
}

/// Optional field: absent or `null` -> `None`.
fn opt<T: DeserializeOwned>(p: &Value, key: &str) -> Result<Option<T>, String> {
    match p.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => T::deserialize(v)
            .map(Some)
            .map_err(|e| format!("invalid {key}: {e}")),
    }
}

/// Farm handle: a number, or the numeric string the UI keeps (`FarmHandle = string`).
fn handle(p: &Value) -> Result<u32, String> {
    match p.get("handle") {
        Some(Value::Number(n)) => n.as_u64().and_then(|n| u32::try_from(n).ok()),
        Some(Value::String(s)) => s.parse().ok(),
        _ => None,
    }
    .ok_or_else(|| "missing or invalid farm handle".to_string())
}

fn to_json<T: Serialize>(v: &T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|e| e.to_string())
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Runs one engine method. `method` is the snake_case command name; same argument names as the TS `Engine` calls.
pub fn dispatch(reg: &Registry, method: &str, p: Value) -> Result<Value, String> {
    match method {
        "prepare_farm" => {
            let pack: FarmPack = req(&p, "pack")?;
            let farm = core_prepare_farm(pack).map_err(err)?;
            Ok(json!(reg.insert(farm)))
        }
        "release_farm" => {
            reg.release(handle(&p)?);
            Ok(Value::Null)
        }
        "simulate_season" => {
            let f = reg.get(handle(&p)?)?;
            let crop: String = req(&p, "crop")?;
            let year: i32 = req(&p, "year")?;
            let opts: SimOptions = req(&p, "opts")?;
            let trace: Option<bool> = opt(&p, "trace")?;
            to_json(
                &season::simulate_season(&f, &crop, year, &opts, trace.unwrap_or(false))
                    .map_err(err)?,
            )
        }
        "simulate_rotation" => {
            let f = reg.get(handle(&p)?)?;
            let rot: Vec<RotationStep> = req(&p, "rot")?;
            let opts: SimOptions = req(&p, "opts")?;
            let trace_year: Option<i32> = opt(&p, "traceYear")?;
            to_json(&rotation::simulate_rotation(&f, &rot, &opts, trace_year).map_err(err)?)
        }
        "adaptation_margin" => {
            let f = reg.get(handle(&p)?)?;
            let rot: Vec<RotationStep> = req(&p, "rot")?;
            let opts: SimOptions = req(&p, "opts")?;
            to_json(&stress::adaptation_margin(&f, &rot, &opts).map_err(err)?)
        }
        "frontier" => {
            let f = reg.get(handle(&p)?)?;
            let rot: Vec<RotationStep> = req(&p, "rot")?;
            let opts: SimOptions = req(&p, "opts")?;
            to_json(&stress::frontier(&f, &rot, &opts).map_err(err)?)
        }
        "optimize" => {
            let f = reg.get(handle(&p)?)?;
            let pool: Vec<String> = req(&p, "pool")?;
            let opts: SimOptions = req(&p, "opts")?;
            let weights: Weights = req(&p, "w")?;
            let baseline: Vec<RotationStep> = req(&p, "baseline")?;
            let constraints: Constraints = req(&p, "c")?;
            to_json(
                &core_optimize::optimize(&f, &pool, &opts, &weights, &baseline, &constraints)
                    .map_err(err)?,
            )
        }
        "pick_three" => {
            let ranked: Vec<RankedRotation> = req(&p, "ranked")?;
            let baseline: Vec<RotationStep> = req(&p, "baseline")?;
            to_json(&core_optimize::pick_three(&ranked, &baseline))
        }
        "margin_year" => {
            let f = reg.get(handle(&p)?)?;
            let rot: Vec<RotationStep> = req(&p, "rot")?;
            let opts: SimOptions = req(&p, "opts")?;
            let series: Vec<ScenarioPoint> = opt(&p, "series")?.unwrap_or_default();
            to_json(&stress::margin_year(&f, &rot, &opts, &series).map_err(err)?)
        }
        "market_shock" => {
            let f = reg.get(handle(&p)?)?;
            let rot: Vec<RotationStep> = req(&p, "rot")?;
            let opts: SimOptions = req(&p, "opts")?;
            let shock: MarketShockParams = req(&p, "shock")?;
            to_json(&stress::market_shock(&f, &rot, &opts, &shock).map_err(err)?)
        }
        "quant_simulate" => {
            let f = reg.get(handle(&p)?)?;
            let rots: Vec<Vec<RotationStep>> = req(&p, "rots")?;
            let opts: SimOptions = req(&p, "opts")?;
            let params: QuantConfig = req(&p, "p")?;
            // C11 parameters are optional (literature defaults otherwise)
            let model: Option<QuantModel> = match opt::<Value>(&p, "quantParams")? {
                Some(v) => Some(QuantModel::from_json(&v.to_string()).map_err(err)?),
                None => None,
            };
            to_json(&quant::quant_simulate(&f, &rots, &opts, &params, model.as_ref()).map_err(err)?)
        }
        "fact_sheet" => {
            let f = reg.get(handle(&p)?)?;
            let rot: Vec<RotationStep> = req(&p, "rot")?;
            let opts: SimOptions = req(&p, "opts")?;
            let picks: Vec<PickResult> = req(&p, "picks")?;
            let constraints: Option<Constraints> = opt(&p, "constraints")?;
            to_json(
                &explain::build_fact_sheet(&f, &rot, &opts, &picks, constraints.as_ref())
                    .map_err(err)?,
            )
        }
        "validate" => {
            let f = reg.get(handle(&p)?)?;
            let observed: ObservedYields = req(&p, "observed")?;
            let opts: SimOptions = opt(&p, "opts")?.unwrap_or_default();
            to_json(&core_validate::validate(&f, &observed, &opts).map_err(err)?)
        }
        "score" => {
            let f = reg.get(handle(&p)?)?;
            let rot: Vec<RotationStep> = req(&p, "rot")?;
            let opts: SimOptions = req(&p, "opts")?;
            let weights: Weights = opt(&p, "w")?.unwrap_or_default();
            let constraints: Constraints = opt(&p, "c")?.unwrap_or_default();
            let llm: Option<LlmAdjustment> = opt(&p, "llm")?;
            to_json(
                &core_score::compute_score(&f, &rot, &opts, &weights, &constraints, llm)
                    .map_err(err)?,
            )
        }
        other => Err(format!("unknown engine method {other}")),
    }
}

#[tauri::command]
pub fn engine_info() -> Result<Value, String> {
    Ok(json!({
        "kind": "native",
        "name": "fieldshift-core",
        "version": env!("CARGO_PKG_VERSION"),
        "threads": std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1),
    }))
}

macro_rules! engine_command {
    ($($name:ident),* $(,)?) => {$(
        /// Runs on a blocking thread so long simulations never freeze the UI.
        #[tauri::command]
        pub async fn $name(
            registry: tauri::State<'_, Registry>,
            payload: Value,
        ) -> Result<Value, String> {
            let reg = registry.inner().clone();
            tauri::async_runtime::spawn_blocking(move || dispatch(&reg, stringify!($name), payload))
                .await
                .map_err(|e| e.to_string())?
        }
    )*};
}

engine_command!(
    prepare_farm,
    release_farm,
    simulate_season,
    simulate_rotation,
    adaptation_margin,
    frontier,
    optimize,
    pick_three,
    margin_year,
    market_shock,
    quant_simulate,
    fact_sheet,
    validate,
    score,
);

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn pack() -> Value {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../web/public/data/mock/farms/iowa.json"
        );
        serde_json::from_str(&std::fs::read_to_string(path).expect("mock Iowa pack")).unwrap()
    }

    fn opts() -> Value {
        json!({
            "dT": 0, "dP": 0, "sowShift": 0, "maturity": 1, "irrigCap": 0, "fieldFactor": 1,
            "failNet": 0, "failShare": 0.2, "prices": {}, "costs": {}
        })
    }

    fn rot() -> Value {
        json!([{"crop": "maize", "cover": false}, {"crop": "soybean", "cover": false}])
    }

    fn prepared() -> (Registry, Value) {
        let reg = Registry::default();
        let h = dispatch(&reg, "prepare_farm", json!({ "pack": pack() })).unwrap();
        (reg, h)
    }

    #[test]
    fn rotation_margin_and_season_match_the_contract_shapes() {
        let (reg, h) = prepared();
        let r = dispatch(
            &reg,
            "simulate_rotation",
            json!({"handle": h, "rot": rot(), "opts": opts()}),
        )
        .unwrap();
        for k in [
            "years",
            "farmNet",
            "meanNet",
            "minNet",
            "worstYear",
            "pFail",
            "yieldByCrop",
            "soilScore",
        ] {
            assert!(r.get(k).is_some(), "missing {k}");
        }
        assert!(r["years"].as_array().unwrap().len() > 10);
        assert!(r["traced"].is_null());

        let traced = dispatch(
            &reg,
            "simulate_rotation",
            json!({"handle": h.to_string(), "rot": rot(), "opts": opts(), "traceYear": r["worstYear"]}),
        )
        .unwrap();
        assert!(!traced["traced"].as_array().unwrap().is_empty());

        let m = dispatch(
            &reg,
            "adaptation_margin",
            json!({"handle": h, "rot": rot(), "opts": opts()}),
        )
        .unwrap();
        assert!(m["dT"].as_f64().unwrap() >= 0.0 && m["already"].is_boolean());

        let s = dispatch(
            &reg,
            "simulate_season",
            json!({"handle": h, "crop": "maize", "year": r["worstYear"], "opts": opts(), "trace": true}),
        )
        .unwrap();
        assert!(s["trace"].is_object() && s["yield"].as_f64().unwrap() > 0.0);
    }

    #[test]
    fn optimize_picks_fact_sheet_and_score_round_trip_with_reason_codes() {
        let (reg, h) = prepared();
        let ranked = dispatch(
            &reg,
            "optimize",
            json!({"handle": h, "pool": [], "opts": opts(), "w": {"profit": 3, "stability": 3, "soil": 2, "water": 1},
                   "baseline": rot(), "c": {"equipment": [], "sellable": []}}),
        )
        .unwrap();
        assert!(!ranked.as_array().unwrap().is_empty());
        let picks = dispatch(
            &reg,
            "pick_three",
            json!({"ranked": ranked, "baseline": rot()}),
        )
        .unwrap();
        assert!(picks[0]["whyCode"]["code"].is_string());
        let sheet = dispatch(
            &reg,
            "fact_sheet",
            json!({"handle": h, "rot": rot(), "opts": opts(), "picks": picks}),
        )
        .unwrap();
        assert!(sheet["worstYearWhyCodes"].is_array());
        let score = dispatch(
            &reg,
            "score",
            json!({"handle": h, "rot": [{"crop": "maize", "cover": false}], "opts": opts()}),
        )
        .unwrap();
        assert!(score["score"].as_f64().is_some());
        assert!(score["rules"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["code"] == "continuous_maize"));
    }

    #[test]
    fn bad_input_and_unknown_handle_are_errors() {
        let reg = Registry::default();
        assert!(dispatch(
            &reg,
            "simulate_rotation",
            json!({"handle": 9, "rot": rot(), "opts": opts()})
        )
        .is_err());
        assert!(dispatch(&reg, "nope", json!({})).is_err());
        assert!(dispatch(&reg, "prepare_farm", json!({"pack": {"meta": 1}})).is_err());
    }

    #[test]
    fn quant_10k_paths_is_fast_in_release() {
        let (reg, h) = prepared();
        let payload = json!({
            "handle": h, "rots": [rot()], "opts": opts(),
            "p": {"paths": 10000, "fromYear": 2026, "toYear": 2050, "ssp": "ssp245", "cashReserve": 0, "seed": 7}
        });
        let t = Instant::now();
        let r = dispatch(&reg, "quant_simulate", payload).unwrap();
        let ms = t.elapsed().as_millis();
        eprintln!("quant 10 000 paths: {ms} ms");
        assert!(r[0]["var95"].is_number() && r[0]["pRuin"].is_number());
        if !cfg!(debug_assertions) {
            assert!(ms < 2000, "10 000 paths took {ms} ms");
        }
    }
}
