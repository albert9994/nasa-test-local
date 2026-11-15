"use client";
// AI assistant page (desktop): a conversation about one field. The question, the last turns and the field's fact sheet go
// to the Hotar server (/api/explain, mode "chat"), which holds the LLM key, checks every number against the fact
// sheet and streams the answer. Without a server it answers with the deterministic summary built from the same numbers.
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { ArrowUp, ChevronDown, MessageCirclePlus, Sprout, Square } from "lucide-react";
import { useCurrency, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useFarm } from "@/lib/store/farm";
import type { FactSheet } from "@/lib/engine/types";
import { API_URL, RateLimitError, streamExplain, type ChatTurn } from "@/components/explain/api";
import { RichText } from "@/components/explain/rich-text";
import { buildTemplate, type Lang } from "@/components/explain/templates";
import { useFactSheet } from "@/components/explain/use-fact-sheet";
import { useFieldData } from "@/components/workspace/analysis";
import { RiskBadge } from "@/components/workspace/fields-card";

type Note = "offline" | "replaced" | "error" | "rate";
interface Msg { id: number; role: "user" | "assistant"; text: string; note?: Note; streaming?: boolean }

/** Conversations per field, kept while the app is open (switching pages or fields does not lose them). */
const useChats = create<{ byField: Record<string, Msg[]>; set(fieldId: string, f: (m: Msg[]) => Msg[]): void; clear(fieldId: string): void }>((set) => ({
  byField: {},
  set: (fieldId, f) => set((s) => ({ byField: { ...s.byField, [fieldId]: f(s.byField[fieldId] ?? []) } })),
  clear: (fieldId) => set((s) => ({ byField: { ...s.byField, [fieldId]: [] } })),
}));
let nextId = 1;
const SUGGESTIONS = ["s_why", "s_switch", "s_hotter", "s_drought"] as const;

function FieldSelect() {
  const t = useT();
  const { fields, selectedId, select } = useFarm();
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{t("assistant.about")}</span>
      <select value={selectedId ?? ""} onChange={(e) => select(e.target.value || null)}
        className="h-9 cursor-pointer appearance-none rounded-full border border-line bg-surface pl-3.5 pr-9 text-sm font-medium text-fg outline-none transition-colors hover:border-line-strong focus:border-primary">
        {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 size-4 text-fg-muted" aria-hidden />
    </label>
  );
}

function Bubble({ m, fact, lang }: { m: Msg; fact: FactSheet | null; lang: Lang }) {
  const t = useT();
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-fg">{m.text}</p>
      </div>
    );
  }
  const noteKey = m.note ? `assistant.${m.note}` : null;
  return (
    <div className="flex gap-3">
      <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Sprout className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium text-fg-subtle">{t("assistant.bot")}</p>
        {m.text ? (
          fact ? <RichText text={m.text} fact={fact} lang={lang} caret={m.streaming} /> : <p className="whitespace-pre-line text-[15px] leading-relaxed">{m.text}</p>
        ) : m.streaming ? (
          <p className="flex items-center gap-2 text-sm text-fg-muted" role="status">
            <span className="flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: `${i * 120}ms` }} />)}</span>
            {t("assistant.thinking")}
          </p>
        ) : null}
        {noteKey && <p role="note" className={cn("mt-2 text-xs", m.note === "error" || m.note === "rate" ? "text-danger" : "text-fg-muted")}>{t(noteKey)}</p>}
      </div>
    </div>
  );
}

