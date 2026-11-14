"use client";
// One-page report for a bank / APIA / AFIR file. Rendered into document.body; the print stylesheet hides everything else.
// No PDF library: the browser prints it ("Save as PDF").
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAttention, useAttentionText } from "@/components/field/attention-list";
import { useF, useNames } from "@/components/field/hooks";
import { fitCheck, pickKey, rotationCost } from "@/components/field/numbers";
import { getEngine, type MarginResult, type PickResult, type Rotation, type RotationResult } from "@/lib/engine";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import { useAnalysis } from "@/lib/store/analysis";
import { useScore } from "./score-card";
import { useFactSheet } from "./use-fact-sheet";

const PRINT_CSS = `
@media print {
  body > *:not(.fs-print-root) { display: none !important; }
  .fs-print-root { position: static !important; inset: auto !important; overflow: visible !important; background: #fff !important; padding: 0 !important; }
  .fs-print-root .no-print { display: none !important; }
  .fs-print-sheet { box-shadow: none !important; border: 0 !important; margin: 0 !important; max-width: none !important; padding: 0 !important; font-size: 10.5px !important; }
  @page { size: A4; margin: 12mm; }
}
`;

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-2 border-b border-line py-1"><dt className="w-32 shrink-0 text-fg-muted">{k}</dt><dd className="min-w-0 font-medium">{v}</dd></div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-4 break-inside-avoid"><h3 className="mb-1 border-b border-fg pb-0.5 text-[11px] font-semibold uppercase tracking-wide">{title}</h3>{children}</section>;
}

