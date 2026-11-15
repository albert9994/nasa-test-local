//! Hotar Axum API (C9): `/api/health`, `/api/simulate`, `/api/stress`, `/api/optimize`, `/api/score`,
//! `/api/explain` (SSE). Requests name a farm either by `farmId` (a real C1 pack from disk) or inline `pack`.
//! Weather is never synthesized: an unknown farm is a 404.

pub mod advisor;
pub mod llm;
pub mod ratelimit;

use advisor::{HistoryTurn, Prompts};
use axum::extract::{ConnectInfo, FromRequestParts, State};
use axum::http::request::Parts;
use axum::http::{header, Method, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use hotar_core::explain::{
    build_fact_sheet, render_template_explanation, verify_numbers_in_text, FactSheet,
};
use hotar_core::optimize::{optimize, pick_three, PickResult};
use hotar_core::quant::{quant_simulate, QuantConfig, QuantModel};
use hotar_core::rotation::simulate_rotation;
use hotar_core::score::{compute_score, LlmAdjustment, ScoreResult};
use hotar_core::season::simulate_season;
use hotar_core::stress::{
    adaptation_margin, frontier, margin_year, market_shock, MarketShockParams,
};
use hotar_core::validate::{validate, ObservedYields};
use hotar_core::{
    prepare_farm, Constraints, EngineError, FarmPack, PreparedFarm, RotationStep, ScenarioPoint,
    SimOptions, Weights,
};
use llm::{ChatMessage, ChatOpts, HttpLlm, LlmClient, NoLlm};
use lru::LruCache;
use ratelimit::RateLimiter;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::convert::Infallible;
use std::hash::{Hash, Hasher};
use std::net::SocketAddr;
use std::num::NonZeroUsize;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::{Arc, Mutex, RwLock};
use tower_http::cors::{Any, CorsLayer};

/// Shared server state: where packs live, a cache of prepared farms and the LLM client.
#[derive(Clone)]
pub struct AppState {
    data_dirs: Vec<PathBuf>,
    farms: Arc<RwLock<HashMap<String, Arc<PreparedFarm>>>>,
    llm: Arc<dyn LlmClient>,
    /// C11 `quant_params.json` (next to the farms directory, or `HOTAR_QUANT_PARAMS`); literature defaults if absent.
    quant: Option<Arc<QuantModel>>,
    prompts: Arc<Prompts>,
    cache: Arc<Mutex<LruCache<u64, CacheEntry>>>,
    limiter: Arc<RateLimiter>,
    trust_proxy: bool,
}

/// What the advisor remembers per (fact sheet, question, lang, mode).
#[derive(Clone)]
enum CacheEntry {
    Explain { text: String, used: Vec<f64> },
    Score(LlmAdjustment),
}

const CACHE_SIZE: usize = 256;
const DEFAULT_RATE_PER_HOUR: usize = 20;

impl AppState {
    /// `HOTAR_DATA_DIR` = directory holding `<id>.json` packs; fallbacks are the repo's real packs
    /// (`apps/web/public/data/farms`) and then the mock packs (`apps/web/public/data/mock/farms`).
    pub fn from_env() -> Self {
        let mut dirs = Vec::new();
        if let Ok(d) = std::env::var("HOTAR_DATA_DIR") {
            dirs.push(PathBuf::from(d));
        }
        dirs.push(PathBuf::from("apps/web/public/data/farms"));
        dirs.push(PathBuf::from("apps/web/public/data/mock/farms"));
        let mut st = Self::new(dirs);
        st.prompts = Arc::new(Prompts::from_env());
        if let Some(l) = HttpLlm::from_env() {
            eprintln!("advisor LLM: {} (key hidden)", l.describe());
            st.llm = Arc::new(l);
        } else {
            eprintln!("advisor LLM: not configured, serving template explanations");
        }
        if let Some(n) = std::env::var("HOTAR_RATE_LIMIT_PER_HOUR")
            .ok()
            .and_then(|v| v.parse().ok())
        {
            st.limiter = Arc::new(RateLimiter::per_hour(n));
        }
        st.trust_proxy = std::env::var("HOTAR_TRUST_PROXY").is_ok_and(|v| v == "1");
        st
    }

    pub fn new(data_dirs: Vec<PathBuf>) -> Self {
        let quant = Self::find_beside(&data_dirs, "quant_params.json")
            .or_else(|| std::env::var("HOTAR_QUANT_PARAMS").ok().map(PathBuf::from))
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|t| QuantModel::from_json(&t).ok())
            .map(Arc::new);
        Self {
            data_dirs,
            farms: Arc::default(),
            llm: Arc::new(NoLlm),
            quant,
            prompts: Arc::new(Prompts::embedded()),
            cache: Arc::new(Mutex::new(LruCache::new(
                NonZeroUsize::new(CACHE_SIZE).unwrap_or(NonZeroUsize::MIN),
            ))),
            limiter: Arc::new(RateLimiter::per_hour(DEFAULT_RATE_PER_HOUR)),
            trust_proxy: false,
        }
    }

    /// `<data dir>/../<name>` (the web app keeps `farms/`, `validation/` and `quant_params.json` side by side).
    fn find_beside(dirs: &[PathBuf], name: &str) -> Option<PathBuf> {
        dirs.iter()
            .filter_map(|d| d.parent().map(|p| p.join(name)))
            .find(|p| p.is_file())
    }

    pub fn with_llm(mut self, llm: Arc<dyn LlmClient>) -> Self {
        self.llm = llm;
        self
    }

    pub fn with_prompts(mut self, prompts: Prompts) -> Self {
        self.prompts = Arc::new(prompts);
        self
    }

    /// Per-IP limit for LLM calls (cache hits and template answers are free).
    pub fn with_rate_limit(mut self, per_hour: usize) -> Self {
        self.limiter = Arc::new(RateLimiter::per_hour(per_hour));
        self
    }

    fn cache_get(&self, key: u64) -> Option<CacheEntry> {
        self.cache.lock().ok()?.get(&key).cloned()
    }

    fn cache_put(&self, key: u64, e: CacheEntry) {
        if let Ok(mut c) = self.cache.lock() {
            c.put(key, e);
        }
    }

    pub fn data_dirs_display(&self) -> String {
        self.data_dirs
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    }

    fn load_farm(&self, id: &str) -> Result<Arc<PreparedFarm>, ApiError> {
        if id.is_empty()
            || !id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        {
            return Err(ApiError::bad(format!("invalid farmId {id:?}")));
        }
        if let Some(f) = self
            .farms
            .read()
            .map_err(|_| ApiError::internal("lock"))?
            .get(id)
        {
            return Ok(f.clone());
        }
        for dir in &self.data_dirs {
            let path = dir.join(format!("{id}.json"));
            if let Ok(text) = std::fs::read_to_string(&path) {
                let pack: FarmPack = serde_json::from_str(&text)
                    .map_err(|e| ApiError::bad(format!("{}: {e}", path.display())))?;
                let farm = Arc::new(prepare_farm(pack)?);
                self.farms
                    .write()
                    .map_err(|_| ApiError::internal("lock"))?
                    .insert(id.to_string(), farm.clone());
                return Ok(farm);
            }
        }
        Err(ApiError {
            status: StatusCode::NOT_FOUND,
            message: format!("no farm pack for id {id:?}"),
        })
    }
}

