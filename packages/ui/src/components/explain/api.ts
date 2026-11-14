// Network side of O7. The server URL comes from lib/platform/api-url.ts; the LLM key lives on the server.
import type { FactSheet, ScoreResult } from "@/lib/engine/types";
import { API_URL, apiUrl } from "@/lib/platform/api-url";
import type { Lang } from "./templates";

export { API_URL };
export const TIMEOUT_MS = 8000;

export interface ExplainRequest { factSheet: FactSheet; lang: Lang; mode: "short" | "plan" | "chat"; question?: string }
export interface ExplainDone {
  usedNumbers: (string | number)[];
  /** The server removed sentences it could not back with the data: `text` is the whole corrected answer, show it instead of the stream. */
  replaced?: boolean;
  text?: string;
  /** Sentences that were dropped (or that the checker could not verify). */
  unsupported?: string[];
}

/** HTTP 429 from /api/explain: the caller shows the template text and says the limit was reached. */
export class RateLimitError extends Error {
  constructor() { super("explain 429"); this.name = "RateLimitError"; }
}

/** Pure: turn the final `{done:true,…}` event into an ExplainDone. */
export function parseDone(j: Record<string, unknown>): ExplainDone {
  const d: ExplainDone = { usedNumbers: Array.isArray(j.usedNumbers) ? (j.usedNumbers as (string | number)[]) : [] };
  if (j.replaced === true && typeof j.text === "string" && j.text.trim()) { d.replaced = true; d.text = j.text; }
  if (Array.isArray(j.unsupported)) d.unsupported = j.unsupported.filter((x): x is string => typeof x === "string");
  return d;
}

/**
 * POST /api/explain (C9) and read the SSE stream. Calls onText with each text chunk.
 * Throws if the URL is missing, the request fails or no byte arrives within TIMEOUT_MS.
 * Accepted event shapes: `data: {"text":"…"}`, `data: {"delta":"…"}`, `data: "…"`, plain `data: …`, final `data: {"done":true,"usedNumbers":[…]}`.
 */
export async function streamExplain(req: ExplainRequest, onText: (chunk: string) => void, signal?: AbortSignal): Promise<ExplainDone> {
  const url = apiUrl("/api/explain");
  if (!url) throw new Error("no API url");
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener("abort", onAbort);
  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(req), signal: ctl.signal,
    });
    if (res.status === 429) throw new RateLimitError();
    if (!res.ok || !res.body) throw new Error(`explain ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", got = false, done: ExplainDone = { usedNumbers: [] };
    const handle = (data: string) => {
      if (!data || data === "[DONE]") return;
      let text = data;
      try {
        const j = JSON.parse(data);
        if (typeof j === "string") text = j;
        else if (j && typeof j === "object") {
          if (j.done) { done = parseDone(j); return; }
          text = typeof j.text === "string" ? j.text : typeof j.delta === "string" ? j.delta : "";
        }
      } catch { /* plain text chunk */ }
      if (text) { got = true; onText(text); }
    };
    for (;;) {
      const { value, done: end } = await reader.read();
      if (timer) { clearTimeout(timer); timer = undefined; }
      if (end) break;
      buf += dec.decode(value, { stream: true });
      const events = buf.split(/\r?\n\r?\n/);
      buf = events.pop() ?? "";
      for (const ev of events) {
        const data = ev.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
        handle(data);
      }
    }
    if (buf.trim().startsWith("data:")) handle(buf.trim().slice(5).trim());
    if (!got && !done.replaced) throw new Error("empty stream");
    return done;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** POST /api/score (C12). Returns null when the server is not configured or not reachable. */
export async function fetchScore(body: unknown): Promise<ScoreResult | null> {
  const url = apiUrl("/api/score");
  if (!url) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal,
    });
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j?.score === "number" && j.subscores && Array.isArray(j.waterfall) ? (j as ScoreResult) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
