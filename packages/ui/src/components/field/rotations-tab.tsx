"use client";
// Rotations tab: current rotation vs the three picks (optimizer + pickThree), with costs, margin, soil, budget and equipment fit.
import { Check, Package, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getEngine, type MarginResult, type PickResult, type Rotation, type RotationResult } from "@/lib/engine";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { use2050 } from "@/components/hero/hero-card";
import { useF, useNames } from "./hooks";
import { fitCheck, pickKey, riskOf, rotationCost, type Risk } from "./numbers";
import { Panel, Skeleton, Spinner } from "./ui";

const RISK_CLS: Record<Risk, string> = { safe: "text-ok", tight: "text-warn", over: "text-danger" };

interface CardData {
  id: string; title: string; why?: string; rot: Rotation; base: RotationResult; margin: MarginResult | null; current?: boolean;
}

/** Margin for each pick (the optimizer does not return it). */
function usePickMargins(picks: PickResult[]) {
  const handle = useApp((s) => s.handle);
  const opts = useApp((s) => s.opts);
  const [m, setM] = useState<Record<string, MarginResult>>({});
  const key = picks.map((p) => p.label + p.rot.map((s) => s.crop + s.cover).join()).join("|");
  useEffect(() => {
    if (!handle || !picks.length) { setM({}); return; }
    let alive = true;
    Promise.all(picks.map((p) => getEngine().adaptationMargin(handle, p.rot, opts))).then((r) => {
      if (alive) setM(Object.fromEntries(picks.map((p, i) => [p.label, r[i]])));
    }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, opts, key]);
  return m;
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line py-2 first:border-t-0">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-right"><span className={cn("num text-sm font-medium", tone)}>{value}</span>{sub && <span className="block text-xs text-fg-muted">{sub}</span>}</dd>
    </div>
  );
}

function RotationCard({ c, baseMean, onAdopt, adopted }: { c: CardData; baseMean: number; onAdopt?: () => void; adopted: boolean }) {
  const t = useT();
  const f = useF();
  const names = useNames();
  const pack = useApp((s) => s.pack);
  const opts = useApp((s) => s.opts);
  const constraints = useApp((s) => s.constraints);
  const { dT: t2050 } = use2050();
  const n = c.base.years.length;
  const fit = fitCheck(c.rot, constraints, pack?.meta, opts);
  const cost = rotationCost(c.rot, pack?.meta, opts);
  const delta = c.base.meanNet - baseMean;
  const risk = c.margin ? riskOf(c.margin, t2050) : null;
  return (
    <article className={cn("flex min-w-0 flex-col rounded-[var(--radius)] border bg-surface p-4 shadow-[var(--shadow)]", c.current ? "border-primary/40" : "border-line")} aria-label={c.title}>
      <header>
        <h3 className="text-base font-semibold">{c.title}</h3>
        <p className="mt-0.5 text-sm text-fg">{names.rotation(c.rot)}</p>
        {c.why && <p className="mt-1 text-xs text-fg-muted">{c.why}</p>}
      </header>
      <dl className="mt-3 flex-1">
        <Metric label={t("analysis.m_income")} value={f.moneyPerHa(c.base.meanNet)} sub={c.current ? undefined : `${f.signedMoney(delta)} ${t("analysis.m_delta")}`} tone={!c.current ? (delta >= 0 ? "text-ok" : "text-danger") : undefined} />
        <Metric label={t("analysis.m_bad")} value={t("analysis.rot_bad_of", { n: c.base.fails, total: n })} tone={c.base.pFail > opts.failShare ? "text-danger" : undefined} />
        <Metric label={t("analysis.m_worst")} value={f.money(c.base.minNet)} sub={t("analysis.rot_worst_in", { year: c.base.worstYear })} tone={c.base.minNet < 0 ? "text-danger" : undefined} />
        <Metric label={t("analysis.m_margin")} value={c.margin ? (c.margin.already ? t("common.risk_over") : c.margin.dTcapped ? t("analysis.hero_beyond_heat") : f.warm(c.margin.dT)) : "…"} tone={risk ? RISK_CLS[risk] : undefined} />
        <Metric label={t("analysis.m_soil")} value={`${c.base.soilScore} / 100`} />
        <Metric label={t("analysis.m_erosion")} value={`${f.num(c.base.erosion, 1)} ${t("analysis.u_tha")}`} />
        <Metric label={t("analysis.m_water")} value={`${f.num(c.base.waterUse)} ${t("analysis.u_mm")}`} />
        <Metric label={t("analysis.m_cost")} value={f.moneyPerHa(cost)} />
      </dl>
      <ul className="mt-3 space-y-1 text-xs">
        <li className={cn("flex items-center gap-1.5", fit.fitsBudget ? "text-ok" : "text-danger")}><Wallet className="size-3.5" aria-hidden />{fit.fitsBudget ? t("analysis.fits_budget") : t("analysis.over_budget")}</li>
        <li className={cn("flex items-center gap-1.5", fit.missing.length ? "text-warn" : "text-ok")}><Package className="size-3.5" aria-hidden />
          {fit.missing.length ? t("analysis.missing_equipment", { list: fit.missing.map((e) => t(`analysis.equip_${e}`)).join(", ") }) : t("analysis.fits_equipment")}
        </li>
      </ul>
      {!c.current && (
        <Button className="mt-4" variant={adopted ? "secondary" : "primary"} disabled={adopted} onClick={onAdopt}>
          {adopted ? <><Check className="size-4" aria-hidden />{t("analysis.adopted")}</> : t("analysis.adopt")}
        </Button>
      )}
    </article>
  );
}

export function RotationsTab() {
  const t = useT();
  const base = useApp((s) => s.base);
  const margin = useApp((s) => s.margin);
  const rotation = useApp((s) => s.rotation);
  const picks = useApp((s) => s.picks);
  const computing = useApp((s) => s.computing);
  const setRotation = useApp((s) => s.setRotation);
  const margins = usePickMargins(picks);
  const same = (a: Rotation, b: Rotation) => a.length === b.length && a.every((s, i) => s.crop === b[i].crop && s.cover === b[i].cover);

  const cards = useMemo<CardData[]>(() => {
    if (!base) return [];
    const cur: CardData = { id: "current", title: t("analysis.rot_current"), rot: rotation, base, margin, current: true };
    return [cur, ...picks.map((p) => ({ id: p.label, title: t(`analysis.pick_${pickKey(p.label)}`), why: t(`analysis.pick_why_${pickKey(p.label)}`), rot: p.rot, base: p.base, margin: margins[p.label] ?? null }))];
  }, [base, margin, rotation, picks, margins, t]);

  return (
    <div className="flex flex-col gap-4">
      <Panel title={t("analysis.rot_title")} sub={t("analysis.rot_intro")} tour="rotation-cards" aside={computing ? <Spinner label={t("analysis.rot_loading")} /> : null}>
        {!base ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Skeleton className="h-96" /><Skeleton className="h-96" /><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <RotationCard key={c.id} c={c} baseMean={base.meanNet} adopted={same(c.rot, rotation)} onAdopt={() => setRotation(c.rot)} />
            ))}
          </div>
        )}
        {base && !picks.length && !computing && <p className="mt-4 text-sm text-fg-muted">{t("analysis.rot_none")}</p>}
        <p className="mt-4 text-xs text-fg-muted">{t("analysis.rot_costs_note")}</p>
      </Panel>
    </div>
  );
}
