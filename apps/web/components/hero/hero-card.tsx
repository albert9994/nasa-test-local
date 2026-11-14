"use client";
// O3: Adaptation Margin hero card (+X °C / −Y % rain, bars with 2050 ticks, sentence, risk badge, #marginYear slot).
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";
import { DEFAULT_SERIES, rotationLabel } from "@/lib/engine";
import type { MarginResult } from "@/lib/engine";
import { useApp } from "@/lib/store/app";
import { cn, fmtMoney } from "@/lib/utils";

const T_MAX = 6; // °C bar range
const P_MAX = 70; // % rain bar range
type Risk = "safe" | "tight" | "over";

const RISK = {
  safe: { label: "Safe", cls: "border-leaf text-leaf" },
  tight: { label: "Tight", cls: "border-gold text-gold" },
  over: { label: "Already over the line", cls: "border-heat text-heat" },
} as const;

function Counter({ value, format }: { value: number; format: (v: number) => string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, format);
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.5, ease: "easeOut" });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

function Bar({ label, frac, tick, tickLabel, color, max }: {
  label: string; frac: number; tick: number; tickLabel: string; color: string; max: string;
}) {
  const clamp = (v: number) => Math.max(0, Math.min(1, v)) * 100;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-fg-muted"><span>{label}</span><span className="num">{max}</span></div>
      <div className="relative h-3 rounded-full bg-line">
        <motion.div className={cn("h-full rounded-full", color)} initial={false} animate={{ width: `${clamp(frac)}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
        <div className="absolute -top-1 bottom-[-4px] w-0.5 bg-fg" style={{ left: `${clamp(tick)}%` }} />
        <span className="num absolute top-4 -translate-x-1/2 whitespace-nowrap text-[11px] text-fg-muted" style={{ left: `clamp(1.5rem, ${clamp(tick)}%, calc(100% - 1.5rem))` }}>
          {tickLabel}
        </span>
      </div>
    </div>
  );
}

function riskOf(m: MarginResult, t2050: number): Risk {
  if (m.already) return "over";
  if (m.dTcapped || m.dT > t2050 + 0.5) return "safe";
  return "tight";
}

export function HeroCard() {
  const margin = useApp((s) => s.margin);
  const base = useApp((s) => s.base);
  const pack = useApp((s) => s.pack);
  const rotation = useApp((s) => s.rotation);
  const computing = useApp((s) => s.computing);

  const p50 = pack?.scenarios?.ssp245?.["2050"];
  const pt = DEFAULT_SERIES.find((p) => p.year === 2050);
  const t2050 = p50?.dT ?? pt?.dT ?? 2;
  const p2050 = Math.abs(p50?.dP ?? pt?.dP ?? -0.04) * 100;

  if (!margin) {
    return (
      <section className="rounded-[var(--radius)] border border-line bg-bg-elev p-5" aria-busy="true">
        <p className="text-sm text-fg-muted">Adaptation Margin</p>
        <div className="mt-3 h-14 w-48 animate-pulse rounded bg-line" />
        <div className="mt-4 h-3 w-full animate-pulse rounded bg-line" />
        <div id="marginYear" />
      </section>
    );
  }

  const risk = riskOf(margin, t2050);
  const rain = Math.abs(margin.dP) * 100;
  const tText = margin.already ? "Already over" : margin.dTcapped ? "> +6 °C" : null;
  const pText = margin.already ? null : margin.dPcapped ? "> −70 %" : null;
  const rot = rotation.length ? rotationLabel(rotation) : "rotation";
  const sentence = margin.already
    ? `Your ${rot} rotation already has more bad years than you tolerate, even with today's climate.`
    : `Your ${rot} rotation stays inside your limit until ${margin.dTcapped ? "more than +6 °C" : `about +${margin.dT.toFixed(1)} °C`}. 2050 is projected at +${t2050.toFixed(1)} °C.`;
  const n = base?.years.length ?? 0;

  return (
    <section className={cn("rounded-[var(--radius)] border border-line bg-bg-elev p-5 transition-opacity", computing && "opacity-80")} aria-busy={computing}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">Adaptation Margin {computing && <span className="ml-1 animate-pulse text-xs">updating…</span>}</p>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", RISK[risk].cls)}>{RISK[risk].label}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-1">
        <p className="display text-5xl sm:text-6xl">
          {tText ?? <Counter value={margin.dT} format={(v) => `+${v.toFixed(1)} °C`} />}
        </p>
        <p className="display text-3xl text-fg-muted sm:text-4xl">
          {margin.already ? "" : pText ?? <Counter value={rain} format={(v) => `−${v.toFixed(0)} % rain`} />}
        </p>
      </div>

      <p className="mt-3 text-sm leading-relaxed">{sentence}</p>

      {!margin.already && (
        <div className="mt-5 space-y-6 pb-3">
          <Bar label="Heat you can absorb" frac={margin.dT / T_MAX} tick={t2050 / T_MAX} tickLabel="2050" color="bg-heat" max={`0–${T_MAX} °C`} />
          <Bar label="Rain loss you can absorb" frac={rain / P_MAX} tick={p2050 / P_MAX} tickLabel="2050" color="bg-water" max={`0–${P_MAX} %`} />
        </div>
      )}

      {base && (
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
          <div>
            <dt className="text-xs text-fg-muted">Bad years today</dt>
            <dd className="num text-lg">{base.fails}/{n}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Mean net income</dt>
            <dd className="num text-lg">{fmtMoney(base.meanNet)}/ha</dd>
          </div>
        </dl>
      )}
      <div id="marginYear" />
    </section>
  );
}