export function ReportSheet() {
  const t = useT();
  const f = useF();
  const names = useNames();
  const fact = useFactSheet();
  const pack = useApp((s) => s.pack);
  const base = useApp((s) => s.base);
  const margin = useApp((s) => s.margin);
  const rotation = useApp((s) => s.rotation);
  const picks = useApp((s) => s.picks);
  const opts = useApp((s) => s.opts);
  const constraints = useApp((s) => s.constraints);
  const handle = useApp((s) => s.handle);
  const { score } = useScore();
  const attention = useAttention();
  const attText = useAttentionText();
  const [pickMargins, setPickMargins] = useState<Record<string, MarginResult>>({});
  useEffect(() => {
    if (!handle || !picks.length) return;
    let alive = true;
    Promise.all(picks.map((p) => getEngine().adaptationMargin(handle, p.rot, opts))).then((r) => { if (alive) setPickMargins(Object.fromEntries(picks.map((p, i) => [p.label, r[i]]))); }).catch(() => undefined);
    return () => { alive = false; };
  }, [handle, picks, opts]);

  if (!pack || !base || !margin || !fact) return <p className="p-6 text-sm">{t("common.loading")}</p>;

  const n = base.years.length;
  const first = base.years[0], last = base.years[n - 1];
  const marginText = (m: MarginResult) => (m.already ? t("common.risk_over") : m.dTcapped ? t("analysis.hero_beyond_heat") : f.warm(m.dT));
  const marginLine = margin.already
    ? t("explain.r_margin_over")
    : t("explain.r_margin_value", { dT: margin.dTcapped ? t("analysis.hero_beyond_heat") : f.warm(margin.dT), rain: margin.dPcapped ? t("analysis.hero_beyond_rain") : f.rainCut(margin.dP), year: fact.margin.safeUntil.ssp245 });
  const risks = (attention ?? []).filter((a) => a.id !== "ok").slice(0, 5);
  const reco: PickResult | undefined = picks.find((p) => fitCheck(p.rot, constraints, pack.meta, opts).fitsBudget && fitCheck(p.rot, constraints, pack.meta, opts).missing.length === 0) ?? picks[0];
  const rows: { id: string; label: string; rot: Rotation; res: RotationResult; m: MarginResult | null }[] = [
    { id: "cur", label: t("analysis.rot_current"), rot: rotation, res: base, m: margin },
    ...picks.map((p) => ({ id: p.label, label: t(`analysis.pick_${pickKey(p.label)}`), rot: p.rot, res: p.base, m: pickMargins[p.label] ?? null })),
  ];
  const date = new Date().toLocaleDateString(f.locale === "ro" ? "ro-RO" : "en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <article className="fs-print-sheet mx-auto max-w-[210mm] rounded-lg bg-white p-6 text-[12px] leading-snug text-[#14201a] shadow-xl sm:p-9" data-tour="report-sheet">
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#1f5135] pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#1f5135]">FieldShift</p>
          <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">{t("explain.r_title")}</h2>
          <p className="text-[#5b655e]">{t("explain.r_subtitle")}</p>
        </div>
        <p className="shrink-0 text-right text-[11px] text-[#5b655e]">{t("explain.r_prepared", { date })}</p>
      </header>

      <Section title={t("explain.r_field")}>
        <dl className="grid gap-x-6 sm:grid-cols-2">
          <Row k={t("explain.r_farm")} v={fact.farm.name} />
          <Row k={t("explain.r_location")} v={`${fact.farm.lat.toFixed(4)}, ${fact.farm.lon.toFixed(4)}`} />
          <Row k={t("explain.r_soil")} v={fact.farm.soil} />
          <Row k={t("explain.r_climate")} v={`${fact.farm.climate}, ${first}–${last}`} />
          <Row k={t("explain.r_rotation")} v={names.rotation(rotation)} />
          <Row k={t("explain.r_rule")} v={t("inputs.bad_below") + ` ${f.money(opts.failNet)}/ha; ` + t("inputs.tolerate") + ` ${Math.round(1 / opts.failShare)}`} />
        </dl>
      </Section>

      <Section title={t("explain.r_summary")}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            [t("explain.r_margin"), marginText(margin)],
            [t("explain.r_score"), score ? `${score.score} / 100` : "…"],
            [t("explain.r_mean"), f.money(base.meanNet)],
            [t("explain.r_bad_years"), `${base.fails}/${n}`],
            [t("explain.r_worst"), `${f.money(base.minNet)} (${base.worstYear})`],
            [t("explain.r_soil_score"), `${base.soilScore} / 100`],
          ].map(([k, v]) => (
            <div key={k} className="rounded border border-[#e3e1d8] p-2"><div className="text-[10px] text-[#5b655e]">{k}</div><div className="num text-sm font-semibold">{v}</div></div>
          ))}
        </div>
        <p className="mt-2">{marginLine}</p>
      </Section>

      <Section title={t("explain.r_risks")}>
        {risks.length ? <ul className="list-disc space-y-0.5 pl-5">{risks.map((r) => <li key={r.id}>{attText(r)}</li>)}</ul> : <p>{t("explain.r_no_risks")}</p>}
      </Section>

      <Section title={t("explain.r_reco")}>
        {reco ? (
          <>
            <p className="font-medium">{t("explain.r_reco_line", { label: t(`analysis.pick_${pickKey(reco.label)}`), rotation: names.rotation(reco.rot) })}</p>
            <p>{t("explain.r_reco_numbers", { bad: `${reco.base.fails}/${n}`, delta: f.signedMoney(reco.base.meanNet - base.meanNet), dT: pickMargins[reco.label] ? marginText(pickMargins[reco.label]) : "…", soil: reco.base.soilScore })}</p>
            <p>{t("explain.r_reco_costs", { cost: f.money(rotationCost(reco.rot, pack.meta, opts)) })}
              {fitCheck(reco.rot, constraints, pack.meta, opts).missing.length ? " " + t("explain.r_needs", { list: fitCheck(reco.rot, constraints, pack.meta, opts).missing.map((e) => t(`analysis.equip_${e}`)).join(", ") }) : ""}</p>
          </>
        ) : <p>{t("explain.r_reco_none")}</p>}
      </Section>

      <Section title={t("explain.r_alts")}>
        <table className="w-full text-left">
          <thead><tr className="border-b border-[#cfccbf] text-[10px] text-[#5b655e]">
            <th className="py-1 font-normal">{t("explain.th_option")}</th><th className="font-normal">{t("explain.th_bad")}</th><th className="font-normal">{t("explain.th_income")}</th><th className="font-normal">{t("explain.th_margin")}</th><th className="font-normal">{t("explain.th_cost")}</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[#e3e1d8] align-top">
                <td className="py-1 pr-2"><span className="font-medium">{r.label}</span><br /><span className="text-[#5b655e]">{names.rotation(r.rot)}</span></td>
                <td className="num">{r.res.fails}/{n}</td>
                <td className="num">{f.money(r.res.meanNet)}</td>
                <td className="num">{r.m ? marginText(r.m) : "…"}</td>
                <td className="num">{f.money(rotationCost(r.rot, pack.meta, opts))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={t("explain.r_method")}>
        <p>{t("explain.r_method_text")}</p>
        <p className="mt-1"><span className="font-medium">{t("explain.r_sources")}:</span> {fact.sources.join(", ")}.</p>
        {getEngine().kind === "mock" && <p className="mt-1 text-[#8a5a3b]">{t("explain.r_illustrative")}</p>}
      </Section>

      <footer className="mt-5 border-t border-[#cfccbf] pt-2 text-[10px] text-[#5b655e]">
        <p className="font-medium text-[#14201a]">{t("explain.r_disclaimer")}</p>
        <p>{t("explain.r_currency", { currency: f.currency })} · {t("explain.r_footer")}</p>
      </footer>
    </article>
  );
}

export function ReportDialog() {
  const t = useT();
  const open = useAnalysis((s) => s.reportOpen);
  const setOpen = useAnalysis((s) => s.setReportOpen);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, setOpen]);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="fs-print-root fixed inset-0 z-50 overflow-auto bg-fg/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={t("explain.r_title")}>
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-3 flex max-w-[210mm] justify-end gap-2">
        <Button onClick={() => window.print()}><Printer className="size-4" aria-hidden />{t("explain.r_print")}</Button>
        <Button variant="outline" onClick={() => setOpen(false)}><X className="size-4" aria-hidden />{t("explain.r_close")}</Button>
      </div>
      <ReportSheet />
    </div>,
    document.body,
  );
}
