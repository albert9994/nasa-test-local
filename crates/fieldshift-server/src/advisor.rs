//! Grounded advisor: prompts, answer checking (numbers, crops, per-sentence judge) and the explain pipeline.
//!
//! Pattern: the engine computes, the LLM only explains the evidence packet (the C10 fact sheet). Every answer is
//! checked sentence by sentence; unsupported sentences are removed, and if too little is left the deterministic
//! template is served instead.

use crate::llm::{ChatMessage, ChatOpts, LlmClient};
use fieldshift_core::explain::{
    render_template_explanation, unverified_crops, verify_numbers_in_text, FactSheet,
};
use fieldshift_core::score::LlmAdjustment;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

const EMBEDDED: [(&str, &str); 5] = [
    (
        "explain_short",
        include_str!("../../../prompts/explain_short.md"),
    ),
    (
        "explain_plan",
        include_str!("../../../prompts/explain_plan.md"),
    ),
    ("chat", include_str!("../../../prompts/chat.md")),
    ("judge", include_str!("../../../prompts/judge.md")),
    (
        "score_adjust",
        include_str!("../../../prompts/score_adjust.md"),
    ),
];

/// System prompts, loaded once at server start.
#[derive(Debug, Clone)]
pub struct Prompts {
    map: HashMap<&'static str, String>,
}

impl Prompts {
    /// Built-in copies of `prompts/*.md` (used when no directory is configured).
    pub fn embedded() -> Self {
        Self {
            map: EMBEDDED
                .iter()
                .map(|(k, v)| (*k, (*v).to_string()))
                .collect(),
        }
    }

    /// Loads `<dir>/<name>.md`; a missing file falls back to the built-in copy.
    pub fn load(dir: &Path) -> Self {
        let mut p = Self::embedded();
        for (name, _) in EMBEDDED {
            if let Ok(text) = std::fs::read_to_string(dir.join(format!("{name}.md"))) {
                if !text.trim().is_empty() {
                    p.map.insert(name, text);
                }
            }
        }
        p
    }

    /// `FIELDSHIFT_PROMPTS_DIR` (default `prompts/`).
    pub fn from_env() -> Self {
        let dir = std::env::var("FIELDSHIFT_PROMPTS_DIR").unwrap_or_else(|_| "prompts".into());
        Self::load(Path::new(&dir))
    }

    pub fn get(&self, name: &str) -> &str {
        self.map.get(name).map_or("", String::as_str)
    }

    pub fn for_mode(&self, mode: &str) -> &str {
        self.get(match mode.to_ascii_lowercase().as_str() {
            "plan" => "explain_plan",
            "chat" => "chat",
            _ => "explain_short",
        })
    }
}

/// One earlier chat turn sent by the browser.
#[derive(Debug, Clone, Deserialize)]
pub struct HistoryTurn {
    pub role: String,
    pub content: String,
}

pub const MAX_HISTORY: usize = 6;
pub const MAX_QUESTION_CHARS: usize = 600;

