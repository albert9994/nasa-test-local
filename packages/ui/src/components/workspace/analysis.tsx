"use client";
// Field analysis area. Loads the selected field's data pack, hands it to the shared analysis store (`useApp`) and renders
// the shared analysis panels (FieldAnalysis, B3).
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import type { Field, Profile } from "@/lib/store/farm";
import { FieldAnalysis } from "@/components/field";
import { Skeleton } from "@/components/field/ui";
import { loadFieldPack, packForField } from "./packs";

type Status = "loading" | "ready" | "error";

/** Loads a field's data pack into the shared analysis store (`useApp`) with the farmer's profile. Used by the analysis
 *  panel and by the assistant, so both work on the same field data. */
export function useFieldData(field: Field | null, profile: Profile) {
  const [status, setStatus] = useState<Status>("loading");
  const [cached, setCached] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sig = field ? `${field.id}|${field.rotation.join(",")}|${field.name}` : "";

  useEffect(() => {
    if (!field) return;
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

  return { status, cached, retry: () => setAttempt((a) => a + 1) };
}

export function Analysis({ field, profile }: { field: Field; profile: Profile }) {
  const t = useT();
  const { status, cached, retry } = useFieldData(field, profile);

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-4 pt-4" role="status" aria-label={t("workspace.loadingData")}>
        <p className="flex items-center gap-2 text-sm text-fg-muted"><span aria-hidden className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-primary" />{t("workspace.loadingData")}</p>
        <Skeleton className="h-10 rounded-full" />
        <div className="grid gap-4 @3xl:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="py-6 text-sm">
        <p className="text-heat">{t("workspace.loadFailed")}</p>
        <button className="mt-3 rounded-full border border-line-strong px-4 py-1.5 hover:bg-surface-2" onClick={retry}>{t("common.retry")}</button>
      </div>
    );
  }
  return (
    <>
      {cached && <p className="mt-3 text-xs text-fg-muted">{t("workspace.cachedOffline")}</p>}
      <Panels />
    </>
  );
}

function Panels() {
  return <FieldAnalysis tabsClassName="sticky top-0 z-20 -mx-5 bg-bg/85 px-5 pb-2 pt-4 backdrop-blur-md" />;
}
