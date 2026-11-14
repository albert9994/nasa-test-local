"use client";
// Stretch: small chat (mode "chat"). Only rendered when the server answered an explain request.
import { useRef, useState } from "react";
import { Send } from "lucide-react";
import type { FactSheet } from "@/lib/engine/types";
import { streamExplain } from "./api";
import type { Lang } from "./templates";

export function ChatBox({ fact, lang }: { fact: FactSheet; lang: Lang }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const ref = useRef<AbortController | null>(null);
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    ref.current?.abort(); ref.current = new AbortController();
    setBusy(true); setA(""); setErr(false);
    try { await streamExplain({ factSheet: fact, lang, mode: "chat", question: q.trim() }, (c) => setA((p) => p + c), ref.current.signal); }
    catch { setErr(true); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={ask} className="mt-4 border-t border-line pt-3">
      <label className="text-xs text-fg-muted" htmlFor="fs-chat">{lang === "en" ? "Ask about this plan" : "Întreabă despre acest plan"}</label>
      <div className="mt-1 flex gap-2">
        <input id="fs-chat" value={q} onChange={(e) => setQ(e.target.value)} maxLength={300}
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-sm outline-none focus:border-gold" />
        <button type="submit" disabled={busy || !q.trim()} aria-label="Send" className="grid size-10 place-items-center rounded-full bg-gold text-primary-fg disabled:opacity-50"><Send className="size-4" /></button>
      </div>
      {a ? <p className="mt-2 whitespace-pre-line text-sm">{a}</p> : null}
      {err ? <p className="mt-2 text-xs text-heat">{lang === "en" ? "The assistant is not available right now." : "Asistentul nu este disponibil acum."}</p> : null}
    </form>
  );
}
