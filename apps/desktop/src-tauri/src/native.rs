//! Native engine commands (cargo feature `native-engine`).
//!
//! One command per method of the TypeScript `Engine` interface (packages/ui/src/lib/engine/types.ts). Arguments and results
//! are the same JSON shapes as the TypeScript types (C1/C2/C3 contracts), so the UI adapter in
//! packages/ui/src/lib/engine/tauri.ts is a thin forwarder.
//!
//! Contract assumed from `fieldshift-core` (crates/fieldshift-core, created by workstream A1):
//!
//! ```ignore
//! pub const NAME: &str = "fieldshift-core";
//! pub const VERSION: &str = env!("CARGO_PKG_VERSION");
//! /// `method` is the snake_case command name below, `args` the JSON payload, the result is JSON.
//! pub fn call(method: &str, args: serde_json::Value) -> Result<serde_json::Value, String>;
//! ```
//!
//! If A1 exposes typed functions instead, only `dispatch` below needs to change.

use serde_json::{json, Value};

fn dispatch(method: &str, payload: Value) -> Result<Value, String> {
    // TODO(A1): `fieldshift_core::call(method, payload)` once the crate exists and the dependency line in Cargo.toml is enabled.
    let _ = (method, payload);
    Err("fieldshift-core is not linked yet: enable the dependency in src-tauri/Cargo.toml".into())
}

#[tauri::command]
pub fn engine_info() -> Result<Value, String> {
    // Probe the core so a half-wired build fails here (and the UI falls back to the TypeScript engine).
    dispatch("ping", json!({}))?;
    Ok(json!({ "name": "fieldshift-core", "version": env!("CARGO_PKG_VERSION"), "threads": std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1) }))
}

macro_rules! engine_command {
    ($($name:ident),* $(,)?) => {$(
        /// Runs on a blocking thread so long simulations never freeze the UI.
        #[tauri::command]
        pub async fn $name(payload: Value) -> Result<Value, String> {
            tauri::async_runtime::spawn_blocking(move || dispatch(stringify!($name), payload))
                .await
                .map_err(|e| e.to_string())?
        }
    )*};
}

engine_command!(
    prepare_farm, simulate_season, simulate_rotation, adaptation_margin, frontier, optimize,
    pick_three, margin_year, market_shock, quant_simulate, fact_sheet,
);