fn clip(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

pub fn max_tokens(mode: &str) -> u32 {
    match mode.to_ascii_lowercase().as_str() {
        "plan" => 1000,
        "chat" => 320,
        _ => 380,
    }
}

/// system prompt + fact sheet, then (chat only) up to 6 history turns, then the question.
pub fn explain_messages(
    prompts: &Prompts,
    sheet: &FactSheet,
    lang: &str,
    mode: &str,
    question: Option<&str>,
    history: &[HistoryTurn],
) -> Vec<ChatMessage> {
    let json = serde_json::to_string_pretty(sheet).unwrap_or_default();
    let system = format!(
        "{}\n\n## Runtime input\nlang: {lang}\nfactSheet (the ONLY source of truth, do not use any other data):\n```json\n{json}\n```",
        prompts.for_mode(mode)
    );
    let mut m = vec![ChatMessage::new("system", system)];
    if mode.eq_ignore_ascii_case("chat") {
        let start = history.len().saturating_sub(MAX_HISTORY);
        for t in &history[start..] {
            let role = if t.role == "assistant" {
                "assistant"
            } else {
                "user"
            };
            m.push(ChatMessage::new(role, clip(&t.content, MAX_QUESTION_CHARS)));
        }
    }
    let q = question.map(str::trim).filter(|q| !q.is_empty());
    let ask = match (q, mode.to_ascii_lowercase().as_str()) {
        (Some(q), _) => clip(q, MAX_QUESTION_CHARS),
        (None, "plan") => "Write the plan.".to_string(),
        (None, _) => "Explain this result.".to_string(),
    };
    m.push(ChatMessage::new(
        "user",
        format!("{ask}\n\n(Answer in language: {lang}.)"),
    ));
    m
}

// ---------- sentences ----------

/// A sentence and the whitespace that followed it (so cleaned text keeps its line structure).
#[derive(Debug, Clone, PartialEq)]
pub struct Seg {
    pub text: String,
    pub tail: String,
}

fn is_list_marker(cur: &str) -> bool {
    let rest = cur.trim_start_matches(|c: char| "#*->• \t_".contains(c));
    rest.len() > 1
        && rest.ends_with('.')
        && rest[..rest.len() - 1].chars().all(|c| c.is_ascii_digit())
}

/// Splits on `. ! ?` followed by whitespace (not inside decimals or `1.` list markers) and on newlines.
pub fn split_sentences(text: &str) -> Vec<Seg> {
    let ch: Vec<char> = text.chars().collect();
    let (mut segs, mut cur, mut i) = (Vec::<Seg>::new(), String::new(), 0);
    let take_ws = |i: &mut usize| {
        let mut w = String::new();
        while *i < ch.len() && ch[*i].is_whitespace() {
            w.push(ch[*i]);
            *i += 1;
        }
        w
    };
    let push = |cur: &mut String, tail: String, segs: &mut Vec<Seg>| {
        if cur.trim().is_empty() {
            if let Some(last) = segs.last_mut() {
                last.tail.push_str(cur);
                last.tail.push_str(&tail);
            }
        } else {
            segs.push(Seg {
                text: std::mem::take(cur),
                tail,
            });
        }
        cur.clear();
    };
    while i < ch.len() {
        let c = ch[i];
        if c == '\n' {
            let tail = take_ws(&mut i);
            push(&mut cur, tail, &mut segs);
        } else if matches!(c, '.' | '!' | '?') {
            cur.push(c);
            i += 1;
            while i < ch.len() && matches!(ch[i], '*' | '_' | '"' | ')' | '”') {
                cur.push(ch[i]);
                i += 1;
            }
            if (i >= ch.len() || ch[i].is_whitespace()) && !is_list_marker(&cur) {
                let tail = take_ws(&mut i);
                push(&mut cur, tail, &mut segs);
            }
        } else {
            cur.push(c);
            i += 1;
        }
    }
    push(&mut cur, String::new(), &mut segs);
    segs
}

pub fn is_disclaimer(s: &str) -> bool {
    let l = s.to_lowercase();
    l.contains("nu o garanție") || l.contains("nu o garantie") || l.contains("not a guarantee")
}

pub fn disclaimer(lang: &str, mode: &str) -> &'static str {
    let ro = lang.trim().to_ascii_lowercase().starts_with("ro");
    match (ro, mode.eq_ignore_ascii_case("chat")) {
        (true, true) => "Instrument de planificare, nu o garanție.",
        (true, false) => {
            "Acesta este un instrument de planificare bazat pe scenarii, nu o garanție."
        }
        (false, true) => "Planning aid, not a guarantee.",
        (false, false) => "This is a scenario-based planning aid, not a guarantee.",
    }
}

