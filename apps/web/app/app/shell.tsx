"use client";
// Full app layout (O1). Each region is one owner's component; keep this file a thin layout so PRs don't collide.
// Slots for Ionut's modules: #compare (I5), #frontier (I3b), #science (I7), #marginYear (I6, inside the hero).
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/app/header";
import { FarmMap } from "@/components/app/farm-map";
import { FarmPanel } from "@/components/app/farm-panel";
import { LiveClick } from "@/components/app/live-click";
import { InputsPanel } from "@/components/inputs/inputs-panel";
import { HeroCard } from "@/components/hero/hero-card";
import { YearlyChart } from "@/components/hero/yearly-chart";
import { DroughtReplay } from "@/components/replay/drought-replay";
import { ExplainPanel } from "@/components/explain/explain-panel";
import { Placeholder } from "@/components/ui/placeholder";
import { useApp } from "@/lib/store/app";
import { useWorkerEngine } from "@/lib/engine";

/** Boots the engine worker, then loads the farm index; `?farm=<id>` deep-links to a farm. */
function Boot() {
  const init = useApp((s) => s.init);
  const farm = useSearchParams().get("farm");
  useEffect(() => {
    let alive = true;
    (async () => {
      await useWorkerEngine();
      if (!alive) return;
      if (farm) useApp.setState({ farmId: farm }); // so init() keeps it instead of picking the first farm
      await init();
      const { index, selectFarm } = useApp.getState();
      if (alive && farm && index.some((f) => f.id === farm)) await selectFarm(farm);
    })();
    return () => { alive = false; };
  }, [init, farm]);
  return null;
}

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={null}><Boot /></Suspense>
      <AppHeader />
      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <aside className="flex flex-col gap-4">
          <FarmMap />
          <LiveClick />
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
