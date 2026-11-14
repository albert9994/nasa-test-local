//! FieldShift desktop shell (Tauri 2).
//!
//! The UI (packages/ui, bundled by apps/desktop) talks to the engine through the `Engine` interface. By default that is the
//! TypeScript engine in a Web Worker. With the cargo feature `native-engine` the commands in `native.rs` are registered and
//! the UI switches to them (see packages/ui/src/lib/engine/tauri.ts). Without it, `engine_info` returns an error and the UI
//! keeps the TypeScript engine.

#[cfg(feature = "native-engine")]
mod native;

#[cfg(not(feature = "native-engine"))]
#[tauri::command]
fn engine_info() -> Result<serde_json::Value, String> {
    Err("native engine not compiled in (build with --features native-engine)".into())
}

#[cfg(feature = "native-engine")]
use native::engine_info;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(not(feature = "native-engine"))]
    let builder = builder.invoke_handler(tauri::generate_handler![engine_info]);

    #[cfg(feature = "native-engine")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        engine_info,
        native::prepare_farm,
        native::simulate_season,
        native::simulate_rotation,
        native::adaptation_margin,
        native::frontier,
        native::optimize,
        native::pick_three,
        native::margin_year,
        native::market_shock,
        native::quant_simulate,
        native::fact_sheet,
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running FieldShift");
}
