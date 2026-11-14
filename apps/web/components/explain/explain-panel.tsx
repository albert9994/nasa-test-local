"use client";
// O7: "Explain this" (streamed LLM text from /api/explain, template fallback), FieldShift Score card, printable plan.
// The engine computes; the LLM only explains numbers from the fact sheet (C10).
import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { API_URL, streamExplain } from "./api";
import { ChatBox } from "./chat-box";
import { PlanView } from "./plan-view";
import { RichText } from "./rich-text";
import { ScoreCard } from "./score-card";
import { buildTemplate, DISCLAIMER, type Lang } from "./templates";
import { useFactSheet } from "./use-fact-sheet";

type Source = "ai" | "template";

export function ExplainPanel() {
  const fact = useFactSheet();
  const [lang, setLang] = useState<Lang>("en");
  const [text, setText] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
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
    setBusy(true); setText(""); setSource(null); setTyping(false);
    ctl.current = new AbortController();
    let acc = "";
    try {
      await streamExplain({ factSheet: fact, lang: l, mode: "short" }, (c) => {
        if (my !== run.current) return;
        acc += c; setText(acc); setSource("ai"); setTyping(true);
      }, ctl.current.signal);
      if (my !== run.current) return;
      setTyping(false); setBusy(false);
      // the server must end with the disclaimer; add it if the model forgot
      if (!acc.includes(DISCLAIMER[l])) setText(acc.trimEnd() + "\n\n" + DISCLAIMER[l]);
    } catch {
      if (my !== run.current) return;
      // fallback: template text with a typing effect so it feels the same
      const full = buildTemplate(fact, l);
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
  useEffect(() => { stop(); setText(""); setSource(null); setBusy(false); setTyping(false); }, [factKey, stop]);

  return (
    <Card className="flex flex-col gap-5" id="explain">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="display text-3xl">Explain this</h3>
          <p className="text-xs text-fg-muted">The engine computes the numbers; the AI only explains them.</p>
        </div>
        <div role="group" aria-label="Language" className="flex rounded-full border border-line p-0.5 text-xs">
          {(["en", "ro"] as Lang[]).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
              className={cn("rounded-full px-3 py-1 uppercase", lang === l ? "bg-gold text-[#0b0c09]" : "text-fg-muted hover:text-fg")}>{l}</button>
          ))}
        </div>
      </div>

      <ScoreCard />

      <div className="border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => explain(lang)} disabled={!fact || busy}>
            <Sparkles className="size-4" />{busy ? (lang === "en" ? "Explaining…" : "Se explică…") : lang === "en" ? "Explain this" : "Explică"}
          </Button>
          <Button variant="outline" onClick={() => setShowPlan(true)} disabled={!fact}>
            <Printer className="size-4" />{lang === "en" ? "Print my plan" : "Tipărește planul"}
          </Button>
          {source ? (
            <span className="text-[11px] text-fg-muted">
              {source === "ai" ? (lang === "en" ? "Answered by AI, numbers checked against the fact sheet" : "Răspuns AI, numere verificate cu fișa de fapte")
                : (lang === "en" ? "Template text built from the fact sheet (AI not used)" : "Text-șablon din fișa de fapte (fără AI)")}
            </span>
          ) : null}
        </div>
        {fact && text ? <div className="mt-4"><RichText text={text} fact={fact} lang={lang} caret={typing} /></div> : null}
        {!fact ? <p className="mt-3 text-sm text-fg-muted">Pick a farm to get an explanation.</p> : null}
        {fact && source === "ai" && !busy && API_URL ? <ChatBox fact={fact} lang={lang} /> : null}
      </div>
      {showPlan && fact ? <PlanView fact={fact} lang={lang} onClose={() => setShowPlan(false)} /> : null}
    </Card>
  );
}
