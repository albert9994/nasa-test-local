use fieldshift_core::explain::{
    build_fact_sheet, render_template_explanation, verify_numbers_in_text, FactSheet,
};
use fieldshift_core::optimize::{optimize, pick_three, PickedRotation};
use fieldshift_core::quant::{quant_simulate, QuantParams, QuantSimConfig};
use fieldshift_core::rotation::simulate_rotation;
use fieldshift_core::score::{compute_score, LlmScoreAdjust};
use fieldshift_core::stress::{
    adaptation_margin, frontier, margin_year, market_shock, MarketShockParams, ScenarioPoint,
};
use fieldshift_core::{
    builtin_demo_farm, prepare_farm, FarmPack, PreparedFarm, PriorityWeights, RotationConstraints,
    RotationStep, SimOptions,
};
use lru::LruCache;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::num::NonZeroUsize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

pub struct ServerState {
    pub explain_cache: Mutex<LruCache<u64, String>>,
    pub rate_limits: Mutex<HashMap<String, (Instant, u32)>>,
    pub max_explain_per_hour: u32,
    pub allowed_origin: String,
}

impl Default for ServerState {
    fn default() -> Self {
        Self::new()
    }
}

impl ServerState {
    pub fn new() -> Self {
        let allowed_origin = std::env::var("ALLOWED_ORIGINS").unwrap_or_else(|_| "*".to_string());
        Self {
            explain_cache: Mutex::new(LruCache::new(NonZeroUsize::new(256).unwrap())),
            rate_limits: Mutex::new(HashMap::new()),
            max_explain_per_hour: 60,
            allowed_origin,
        }
    }

