"use client";
// Field analysis area. Loads the selected field's data pack, hands it to the shared analysis store (`useApp`) and renders
// the analysis panels. Today: the v1 components (same as apps/web/app/app/shell.tsx). When `components/field/FieldAnalysis`
// (B3) lands, replace the body of <Panels/> with it; the loading/store wiring around it stays.
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import type { Field, Profile } from "@/lib/store/farm";
import { InputsPanel } from "@/components/inputs/inputs-panel";
import { HeroCard } from "@/components/hero/hero-card";
import { YearlyChart } from "@/components/hero/yearly-chart";
import { DroughtReplay } from "@/components/replay/drought-replay";
import { ExplainPanel } from "@/components/explain/explain-panel";
import { loadFieldPack, packForField } from "./packs";

type Status = "loading" | "ready" | "error";

export function Analysis({ field, profile }: { field: Field; profile: Profile }) {
  const t = useT();
  const [status, setStatus] = useState<Status>("loading");
  const [cached, setCached] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sig = `${field.id}|${field.rotation.join(",")}|${field.name}`;

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    (async () => {
      try {
        const { pack, fromCache } = await loadFieldPack(field);
        if (!alive) return;
        await useApp.getState().usePack(packForField(pack, field));
        // Farmer profile -> engine inputs (usePack resets them).
        useApp.setState({
          opts: { ...useApp.getState().opts, failShare: 1 / profile.badYearsIn },
          constraints: { equipment: profile.equipment, sellable: profile.sellable, ...(profile.budgetPerHa != null ? { maxCostPerHa: profile.budgetPerHa } : {}) },
        });
        useApp.getState().recompute();
        if (alive) { setCached(fromCache); setStatus("ready"); }
      } catch (e) {
        console.warn("field load failed", e);
        if (alive) setStatus("error");
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, profile.badYearsIn, profile.budgetPerHa, profile.equipment, profile.sellable, attempt]);

  if (status === "loading") return <p className="p-6 text-sm text-fg-muted" role="status">{t("workspace.loadingData")}</p>;
  if (status === "error") {
    return (
      <div className="p-6 text-sm">
        <p className="text-heat">{t("workspace.loadFailed")}</p>
        <button className="mt-3 rounded-full border border-line-strong px-4 py-1.5 hover:bg-surface-2" onClick={() => setAttempt(attempt + 1)}>{t("common.retry")}</button>
      </div>
    );
  }
  return (
    <>
      {cached && <p className="mb-3 text-xs text-fg-muted">{t("workspace.cachedOffline")}</p>}
      <Panels />
    </>
  );
}

function Panels() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(320px,380px)_1fr]">
      <div className="flex flex-col gap-4" data-tour="stress"><InputsPanel /></div>
      <div className="flex min-w-0 flex-col gap-4">
        <div data-tour="margin"><HeroCard /></div>
        <div data-tour="futures"><YearlyChart /></div>
        <DroughtReplay />
        <div data-tour="rotations"><ExplainPanel /></div>
      </div>
    </div>
  );
}
