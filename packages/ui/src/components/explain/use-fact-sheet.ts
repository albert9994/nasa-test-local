"use client";
// Builds the C10 fact sheet from the app store through the engine interface, with names in the app language.
import { useEffect, useMemo, useState } from "react";
import { getEngine, type FactSheet } from "@/lib/engine";
import { useNames } from "@/components/field/hooks";
import { pickKey } from "@/components/field/numbers";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";

export function useFactSheet() {
  const t = useT();
  const names = useNames();
  const handle = useApp((s) => s.handle);
  const rotation = useApp((s) => s.rotation);
  const opts = useApp((s) => s.opts);
  const picks = useApp((s) => s.picks);
  const base = useApp((s) => s.base);
  const [fact, setFact] = useState<FactSheet | null>(null);
  useEffect(() => {
    if (!handle || !rotation.length || !base) { setFact(null); return; }
    let alive = true;
    getEngine().factSheet(handle, rotation, opts, picks).then((f) => { if (alive) setFact(f); }).catch(() => { if (alive) setFact(null); });
    return () => { alive = false; };
  }, [handle, rotation, opts, picks, base]);
  return useMemo(() => {
    if (!fact) return null;
    return {
      ...fact,
      rotation: names.rotation(rotation),
      alternatives: fact.alternatives.map((a, i) => ({
        ...a,
        label: picks[i] ? t(`analysis.pick_${pickKey(picks[i].label)}`) : a.label,
        rotation: picks[i] ? names.rotation(picks[i].rot) : a.rotation,
      })),
    } satisfies FactSheet;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fact, rotation, picks, t.locale]);
}
