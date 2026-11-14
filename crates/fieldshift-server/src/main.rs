use fieldshift_server::{app, AppState};
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    let port: u16 = std::env::var("PORT")
        .or_else(|_| std::env::var("SERVER_PORT"))
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8787);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let state = AppState::from_env();
    eprintln!(
        "fieldshift-server listening on http://{addr} (data: {})",
        state.data_dirs_display()
    );
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("cannot bind {addr}: {e}");
            std::process::exit(1);
        }
    };
    if let Err(e) = axum::serve(
        listener,
        app(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    {
        eprintln!("server error: {e}");
        std::process::exit(1);
    }
}