/// Drops the list marker and `SSP2-4.5` style labels, which are not data numbers.
fn numeric_view(s: &str) -> String {
    let mut t = s.trim_start_matches(|c: char| "#*->• \t_".contains(c));
    let digits = t.chars().take_while(char::is_ascii_digit).count();
    if digits > 0 && matches!(t[digits..].chars().next(), Some('.' | ')')) {
        t = t[digits + 1..].trim_start();
    }
    let (b, mut out, mut i) = (t.as_bytes(), String::new(), 0);
    while i < b.len() {
        if t[i..].starts_with("SSP")
            && i + 8 <= b.len()
            && b[i + 3].is_ascii_digit()
            && b[i + 4] == b'-'
            && b[i + 5].is_ascii_digit()
            && b[i + 6] == b'.'
            && b[i + 7].is_ascii_digit()
        {
            out.push_str("SSP");
            i += 8;
        } else {
            let ch = t[i..].chars().next().unwrap_or(' ');
            out.push(ch);
            i += ch.len_utf8();
        }
    }
    out
}

/// Result of checking one answer.
#[derive(Debug, Clone)]
pub struct Verdict {
    pub text: String,
    pub replaced: bool,
    pub unsupported: Vec<String>,
    pub used: Vec<f64>,
}

/// Why a sentence fails the deterministic checks (numbers, crops). `None` = ok.
fn sentence_problem(sheet: &FactSheet, s: &str) -> Option<&'static str> {
    if !verify_numbers_in_text(sheet, &numeric_view(s)).0 {
        return Some("number");
    }
    if !unverified_crops(sheet, s).is_empty() {
        return Some("crop");
    }
    None
}

/// Checks `raw` sentence by sentence (numbers, crops, optional judge flags aligned with `split_sentences`).
/// Unsupported sentences are removed; the template replaces the answer when fewer than 2 factual sentences stay.
pub fn assess(
    sheet: &FactSheet,
    lang: &str,
    mode: &str,
    question: Option<&str>,
    raw: &str,
    judge: Option<&[bool]>,
) -> Verdict {
    let segs = split_sentences(raw);
    let mut kept = String::new();
    let (mut unsupported, mut factual, mut has_disclaimer) = (Vec::new(), 0, false);
    for (i, seg) in segs.iter().enumerate() {
        if is_disclaimer(&seg.text) {
            has_disclaimer = true;
            kept.push_str(&seg.text);
            kept.push_str(&seg.tail);
            continue;
        }
        let judged_ok = judge.and_then(|j| j.get(i)).copied().unwrap_or(true);
        if sentence_problem(sheet, &seg.text).is_some() || !judged_ok {
            unsupported.push(seg.text.trim().to_string());
        } else {
            factual += 1;
            kept.push_str(&seg.text);
            kept.push_str(&seg.tail);
        }
    }
    if factual < 2 {
        let text = render_template_explanation(sheet, lang, mode, question);
        let used = verify_numbers_in_text(sheet, &text).1;
        return Verdict {
            text,
            replaced: true,
            unsupported,
            used,
        };
    }
    let mut text = kept.trim_end().to_string();
    let changed = !unsupported.is_empty() || !has_disclaimer;
    if !has_disclaimer {
        text.push(' ');
        text.push_str(disclaimer(lang, mode));
    }
    let used = verify_numbers_in_text(sheet, &text).1;
    Verdict {
        text: if changed { text } else { raw.to_string() },
        replaced: changed,
        unsupported,
        used,
    }
}

// ---------- judge ----------

#[derive(Deserialize)]
struct JudgeItem {
    sentence: String,
    supported: bool,
}

/// First JSON array (or object) embedded in `s`, tolerant of code fences and chatter.
pub fn extract_json(s: &str, open: char, close: char) -> Option<&str> {
    let a = s.find(open)?;
    let b = s.rfind(close)?;
    (b > a).then(|| &s[a..=b])
}

/// Maps judge items onto segments (by index when counts match, else by sentence text); unmatched = supported.
pub fn judge_flags(items_json: &str, segs: &[Seg]) -> Option<Vec<bool>> {
    let items: Vec<JudgeItem> = serde_json::from_str(extract_json(items_json, '[', ']')?).ok()?;
    if items.len() == segs.len() {
        return Some(items.iter().map(|i| i.supported).collect());
    }
    let norm = |s: &str| {
        s.split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase()
    };
    Some(
        segs.iter()
            .map(|s| {
                items
                    .iter()
                    .find(|i| norm(&i.sentence) == norm(&s.text))
                    .is_none_or(|i| i.supported)
            })
            .collect(),
    )
}

