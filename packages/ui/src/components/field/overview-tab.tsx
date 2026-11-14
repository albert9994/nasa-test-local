"use client";
import { HeroCard } from "@/components/hero/hero-card";
import { YearlyChart } from "@/components/hero/yearly-chart";
import { AlertsPanel } from "@/components/alerts/alerts-panel";
import { useFarmAlertCtx } from "@/components/alerts/use-farm-alerts";
import { AttentionList } from "./attention-list";

export function OverviewTab() {
  const ctx = useFarmAlertCtx();
  return (
    <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <HeroCard />
        <AttentionList />
        {ctx && (
          <section className="rounded-[var(--radius)] border border-line bg-surface p-4 shadow-[var(--shadow)]" data-tour="alerts">
            <AlertsPanel {...ctx} />
          </section>
        )}
      </div>
      <div className="min-w-0"><YearlyChart /></div>
    </div>
  );
}
