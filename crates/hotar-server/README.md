# hotar-server

Axum API for Hotar (contracts C9, C10, C12) with the grounded AI advisor.
The engine computes; the LLM only explains an **evidence packet** (the C10 fact sheet). If no LLM is
configured, every endpoint still works and `/api/explain` serves the deterministic template.

## Run locally

```bash
# LLM settings: ~/.hotar/ai.env (also used by the desktop app) or ./.env; both are read at start-up,
# variables already set in the shell win. Never commit them.
pnpm ai                     # = cargo run --release -p hotar-server → http://localhost:8787
```

Example `~/.hotar/ai.env` for Meta's Muse Spark (OpenAI-compatible):

```bash
LLM_PROVIDER=openai
LLM_API_URL=https://api.meta.ai/v1
LLM_API_KEY=LLM|…
LLM_MODEL=muse-spark-1.3
LLM_REASONING_EFFORT=minimal
HOTAR_RATE_LIMIT_PER_HOUR=1000
```

The **desktop app** embeds this server: at launch it reads the same file and, when an LLM is configured, serves the API
on `127.0.0.1:8788` (or a free port) for its own UI (`apps/desktop/src-tauri/src/ai.rs`). Nothing else to run.

Web (Next.js) and desktop (Tauri) call it through the **public** `NEXT_PUBLIC_API_URL`
(e.g. `NEXT_PUBLIC_API_URL=http://localhost:8787`). Without it the UI uses its client-side templates.
The LLM key only ever lives in the server environment; it is never sent to the browser.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` / `SERVER_PORT` | `8787` | listen port |
| `HOTAR_DATA_DIR` | repo packs | extra directory with `<farmId>.json` packs |
| `LLM_PROVIDER` | `openai` | `openai` (OpenAI-compatible) or `anthropic` (Messages API) |
| `LLM_API_URL` | none (`https://api.anthropic.com/v1` for anthropic) | base URL, e.g. `https://api.openai.com/v1` |
| `LLM_API_KEY` | none | secret (Bearer for openai, `x-api-key` for anthropic) |
| `LLM_MODEL` | none | model name |
| `LLM_REASONING_EFFORT` | none | reasoning models only (`openai` format): sent as `reasoning_effort`, e.g. `minimal` for Meta `muse-spark-1.3` |
| `LLM_REASONING_TOKENS` | `1500` | extra `max_tokens` for the hidden reasoning when `LLM_REASONING_EFFORT` is set |
| `LLM_TIMEOUT_SECS` | `90` | max duration of one model call, streamed body included |
| `HOTAR_PROMPTS_DIR` | `prompts` | system prompts (`explain_short`, `explain_plan`, `chat`, `judge`, `score_adjust`); missing files fall back to built-in copies |
| `HOTAR_RATE_LIMIT_PER_HOUR` | `20` | LLM calls per IP per hour (cache hits and template answers are free) |
| `HOTAR_TRUST_PROXY` | off | `1` = take the client IP from `X-Forwarded-For` (set only behind a trusted proxy) |

If `LLM_API_URL`, `LLM_API_KEY` or `LLM_MODEL` is missing the server runs without a model (`NoLlm`).
Timeouts: first byte 8 s, total 90 s (`LLM_TIMEOUT_SECS`), one retry on network errors, 429 and 5xx. Temperature 0.2.

## Endpoints

`GET /api/health`, `POST /api/simulate`, `/api/stress`, `/api/optimize` (see `docs/CONTRACTS.md`), plus:

### `POST /api/explain` (SSE, C9/C10)
Body: `{ factSheet | farmId | pack(+rotation, opts, picks), lang: "ro"|"en", mode: "short"|"plan"|"chat", question?, history? }`.
`history` is `[{role, content}]`, only the last 6 turns are used (chat mode; still grounded in the fact sheet).

Events (`data: <json>`):
1. `{"text": "..."}` repeated: tokens as they stream.
2. Final, clean answer: `{"done": true, "usedNumbers": [...], "judged": true}`.
3. Final, something unsupported: `{"done": true, "replaced": true, "text": "<cleaned or template>", "usedNumbers": [...], "unsupported": ["sentence", ...]}`. The UI must **replace** the streamed text with `text`.

Verification after the stream: every sentence is checked for numbers not in the fact sheet and for crops
the fact sheet never mentions, and a separate non-streamed **judge** call labels each sentence
supported/unsupported (`[{sentence, supported}]`). Bad sentences are removed; with fewer than 2 factual
sentences left the template is used. A missing disclaimer is appended. If the judge call fails or is not
parsable, only the number/crop checks apply (`"judged": false`). `429` when the per-IP limit is reached.

### `POST /api/score` (C12)
Same body as before (+ optional `lang`). When a model is configured and the request has no `llm`, the server asks
for `{delta (-10..10), reason, confidence}` given the fact sheet and the score breakdown, validates it with serde
(invalid JSON, out of range, or a reason citing numbers not in the evidence all give `delta: 0`) and returns it in
`llm` and in the `waterfall`. No model or no quota: the score is deterministic and `llm` is `null`.

## Tests

`cargo test -p hotar-server` runs against an in-process mock OpenAI/Anthropic server (no network, no real model).
