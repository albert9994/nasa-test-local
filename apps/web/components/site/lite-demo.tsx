"use client";
// Lite demo ("farmer mode"): pick a farm, push the climate, see the margin, bad years and three better rotations.
// Uses the same store and engine as the full app, with plain words and fewer numbers.
import Link from "next/link";
import { useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { rotationLabel } from "@/lib/engine";
import { useApp } from "@/lib/store/app";
import { cn, fmtMoney } from "@/lib/utils";
import { useHeatCurve } from "./use-heat-curve";

const SHORT: Record<string, string> = { iowa: "Iowa, USA", kansas: "Kansas, USA", baragan: "Bărăgan, Romania" };

export function LiteDemo({ initialFarm, compact = false }: { initialFarm?: string; compact?: boolean }) {
  const { index, farmId, init, selectFarm, opts, setOpts, base, picks, computing, rotation } = useApp();
  useEffect(() => {
    init().then(() => { if (initialFarm && useApp.getState().farmId !== initialFarm) selectFarm(initialFarm); });
  }, [init, initialFarm, selectFarm]);
  const curve = useHeatCurve(farmId ?? initialFarm ?? "iowa");
  const limit = curve?.margin;
  const years = base?.years.length ?? 25;
  const over = !!limit && (limit.already || opts.dT > limit.dT);

  return (
    <div className={cn("grid gap-6", !compact && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]")}>
      <div className="flex flex-col gap-6 rounded-[var(--radius)] border border-line bg-bg-elev/70 p-5 backdrop-blur">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-fg-muted">1 · Choose a farm</p>
          <div className="flex flex-wrap gap-2">
            {(index.length ? index : [{ id: "iowa", name: "Iowa" }]).map((f) => (
              <button key={f.id} onClick={() => selectFarm(f.id)}
                className={cn("rounded-full border px-4 py-1.5 text-sm transition-colors",
                  f.id === farmId ? "border-gold bg-gold text-[#0b0c09]" : "border-line hover:border-gold")}>
                {SHORT[f.id] ?? f.name}
              </button>
            ))}
          </div>
          {rotation.length > 0 && <p className="mt-2 text-sm text-fg-muted">Grows today: <span className="text-fg">{rotationLabel(rotation)}</span></p>}
        </div>
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-fg-muted">2 · Change the climate</p>
          <label className="mb-1 flex justify-between text-sm"><span>Hotter summers</span><span className="num text-heat">+{opts.dT.toFixed(1)} °C</span></label>
          <Slider aria-label="Hotter summers" min={0} max={4} step={0.1} value={[opts.dT]} onValueChange={([v]) => setOpts({ dT: v })} />
          <label className="mb-1 mt-5 flex justify-between text-sm"><span>Less rain</span><span className="num text-water">{Math.round(opts.dP * 100)} %</span></label>
          <Slider aria-label="Less rain" min={0} max={40} step={1} value={[-opts.dP * 100]} onValueChange={([v]) => setOpts({ dP: -v / 100 })} />
          <div className="mt-4 flex gap-2">
            <button className="rounded-full border border-line px-3 py-1 text-xs hover:border-gold" onClick={() => setOpts({ dT: 0, dP: 0 })}>Today</button>
            <button className="rounded-full border border-line px-3 py-1 text-xs hover:border-gold" onClick={() => setOpts({ dT: 2.0, dP: -0.04 })}>2050 (projected)</button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className={cn("rounded-[var(--radius)] border p-6 transition-colors", over ? "border-heat/60 bg-heat/10" : "border-leaf/50 bg-leaf/10")}>
          <p className="text-xs uppercase tracking-[0.2em] text-fg-muted">Adaptation Margin</p>
          <p className="display mt-1 text-6xl sm:text-7xl">
            {limit ? (limit.already ? "Over the line" : limit.dTcapped ? "> +6 °C" : `+${limit.dT.toFixed(1)} °C`) : "…"}
          </p>
          <p className="mt-2 max-w-prose text-sm text-fg-muted">
            {limit && !limit.already
              ? `This farm can take about ${limit.dT.toFixed(1)} °C of warming before bad years come more often than 1 in 5.`
              : "Even today's climate gives this farm more bad years than it can live with."}
          </p>
          <p className={cn("mt-4 text-lg", computing && "opacity-60")}>
            In this climate: <span className="num font-medium">{base ? `${base.fails} bad ${base.fails === 1 ? "year" : "years"} out of ${years}` : "…"}</span>
            {base && <span className="text-fg-muted"> · average {fmtMoney(base.meanNet)}/ha</span>}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {picks.length === 0 && [0, 1, 2].map((i) => <div key={i} className="h-36 animate-pulse rounded-[var(--radius)] border border-line bg-bg-elev" />)}
          {picks.map((p) => (
            <div key={p.label} className="rounded-[var(--radius)] border border-line bg-bg-elev p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-gold">{p.label}</p>
              <p className="mt-1 text-sm font-medium">{rotationLabel(p.rot)}</p>
              <p className="num mt-3 text-sm">{p.base.fails}/{years} bad years</p>
              {base && <p className={cn("num text-sm", p.base.meanNet >= base.meanNet ? "text-leaf" : "text-heat")}>
                {p.base.meanNet >= base.meanNet ? "+" : ""}{fmtMoney(p.base.meanNet - base.meanNet)}/ha vs today
              </p>}
              <p className="mt-2 text-xs text-fg-muted">{p.why}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/app${farmId ? `?farm=${farmId}` : ""}`} className="rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-[#0b0c09] hover:brightness-110">
            Open the full app →
          </Link>
          <p className="text-xs text-fg-muted">Planning aid, not a guarantee. Numbers from a preview engine on real NASA data.</p>
        </div>
      </div>
    </div>
  );
}
