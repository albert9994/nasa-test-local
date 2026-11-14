"use client";
// Renders explanation text with fact-sheet numbers highlighted; clicking one says where the number comes from.
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { FactSheet } from "@/lib/engine/types";
import { cn } from "@/lib/utils";
import { numberRegistry, segmentText, type Lang, type NumberRef } from "./templates";

export function RichText({ text, fact, lang, caret }: { text: string; fact: FactSheet; lang: Lang; caret?: boolean }) {
  const reg = useMemo(() => numberRegistry(fact), [fact]);
  const segs = useMemo(() => segmentText(text, reg), [text, reg]);
  const [active, setActive] = useState<NumberRef | null>(null);
  return (
    <div>
      <p className="whitespace-pre-line text-[15px] leading-relaxed" aria-live="polite">
        {segs.map((s, i) =>
          s.ref ? (
            <button
              key={i} type="button" onClick={() => setActive(s.ref!)}
              aria-label={`${s.text}: ${lang === "en" ? "where does this number come from?" : "de unde vine acest număr?"}`}
              className={cn("num rounded px-0.5 text-gold underline decoration-dotted underline-offset-4 hover:bg-gold/15",
                active?.field === s.ref.field && "bg-gold/20")}
            >{s.text}</button>
          ) : <span key={i}>{s.text}</span>,
        )}
        {caret ? <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-fg-muted" /> : null}
      </p>
      {active ? (
        <div role="dialog" className="mt-3 rounded-lg border border-line bg-bg p-3 text-sm shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium">{lang === "en" ? "Where does this number come from?" : "De unde vine acest număr?"}</p>
            <button type="button" onClick={() => setActive(null)} aria-label="Close" className="text-fg-muted hover:text-fg"><X className="size-4" /></button>
          </div>
          <p className="mt-1 text-fg-muted">{active.explain[lang]}</p>
          <p className="num mt-2 text-xs text-fg-muted">fact sheet · <span className="text-fg">{active.field}</span> = {active.value}</p>
        </div>
      ) : null}
    </div>
  );
}
