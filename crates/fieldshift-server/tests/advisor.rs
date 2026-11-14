//! Grounded advisor tests against a mock OpenAI-compatible / Anthropic server (no real LLM is ever called).

use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderMap, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use fieldshift_core::explain::{build_fact_sheet, FactSheet};
use fieldshift_core::{prepare_farm, FarmPack, RotationStep, SimOptions};
use fieldshift_server::llm::{HttpLlm, LlmConfig, Provider};
use fieldshift_server::{app, AppState};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tower::ServiceExt;

#[derive(Default)]
struct Mock {
    /// Streamed answer for the main call.
    answer: Mutex<String>,
    /// `accept` | `reject_all` | `broken`
    judge: Mutex<String>,
    /// Raw reply for the score adjustment call.
    score_reply: Mutex<String>,
    /// Respond 500 to everything.
    down: Mutex<bool>,
    bodies: Mutex<Vec<Value>>,
    headers: Mutex<Vec<HeaderMap>>,
}

fn sse_body(tokens: &[String], anthropic: bool) -> String {
    let mut out = String::new();
    for t in tokens {
        let v = if anthropic {
            json!({"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":t}})
        } else {
            json!({"choices":[{"delta":{"content":t}}]})
        };
        if anthropic {
            out.push_str("event: content_block_delta\n");
        }
        out.push_str(&format!("data: {v}\n\n"));
    }
    out.push_str(if anthropic {
        "data: {\"type\":\"message_stop\"}\n\n"
    } else {
        "data: [DONE]\n\n"
    });
    out
}

fn tokens(text: &str) -> Vec<String> {
    // awkward splits on purpose: tokens do not align with sentences
    text.chars()
        .collect::<Vec<_>>()
        .chunks(7)
        .map(|c| c.iter().collect())
        .collect()
}

async fn handle(m: Arc<Mock>, anthropic: bool, headers: HeaderMap, body: Value) -> Response {
    m.bodies.lock().unwrap().push(body.clone());
    m.headers.lock().unwrap().push(headers);
    if *m.down.lock().unwrap() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }
    let system = if anthropic {
        body["system"].as_str().unwrap_or("").to_string()
    } else {
        body["messages"][0]["content"]
            .as_str()
            .unwrap_or("")
            .to_string()
    };
    let wrap = |text: String| -> Response {
        if anthropic {
            Json(json!({"content":[{"type":"text","text":text}]})).into_response()
        } else {
            Json(json!({"choices":[{"message":{"content":text}}]})).into_response()
        }
    };
    if body["stream"] == true {
        let text = m.answer.lock().unwrap().clone();
        return (
            [("content-type", "text/event-stream")],
            sse_body(&tokens(&text), anthropic),
        )
            .into_response();
    }
    if system.contains("Evidence Judge") {
        let mode = m.judge.lock().unwrap().clone();
        let user = body["messages"]
            .as_array()
            .and_then(|a| a.last())
            .and_then(|l| l["content"].as_str())
            .unwrap_or("")
            .to_string();
        return match mode.as_str() {
            "reject_all" => {
                let sentences: Vec<Value> = user
                    .lines()
                    .filter(|l| l.chars().next().is_some_and(|c| c.is_ascii_digit()))
                    .map(|l| json!({"sentence": l, "supported": false}))
                    .collect();
                wrap(Value::Array(sentences).to_string())
            }
            "broken" => wrap("I cannot do that".into()),
            _ => wrap("[]".into()),
        };
    }
    if system.contains("Bounded Score Adjustment") {
        return wrap(m.score_reply.lock().unwrap().clone());
    }
    wrap("unexpected".into())
}

async fn spawn_mock(m: Arc<Mock>) -> String {
    async fn openai(State(m): State<Arc<Mock>>, h: HeaderMap, Json(b): Json<Value>) -> Response {
        handle(m, false, h, b).await
    }
    async fn anth(State(m): State<Arc<Mock>>, h: HeaderMap, Json(b): Json<Value>) -> Response {
        handle(m, true, h, b).await
    }
    let router = Router::new()
        .route("/v1/chat/completions", post(openai))
        .route("/v1/messages", post(anth))
        .with_state(m);
    let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = l.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(l, router).await.unwrap() });
    format!("http://{addr}/v1")
}

