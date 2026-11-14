"use client";
// Dev harness for the field analysis workspace: map + farm panel on the left, <FieldAnalysis/> on the right.
// Keep this file a thin layout; the desktop app reuses FieldAnalysis directly.
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/app/header";
import { FarmMap } from "@/components/app/farm-map";
import { FarmPanel } from "@/components/app/farm-panel";
import { LiveClick } from "@/components/app/live-click";
import { FieldAnalysis } from "@/components/field";
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
    <div className="flex min-h-dvh flex-col bg-bg">
      <Suspense fallback={null}><Boot /></Suspense>
      <AppHeader />
      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <FarmMap />
          <LiveClick />
          <FarmPanel />
        </aside>
        <FieldAnalysis />
      </main>
    </div>
  );
}
