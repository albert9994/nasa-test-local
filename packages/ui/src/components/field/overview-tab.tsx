"use client";
import { HeroCard } from "@/components/hero/hero-card";
import { YearlyChart } from "@/components/hero/yearly-chart";
import { AttentionList } from "./attention-list";

export function OverviewTab() {
  return (
    <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <HeroCard />
        <AttentionList />
      </div>
      <div className="min-w-0"><YearlyChart /></div>
    </div>
  );
}