fn state_with(url: &str, provider: Provider) -> AppState {
    let root = format!("{}/../../apps/web/public/data", env!("CARGO_MANIFEST_DIR"));
    let llm = HttpLlm::new(LlmConfig {
        provider,
        url: url.to_string(),
        key: "test-key".into(),
        model: "test-model".into(),
    })
    .unwrap();
    AppState::new(vec![format!("{root}/mock/farms").into()]).with_llm(Arc::new(llm))
}

fn sheet() -> FactSheet {
    let root = format!(
        "{}/../../apps/web/public/data/mock/farms/iowa.json",
        env!("CARGO_MANIFEST_DIR")
    );
    let pack: FarmPack = serde_json::from_str(&std::fs::read_to_string(root).unwrap()).unwrap();
    let farm = prepare_farm(pack).unwrap();
    let rot = vec![
        RotationStep::new("maize", false),
        RotationStep::new("soybean", false),
    ];
    build_fact_sheet(&farm, &rot, &SimOptions::default(), &[], None).unwrap()
}

/// A faithful answer: only numbers and crops from the sheet, ending with the disclaimer.
fn good_answer(s: &FactSheet) -> String {
    format!(
        "On {} the {} rotation had {} bad years. Average net income was {:.1} $/ha. The worst season was {}. This is a scenario-based planning aid, not a guarantee.",
        s.farm.name, s.rotation, s.today.bad_years, s.today.mean_net, s.today.worst_year
    )
}

async fn post_json(state: &AppState, uri: &str, body: Value) -> (StatusCode, String) {
    let req = Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    let res = app(state.clone()).oneshot(req).await.unwrap();
    let st = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (st, String::from_utf8(bytes.to_vec()).unwrap())
}

fn events(body: &str) -> Vec<Value> {
    body.split("\n\n")
        .filter_map(|e| e.lines().find_map(|l| l.strip_prefix("data:")))
        .filter_map(|d| serde_json::from_str(d.trim()).ok())
        .collect()
}

fn streamed_text(ev: &[Value]) -> String {
    ev.iter()
        .filter_map(|e| e["text"].as_str())
        .filter(|_| true)
        .collect()
}

fn explain_req(s: &FactSheet, q: &str) -> Value {
    json!({ "factSheet": s, "lang": "en", "mode": "short", "question": q })
}

#[tokio::test]
async fn streams_tokens_and_verifies_clean_answer() {
    let m = Arc::new(Mock::default());
    let s = sheet();
    *m.answer.lock().unwrap() = good_answer(&s);
    let st = state_with(&spawn_mock(m.clone()).await, Provider::OpenAi);
    let (code, body) = post_json(&st, "/api/explain", explain_req(&s, "")).await;
    assert_eq!(code, StatusCode::OK);
    let ev = events(&body);
    assert!(
        ev.iter().filter(|e| e["text"].is_string()).count() > 3,
        "token-level stream"
    );
    let done = ev.last().unwrap();
    assert_eq!(done["done"], true);
    assert!(done.get("replaced").is_none(), "{done}");
    assert_eq!(streamed_text(&ev), good_answer(&s));
    // bearer key is sent to the model, never echoed to the browser
    assert_eq!(
        m.headers.lock().unwrap()[0]["authorization"],
        "Bearer test-key"
    );
    assert!(!body.contains("test-key"));
    let first = &m.bodies.lock().unwrap()[0];
    assert_eq!(first["stream"], true);
    assert!((first["temperature"].as_f64().unwrap() - 0.2).abs() < 1e-6);
}