/// Error body `{ "error": "..." }`.
#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn bad(m: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: m.into(),
        }
    }
    fn too_many(retry_after: u64) -> Self {
        Self {
            status: StatusCode::TOO_MANY_REQUESTS,
            message: format!("rate limit reached, retry in {retry_after} s"),
        }
    }
    fn internal(m: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: m.into(),
        }
    }
}

impl From<EngineError> for ApiError {
    fn from(e: EngineError) -> Self {
        Self::bad(e.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(json!({ "error": self.message }))).into_response()
    }
}

/// Client key for rate limiting: the socket peer, or `X-Forwarded-For` when `HOTAR_TRUST_PROXY=1`.
struct ClientIp(String);

impl FromRequestParts<AppState> for ClientIp {
    type Rejection = Infallible;
    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let fwd = state
            .trust_proxy
            .then(|| parts.headers.get("x-forwarded-for"))
            .flatten()
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .map(|v| v.trim().to_string());
        let peer = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|c| c.0.ip().to_string());
        Ok(ClientIp(
            fwd.or(peer).unwrap_or_else(|| "unknown".to_string()),
        ))
    }
}

fn hash_key(parts: &[&str]) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    for p in parts {
        p.hash(&mut h);
        0u8.hash(&mut h);
    }
    h.finish()
}

