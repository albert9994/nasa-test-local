"use client";
// O3 (subagent): Adaptation Margin hero card (+X °C / −Y % rain, bars with 2050 ticks, sentence, risk badge, #marginYear slot).
import { useApp } from "@/lib/store/app";
export function HeroCard() {
  const m = useApp((s) => s.margin);
  return (
    <div className="rounded-[var(--radius)] border border-line bg-bg-elev p-5">
      <p className="text-sm text-fg-muted">Adaptation Margin</p>
      <p className="display text-6xl">{m ? (m.already ? "Already over" : `+${m.dT.toFixed(1)} °C`) : "…"}</p>
    </div>
  );
}