#[tokio::test]
async fn invented_number_or_crop_is_removed() {
    let m = Arc::new(Mock::default());
    let s = sheet();
    *m.answer.lock().unwrap() = format!(
        "{} Yields will reach 987 t/ha next year. Plant sugar beet on half of the field.",
        good_answer(&s).replace(
            " This is a scenario-based planning aid, not a guarantee.",
            ""
        )
    ) + " This is a scenario-based planning aid, not a guarantee.";
    let st = state_with(&spawn_mock(m).await, Provider::OpenAi);
    let (_, body) = post_json(&st, "/api/explain", explain_req(&s, "")).await;
    let done = events(&body).pop().unwrap();
    assert_eq!(done["replaced"], true, "{done}");
    let text = done["text"].as_str().unwrap();
    assert!(
        !text.contains("987") && !text.to_lowercase().contains("sugar beet"),
        "{text}"
    );
    assert!(text.contains(&s.today.bad_years));
    assert!(text.ends_with("not a guarantee."));
    assert_eq!(done["unsupported"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn judge_rejection_falls_back_to_template() {
    let m = Arc::new(Mock::default());
    let s = sheet();
    *m.answer.lock().unwrap() = good_answer(&s);
    *m.judge.lock().unwrap() = "reject_all".into();
    let st = state_with(&spawn_mock(m).await, Provider::OpenAi);
    let (_, body) = post_json(&st, "/api/explain", explain_req(&s, "")).await;
    let done = events(&body).pop().unwrap();
    assert_eq!(done["replaced"], true);
    let template =
        fieldshift_core::explain::render_template_explanation(&s, "en", "short", Some(""));
    assert_eq!(done["text"].as_str().unwrap(), template);
    assert!(!done["unsupported"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn unparsable_judge_keeps_checked_answer() {
    let m = Arc::new(Mock::default());
    let s = sheet();
    *m.answer.lock().unwrap() = good_answer(&s);
    *m.judge.lock().unwrap() = "broken".into();
    let st = state_with(&spawn_mock(m).await, Provider::OpenAi);
    let (_, body) = post_json(&st, "/api/explain", explain_req(&s, "")).await;
    let done = events(&body).pop().unwrap();
    assert!(done.get("replaced").is_none());
    assert_eq!(done["judged"], false);
}

#[tokio::test]
async fn llm_down_serves_template_after_one_retry() {
    let m = Arc::new(Mock::default());
    *m.down.lock().unwrap() = true;
    let s = sheet();
    let st = state_with(&spawn_mock(m.clone()).await, Provider::OpenAi);
    let (code, body) = post_json(&st, "/api/explain", explain_req(&s, "")).await;
    assert_eq!(code, StatusCode::OK);
    let ev = events(&body);
    let template =
        fieldshift_core::explain::render_template_explanation(&s, "en", "short", Some(""));
    assert_eq!(streamed_text(&ev).trim(), template.trim());
    assert!(ev.last().unwrap().get("replaced").is_none());
    assert_eq!(m.bodies.lock().unwrap().len(), 2, "one retry");
}

#[tokio::test]
async fn chat_history_is_capped_at_six_turns() {
    let m = Arc::new(Mock::default());
    let s = sheet();
    *m.answer.lock().unwrap() = good_answer(&s);
    let st = state_with(&spawn_mock(m.clone()).await, Provider::OpenAi);
    let history: Vec<Value> = (0..10)
        .map(|i| json!({"role": if i % 2 == 0 {"user"} else {"assistant"}, "content": format!("turn {i}")}))
        .collect();
    let mut req = explain_req(&s, "and soybean?");
    req["mode"] = json!("chat");
    req["history"] = json!(history);
    let (code, _) = post_json(&st, "/api/explain", req).await;
    assert_eq!(code, StatusCode::OK);
    let msgs = m.bodies.lock().unwrap()[0]["messages"]
        .as_array()
        .unwrap()
        .clone();
    assert_eq!(msgs.len(), 1 + 6 + 1);
    assert!(
        msgs[0]["content"].as_str().unwrap().contains(&s.farm.name),
        "fact sheet grounds the chat"
    );
    assert_eq!(msgs[1]["content"], "turn 4");
}

#[tokio::test]
async fn rate_limit_applies_to_model_calls_not_cache_hits() {
    let m = Arc::new(Mock::default());
    let s = sheet();
    *m.answer.lock().unwrap() = good_answer(&s);
    let st = state_with(&spawn_mock(m.clone()).await, Provider::OpenAi).with_rate_limit(1);
    let (c1, _) = post_json(&st, "/api/explain", explain_req(&s, "a")).await;
    let (c2, b2) = post_json(&st, "/api/explain", explain_req(&s, "b")).await;
    let (c3, b3) = post_json(&st, "/api/explain", explain_req(&s, "a")).await;
    assert_eq!(c1, StatusCode::OK);
    assert_eq!(c2, StatusCode::TOO_MANY_REQUESTS, "{b2}");
    assert_eq!(c3, StatusCode::OK, "cached answers are free");
    assert_eq!(streamed_text(&events(&b3)), good_answer(&s));
    assert_eq!(
        m.bodies.lock().unwrap().len(),
        2,
        "1 stream + 1 judge, nothing for the cache hit"
    );
}

async fn score_with(reply: &str) -> Value {
    let m = Arc::new(Mock::default());
    *m.score_reply.lock().unwrap() = reply.to_string();
    let st = state_with(&spawn_mock(m).await, Provider::OpenAi);
    let (code, body) =
        post_json(&st, "/api/score", json!({ "farmId": "iowa", "lang": "en" })).await;
    assert_eq!(code, StatusCode::OK, "{body}");
    serde_json::from_str(&body).unwrap()
}

#[tokio::test]
async fn score_adjustment_is_validated() {
    let ok = score_with(r#"{"delta": 4, "reason": "Soybean follows maize so nitrogen is not a worry.", "confidence": "high"}"#).await;
    assert_eq!(ok["llm"]["delta"], 4);
    let w = ok["waterfall"].as_array().unwrap();
    assert_eq!(w[2], json!(["llm", 4]));
    assert_eq!(
        ok["score"].as_i64().unwrap(),
        (ok["base"].as_i64().unwrap() + w[1][1].as_i64().unwrap() + 4).clamp(0, 100)
    );

    for bad in [
        r#"{"delta": 40, "reason": "huge bonus", "confidence": "high"}"#,
        "not json at all",
        r#"{"delta": "five", "reason": "x"}"#,
        r#"{"delta": 5, "reason": "Yields reach 987 t/ha", "confidence": "high"}"#,
    ] {
        let v = score_with(bad).await;
        assert_eq!(v["llm"]["delta"], 0, "{bad}");
        assert_eq!(v["waterfall"][2], json!(["llm", 0]), "{bad}");
        assert_eq!(
            v["score"],
            v["base"]
                .as_i64()
                .map(|b| b + v["waterfall"][1][1].as_i64().unwrap())
                .map(|x| x.clamp(0, 100))
                .unwrap()
        );
    }
}

#[tokio::test]
async fn anthropic_adapter_streams_and_authenticates() {
    let m = Arc::new(Mock::default());
    let s = sheet();
    *m.answer.lock().unwrap() = good_answer(&s);
    let st = state_with(&spawn_mock(m.clone()).await, Provider::Anthropic);
    let (code, body) = post_json(&st, "/api/explain", explain_req(&s, "")).await;
    assert_eq!(code, StatusCode::OK);
    assert_eq!(streamed_text(&events(&body)), good_answer(&s));
    let h = &m.headers.lock().unwrap()[0];
    assert_eq!(h["x-api-key"], "test-key");
    assert_eq!(h["anthropic-version"], "2023-06-01");
    let b = &m.bodies.lock().unwrap()[0];
    assert!(b["system"].as_str().unwrap().contains("factSheet"));
    assert_eq!(b["messages"][0]["role"], "user");
}

#[tokio::test]
async fn no_llm_serves_template_and_default_score() {
    let root = format!("{}/../../apps/web/public/data", env!("CARGO_MANIFEST_DIR"));
    let st = AppState::new(vec![format!("{root}/mock/farms").into()]);
    let s = sheet();
    let (_, body) = post_json(&st, "/api/explain", explain_req(&s, "")).await;
    let ev = events(&body);
    assert!(ev.last().unwrap()["done"] == true && ev.last().unwrap().get("replaced").is_none());
    let (_, b) = post_json(&st, "/api/score", json!({ "farmId": "iowa" })).await;
    assert!(serde_json::from_str::<Value>(&b).unwrap()["llm"].is_null());
}
