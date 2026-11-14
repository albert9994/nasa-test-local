"use client";
// Stress test tab: inputs on the left, live results on the right.
import { HeroCard } from "@/components/hero/hero-card";
import { YearlyChart } from "@/components/hero/yearly-chart";
import { InputsPanel } from "@/components/inputs/inputs-panel";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import { useMarket } from "@/lib/store/market";
import { useF } from "./hooks";
import { Segmented } from "./segmented";

export function StressTab() {
  const t = useT();
  const f = useF();
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const { dT, dP } = useApp((s) => s.opts);
  const pricePct = useMarket((s) => s.pricePct);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-2xl">{t("analysis.stress_title")}</h2>
          <p className="text-sm text-fg-muted">{t("analysis.stress_intro")}</p>
        </div>
        <Segmented<"farmer" | "expert"> label={t("analysis.stress_mode")} value={mode} onChange={setMode}
          options={[{ value: "farmer", label: t("analysis.stress_mode_farmer") }, { value: "expert", label: t("analysis.stress_mode_expert") }]} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <InputsPanel />
        <div className="flex min-w-0 flex-col gap-4" data-tour="stress-results">
          <p className="rounded-xl bg-primary-soft px-3 py-2 text-sm text-primary" aria-live="polite">
            <span className="font-semibold">{t("analysis.stress_scenario")}: </span>
            {t("analysis.stress_scenario_line", { dT: f.warm(dT), rain: f.rainCut(dP), price: f.signedPct(pricePct) })}
          </p>
          <HeroCard />
          <YearlyChart />
        </div>
      </div>
    </div>
  );
}
