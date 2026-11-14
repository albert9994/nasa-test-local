use fieldshift_server::run_server;

#[tokio::main]
async fn main() {
    let port = std::env::var("SERVER_PORT").unwrap_or_else(|_| "8787".to_string());
    let addr = format!("0.0.0.0:{port}");
    if let Err(e) = run_server(&addr).await {
        eprintln!("FieldShift server error: {e}");
        std::process::exit(1);
    }
}