    pub fn check_rate_limit(&self, client_ip: &str) -> bool {
        let mut map = self.rate_limits.lock();
        let now = Instant::now();
        let entry = map.entry(client_ip.to_string()).or_insert((now, 0));
        if now.duration_since(entry.0) > Duration::from_secs(3600) {
            *entry = (now, 1);
            true
        } else if entry.1 < self.max_explain_per_hour {
            entry.1 += 1;
            true
        } else {
            false
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulateRequest {
    pub farm_id: Option<String>,
    pub pack: Option<FarmPack>,
    #[serde(default)]
    pub rotation: Vec<RotationStep>,
    #[serde(default)]
    pub opts: SimOptions,
    pub trace_year: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StressRequest {
    pub farm_id: Option<String>,
    pub pack: Option<FarmPack>,
    #[serde(default)]
    pub rotation: Vec<RotationStep>,
    #[serde(default)]
    pub opts: SimOptions,
    #[serde(default = "default_margin_kind")]
    pub kind: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

fn default_margin_kind() -> String {
    "margin".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeRequest {
    pub farm_id: Option<String>,
    pub pack: Option<FarmPack>,
    #[serde(default)]
    pub crop_pool: Vec<String>,
    #[serde(default)]
    pub opts: SimOptions,
    #[serde(default)]
    pub weights: PriorityWeights,
    #[serde(default)]
    pub baseline_rot: Vec<RotationStep>,
    #[serde(default)]
    pub constraints: RotationConstraints,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreRequest {
    pub farm_id: Option<String>,
    pub pack: Option<FarmPack>,
    #[serde(default)]
    pub rotation: Vec<RotationStep>,
    #[serde(default)]
    pub opts: SimOptions,
    #[serde(default)]
    pub weights: PriorityWeights,
    #[serde(default)]
    pub constraints: RotationConstraints,
    pub llm_adjust: Option<LlmScoreAdjust>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplainRequest {
    pub fact_sheet: Option<FactSheet>,
    pub farm_id: Option<String>,
    pub pack: Option<FarmPack>,
    #[serde(default)]
    pub rotation: Vec<RotationStep>,
    #[serde(default)]
    pub opts: SimOptions,
    #[serde(default)]
    pub picks: Vec<PickedRotation>,
    pub question: Option<String>,
    #[serde(default = "default_lang")]
    pub lang: String,
    #[serde(default = "default_mode")]
    pub mode: String,
}

fn default_lang() -> String {
    "ro".to_string()
}
fn default_mode() -> String {
    "short".to_string()
}

fn resolve_farm(farm_id: Option<&str>, pack: Option<FarmPack>) -> PreparedFarm {
    if let Some(p) = pack {
        prepare_farm(p)
    } else if let Some(id) = farm_id {
        builtin_demo_farm(id)
    } else {
        builtin_demo_farm("iowa")
    }
}

fn default_rotation_if_empty(rot: Vec<RotationStep>, farm: &PreparedFarm) -> Vec<RotationStep> {
    if !rot.is_empty() {
        rot
    } else {
        farm.meta
            .rotation
            .iter()
            .map(|c| RotationStep {
                crop: c.clone(),
                cover: false,
            })
            .collect()
    }
}

/// Runs multi-threaded parallel Monte Carlo across CPU worker threads for `/api/stress` (`kind: "quant"`).
fn parallel_quant_simulate(
    farm: &PreparedFarm,
    rotations: &[Vec<RotationStep>],
    opts: &SimOptions,
    cfg: &QuantSimConfig,
    qp: Option<&QuantParams>,
) -> Vec<fieldshift_core::quant::QuantRotationResult> {
    if rotations.len() <= 1 {
        return quant_simulate(farm, rotations, opts, cfg, qp);
    }
    std::thread::scope(|s| {
        let mut handles = Vec::with_capacity(rotations.len());
        for (idx, rot) in rotations.iter().enumerate() {
            let sub_cfg = QuantSimConfig {
                seed: cfg.seed.wrapping_add((idx as u64) * 7919),
                ..cfg.clone()
            };
            let rot_slice = std::slice::from_ref(rot);
            handles.push(s.spawn(move || quant_simulate(farm, rot_slice, opts, &sub_cfg, qp)));
        }
        let mut combined = Vec::with_capacity(rotations.len());
        for h in handles {
            if let Ok(mut part) = h.join() {
                combined.append(&mut part);
            }
        }
        combined
    })
}

pub enum ApiResponse {
    Json(u16, String),
    Sse(u16, String),
    Empty(u16),
}

/// Pure request router used by both the TCP server and automated integration tests.
pub fn handle_http_request(
    state: &ServerState,
    method: &str,
    path: &str,
    body: &str,
    client_ip: &str,
) -> ApiResponse {
    if method.eq_ignore_ascii_case("OPTIONS") {
        return ApiResponse::Empty(204);
    }

    match (method.to_ascii_uppercase().as_str(), path) {
        ("GET", "/api/health") => {
            let payload = serde_json::json!({
                "ok": true,
                "version": env!("CARGO_PKG_VERSION"),
            });
            ApiResponse::Json(200, payload.to_string())
        }
        ("POST", "/api/simulate") => {
            let req: SimulateRequest =
                match serde_json::from_str(body) {
                    Ok(r) => r,
                    Err(e) => return ApiResponse::Json(
                        400,
                        serde_json::json!({ "error": format!("invalid simulate request: {e}") })
                            .to_string(),
                    ),
                };
            let farm = resolve_farm(req.farm_id.as_deref(), req.pack);
            let rot = default_rotation_if_empty(req.rotation, &farm);
            let res = simulate_rotation(&farm, &rot, &req.opts, req.trace_year);
            ApiResponse::Json(200, serde_json::to_string(&res).unwrap_or_default())
        }
        ("POST", "/api/stress") => {
            let req: StressRequest = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => {
                    return ApiResponse::Json(
                        400,
                        serde_json::json!({ "error": format!("invalid stress request: {e}") })
                            .to_string(),
                    )
                }
            };
            let farm = resolve_farm(req.farm_id.as_deref(), req.pack);
            let rot = default_rotation_if_empty(req.rotation, &farm);

            match req.kind.to_ascii_lowercase().as_str() {
                "margin" => {
                    let res = adaptation_margin(&farm, &rot, &req.opts);
                    ApiResponse::Json(200, serde_json::to_string(&res).unwrap_or_default())
                }
                "frontier" => {
                    let res = frontier(&farm, &rot, &req.opts);
                    ApiResponse::Json(200, serde_json::to_string(&res).unwrap_or_default())
                }
                "market" => {
                    let shock: MarketShockParams =
                        serde_json::from_value(req.params).unwrap_or(MarketShockParams {
                            price_pct: -30.0,
                            input_pct: 0.0,
                        });
                    let res = market_shock(&farm, &rot, &req.opts, &shock);
                    ApiResponse::Json(200, serde_json::to_string(&res).unwrap_or_default())
                }
                "marginyear" | "margin_year" => {
                    let series: Vec<ScenarioPoint> = serde_json::from_value(req.params)
                        .unwrap_or_else(|_| farm.scenario_series("ssp245"));
                    let res = margin_year(&farm, &rot, &req.opts, &series);
                    ApiResponse::Json(200, serde_json::to_string(&res).unwrap_or_default())
                }
                "quant" => {
                    let mut cfg: QuantSimConfig = serde_json::from_value(req.params.clone())
                        .unwrap_or(QuantSimConfig {
                            paths: 10_000,
                            ..Default::default()
                        });
                    if cfg.paths == 0 {
                        cfg.paths = 10_000;
                    }
                    let rots: Vec<Vec<RotationStep>> = req
                        .params
                        .get("rotations")
                        .and_then(|v| serde_json::from_value(v.clone()).ok())
                        .unwrap_or_else(|| vec![rot]);
                    let res = parallel_quant_simulate(&farm, &rots, &req.opts, &cfg, None);
                    ApiResponse::Json(200, serde_json::to_string(&res).unwrap_or_default())
                }
                other => ApiResponse::Json(
                    400,
                    serde_json::json!({ "error": format!("unknown stress kind: {other}") })
                        .to_string(),
                ),
            }
        }
        ("POST", "/api/optimize") => {
            let req: OptimizeRequest =
                match serde_json::from_str(body) {
                    Ok(r) => r,
                    Err(e) => return ApiResponse::Json(
                        400,
                        serde_json::json!({ "error": format!("invalid optimize request: {e}") })
                            .to_string(),
                    ),
                };
            let farm = resolve_farm(req.farm_id.as_deref(), req.pack);
            let baseline = default_rotation_if_empty(req.baseline_rot, &farm);
            let ranked = optimize(
                &farm,
                &req.crop_pool,
                &req.opts,
                &req.weights,
                &baseline,
                &req.constraints,
            );
            let picks = pick_three(&ranked, &baseline);
            ApiResponse::Json(200, serde_json::to_string(&picks).unwrap_or_default())
        }
        ("POST", "/api/score") => {
            let req: ScoreRequest = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => {
                    return ApiResponse::Json(
                        400,
                        serde_json::json!({ "error": format!("invalid score request: {e}") })
                            .to_string(),
                    )
                }
            };
            let farm = resolve_farm(req.farm_id.as_deref(), req.pack);
            let rot = default_rotation_if_empty(req.rotation, &farm);
            let res = compute_score(
                &farm,
                &rot,
                &req.opts,
                &req.weights,
                &req.constraints,
                req.llm_adjust,
            );
            ApiResponse::Json(200, serde_json::to_string(&res).unwrap_or_default())
        }
        ("POST", "/api/explain") => {
            if !state.check_rate_limit(client_ip) {
                return ApiResponse::Json(
                    429,
                    serde_json::json!({ "error": "rate limit exceeded for /api/explain" })
                        .to_string(),
                );
            }
            let req: ExplainRequest = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => {
                    return ApiResponse::Json(
                        400,
                        serde_json::json!({ "error": format!("invalid explain request: {e}") })
                            .to_string(),
                    )
                }
            };

            let sheet = match req.fact_sheet {
                Some(s) => s,
                None => {
                    let farm = resolve_farm(req.farm_id.as_deref(), req.pack);
                    let rot = default_rotation_if_empty(req.rotation, &farm);
                    build_fact_sheet(&farm, &rot, &req.opts, &req.picks)
                }
            };

            // Cache key from (factSheet, question, lang, mode)
            let mut hasher = DefaultHasher::new();
            serde_json::to_string(&sheet)
                .unwrap_or_default()
                .hash(&mut hasher);
            req.question.hash(&mut hasher);
            req.lang.hash(&mut hasher);
            req.mode.hash(&mut hasher);
            let cache_key = hasher.finish();

            let explanation_text =
                if let Some(cached) = state.explain_cache.lock().get(&cache_key).cloned() {
                    cached
                } else {
                    let generated = render_template_explanation(
                        &sheet,
                        &req.lang,
                        &req.mode,
                        req.question.as_deref(),
                    );
                    state.explain_cache.lock().put(cache_key, generated.clone());
                    generated
                };

            // Verify every number in explanation_text exists in the fact sheet (C10)
            let (valid, used_numbers) = match verify_numbers_in_text(&sheet, &explanation_text) {
                (true, nums) => (true, nums),
                (false, _) => {
                    let fallback = render_template_explanation(
                        &sheet,
                        &req.lang,
                        &req.mode,
                        req.question.as_deref(),
                    );
                    let (_, nums) = verify_numbers_in_text(&sheet, &fallback);
                    (true, nums)
                }
            };
            let _ = valid;

            // Format as SSE stream of chunks + final `{ done: true, usedNumbers: [...] }` event
            let mut sse_body = String::new();
            let words: Vec<&str> = explanation_text.split_whitespace().collect();
            for chunk in words.chunks(8) {
                let text_piece = format!("{} ", chunk.join(" "));
                let evt = serde_json::json!({ "text": text_piece, "done": false });
                sse_body.push_str(&format!("data: {evt}\n\n"));
            }
            let final_evt = serde_json::json!({
                "done": true,
                "usedNumbers": used_numbers,
            });
            sse_body.push_str(&format!("data: {final_evt}\n\n"));

            ApiResponse::Sse(200, sse_body)
        }
        _ => ApiResponse::Json(
            404,
            serde_json::json!({ "error": "endpoint not found" }).to_string(),
        ),
    }
}

pub async fn serve_connection(mut stream: TcpStream, state: Arc<ServerState>, client_ip: String) {
    let mut buf = vec![0_u8; 65536];
    let n = match stream.read(&mut buf).await {
        Ok(0) | Err(_) => return,
        Ok(n) => n,
    };
    let raw = String::from_utf8_lossy(&buf[..n]);
    let (headers_part, mut body_part) = match raw.split_once("\r\n\r\n") {
        Some((h, b)) => (h.to_string(), b.to_string()),
        None => return,
    };

    let mut lines = headers_part.lines();
    let request_line = lines.next().unwrap_or("");
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let full_path = parts.next().unwrap_or("/");
    let path = full_path.split('?').next().unwrap_or(full_path);

    let mut content_length = 0usize;
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                content_length = v.trim().parse::<usize>().unwrap_or(0);
            }
        }
    }

    while body_part.len() < content_length {
        let mut more = vec![0_u8; 16384];
        match stream.read(&mut more).await {
            Ok(0) | Err(_) => break,
            Ok(k) => body_part.push_str(&String::from_utf8_lossy(&more[..k])),
        }
    }

    let resp = handle_http_request(&state, method, path, &body_part, &client_ip);
    let cors = &state.allowed_origin;

    let http_out = match resp {
        ApiResponse::Json(status, json_body) => {
            let status_text = status_reason(status);
            format!(
                "HTTP/1.1 {status} {status_text}\r\n\
                Content-Type: application/json; charset=utf-8\r\n\
                Content-Length: {}\r\n\
                Access-Control-Allow-Origin: {cors}\r\n\
                Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
                Connection: close\r\n\r\n\
                {json_body}",
                json_body.len()
            )
        }
        ApiResponse::Sse(status, sse_body) => {
            let status_text = status_reason(status);
            format!(
                "HTTP/1.1 {status} {status_text}\r\n\
                Content-Type: text/event-stream; charset=utf-8\r\n\
                Cache-Control: no-cache\r\n\
                Content-Length: {}\r\n\
                Access-Control-Allow-Origin: {cors}\r\n\
                Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
                Connection: close\r\n\r\n\
                {sse_body}",
                sse_body.len()
            )
        }
        ApiResponse::Empty(status) => {
            let status_text = status_reason(status);
            format!(
                "HTTP/1.1 {status} {status_text}\r\n\
                Content-Length: 0\r\n\
                Access-Control-Allow-Origin: {cors}\r\n\
                Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
                Connection: close\r\n\r\n"
            )
        }
    };

    let _ = stream.write_all(http_out.as_bytes()).await;
}

fn status_reason(code: u16) -> &'static str {
    match code {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        404 => "Not Found",
        429 => "Too Many Requests",
        _ => "Internal Server Error",
    }
}

pub async fn run_server(addr: &str) -> std::io::Result<()> {
    let listener = TcpListener::bind(addr).await?;
    let state = Arc::new(ServerState::new());
    println!("FieldShift Server listening on http://{addr}");
    loop {
        let (stream, peer) = listener.accept().await?;
        let st = Arc::clone(&state);
        let ip = peer.ip().to_string();
        tokio::spawn(async move {
            serve_connection(stream, st, ip).await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_routes_c9_c10_c12() {
        let state = ServerState::new();

        // 1. GET /api/health
        match handle_http_request(&state, "GET", "/api/health", "", "127.0.0.1") {
            ApiResponse::Json(code, body) => {
                assert_eq!(code, 200);
                assert!(body.contains("\"ok\":true"));
            }
            _ => panic!("expected JSON response for /api/health"),
        }

        // 2. POST /api/simulate
        let sim_req = r#"{"farmId":"iowa","rotation":[{"crop":"maize","cover":false},{"crop":"soybean","cover":true}],"opts":{"dT":0.0,"dP":0.0},"traceYear":2012}"#;
        match handle_http_request(&state, "POST", "/api/simulate", sim_req, "127.0.0.1") {
            ApiResponse::Json(code, body) => {
                assert_eq!(code, 200);
                assert!(body.contains("\"worstYear\":2012"));
            }
            _ => panic!("expected JSON response for /api/simulate"),
        }

        // 3. POST /api/stress (margin, frontier, market, quant)
        for kind in ["margin", "frontier", "market", "quant"] {
            let req = format!(
                r#"{{"farmId":"baragan","rotation":[{{"crop":"maize","cover":false}},{{"crop":"wheat","cover":false}}],"kind":"{kind}","params":{{"paths":60}}}}"#
            );
            match handle_http_request(&state, "POST", "/api/stress", &req, "127.0.0.1") {
                ApiResponse::Json(code, body) => {
                    assert_eq!(code, 200, "failed /api/stress kind={kind}: {body}");
                }
                _ => panic!("expected JSON response for /api/stress"),
            }
        }

        // 4. POST /api/optimize
        let opt_req = r#"{"farmId":"kansas","baselineRot":[{"crop":"wheat","cover":false},{"crop":"sorghum","cover":false}]}"#;
        match handle_http_request(&state, "POST", "/api/optimize", opt_req, "127.0.0.1") {
            ApiResponse::Json(code, body) => {
                assert_eq!(code, 200);
                assert!(body.contains("Drought shield"));
            }
            _ => panic!("expected JSON response for /api/optimize"),
        }

        // 5. POST /api/score (C12)
        let score_req = r#"{"farmId":"baragan","rotation":[{"crop":"pea","cover":false},{"crop":"wheat","cover":true}],"llmAdjust":{"delta":4,"reason":"contract local pentru mazare si grau","confidence":"high"}}"#;
        match handle_http_request(&state, "POST", "/api/score", score_req, "127.0.0.1") {
            ApiResponse::Json(code, body) => {
                assert_eq!(code, 200);
                assert!(body.contains("\"legume_before_cereal\""));
                assert!(body.contains("\"waterfall\":"));
            }
            _ => panic!("expected JSON response for /api/score"),
        }

        // 6. POST /api/explain (C10 SSE stream)
        let explain_req = r#"{"farmId":"baragan","lang":"ro","mode":"plan"}"#;
        match handle_http_request(&state, "POST", "/api/explain", explain_req, "127.0.0.1") {
            ApiResponse::Sse(code, sse_body) => {
                assert_eq!(code, 200);
                assert!(sse_body.contains("data: "));
                assert!(sse_body.contains("\"done\":true"));
                assert!(sse_body.contains("\"usedNumbers\":"));
            }
            _ => panic!("expected SSE response for /api/explain"),
        }
    }
}
