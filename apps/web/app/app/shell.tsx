"use client";
// Full app layout (O1). Each region is one owner's component; keep this file a thin layout so PRs don't collide.
// Slots for Ionut's modules: #compare (I5), #frontier (I3b), #science (I7), #marginYear (I6, inside the hero).
import { useEffect } from "react";
import { AppHeader } from "@/components/app/header";
import { FarmMap } from "@/components/app/farm-map";
import { FarmPanel } from "@/components/app/farm-panel";
import { InputsPanel } from "@/components/inputs/inputs-panel";
import { HeroCard } from "@/components/hero/hero-card";
import { YearlyChart } from "@/components/hero/yearly-chart";
import { DroughtReplay } from "@/components/replay/drought-replay";
import { ExplainPanel } from "@/components/explain/explain-panel";
import { Placeholder } from "@/components/ui/placeholder";
import { useApp } from "@/lib/store/app";

export function AppShell() {
  const init = useApp((s) => s.init);
  useEffect(() => { init(); }, [init]);
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <aside className="flex flex-col gap-4">
          <FarmMap />
          <FarmPanel />
          <InputsPanel />
        </aside>
        <section className="flex min-w-0 flex-col gap-4">
          <HeroCard />
          <YearlyChart />
          <div id="compare"><Placeholder task="I5" title="Compare cards (Ionut)" /></div>
          <div id="frontier"><Placeholder task="I3b" title="Failure frontier (Ionut)" /></div>
          <DroughtReplay />
          <ExplainPanel />
          <div id="science"><Placeholder task="I7" title="Validation + data panel (Ionut)" /></div>
        </section>
      </main>
    </div>
  );
}
