//! LLM clients for the advisor (`/api/explain`, `/api/score`).
//!
//! Contract C10: the model only sees the fact sheet and every number it writes must appear in it. The server
//! verifies the output (see `advisor`) and falls back to the deterministic template otherwise.
//!
//! Two wire formats are supported, selected by `LLM_PROVIDER`:
//! * `openai` (default): OpenAI-compatible `POST {LLM_API_URL}/chat/completions` with `Authorization: Bearer`.
//! * `anthropic`: Messages API `POST {LLM_API_URL}/messages` with `x-api-key` + `anthropic-version`.
//!
//! The API key is read from the environment only and is never logged, serialized or sent to the browser.

use futures_util::{Stream, StreamExt};
use serde_json::{json, Value};
use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;
pub type TokenStream = Pin<Box<dyn Stream<Item = Result<String, LlmError>> + Send>>;

/// Max wait for the response headers / first byte.
pub const FIRST_BYTE_TIMEOUT: Duration = Duration::from_secs(8);
/// Default max total duration of one request (including the streamed body); `LLM_TIMEOUT_SECS` overrides it.
/// Long answers from reasoning models (the plan mode) take about 30 s.
pub const TOTAL_TIMEOUT: Duration = Duration::from_secs(90);

fn total_timeout() -> Duration {
    std::env::var("LLM_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|s| *s > 0)
        .map_or(TOTAL_TIMEOUT, Duration::from_secs)
}
const RETRIES: usize = 1;

#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("llm unavailable: {0}")]
    Unavailable(String),
}

#[derive(Debug, Clone)]
pub struct ChatMessage {
    /// `system`, `user` or `assistant`.
    pub role: String,
    pub content: String,
}

impl ChatMessage {
    pub fn new(role: &str, content: impl Into<String>) -> Self {
        Self {
            role: role.to_string(),
            content: content.into(),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ChatOpts {
    pub temperature: f32,
    pub max_tokens: u32,
}

impl Default for ChatOpts {
    fn default() -> Self {
        Self {
            temperature: 0.2,
            max_tokens: 400,
        }
    }
}

/// A chat model. `NoLlm` means "not configured": callers serve the deterministic template.
pub trait LlmClient: Send + Sync {
    /// False for `NoLlm`; handlers skip all LLM work (and rate limiting) when false.
    fn enabled(&self) -> bool {
        true
    }
    /// Streams the answer token by token.
    fn stream(
        &self,
        messages: Vec<ChatMessage>,
        opts: ChatOpts,
    ) -> BoxFuture<'_, Result<TokenStream, LlmError>>;
    /// Non-streamed completion (judge, score adjustment).
    fn complete(
        &self,
        messages: Vec<ChatMessage>,
        opts: ChatOpts,
    ) -> BoxFuture<'_, Result<String, LlmError>>;
}

/// Default client: never calls a model, so the server always serves the template text.
pub struct NoLlm;

impl LlmClient for NoLlm {
    fn enabled(&self) -> bool {
        false
    }
    fn stream(
        &self,
        _m: Vec<ChatMessage>,
        _o: ChatOpts,
    ) -> BoxFuture<'_, Result<TokenStream, LlmError>> {
        Box::pin(async { Err(LlmError::Unavailable("no LLM configured".into())) })
    }
    fn complete(
        &self,
        _m: Vec<ChatMessage>,
        _o: ChatOpts,
    ) -> BoxFuture<'_, Result<String, LlmError>> {
        Box::pin(async { Err(LlmError::Unavailable("no LLM configured".into())) })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    OpenAi,
    Anthropic,
}

/// Connection settings. `Debug` redacts the key.
#[derive(Clone)]
pub struct LlmConfig {
    pub provider: Provider,
    pub url: String,
    pub key: String,
    pub model: String,
    /// OpenAI-style `reasoning_effort` for reasoning models (e.g. Meta `muse-spark-1.3`: minimal | low | medium | high).
    /// Hidden reasoning tokens count against `max_tokens`, so short answers need a low effort. Not sent when unset.
    pub reasoning_effort: Option<String>,
    /// Extra `max_tokens` for the hidden reasoning when `reasoning_effort` is set, on top of each call's answer budget
    /// (`LLM_REASONING_TOKENS`, default [`DEFAULT_REASONING_TOKENS`]).
    pub reasoning_tokens: u32,
}

/// Default reasoning headroom; measured on `muse-spark-1.3` at `minimal` with a full fact sheet.
pub const DEFAULT_REASONING_TOKENS: u32 = 1500;

impl std::fmt::Debug for LlmConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LlmConfig")
            .field("provider", &self.provider)
            .field("url", &self.url)
            .field("key", &"<redacted>")
            .field("model", &self.model)
            .field("reasoning_effort", &self.reasoning_effort)
            .field("reasoning_tokens", &self.reasoning_tokens)
            .finish()
    }
}

