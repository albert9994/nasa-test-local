"use client";
// AI advisor: "Explain this" (streamed LLM text from /api/explain, template fallback), FieldShift Score card, link to the report.
// The engine computes; the LLM only explains numbers from the fact sheet (C10). Language follows the app locale.
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCurrency, useT } from "@/lib/i18n";
import { useAnalysis } from "@/lib/store/analysis";
import { API_URL, RateLimitError, streamExplain } from "./api";
import { ChatBox } from "./chat-box";
import { RichText } from "./rich-text";
import { ScoreCard } from "./score-card";
import { buildTemplate, DISCLAIMER, type Lang } from "./templates";
import { useFactSheet } from "./use-fact-sheet";

type Source = "ai" | "template";

export function ExplainPanel() {
  const t = useT();
  const fact = useFactSheet();
  const lang: Lang = t.locale;
  const setReportOpen = useAnalysis((s) => s.setReportOpen);
  const [text, setText] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  /** "replaced": the server dropped unsupported sentences; "rate": 429, showing the template */
  const [note, setNote] = useState<"replaced" | "rate" | null>(null);
  const run = useRef(0);
  const ctl = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    run.current++; ctl.current?.abort();
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const explain = useCallback(async (l: Lang) => {
    if (!fact) return;
    stop();
    const my = run.current;
    setBusy(true); setText(""); setSource(null); setTyping(false); setNote(null);
    ctl.current = new AbortController();
    let acc = "";
    try {
      const done = await streamExplain({ factSheet: fact, lang: l, mode: "short" }, (c) => {
        if (my !== run.current) return;
        acc += c; setText(acc); setSource("ai"); setTyping(true);
      }, ctl.current.signal);
      if (my !== run.current) return;
      setTyping(false); setBusy(false);
      if (done.replaced && done.text) {
        // the server removed sentences it could not back with the data: show its corrected text, not what streamed
        acc = done.text; setText(acc); setSource("ai"); setNote("replaced");
      }
      // the server must end with the disclaimer; add it if the model forgot
      if (!acc.includes(DISCLAIMER[l])) setText(acc.trimEnd() + "\n\n" + DISCLAIMER[l]);
    } catch (e) {
      if (my !== run.current) return;
      if (e instanceof RateLimitError) setNote("rate");
      // fallback: template text with a typing effect so it feels the same
      const full = buildTemplate(fact, l, useCurrency.getState().currency);
      setSource("template"); setText(""); setTyping(true);
      const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduce) { setText(full); setTyping(false); setBusy(false); return; }
      let i = 0;
      timer.current = setInterval(() => {
        i = Math.min(full.length, i + 4);
        setText(full.slice(0, i));
        if (i >= full.length) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null; setTyping(false); setBusy(false);
        }
      }, 18);
    }
  }, [fact, stop]);

  // changing the language re-explains if there is already an answer; changing the farm/rotation clears it
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (source) void explain(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
  const factKey = fact ? `${fact.farm.name}|${fact.rotation}|${fact.today.badYears}|${fact.today.meanNet}` : "";
  useEffect(() => { stop(); setText(""); setSource(null); setBusy(false); setTyping(false); setNote(null); }, [factKey, stop]);

  return (
    <Card className="flex flex-col gap-5" id="explain" data-tour="advisor">
      <div>
        <h2 className="display text-2xl">{t("explain.title")}</h2>
        <p className="text-sm text-fg-muted">{t("explain.sub")}</p>
      </div>

      <ScoreCard />

      <div className="border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => explain(lang)} disabled={!fact || busy}>
            <Sparkles className="size-4" aria-hidden />{busy ? t("explain.explaining") : t("explain.explain_btn")}
          </Button>
          <Button variant="outline" onClick={() => setReportOpen(true)} disabled={!fact} data-tour="open-report">
            <FileText className="size-4" aria-hidden />{t("explain.report_btn")}
          </Button>
          {source ? <span className="text-[11px] text-fg-muted">{source === "ai" ? t("explain.src_ai") : t("explain.src_template")}</span> : null}
        </div>
        {fact && text ? <div className="mt-4"><RichText text={text} fact={fact} lang={lang} caret={typing} /></div> : null}
        {note && !busy ? <p role="note" data-testid="explain-note" className="mt-2 text-xs text-fg-muted">{t(note === "replaced" ? "explain.note_replaced" : "explain.note_rate")}</p> : null}
        {!fact ? <p className="mt-3 text-sm text-fg-muted">{t("explain.pick_farm")}</p> : null}
        {fact && source === "ai" && !busy && API_URL ? <ChatBox fact={fact} lang={lang} /> : null}
      </div>
    </Card>
  );
}
