"use client";
// Printable one-page plan. Rendered into document.body; the print stylesheet hides everything else. No PDF library.
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import type { FactSheet } from "@/lib/engine/types";
import { Button } from "@/components/ui/button";
import { DISCLAIMER, type Lang } from "./templates";

const PRINT_CSS = `
@media print {
  body > *:not(.fs-print-root) { display: none !important; }
  .fs-print-root { position: static !important; inset: auto !important; overflow: visible !important; background: #fff !important; padding: 0 !important; }
  .fs-print-root .no-print { display: none !important; }
  .fs-print-sheet { box-shadow: none !important; border: 0 !important; margin: 0 !important; max-width: none !important; padding: 0 !important; }
  @page { size: A4; margin: 14mm; }
}
.fs-print-sheet, .fs-print-sheet * { --fg: #16170f; --fg-muted: #4a4739; --line: #16170f33; }
`;

const L = {
  en: { title: "My FieldShift plan", farm: "Farm", rotation: "Current rotation", margin: "Climate margin", today: "Today", alts: "Three alternatives", steps: "Next steps", print: "Print", close: "Close",
    bad: "bad years", net: "mean net", soil: "soil score", marginT: "margin", none: "No alternatives computed yet." },
  ro: { title: "Planul meu FieldShift", farm: "Fermă", rotation: "Rotația actuală", margin: "Marja climatică", today: "Azi", alts: "Trei alternative", steps: "Pașii următori", print: "Tipărește", close: "Închide",
    bad: "ani răi", net: "marjă netă medie", soil: "scor sol", marginT: "marjă", none: "Nu există încă alternative calculate." },
} as const;

function steps(f: FactSheet, lang: Lang): string[] {
  const en = lang === "en";
  const s = f.alternatives.slice(0, 3).map((a) => {
    const need = a.missingEquipment.length ? (en ? ` Equipment needed: ${a.missingEquipment.join(", ")}.` : ` Echipament necesar: ${a.missingEquipment.join(", ")}.`) : "";
    return en
      ? `Plan the switch to ${a.rotation} (${a.label}): ${a.badYears} bad years in the simulation.${need}`
      : `Planifică trecerea la ${a.rotation} (${a.label}): ${a.badYears} ani răi în simulare.${need}`;
  });
  s.push(en ? "Re-run FieldShift each season with your own prices and costs." : "Rulează din nou FieldShift în fiecare sezon cu prețurile și costurile tale.");
  return s;
}

export function PlanView({ fact, lang, onClose }: { fact: FactSheet; lang: Lang; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!mounted) return null;
  const t = L[lang], m = fact.margin;
  const marginLine = m.status === "already_over"
    ? (lang === "en" ? "Already over your risk rule today." : "Depășește deja regula ta de risc azi.")
    : `+${m.dT.toFixed(1)} °C (${lang === "en" ? "safe until" : "sigur până în"} ${m.safeUntil.ssp245}, SSP2-4.5)`;
  return createPortal(
    <div className="fs-print-root fixed inset-0 z-50 overflow-auto bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={t.title}>
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-3 flex max-w-[210mm] justify-end gap-2">
        <Button onClick={() => window.print()}><Printer className="size-4" />{t.print}</Button>
        <Button variant="outline" className="bg-bg-elev" onClick={onClose}><X className="size-4" />{t.close}</Button>
      </div>
      <article className="fs-print-sheet mx-auto max-w-[210mm] rounded-lg bg-white p-6 text-[#16170f] shadow-xl sm:p-10">
        <header className="border-b border-[#16170f33] pb-3">
          <h2 className="display text-4xl">{t.title}</h2>
          <p className="mt-1 text-sm text-[#4a4739]">{fact.farm.name} · {fact.farm.lat.toFixed(2)}, {fact.farm.lon.toFixed(2)} · {fact.farm.soil} · {fact.farm.climate}</p>
        </header>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs uppercase tracking-wide text-[#4a4739]">{t.rotation}</dt><dd className="font-medium">{fact.rotation}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-[#4a4739]">{t.margin}</dt><dd className="font-medium">{marginLine}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wide text-[#4a4739]">{t.today}</dt>
            <dd>{fact.today.badYears} {t.bad} · {t.net} ${Math.round(fact.today.meanNet)}/ha · {fact.rule.tolerance}</dd></div>
        </dl>
        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide">{t.alts}</h3>
        {fact.alternatives.length ? (
          <ol className="mt-2 space-y-2 text-sm">
            {fact.alternatives.slice(0, 3).map((a, i) => (
              <li key={i} className="break-inside-avoid rounded border border-[#16170f33] p-3">
                <strong>{a.label}</strong>: {a.rotation}
                <div className="text-[#4a4739]">
                  {a.badYears} {t.bad} · {t.net} {a.deltaNet < 0 ? "−" : "+"}${Math.abs(Math.round(a.deltaNet))}/ha · {t.marginT} +{a.margin.dT.toFixed(1)} °C · {t.soil} {a.soilScore}
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="mt-2 text-sm">{t.none}</p>}
        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide">{t.steps}</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{steps(fact, lang).map((s, i) => <li key={i}>{s}</li>)}</ol>
        <footer className="mt-8 border-t border-[#16170f33] pt-3 text-xs text-[#4a4739]">
          <p className="font-medium">{DISCLAIMER[lang]}</p>
          <p>{lang === "en" ? "Sources" : "Surse"}: {fact.sources.join(", ")}.</p>
        </footer>
      </article>
    </div>,
    document.body,
  );
}
