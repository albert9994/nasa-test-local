//! FieldShift Axum API (C9): `/api/health`, `/api/simulate`, `/api/stress`, `/api/optimize`, `/api/score`,
//! `/api/explain` (SSE). Requests name a farm either by `farmId` (a real C1 pack from disk) or inline `pack`.
//! Weather is never synthesized: an unknown farm is a 404.

pub mod llm;

use axum::extract::State;
use axum::http::{header, Method, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use fieldshift_core::explain::{
    build_fact_sheet, render_template_explanation, verify_numbers_in_text, FactSheet,
};
use fieldshift_core::optimize::{optimize, pick_three, PickResult};
use fieldshift_core::quant::{quant_simulate, QuantConfig, QuantModel};
use fieldshift_core::rotation::simulate_rotation;
use fieldshift_core::score::{compute_score, LlmAdjustment};
use fieldshift_core::season::simulate_season;
use fieldshift_core::stress::{
    adaptation_margin, frontier, margin_year, market_shock, MarketShockParams,
};
use fieldshift_core::validate::{validate, ObservedYields};
use fieldshift_core::{
    prepare_farm, Constraints, EngineError, FarmPack, PreparedFarm, RotationStep, ScenarioPoint,
    SimOptions, Weights,
};
use llm::{LlmClient, NoLlm};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tower_http::cors::{Any, CorsLayer};

/// Shared server state: where packs live, a cache of prepared farms and the LLM client.
#[derive(Clone)]
pub struct AppState {
    data_dirs: Vec<PathBuf>,
    farms: Arc<RwLock<HashMap<String, Arc<PreparedFarm>>>>,
    llm: Arc<dyn LlmClient>,
    /// C11 `quant_params.json` (next to the farms directory, or `FIELDSHIFT_QUANT_PARAMS`); literature defaults if absent.
    quant: Option<Arc<QuantModel>>,
}

impl AppState {
    /// `FIELDSHIFT_DATA_DIR` = directory holding `<id>.json` packs; fallbacks are the repo's real packs
    /// (`apps/web/public/data/farms`) and then the mock packs (`apps/web/public/data/mock/farms`).
    pub fn from_env() -> Self {
        let mut dirs = Vec::new();
        if let Ok(d) = std::env::var("FIELDSHIFT_DATA_DIR") {
            dirs.push(PathBuf::from(d));
        }
        dirs.push(PathBuf::from("apps/web/public/data/farms"));
        dirs.push(PathBuf::from("apps/web/public/data/mock/farms"));
        Self::new(dirs)
    }

    pub fn new(data_dirs: Vec<PathBuf>) -> Self {
        let quant = Self::find_beside(&data_dirs, "quant_params.json")
            .or_else(|| {
                std::env::var("FIELDSHIFT_QUANT_PARAMS")
                    .ok()
                    .map(PathBuf::from)
            })
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|t| QuantModel::from_json(&t).ok())
            .map(Arc::new);
        Self {
            data_dirs,
            farms: Arc::default(),
            llm: Arc::new(NoLlm),
            quant,
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
}

async fn score(State(s): State<AppState>, Json(r): Json<ScoreReq>) -> ApiResult {
    blocking(move || {
        let farm = r.farm.resolve(&s)?;
        let rot = rotation_or_default(r.rotation, &farm);
        to_json(&compute_score(
            &farm,
            &rot,
            &r.opts,
            &r.weights,
            &r.constraints,
            r.llm,
        )?)
    })
    .await
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

async fn explain(
    State(s): State<AppState>,
    Json(r): Json<ExplainReq>,
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>>, ApiError> {
    let (lang, mode, question) = (r.lang.clone(), r.mode.clone(), r.question.clone());
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
    // Optional model text; anything that fails the C10 number check falls back to the template.
    let template = render_template_explanation(&sheet, &lang, &mode, question.as_deref());
    let candidate = match s
        .llm
        .explain(&sheet, &lang, &mode, question.as_deref())
        .await
    {
        Ok(Some(t)) if verify_numbers_in_text(&sheet, &t).0 => t,
        _ => template,
    };
    let (_, used) = verify_numbers_in_text(&sheet, &candidate);
    let mut events: Vec<Result<Event, Infallible>> = chunks(&candidate)
        .into_iter()
        .map(|t| Ok(Event::default().data(json!({ "text": t }).to_string())))
        .collect();
    events.push(Ok(
        Event::default().data(json!({ "done": true, "usedNumbers": used }).to_string())
    ));
    Ok(Sse::new(futures_util::stream::iter(events)).keep_alive(KeepAlive::default()))
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true, "engine": "fieldshift-core", "version": env!("CARGO_PKG_VERSION") }))
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
