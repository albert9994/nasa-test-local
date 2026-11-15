//! Hotar desktop shell (Tauri 2).
//!
//! The UI (packages/ui, bundled by apps/desktop) talks to the engine through the `Engine` interface. By default that is the
//! Rust engine (WASM) in a Web Worker. The default cargo feature `native-engine` registers the commands in `native.rs` (the
//! Rust core with rayon, called through Tauri) and the UI switches to them (packages/ui/src/lib/engine/tauri.ts). Without it
//! (`--no-default-features`), `engine_info` returns an error and the UI keeps the worker engine.

mod ai;
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
        .plugin(tauri_plugin_opener::init())
        .manage(ai::AiServer::default())
        .setup(|app| {
            use tauri::Manager;
            let url = ai::start();
            if let Ok(mut g) = app.state::<ai::AiServer>().0.lock() {
                *g = url;
            }
            Ok(())
        });

    #[cfg(feature = "native-engine")]
    let builder = builder.manage(native::Registry::default());

    #[cfg(not(feature = "native-engine"))]
    let builder = builder.invoke_handler(tauri::generate_handler![engine_info, ai::ai_server_url]);

    #[cfg(feature = "native-engine")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        engine_info,
        ai::ai_server_url,
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
        .expect("error while running Hotar");
}
