//! Local AI advisor (cargo feature `ai-server`, on by default).
//!
//! At launch the app reads `~/.hotar/ai.env` (and the `LLM_*` environment variables, which win), and when an LLM is
//! configured it serves the Hotar API (crates/hotar-server: explain, chat, score adjustment) on 127.0.0.1. The UI asks
//! for that address with `ai_server_url` before it renders. Without a configuration nothing is started and the UI keeps
//! its template explanations and on-device score. The API key never leaves this computer except to the LLM provider.

use std::sync::Mutex;

#[derive(Default)]
pub struct AiServer(pub Mutex<Option<String>>);

/// Preferred port (next to the standalone server's 8787, so both can run); any free port is used when it is taken.
#[cfg(feature = "ai-server")]
const PORT: u16 = 8788;

/// Built without the `ai-server` feature: no local AI.
#[cfg(not(feature = "ai-server"))]
pub fn start() -> Option<String> {
    None
}

/// Starts the embedded server when an LLM is configured. Returns its base URL.
#[cfg(feature = "ai-server")]
pub fn start() -> Option<String> {
    hotar_server::envfile::load_local_env();
    if std::env::var_os("HOTAR_RATE_LIMIT_PER_HOUR").is_none() {
        // one person on their own key: no need for the public per-IP limit
        std::env::set_var("HOTAR_RATE_LIMIT_PER_HOUR", "1000");
    }
    hotar_server::llm::LlmConfig::from_env()?;
    let listener = match hotar_server::bind_loopback(PORT) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("AI server: cannot bind 127.0.0.1: {e}");
            return None;
        }
    };
    let addr = listener.local_addr().ok()?;
    let state = hotar_server::AppState::from_env();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = hotar_server::serve_std(listener, state).await {
            eprintln!("AI server stopped: {e}");
        }
    });
    Some(format!("http://{addr}"))
}

/// Base URL of the embedded AI server, or null when no LLM is configured.
#[tauri::command]
pub fn ai_server_url(state: tauri::State<'_, AiServer>) -> Option<String> {
    state.0.lock().ok().and_then(|g| g.clone())
}
