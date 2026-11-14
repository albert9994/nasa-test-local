"use client";
// OneSoil-style "what needs attention" list, ranked from the engine results.
import { AlertTriangle, CheckCircle2, ChevronRight, Flame } from "lucide-react";
import { useMemo } from "react";
import { use2050 } from "@/components/hero/hero-card";
import { useT } from "@/lib/i18n";
import { useReasons } from "@/lib/i18n/reasons";
import { useFactSheet } from "@/components/explain/use-fact-sheet";
import { useApp } from "@/lib/store/app";
import { useAnalysis, type TabId } from "@/lib/store/analysis";
import { cn } from "@/lib/utils";
import { useFarmAlerts } from "@/components/alerts/use-farm-alerts";
import { pickKey } from "./numbers";
import { buildAttention, type AttentionItem, type Level } from "./attention";
import { useF } from "./hooks";
import { Panel, Skeleton } from "./ui";
import { useHeatAtFlowering } from "./use-heat";

const TONE: Record<Level, string> = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
};
const GO_LABEL: Partial<Record<TabId, string>> = { rotations: "att_go_rotations", stress: "att_go_stress", replay: "att_go_replay", risk: "att_go_risk" };

export function useAttention(): AttentionItem[] | null {
  const base = useApp((s) => s.base);
  const margin = useApp((s) => s.margin);
  const picks = useApp((s) => s.picks);
  const failShare = useApp((s) => s.opts.failShare);
  const heat = useHeatAtFlowering();
  const { dT: t2050 } = use2050();
  const wx = useFarmAlerts();
  const alert = wx.status === "ok" ? wx.items.find((a) => a.severity === "danger") ?? null : null;
  return useMemo(() => (base && margin ? buildAttention({ base, margin, picks, failShare, t2050, heat, alert }) : null), [base, margin, picks, failShare, t2050, heat, alert]);
}

/** `worstWhy`: localised reasons of the worst year (from the fact sheet); appended to the "worst year" item. */
export function useAttentionText(worstWhy?: string[]) {
  const t = useT();
  const f = useF();
  return (it: AttentionItem) => {
    const v = { ...it.vars };
    if (it.id === "soil") v.pct = `${f.num(Number(it.vars.pct), 2)} %`;
    if (it.id === "erosion") v.t = f.num(Number(it.vars.t), 1);
    if (it.id === "worst") {
      v.amount = f.money(Number(it.vars.usd));
      if (worstWhy?.length) return `${t("analysis.att_worst", v)} ${t("reasons.why_intro", { list: worstWhy.join("; ") })}`;
    }
    if (it.id === "margin_tight") { v.dT = f.warm(Number(it.vars.dT)); v.t2050 = f.warm(Number(it.vars.t2050)); }
    if (it.id === "weather") {
      const k = String(it.vars.kind);
      return `${t(`alerts.${k}.title`)}: ${t(`alerts.${k}.body`, v)}`;
    }
    const label = typeof v.label === "string" ? t(`analysis.pick_${pickKey(v.label)}`) : "";
    if (it.id === "stress") return v.label ? t("analysis.att_stress", { ...v, label }) : t("analysis.att_stress_alone");
    return t(`analysis.att_${it.id === "ok" ? "none" : it.id}`, v);
  };
}

export function AttentionList() {
  const t = useT();
  const items = useAttention();
  const setTab = useAnalysis((s) => s.setTab);

  const fact = useFactSheet();
  const reasons = useReasons();
  const text = useAttentionText(fact ? reasons.worstWhy(fact) : undefined);

  return (
    <Panel title={t("analysis.att_title")} sub={t("analysis.att_sub")} tour="attention">
      {!items ? (
        <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : (
        <ul className="-mx-1 flex flex-col divide-y divide-line">
          {items.map((it) => {
            const Icon = it.level === "ok" ? CheckCircle2 : it.id === "heat" ? Flame : AlertTriangle;
            const goKey = GO_LABEL[it.go];
            return (
              <li key={it.id} className="flex items-start gap-3 px-1 py-3 first:pt-1 last:pb-1">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", TONE[it.level])}><Icon className="size-4" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="sr-only">{t(`analysis.att_level_${it.level}`)}</p>
                  <p className="pt-1 text-sm leading-snug text-fg">{text(it)}</p>
                </div>
                {goKey && (
                  <button type="button" onClick={() => setTab(it.go)} className="mt-0.5 flex shrink-0 items-center gap-0.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-fg">
                    {t(`analysis.${goKey}`)}<ChevronRight className="size-3.5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