impl LlmConfig {
    /// Reads `LLM_PROVIDER` (openai | anthropic), `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL` and the optional
    /// `LLM_REASONING_EFFORT` / `LLM_REASONING_TOKENS`.
    /// Returns `None` when anything required is missing (the server then serves templates).
    pub fn from_env() -> Option<Self> {
        let get = |k: &str| std::env::var(k).ok().map(|v| v.trim().to_string());
        let provider = match get("LLM_PROVIDER").as_deref().map(str::to_ascii_lowercase) {
            Some(p) if p == "anthropic" => Provider::Anthropic,
            _ => Provider::OpenAi,
        };
        let url = get("LLM_API_URL").filter(|v| !v.is_empty()).or_else(|| {
            (provider == Provider::Anthropic).then(|| "https://api.anthropic.com/v1".to_string())
        })?;
        let key = get("LLM_API_KEY").filter(|v| !v.is_empty())?;
        let model = get("LLM_MODEL").filter(|v| !v.is_empty())?;
        let reasoning_effort = get("LLM_REASONING_EFFORT").filter(|v| !v.is_empty());
        let reasoning_tokens = get("LLM_REASONING_TOKENS")
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_REASONING_TOKENS);
        Some(Self {
            provider,
            url,
            key,
            model,
            reasoning_effort,
            reasoning_tokens,
        })
    }
}

/// HTTP client for either wire format.
pub struct HttpLlm {
    cfg: LlmConfig,
    http: reqwest::Client,
}

impl HttpLlm {
    pub fn new(cfg: LlmConfig) -> Result<Self, LlmError> {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(total_timeout())
            .build()
            .map_err(|e| LlmError::Unavailable(e.to_string()))?;
        Ok(Self { cfg, http })
    }

    pub fn from_env() -> Option<Self> {
        Self::new(LlmConfig::from_env()?).ok()
    }

    pub fn describe(&self) -> String {
        format!("{:?} model {}", self.cfg.provider, self.cfg.model)
    }

    fn endpoint(&self) -> String {
        let base = self.cfg.url.trim_end_matches('/');
        match self.cfg.provider {
            Provider::OpenAi => format!("{base}/chat/completions"),
            Provider::Anthropic => format!("{base}/messages"),
        }
    }

    fn body(&self, messages: &[ChatMessage], opts: ChatOpts, stream: bool) -> Value {
        match self.cfg.provider {
            Provider::OpenAi => {
                let mut b = json!({
                    "model": self.cfg.model,
                    "messages": messages.iter().map(|m| json!({"role": m.role, "content": m.content})).collect::<Vec<_>>(),
                    "temperature": opts.temperature,
                    "max_tokens": opts.max_tokens,
                    "stream": stream,
                });
                if let Some(e) = &self.cfg.reasoning_effort {
                    b["reasoning_effort"] = json!(e);
                    b["max_tokens"] =
                        json!(opts.max_tokens.saturating_add(self.cfg.reasoning_tokens));
                }
                b
            }
            Provider::Anthropic => {
                let system: Vec<&str> = messages
                    .iter()
                    .filter(|m| m.role == "system")
                    .map(|m| m.content.as_str())
                    .collect();
                json!({
                    "model": self.cfg.model,
                    "system": system.join("\n\n"),
                    "messages": messages.iter().filter(|m| m.role != "system")
                        .map(|m| json!({"role": m.role, "content": m.content})).collect::<Vec<_>>(),
                    "temperature": opts.temperature,
                    "max_tokens": opts.max_tokens,
                    "stream": stream,
                })
            }
        }
    }