/// Asks the judge model which sentences are supported. `None` when the judge is unavailable or unparsable.
pub async fn judge(
    llm: &dyn LlmClient,
    prompts: &Prompts,
    sheet: &FactSheet,
    raw: &str,
) -> Option<Vec<bool>> {
    let segs = split_sentences(raw);
    if segs.is_empty() {
        return None;
    }
    let numbered: String = segs
        .iter()
        .enumerate()
        .map(|(i, s)| format!("{}. {}\n", i + 1, s.text.trim()))
        .collect();
    let user = format!(
        "factSheet:\n```json\n{}\n```\n\nAnswer sentences:\n{numbered}",
        serde_json::to_string(sheet).unwrap_or_default()
    );
    let msgs = vec![
        ChatMessage::new("system", prompts.get("judge")),
        ChatMessage::new("user", user),
    ];
    let opts = ChatOpts {
        temperature: 0.0,
        max_tokens: 1200,
    };
    let reply = llm.complete(msgs, opts).await.ok()?;
    judge_flags(&reply, &segs)
}

// ---------- score adjustment ----------

/// Validates the model's `{delta, reason, confidence}`: malformed JSON, an out-of-range delta or a reason that
/// cites a number found neither in the fact sheet nor in the score breakdown all collapse to `delta = 0`.
pub fn parse_adjustment(reply: &str, sheet: &FactSheet, breakdown_json: &str) -> LlmAdjustment {
    let neutral = |why: &str| LlmAdjustment {
        delta: 0,
        reason: why.to_string(),
        confidence: "low".to_string(),
    };
    let Some(obj) = extract_json(reply, '{', '}') else {
        return neutral("LLM adjustment invalid; ignored");
    };
    let Some(mut adj) = LlmAdjustment::from_json(obj) else {
        return neutral("LLM adjustment invalid; ignored");
    };
    let allowed = fieldshift_core::explain::parse_numbers_from_str(breakdown_json);
    let reason_ok = verify_numbers_in_text(sheet, &adj.reason).0
        || fieldshift_core::explain::parse_numbers_from_str(&adj.reason)
            .iter()
            .all(|u| allowed.iter().any(|a| (a.abs() - u.abs()).abs() <= 0.051));
    if !reason_ok || !unverified_crops(sheet, &adj.reason).is_empty() {
        adj.delta = 0;
        adj.reason = "adjustment reset to 0 (reason cites data not in the evidence)".to_string();
    }
    adj
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_sentences_but_not_decimals_or_list_markers() {
        let segs = split_sentences("## 1. Where you stand\nMean net is 3.5 $/ha. Next one! Done");
        let t: Vec<&str> = segs.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(
            t,
            [
                "## 1. Where you stand",
                "Mean net is 3.5 $/ha.",
                "Next one!",
                "Done"
            ]
        );
        let back: String = segs
            .iter()
            .map(|s| format!("{}{}", s.text, s.tail))
            .collect();
        assert_eq!(
            back,
            "## 1. Where you stand\nMean net is 3.5 $/ha. Next one! Done"
        );
    }

    #[test]
    fn judge_flags_by_index_and_by_text() {
        let segs = split_sentences("One. Two. Three.");
        let j = r#"```json
[{"sentence":"One.","supported":true},{"sentence":"Two.","supported":false},{"sentence":"Three.","supported":true}]
```"#;
        assert_eq!(judge_flags(j, &segs), Some(vec![true, false, true]));
        let j2 = r#"[{"sentence":"two.","supported":false}]"#;
        assert_eq!(judge_flags(j2, &segs), Some(vec![true, false, true]));
        assert_eq!(judge_flags("nonsense", &segs), None);
    }

    #[test]
    fn numeric_view_ignores_markers_and_ssp() {
        assert_eq!(
            numeric_view("4. Under SSP5-8.5 it is safe"),
            "Under SSP it is safe"
        );
    }
}