type ApiResult = Result<Json<Value>, ApiError>;

fn to_json<T: serde::Serialize>(v: &T) -> ApiResult {
    serde_json::to_value(v)
        .map(Json)
        .map_err(|e| ApiError::internal(e.to_string()))
}

/// Runs CPU-bound engine work off the async runtime.
async fn blocking<T, F>(f: F) -> Result<T, ApiError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, ApiError> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| ApiError::internal(format!("worker failed: {e}")))?
}

/// Farm reference shared by all requests.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FarmRef {
    farm_id: Option<String>,
    pack: Option<FarmPack>,
}

impl FarmRef {
    fn resolve(self, state: &AppState) -> Result<Arc<PreparedFarm>, ApiError> {
        match (self.pack, self.farm_id) {
            (Some(p), _) => Ok(Arc::new(prepare_farm(p)?)),
            (None, Some(id)) => state.load_farm(&id),
            (None, None) => Err(ApiError::bad("request needs `farmId` or `pack`")),
        }
    }
}

fn rotation_or_default(rot: Vec<RotationStep>, farm: &PreparedFarm) -> Vec<RotationStep> {
    if rot.is_empty() {
        farm.meta
            .rotation
            .iter()
            .map(|c| RotationStep::new(c.clone(), false))
            .collect()
    } else {
        rot
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimulateReq {
    #[serde(flatten)]
    farm: FarmRef,
    #[serde(default)]
    rotation: Vec<RotationStep>,
    #[serde(default)]
    opts: SimOptions,
    trace_year: Option<i32>,
    /// With `crop` + `year`: a single season instead of a rotation.
    crop: Option<String>,
    year: Option<i32>,
    #[serde(default)]
    trace: bool,
}

async fn simulate(State(s): State<AppState>, Json(r): Json<SimulateReq>) -> ApiResult {
    blocking(move || {
        let farm = r.farm.resolve(&s)?;
        if let (Some(crop), Some(year)) = (&r.crop, r.year) {
            return to_json(&simulate_season(&farm, crop, year, &r.opts, r.trace)?);
        }
        let rot = rotation_or_default(r.rotation, &farm);
        to_json(&simulate_rotation(&farm, &rot, &r.opts, r.trace_year)?)
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StressReq {
    #[serde(flatten)]
    farm: FarmRef,
    #[serde(default)]
    rotation: Vec<RotationStep>,
    #[serde(default)]
    opts: SimOptions,
    kind: String,
    /// `market`: `{pricePct, inputPct}`; `marginYear`: `{series}`; `quant`: C3 quant params (+ optional `rotations`).
    #[serde(default)]
    params: Value,
}

async fn stress(State(s): State<AppState>, Json(r): Json<StressReq>) -> ApiResult {
    let quant_model = s.quant.clone();
    blocking(move || {
        let farm = r.farm.resolve(&s)?;
        let rot = rotation_or_default(r.rotation, &farm);
        let bad = |e: serde_json::Error| ApiError::bad(format!("invalid params: {e}"));
        match r.kind.as_str() {
            "margin" => to_json(&adaptation_margin(&farm, &rot, &r.opts)?),
            "frontier" => to_json(&frontier(&farm, &rot, &r.opts)?),
            "market" => {
                let p: MarketShockParams = serde_json::from_value(r.params).map_err(bad)?;
                to_json(&market_shock(&farm, &rot, &r.opts, &p)?)
            }
            "marginYear" => {
                let series: Vec<ScenarioPoint> = match r.params.get("series") {
                    Some(v) if !v.is_null() => serde_json::from_value(v.clone()).map_err(bad)?,
                    _ => Vec::new(),
                };
                to_json(&margin_year(&farm, &rot, &r.opts, &series)?)
            }
            "quant" => {
                let rots: Vec<Vec<RotationStep>> = match r.params.get("rotations") {
                    Some(v) if !v.is_null() => serde_json::from_value(v.clone()).map_err(bad)?,
                    _ => vec![rot],
                };
                let cfg: QuantConfig = serde_json::from_value(r.params.clone()).map_err(bad)?;
                // C11 params: inline `quantParams` > server file > literature defaults
                let inline: Option<QuantModel> = match r.params.get("quantParams") {
                    Some(v) if !v.is_null() => Some(
                        QuantModel::from_json(&v.to_string())
                            .map_err(|e| ApiError::bad(format!("invalid quantParams: {e}")))?,
                    ),
                    _ => None,
                };
                let model = inline.as_ref().or(quant_model.as_deref());
                to_json(&quant_simulate(&farm, &rots, &r.opts, &cfg, model)?)
            }
            other => Err(ApiError::bad(format!(
                "unknown stress kind {other:?} (margin | frontier | market | marginYear | quant)"
            ))),
        }
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ValidateReq {
    #[serde(flatten)]
    farm: FarmRef,
    #[serde(default)]
    opts: SimOptions,
    /// C5 county yields; when omitted the server reads `validation/<farmId>.json` next to the farms directory.
    observed: Option<ObservedYields>,
}

/// Calibration report `{crop: {n, r, rmse, bias, calib, pairs}}`: simulated vs observed county yields.
async fn validate_route(State(s): State<AppState>, Json(r): Json<ValidateReq>) -> ApiResult {
    blocking(move || {
        let id = r.farm.farm_id.clone();
        let farm = r.farm.resolve(&s)?;
        let observed = match r.observed {
            Some(o) => o,
            None => {
                let id =
                    id.ok_or_else(|| ApiError::bad("`observed` is required with an inline pack"))?;
                if !id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
                {
                    return Err(ApiError::bad(format!("invalid farmId {id:?}")));
                }
                let name = format!("validation/{id}.json");
                let path = AppState::find_beside(&s.data_dirs, &name).ok_or(ApiError {
                    status: StatusCode::NOT_FOUND,
                    message: format!("no county yields for {id:?} (expected {name})"),
                })?;
                let text = std::fs::read_to_string(&path)
                    .map_err(|e| ApiError::internal(format!("{}: {e}", path.display())))?;
                serde_json::from_str(&text)
                    .map_err(|e| ApiError::bad(format!("{}: {e}", path.display())))?
            }
        };
        to_json(&validate(&farm, &observed, &r.opts)?)
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OptimizeReq {
    #[serde(flatten)]
    farm: FarmRef,
    #[serde(default)]
    crop_pool: Vec<String>,
    #[serde(default)]
    opts: SimOptions,
    #[serde(default)]
    weights: Weights,
    #[serde(default)]
    baseline_rot: Vec<RotationStep>,
    #[serde(default)]
    constraints: Constraints,
}

async fn optimize_route(State(s): State<AppState>, Json(r): Json<OptimizeReq>) -> ApiResult {
    blocking(move || {
        let farm = r.farm.resolve(&s)?;
        let baseline = rotation_or_default(r.baseline_rot, &farm);
        let ranked = optimize(
            &farm,
            &r.crop_pool,
            &r.opts,
            &r.weights,
            &baseline,
            &r.constraints,
        )?;
        let picks = pick_three(&ranked, &baseline);
        Ok(Json(json!({ "ranked": ranked, "picks": picks })))
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScoreReq {
    #[serde(flatten)]
    farm: FarmRef,
    #[serde(default)]
    rotation: Vec<RotationStep>,
    #[serde(default)]
    opts: SimOptions,
    #[serde(default)]
    weights: Weights,
    #[serde(default)]
    constraints: Constraints,
    #[serde(default, alias = "llmAdjust")]
    llm: Option<LlmAdjustment>,
    #[serde(default = "default_lang")]
    lang: String,
}

async fn score(State(s): State<AppState>, ip: ClientIp, Json(r): Json<ScoreReq>) -> ApiResult {
    let ScoreReq {
        farm,
        rotation,
        opts,
        weights,
        constraints,
        llm,
        lang,
    } = r;
    let state = s.clone();
    let (farm, rot) = blocking(move || {
        let f = farm.resolve(&state)?;
        let rot = rotation_or_default(rotation, &f);
        Ok((f, rot))
    })
    .await?;
    let ctx: ScoreCtx = (farm, rot, opts, weights, constraints);
    let run = |ctx: &ScoreCtx, adj: Option<LlmAdjustment>| {
        let (f, rot, o, w, c) = ctx.clone();
        blocking(move || Ok(compute_score(&f, &rot, &o, &w, &c, adj)?))
    };
    let ask_llm = llm.is_none() && s.llm.enabled();
    let mut result = run(&ctx, llm).await?;
    if ask_llm {
        if let Some(adj) = llm_adjustment(&s, &ip.0, &ctx, &lang, &result).await {
            result = run(&ctx, Some(adj)).await?;
        }
    }
    to_json(&result)
}

type ScoreCtx = (
    Arc<PreparedFarm>,
    Vec<RotationStep>,
    SimOptions,
    Weights,
    Constraints,
);

/// Asks the model for a bounded nudge of the base score. `None` = no LLM answer (score stays deterministic);
/// an invalid or out-of-range answer becomes an explicit `delta = 0`.
async fn llm_adjustment(
    s: &AppState,
    ip: &str,
    ctx: &ScoreCtx,
    lang: &str,
    base: &ScoreResult,
) -> Option<LlmAdjustment> {
    let (farm, rot, opts) = (ctx.0.clone(), ctx.1.clone(), ctx.2.clone());
    let sheet = blocking(move || Ok(build_fact_sheet(&farm, &rot, &opts, &[], None)?))
        .await
        .ok()?;
    let breakdown = serde_json::to_string(base).ok()?;
    let sheet_json = serde_json::to_string(&sheet).ok()?;
    let key = hash_key(&["score", &sheet_json, &breakdown, lang]);
    if let Some(CacheEntry::Score(a)) = s.cache_get(key) {
        return Some(a);
    }
    if s.limiter.check(ip).is_err() {
        return None;
    }
    let msgs = vec![
        ChatMessage::new("system", s.prompts.get("score_adjust")),
        ChatMessage::new(
            "user",
            format!("lang: {lang}\nfactSheet:\n{sheet_json}\n\nscore:\n{breakdown}"),
        ),
    ];
    let opts = ChatOpts {
        temperature: 0.2,
        max_tokens: 200,
    };
    let reply = s.llm.complete(msgs, opts).await.ok()?;
    let adj = advisor::parse_adjustment(&reply, &sheet, &breakdown);
    s.cache_put(key, CacheEntry::Score(adj.clone()));
    Some(adj)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExplainReq {
    fact_sheet: Option<FactSheet>,
    #[serde(flatten)]
    farm: FarmRefOpt,
    #[serde(default)]
    rotation: Vec<RotationStep>,
    #[serde(default)]
    opts: SimOptions,
    #[serde(default)]
    picks: Vec<PickResult>,
    #[serde(default)]
    constraints: Option<Constraints>,
    question: Option<String>,
    #[serde(default = "default_lang")]
    lang: String,
    #[serde(default = "default_mode")]
    mode: String,
    /// Earlier chat turns (chat mode only; the last 6 are used).
    #[serde(default)]
    history: Vec<HistoryTurn>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct FarmRefOpt {
    farm_id: Option<String>,
    pack: Option<FarmPack>,
}

fn default_lang() -> String {
    "ro".into()
}
fn default_mode() -> String {
    "short".into()
}

/// Splits text into sentence-sized SSE chunks (the final chunk carries no trailing space).
fn chunks(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        cur.push(c);
        if matches!(c, '.' | '!' | '?') && chars.peek().is_some_and(|n| n.is_whitespace()) {
            cur.push(' ');
            chars.next();
            out.push(std::mem::take(&mut cur));
        }
    }
    if !cur.trim().is_empty() {
        out.push(cur);
    }
    out
}

type EventStream = Pin<Box<dyn futures_util::Stream<Item = Result<Event, Infallible>> + Send>>;

fn json_event(v: Value) -> Event {
    Event::default().data(v.to_string())
}

fn text_event(t: &str) -> Event {
    json_event(json!({ "text": t }))
}

/// A complete (already verified) text as sentence chunks + the final `done` event.
fn static_events(text: &str, used: &[f64]) -> Vec<Event> {
    let mut ev: Vec<Event> = chunks(text).iter().map(|t| text_event(t)).collect();
    ev.push(json_event(json!({ "done": true, "usedNumbers": used })));
    ev
}

fn sse(events: Vec<Event>) -> Response {
    let st: EventStream = Box::pin(futures_util::stream::iter(events.into_iter().map(Ok)));
    Sse::new(st)
        .keep_alive(KeepAlive::default())
        .into_response()
}

async fn explain(
    State(s): State<AppState>,
    ip: ClientIp,
    Json(r): Json<ExplainReq>,
) -> Result<Response, ApiError> {
    let (lang, mode, question) = (r.lang.clone(), r.mode.clone(), r.question.clone());
    let history = r.history.clone();
    let state = s.clone();
    let sheet: FactSheet = match r.fact_sheet {
        Some(sheet) => sheet,
        None => {
            blocking(move || {
                let farm = FarmRef {
                    farm_id: r.farm.farm_id,
                    pack: r.farm.pack,
                }
                .resolve(&state)?;
                let rot = rotation_or_default(r.rotation, &farm);
                Ok(build_fact_sheet(
                    &farm,
                    &rot,
                    &r.opts,
                    &r.picks,
                    r.constraints.as_ref(),
                )?)
            })
            .await?
        }
    };
    let template = render_template_explanation(&sheet, &lang, &mode, question.as_deref());
    if !s.llm.enabled() {
        let used = verify_numbers_in_text(&sheet, &template).1;
        return Ok(sse(static_events(&template, &used)));
    }

    // cache first (free), then the per-IP limit, then the model
    let sheet_json = serde_json::to_string(&sheet).unwrap_or_default();
    let hist_json = serde_json::to_string(
        &history
            .iter()
            .rev()
            .take(advisor::MAX_HISTORY)
            .map(|h| (&h.role, &h.content))
            .collect::<Vec<_>>(),
    )
    .unwrap_or_default();
    let key = hash_key(&[
        "explain",
        &sheet_json,
        question.as_deref().unwrap_or(""),
        &lang,
        &mode,
        &hist_json,
    ]);
    if let Some(CacheEntry::Explain { text, used }) = s.cache_get(key) {
        return Ok(sse(static_events(&text, &used)));
    }
    s.limiter.check(&ip.0).map_err(ApiError::too_many)?;

    let (tx, rx) = tokio::sync::mpsc::channel::<Event>(64);
    tokio::spawn(run_llm_explain(
        s, sheet, lang, mode, question, history, key, tx,
    ));
    let st: EventStream = Box::pin(futures_util::stream::unfold(rx, |mut rx| async move {
        rx.recv().await.map(|e| (Ok(e), rx))
    }));
    Ok(Sse::new(st)
        .keep_alive(KeepAlive::default())
        .into_response())
}

/// Streams the model's tokens while buffering them, then verifies the whole answer (numbers, crops, judge) and
/// emits the final `done` event, with `replaced: true` + the cleaned text when something was unsupported.
#[allow(clippy::too_many_arguments)]
async fn run_llm_explain(
    s: AppState,
    sheet: FactSheet,
    lang: String,
    mode: String,
    question: Option<String>,
    history: Vec<HistoryTurn>,
    key: u64,
    tx: tokio::sync::mpsc::Sender<Event>,
) {
    use futures_util::StreamExt;
    let msgs = advisor::explain_messages(
        &s.prompts,
        &sheet,
        &lang,
        &mode,
        question.as_deref(),
        &history,
    );
    let opts = ChatOpts {
        temperature: 0.2,
        max_tokens: advisor::max_tokens(&mode),
    };
    let mut buf = String::new();
    let mut failed = false;
    match s.llm.stream(msgs, opts).await {
        Ok(mut st) => {
            while let Some(item) = st.next().await {
                match item {
                    Ok(tok) => {
                        buf.push_str(&tok);
                        if tx.send(text_event(&tok)).await.is_err() {
                            return; // client went away
                        }
                    }
                    Err(e) => {
                        eprintln!("advisor: stream aborted: {e}");
                        failed = true;
                        break;
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("advisor: llm unavailable: {e}");
            failed = true;
        }
    }

    let template = render_template_explanation(&sheet, &lang, &mode, question.as_deref());
    if buf.trim().is_empty() {
        // nothing reached the browser yet: serve the template as a normal answer
        let used = verify_numbers_in_text(&sheet, &template).1;
        for e in static_events(&template, &used) {
            if tx.send(e).await.is_err() {
                return;
            }
        }
        return;
    }
    if failed {
        let used = verify_numbers_in_text(&sheet, &template).1;
        let _ = tx
            .send(json_event(json!({
                "done": true, "replaced": true, "text": template,
                "usedNumbers": used, "unsupported": ["(model stream interrupted)"],
            })))
            .await;
        return;
    }

    let flags = advisor::judge(s.llm.as_ref(), &s.prompts, &sheet, &buf).await;
    let judged = flags.is_some();
    let v = advisor::assess(
        &sheet,
        &lang,
        &mode,
        question.as_deref(),
        &buf,
        flags.as_deref(),
    );
    let done = if v.replaced {
        json!({
            "done": true, "replaced": true, "text": v.text,
            "usedNumbers": v.used, "unsupported": v.unsupported, "judged": judged,
        })
    } else {
        json!({ "done": true, "usedNumbers": v.used, "judged": judged })
    };
    let _ = tx.send(json_event(done)).await;
    // the cache only ever holds the verified final text
    s.cache_put(
        key,
        CacheEntry::Explain {
            text: v.text,
            used: v.used,
        },
    );
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true, "engine": "hotar-core", "version": env!("CARGO_PKG_VERSION") }))
}

/// Builds the router (CORS open for GET/POST so the web app and Tauri shell can call it).
pub fn app(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::ACCEPT]);
    Router::new()
        .route("/api/health", get(health))
        .route("/api/simulate", post(simulate))
        .route("/api/stress", post(stress))
        .route("/api/validate", post(validate_route))
        .route("/api/optimize", post(optimize_route))
        .route("/api/score", post(score))
        .route("/api/explain", post(explain))
        .layer(cors)
        .with_state(state)
}
