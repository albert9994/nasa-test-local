"use client";
// How many of the worst years had heat at flowering? Runs the traced rotation for each of the worst years (engine, debounced).
import { useEffect, useState } from "react";
import { getEngine } from "@/lib/engine";
import { useApp } from "@/lib/store/app";

const WORST = 8;

export function useHeatAtFlowering() {
  const handle = useApp((s) => s.handle);
  const rotation = useApp((s) => s.rotation);
  const opts = useApp((s) => s.opts);
  const base = useApp((s) => s.base);
  const [heat, setHeat] = useState<{ hit: number; of: number } | null>(null);
  useEffect(() => {
    if (!handle || !base || !rotation.length) { setHeat(null); return; }
    let alive = true;
    const years = base.years.map((y, i) => [y, base.farmNet[i]] as const).sort((a, b) => a[1] - b[1]).slice(0, WORST).map((p) => p[0]);
    const timer = setTimeout(async () => {
      try {
        let hit = 0;
        for (const y of years) {
          const r = await getEngine().simulateRotation(handle, rotation, opts, y);
          if (!alive) return;
          if ((r.traced ?? []).some((s) => s.heatDays > 0)) hit++;
        }
        if (alive) setHeat({ hit, of: years.length });
      } catch { if (alive) setHeat(null); }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [handle, rotation, opts, base]);
  return heat;
}
