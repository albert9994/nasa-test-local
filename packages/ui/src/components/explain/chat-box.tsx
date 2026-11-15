"use client";
// Stretch: small chat (mode "chat"). Only rendered when the server answered an explain request.
import { useRef, useState } from "react";
import { Send } from "lucide-react";
import type { FactSheet } from "@/lib/engine/types";
import { useT } from "@/lib/i18n";
import { RateLimitError, streamExplain } from "./api";
import type { Lang } from "./templates";

export function ChatBox({ fact, lang }: { fact: FactSheet; lang: Lang }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<"error" | "rate" | null>(null);
  const [replaced, setReplaced] = useState(false);
  const ref = useRef<AbortController | null>(null);
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    ref.current?.abort(); ref.current = new AbortController();
    setBusy(true); setA(""); setErr(null); setReplaced(false);
    try {
      const done = await streamExplain({ factSheet: fact, lang, mode: "chat", question: q.trim() }, (c) => setA((p) => p + c), ref.current.signal);
      if (done.replaced && done.text) { setA(done.text); setReplaced(true); }
    }
    catch (e) { setErr(e instanceof RateLimitError ? "rate" : "error"); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={ask} className="mt-4 border-t border-line pt-3">
      <label className="text-xs text-fg-muted" htmlFor="hotar-chat">{t("explain.chat_label")}</label>
      <div className="mt-1 flex gap-2">
        <input id="hotar-chat" value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-sm" />
        <button type="submit" disabled={busy || !q.trim()} aria-label={t("explain.chat_send")} className="grid size-10 place-items-center rounded-full bg-primary text-primary-fg disabled:opacity-50"><Send className="size-4" /></button>
      </div>
      {a ? <p className="mt-2 whitespace-pre-line text-sm">{a}</p> : null}
      {replaced ? <p role="note" className="mt-1 text-xs text-fg-muted">{t("explain.note_replaced")}</p> : null}
      {err ? <p className="mt-2 text-xs text-danger">{t(err === "rate" ? "explain.note_rate" : "explain.chat_error")}</p> : null}
    </form>
  );
}