    /// POST with a first-byte timeout and one retry (connect errors, timeouts, 429, 5xx).
    async fn send(&self, body: &Value) -> Result<reqwest::Response, LlmError> {
        let mut last = String::from("no attempt");
        for attempt in 0..=RETRIES {
            let mut req = self.http.post(self.endpoint()).json(body);
            req = match self.cfg.provider {
                Provider::OpenAi => req.bearer_auth(&self.cfg.key),
                Provider::Anthropic => req
                    .header("x-api-key", &self.cfg.key)
                    .header("anthropic-version", "2023-06-01"),
            };
            match tokio::time::timeout(FIRST_BYTE_TIMEOUT, req.send()).await {
                Ok(Ok(r)) if r.status().is_success() => return Ok(r),
                Ok(Ok(r)) => {
                    let st = r.status();
                    last = format!("upstream status {st}");
                    if !(st.is_server_error() || st.as_u16() == 429) {
                        break;
                    }
                }
                Ok(Err(e)) => last = format!("request failed: {}", e.without_url()),
                Err(_) => last = "first byte timeout".into(),
            }
            if attempt < RETRIES {
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
        }
        Err(LlmError::Unavailable(last))
    }
}

/// One SSE `data:` payload -> text delta (both wire formats). `None` for non-text events and `[DONE]`.
pub fn delta_from_sse_data(data: &str) -> Option<String> {
    let v: Value = serde_json::from_str(data.trim()).ok()?;
    if let Some(t) = v
        .pointer("/choices/0/delta/content")
        .and_then(Value::as_str)
    {
        return (!t.is_empty()).then(|| t.to_string());
    }
    if v.get("type").and_then(Value::as_str) == Some("content_block_delta") {
        let t = v.pointer("/delta/text").and_then(Value::as_str)?;
        return (!t.is_empty()).then(|| t.to_string());
    }
    None
}

/// Non-streamed response body -> answer text (both wire formats).
pub fn text_from_completion(v: &Value) -> Option<String> {
    if let Some(t) = v
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
    {
        return Some(t.to_string());
    }
    let parts: Vec<&str> = v
        .get("content")?
        .as_array()?
        .iter()
        .filter_map(|b| b.get("text").and_then(Value::as_str))
        .collect();
    (!parts.is_empty()).then(|| parts.join(""))
}

impl LlmClient for HttpLlm {
    fn stream(
        &self,
        messages: Vec<ChatMessage>,
        opts: ChatOpts,
    ) -> BoxFuture<'_, Result<TokenStream, LlmError>> {
        Box::pin(async move {
            let res = self.send(&self.body(&messages, opts, true)).await?;
            let (tx, rx) = tokio::sync::mpsc::channel::<Result<String, LlmError>>(64);
            tokio::spawn(async move {
                let mut bytes = res.bytes_stream();
                let mut buf = String::new();
                while let Some(chunk) = bytes.next().await {
                    let chunk = match chunk {
                        Ok(c) => c,
                        Err(e) => {
                            let _ = tx
                                .send(Err(LlmError::Unavailable(format!(
                                    "stream error: {}",
                                    e.without_url()
                                ))))
                                .await;
                            return;
                        }
                    };
                    buf.push_str(&String::from_utf8_lossy(&chunk));
                    while let Some(pos) = buf.find('\n') {
                        let line: String = buf.drain(..=pos).collect();
                        let line = line.trim();
                        let Some(data) = line.strip_prefix("data:") else {
                            continue;
                        };
                        if data.trim() == "[DONE]" {
                            return;
                        }
                        if let Some(t) = delta_from_sse_data(data) {
                            if tx.send(Ok(t)).await.is_err() {
                                return;
                            }
                        }
                    }
                }
            });
            let s: TokenStream = Box::pin(futures_util::stream::unfold(rx, |mut rx| async move {
                rx.recv().await.map(|i| (i, rx))
            }));
            Ok(s)
        })
    }

    fn complete(
        &self,
        messages: Vec<ChatMessage>,
        opts: ChatOpts,
    ) -> BoxFuture<'_, Result<String, LlmError>> {
        Box::pin(async move {
            let res = self.send(&self.body(&messages, opts, false)).await?;
            let v: Value = res
                .json()
                .await
                .map_err(|e| LlmError::Unavailable(format!("bad response: {}", e.without_url())))?;
            text_from_completion(&v)
                .ok_or_else(|| LlmError::Unavailable("response has no text".into()))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_openai_and_anthropic_deltas() {
        assert_eq!(
            delta_from_sse_data(r#"{"choices":[{"delta":{"content":"Hi"}}]}"#).as_deref(),
            Some("Hi")
        );
        assert_eq!(
            delta_from_sse_data(
                r#"{"type":"content_block_delta","delta":{"type":"text_delta","text":"Yo"}}"#
            )
            .as_deref(),
            Some("Yo")
        );
        assert_eq!(delta_from_sse_data(r#"{"type":"message_start"}"#), None);
        assert_eq!(delta_from_sse_data("[DONE]"), None);
    }

    #[test]
    fn parses_completions() {
        let o = json!({"choices":[{"message":{"content":"ok"}}]});
        let a = json!({"content":[{"type":"text","text":"a"},{"type":"text","text":"b"}]});
        assert_eq!(text_from_completion(&o).as_deref(), Some("ok"));
        assert_eq!(text_from_completion(&a).as_deref(), Some("ab"));
    }

    #[test]
    fn debug_redacts_key() {
        let c = LlmConfig {
            provider: Provider::OpenAi,
            url: "http://x".into(),
            key: "sk-secret".into(),
            model: "m".into(),
            reasoning_effort: None,
            reasoning_tokens: 0,
        };
        assert!(!format!("{c:?}").contains("sk-secret"));
    }

    #[test]
    fn reasoning_effort_only_when_set() {
        let mk = |e: Option<&str>| {
            HttpLlm::new(LlmConfig {
                provider: Provider::OpenAi,
                url: "http://x".into(),
                key: "k".into(),
                model: "m".into(),
                reasoning_effort: e.map(str::to_string),
                reasoning_tokens: 1000,
            })
            .unwrap()
        };
        let msgs = [ChatMessage::new("user", "hi")];
        let with = mk(Some("minimal")).body(&msgs, ChatOpts::default(), false);
        assert_eq!(with["reasoning_effort"], "minimal");
        assert_eq!(with["max_tokens"], ChatOpts::default().max_tokens + 1000);
        let without = mk(None).body(&msgs, ChatOpts::default(), false);
        assert!(without.get("reasoning_effort").is_none());
        assert_eq!(without["max_tokens"], ChatOpts::default().max_tokens);
    }
}
