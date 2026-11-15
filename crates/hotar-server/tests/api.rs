use axum::body::Body;
use axum::http::{Request, StatusCode};
use hotar_server::{app, AppState};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

fn state() -> AppState {
    let root = format!("{}/../../apps/web/public/data", env!("CARGO_MANIFEST_DIR"));
    AppState::new(vec![
        format!("{root}/farms").into(),
        format!("{root}/mock/farms").into(),
    ])
}

async fn call(method: &str, uri: &str, body: Value) -> (StatusCode, String) {
    let req = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    let res = app(state()).oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}

fn rot() -> Value {
    json!([{ "crop": "maize", "cover": false }, { "crop": "soybean", "cover": false }])
}

#[tokio::test]
async fn health_and_simulate() {
    let (s, b) = call("GET", "/api/health", json!(null)).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(serde_json::from_str::<Value>(&b).unwrap()["ok"], true);

    let (s, b) = call(
        "POST",
        "/api/simulate",
        json!({ "farmId": "iowa", "rotation": rot(), "opts": {}, "traceYear": 2012 }),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{b}");
    let v: Value = serde_json::from_str(&b).unwrap();
    assert_eq!(v["worstYear"], 2012);
    assert_eq!(v["traced"].as_array().unwrap().len(), 2);

    let (s, b) = call(
        "POST",
        "/api/simulate",
        json!({ "farmId": "iowa", "crop": "maize", "year": 2012, "trace": true }),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{b}");
    assert!(serde_json::from_str::<Value>(&b).unwrap()["trace"]["idx"].is_array());
}

#[tokio::test]
async fn stress_kinds() {
    for kind in ["margin", "frontier", "market", "marginYear", "quant"] {
        let params = match kind {
            "market" => json!({ "pricePct": -30, "inputPct": 20 }),
            "quant" => json!({ "paths": 50 }),
            _ => json!({}),
        };
        let (s, b) = call("POST", "/api/stress", json!({ "farmId": "baragan", "rotation": rot(), "opts": {}, "kind": kind, "params": params })).await;
        assert_eq!(s, StatusCode::OK, "{kind}: {b}");
    }
    let (s, _) = call(
        "POST",
        "/api/stress",
        json!({ "farmId": "iowa", "kind": "nope" }),
    )
    .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn optimize_and_score() {
    let (s, b) = call("POST", "/api/optimize", json!({ "farmId": "baragan", "cropPool": ["maize", "wheat", "sunflower", "pea"], "baselineRot": rot().as_array().map(|_| json!([{"crop":"maize"},{"crop":"wheat"}])) })).await;
    assert_eq!(s, StatusCode::OK, "{b}");
    let v: Value = serde_json::from_str(&b).unwrap();
    assert_eq!(v["picks"].as_array().unwrap().len(), 3);
    let (s, b) = call(
        "POST",
        "/api/score",
        json!({ "farmId": "baragan", "rotation": rot() }),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{b}");
    assert!(serde_json::from_str::<Value>(&b).unwrap()["llm"].is_null());
}

#[tokio::test]
async fn explain_streams_sse_with_final_done_event() {
    let (s, b) = call(
        "POST",
        "/api/explain",
        json!({ "farmId": "baragan", "rotation": rot(), "lang": "en" }),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{b}");
    let events: Vec<Value> = b
        .lines()
        .filter_map(|l| l.strip_prefix("data:"))
        .map(|d| serde_json::from_str(d.trim()).unwrap())
        .collect();
    assert!(events.len() >= 2);
    assert!(events[0]["text"].is_string());
    let last = events.last().unwrap();
    assert_eq!(last["done"], true);
    assert!(last["usedNumbers"].is_array());
}

#[tokio::test]
async fn unknown_farm_is_404_and_traversal_is_rejected() {
    let (s, _) = call("POST", "/api/simulate", json!({ "farmId": "atlantis" })).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    let (s, _) = call(
        "POST",
        "/api/simulate",
        json!({ "farmId": "../../etc/passwd" }),
    )
    .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, _) = call("POST", "/api/simulate", json!({ "rotation": [] })).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, _) = call(
        "POST",
        "/api/simulate",
        json!({ "farmId": "iowa", "rotation": [{"crop":"quinoa"}] }),
    )
    .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn validate_reports_per_crop_statistics() {
    let (s, b) = call(
        "POST",
        "/api/validate",
        json!({ "farmId": "iowa", "observed": { "crops": { "maize": { "years": { "2010": 11.0, "2011": 10.6, "2012": 6.9, "2013": 10.9 }, "bogus": { "years": {} } } } } }),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{b}");
    let v: Value = serde_json::from_str(&b).unwrap();
    assert_eq!(v["maize"]["n"], 4);
    assert!(v["maize"]["rmse"].as_f64().unwrap() > 0.0);
    assert!(v["maize"]["r"].is_number() && v["maize"]["bias"].is_number());
    // no observed data in the request: the server reads the farm's validation file (C5, real county yields)
    let (s, b) = call("POST", "/api/validate", json!({ "farmId": "iowa" })).await;
    assert_eq!(s, StatusCode::OK, "{b}");
    let v: Value = serde_json::from_str(&b).unwrap();
    assert!(v["maize"]["n"].as_u64().unwrap() > 0);
}

#[tokio::test]
async fn quant_accepts_inline_c11_params_and_new_fields() {
    let (s, b) = call(
        "POST",
        "/api/stress",
        json!({ "farmId": "iowa", "rotation": rot(), "opts": {}, "kind": "quant",
                "params": { "paths": 60, "debtService": 200, "livingCost": 100, "sensitivity": true,
                            "quantParams": { "crops": { "maize": { "priceMean": 150, "vol": 0.3 } }, "inputs": { "jumpProb": 0.1 } } } }),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{b}");
    let v: Value = serde_json::from_str(&b).unwrap();
    assert_eq!(v[0]["sensitivity"].as_array().unwrap().len(), 3);
    assert!(v[0]["mcSe"]["meanAnnual"].is_number());
}
