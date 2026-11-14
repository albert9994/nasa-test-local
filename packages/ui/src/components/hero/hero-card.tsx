"use client";
// Adaptation Margin hero: big number, traffic light, plain sentence, bars to the 2050 projection.
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";
import { DEFAULT_SERIES } from "@/lib/engine";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import { cn } from "@/lib/utils";
import { useF, useNames } from "@/components/field/hooks";
import { riskOf, type Risk } from "@/components/field/numbers";
import { Hint, Skeleton, Stat } from "@/components/field/ui";

const T_MAX = 6; // °C bar range
const P_MAX = 70; // % rain bar range

const RISK_CLS: Record<Risk, string> = {
  safe: "border-ok/30 bg-ok-soft text-ok",
  tight: "border-warn/30 bg-warn-soft text-warn",
  over: "border-danger/30 bg-danger-soft text-danger",
};
const BAR_CLS = { heat: "bg-heat", water: "bg-water" } as const;

function Counter({ value, format }: { value: number; format: (v: number) => string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, format);
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.5, ease: "easeOut" });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

function Bar({ label, frac, tick, tickLabel, tone, max }: { label: string; frac: number; tick: number; tickLabel: string; tone: keyof typeof BAR_CLS; max: string }) {
  const clamp = (v: number) => Math.max(0, Math.min(1, v)) * 100;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-fg-muted"><span>{label}</span><span className="num">{max}</span></div>
      <div className="relative h-3 rounded-full bg-surface-2">
        <motion.div className={cn("h-full rounded-full", BAR_CLS[tone])} initial={false} animate={{ width: `${clamp(frac)}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-fg" style={{ left: `${clamp(tick)}%` }} />
        <span className="num absolute top-5 -translate-x-1/2 whitespace-nowrap text-[11px] text-fg-muted" style={{ left: `clamp(1.5rem, ${clamp(tick)}%, calc(100% - 1.5rem))` }}>
          {tickLabel}
        </span>
      </div>
    </div>
  );
}

/** The 2050 projection used for the tick marks (pack scenario, else the built-in default path). */
export function use2050() {
  const pack = useApp((s) => s.pack);
  const p50 = pack?.scenarios?.ssp245?.["2050"];
  const pt = DEFAULT_SERIES.find((p) => p.year === 2050);
  return { dT: p50?.dT ?? pt?.dT ?? 2, dP: p50?.dP ?? pt?.dP ?? -0.04 };
}

export function HeroCard() {
  const t = useT();
  const f = useF();
  const names = useNames();
  const margin = useApp((s) => s.margin);
  const base = useApp((s) => s.base);
  const rotation = useApp((s) => s.rotation);
  const computing = useApp((s) => s.computing);
  const failShare = useApp((s) => s.opts.failShare);
  const p2050 = use2050();
  const t2050 = p2050.dT;
  const rain2050 = Math.abs(p2050.dP) * 100;

  if (!margin) {
    return (
      <section className="rounded-[var(--radius)] border border-line bg-surface p-5 shadow-[var(--shadow)]" aria-busy="true" data-tour="margin-hero">
        <p className="text-sm text-fg-muted">{t("common.adaptationMargin")}</p>
        <Skeleton className="mt-3 h-14 w-48" />
        <Skeleton className="mt-4 h-3 w-full" />
      </section>
    );
  }

  const risk = riskOf(margin, t2050);
  const rain = Math.abs(margin.dP) * 100;
  const rot = names.rotation(rotation);
  const sentence = margin.already
    ? t("analysis.sentence_over", { rotation: rot })
    : margin.dTcapped
      ? t("analysis.sentence_beyond", { rotation: rot, t2050: f.warm(t2050) })
      : t("analysis.sentence_safe", { rotation: rot, dT: f.warm(margin.dT), t2050: f.warm(t2050) });
  const n = base?.years.length ?? 0;
  const tText = margin.already ? t("analysis.hero_over") : margin.dTcapped ? t("analysis.hero_beyond_heat") : null;
  const pText = margin.already ? null : margin.dPcapped ? t("analysis.hero_beyond_rain") : null;

  return (
    <section className={cn("rounded-[var(--radius)] border border-line bg-surface p-5 shadow-[var(--shadow)] transition-opacity", computing && "opacity-80")} aria-busy={computing} data-tour="margin-hero">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-sm text-fg-muted">
          {t("common.adaptationMargin")} <Hint text={t("analysis.gl_margin")} />
          {computing && <span className="ml-1 animate-pulse text-xs">{t("analysis.computing")}</span>}
        </p>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", RISK_CLS[risk])}>{t(`common.risk_${risk}`)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-1">
        <p className="display num text-5xl sm:text-6xl">
          {tText ?? <Counter value={margin.dT} format={(v) => f.warm(v)} />}
        </p>
        {!margin.already && (
          <p className="display text-2xl text-fg-muted sm:text-3xl">
            {pText ?? <Counter value={rain} format={(v) => t("analysis.hero_rain", { v: f.num(v) })} />}
          </p>
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed">{sentence}</p>

      {!margin.already && (
        <div className="mt-5 space-y-7 pb-4">
          <Bar label={t("analysis.hero_heat_bar")} frac={margin.dT / T_MAX} tick={t2050 / T_MAX} tickLabel={`${t("analysis.hero_2050")} ${f.warm(t2050)}`} tone="heat" max={`0–${T_MAX} °C`} />
          <Bar label={t("analysis.hero_rain_bar")} frac={rain / P_MAX} tick={rain2050 / P_MAX} tickLabel={`${t("analysis.hero_2050")} −${f.num(rain2050)} %`} tone="water" max={`0–${P_MAX} %`} />
        </div>
      )}

      {base && (
        <dl className="mt-2 grid grid-cols-3 gap-3 border-t border-line pt-4">
          <Stat label={t("analysis.stat_bad")} value={`${base.fails}/${n}`} tone={base.pFail > failShare ? "danger" : undefined} />
          <Stat label={t("analysis.stat_mean")} value={f.moneyPerHa(base.meanNet)} />
          <Stat label={t("analysis.stat_worst")} value={f.money(base.minNet)} sub={String(base.worstYear)} tone={base.minNet < 0 ? "danger" : undefined} />
        </dl>
      )}
    </section>
  );
}
