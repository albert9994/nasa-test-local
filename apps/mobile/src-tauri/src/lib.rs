//! FieldShift mobile shell (Tauri 2, iOS + Android).
//!
//! Same engine contract as the desktop app: the native commands are the desktop's `native.rs`, included by path so the two
//! apps can never drift apart. The UI (packages/ui, bundled by apps/mobile) switches to them through
//! packages/ui/src/lib/engine/tauri.ts; without the `native-engine` feature it keeps the engine in a Web Worker.

#[cfg(feature = "native-engine")]
#[path = "../../../desktop/src-tauri/src/native.rs"]
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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(feature = "native-engine")]
    let builder = builder.manage(native::Registry::default());

    #[cfg(not(feature = "native-engine"))]
    let builder = builder.invoke_handler(tauri::generate_handler![engine_info]);

    #[cfg(feature = "native-engine")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        engine_info,
        native::prepare_farm,
        native::release_farm,
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
        native::validate,
        native::score,
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running FieldShift");
}
