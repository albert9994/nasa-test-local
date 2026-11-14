"use client";
// Pre-computes, for one demo farm, how bad years grow as it gets hotter (0 → 4 °C), plus its Adaptation Margin.
// Drives the scroll story on the landing page. Runs on whichever engine `getEngine()` returns (mock today, WASM later).
import { useEffect, useState } from "react";
import { loadPack } from "@/lib/data/packs";
import { DEFAULT_OPTS, getEngine, type MarginResult } from "@/lib/engine";

export interface HeatCurve {
  farm: string; name: string; rotation: string; years: number;
  points: { dT: number; badYears: number; meanNet: number }[];
  margin: MarginResult;
}

const cache = new Map<string, Promise<HeatCurve>>();

async function compute(id: string): Promise<HeatCurve> {
  const pack = await loadPack(id);
  const fs = getEngine();
  const h = await fs.prepareFarm(pack);
  const rot = pack.meta.rotation.map((crop) => ({ crop, cover: false }));
  const points = [];
  let years = 0;
  for (let dT = 0; dT <= 4.001; dT += 0.25) {
    const r = await fs.simulateRotation(h, rot, { ...DEFAULT_OPTS, dT });
    years = r.years.length;
    points.push({ dT: +dT.toFixed(2), badYears: r.fails, meanNet: r.meanNet });
  }
  const margin = await fs.adaptationMargin(h, rot, DEFAULT_OPTS);
  return { farm: id, name: pack.meta.name, rotation: pack.meta.rotation.join(" → "), years, points, margin };
}

export function useHeatCurve(id: string) {
  const [curve, setCurve] = useState<HeatCurve | null>(null);
  useEffect(() => {
    let live = true;
    if (!cache.has(id)) cache.set(id, compute(id));
    cache.get(id)!.then((c) => { if (live) setCurve(c); }).catch(() => cache.delete(id));
    return () => { live = false; };
  }, [id]);
  return curve;
}
