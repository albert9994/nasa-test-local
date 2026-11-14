//! LLM hook for `/api/explain` (stub: the real model call lands in a later task).
//!
//! Contract C10: the model only sees the fact sheet and every number it writes must appear in it. The server
//! verifies the output with `verify_numbers_in_text` and falls back to the deterministic template otherwise.

use fieldshift_core::explain::FactSheet;
use std::future::Future;
use std::pin::Pin;

pub type LlmFuture<'a> =
    Pin<Box<dyn Future<Output = Result<Option<String>, LlmError>> + Send + 'a>>;

#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("llm unavailable: {0}")]
    Unavailable(String),
}

/// Produces an explanation from a fact sheet. Return `Ok(None)` to use the template fallback.
pub trait LlmClient: Send + Sync {
    fn explain<'a>(
        &'a self,
        sheet: &'a FactSheet,
        lang: &'a str,
        mode: &'a str,
        question: Option<&'a str>,
    ) -> LlmFuture<'a>;
}

/// Default client: never calls a model, so `/api/explain` always serves the template text.
pub struct NoLlm;

impl LlmClient for NoLlm {
    fn explain<'a>(
        &'a self,
        _sheet: &'a FactSheet,
        _lang: &'a str,
        _mode: &'a str,
        _question: Option<&'a str>,
    ) -> LlmFuture<'a> {
        Box::pin(async { Ok(None) })
    }
}