export function Assistant() {
  const t = useT();
  const lang: Lang = t.locale;
  const farm = useFarm();
  const field = farm.fields.find((f) => f.id === farm.selectedId) ?? farm.fields[0] ?? null;
  const { status, retry } = useFieldData(field, farm.profile);
  const fact = useFactSheet();
  const msgs = useChats((s) => (field ? s.byField[field.id] : undefined)) ?? [];
  const setMsgs = useChats((s) => s.set);
  const clear = useChats((s) => s.clear);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  // The assistant works on the selected field; pick the first one if nothing is selected.
  useEffect(() => { if (field && farm.selectedId !== field.id) farm.select(field.id); }, [field, farm]);
  useEffect(() => () => ctl.current?.abort(), []);
  useEffect(() => { ctl.current?.abort(); setBusy(false); }, [field?.id]);
  const last = msgs[msgs.length - 1];
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs.length, last?.text.length]);
  useEffect(() => { // auto-grow the composer
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [q]);

  const ready = status === "ready" && !!fact;
  const history = useMemo<ChatTurn[]>(() => msgs.filter((m) => m.text && !m.streaming && !m.note?.match(/error|rate/)).map((m) => ({ role: m.role, content: m.text })), [msgs]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy || !field || !fact) return;
    const fid = field.id;
    const id = nextId++;
    setQ("");
    setMsgs(fid, (m) => [...m, { id: nextId++, role: "user", text: question }, { id, role: "assistant", text: "", streaming: true }]);
    const patch = (p: Partial<Msg>) => setMsgs(fid, (m) => m.map((x) => (x.id === id ? { ...x, ...p } : x)));

    if (!API_URL) { // no server configured: deterministic summary of the same numbers
      patch({ text: buildTemplate(fact, lang, useCurrency.getState().currency), streaming: false, note: "offline" });
      return;
    }
    setBusy(true);
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    let acc = "";
    try {
      const done = await streamExplain({ factSheet: fact, lang, mode: "chat", question, history }, (chunk) => { acc += chunk; patch({ text: acc }); }, c.signal);
      patch(done.replaced && done.text ? { text: done.text, streaming: false, note: "replaced" } : { streaming: false });
    } catch (e) {
      if (c.signal.aborted) patch({ streaming: false });
      else patch({ streaming: false, note: e instanceof RateLimitError ? "rate" : "error" });
    } finally {
      if (ctl.current === c) { ctl.current = null; setBusy(false); }
    }
  }

  if (!field) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-sm">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary"><Sprout className="size-6" aria-hidden /></span>
          <h1 className="text-xl font-semibold tracking-tight">{t("assistant.noFields")}</h1>
          <p className="mt-2 text-sm text-fg-muted">{t("assistant.noFieldsBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-6 py-3">
        <h1 className="text-lg font-semibold tracking-tight">{t("assistant.title")}</h1>
        <span className="text-sm text-fg-subtle">·</span>
        <FieldSelect />
        <RiskBadge id={field.id} />
        <button type="button" onClick={() => { ctl.current?.abort(); clear(field.id); input.current?.focus(); }} disabled={!msgs.length}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40">
          <MessageCirclePlus className="size-4" aria-hidden />{t("assistant.newChat")}
        </button>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
          {msgs.length === 0 ? (
            <div className="pt-[8vh]">
              <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary text-primary-fg shadow-[var(--shadow)]"><Sprout className="size-6" aria-hidden /></span>
              <h2 className="text-3xl font-semibold tracking-tight">{t("assistant.hello")}</h2>
              <p className="mt-2 max-w-xl text-[15px] text-fg-muted">{t("assistant.helloBody", { field: field.name })}</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((k) => (
                  <button key={k} type="button" disabled={!ready} onClick={() => void ask(t(`assistant.${k}`))}
                    className="rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm transition-colors hover:border-line-strong hover:bg-surface-2 disabled:opacity-50">
                    {t(`assistant.${k}`)}
                  </button>
                ))}
              </div>
              {status === "loading" && <p className="mt-6 flex items-center gap-2 text-sm text-fg-muted" role="status"><span aria-hidden className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-primary" />{t("assistant.loading")}</p>}
              {status === "error" && (
                <p className="mt-6 text-sm text-danger">{t("assistant.loadFailed")} <button type="button" className="underline" onClick={retry}>{t("common.retry")}</button></p>
              )}
            </div>
          ) : msgs.map((m) => <Bubble key={m.id} m={m} fact={fact} lang={lang} />)}
        </div>
      </div>

      <div className="border-t border-line bg-bg px-6 pb-4 pt-3">
        <form className="mx-auto w-full max-w-3xl" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
          <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-surface p-2 shadow-[var(--shadow)] transition-colors focus-within:border-primary">
            <textarea
              ref={input} rows={1} value={q} maxLength={600} disabled={!ready}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(q); } }}
              placeholder={ready ? t("assistant.placeholder", { field: field.name }) : t("assistant.loading")}
              aria-label={t("assistant.placeholder", { field: field.name })}
              className="max-h-[200px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 outline-none disabled:opacity-60"
            />
            {busy ? (
              <button type="button" onClick={() => ctl.current?.abort()} aria-label={t("assistant.stop")} title={t("assistant.stop")}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-fg text-bg transition-opacity hover:opacity-85"><Square className="size-3.5 fill-current" aria-hidden /></button>
            ) : (
              <button type="submit" disabled={!ready || !q.trim()} aria-label={t("assistant.send")} title={t("assistant.send")}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-40"><ArrowUp className="size-4" aria-hidden /></button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-fg-subtle">{t("assistant.footer")}</p>
        </form>
      </div>
    </div>
  );
}
