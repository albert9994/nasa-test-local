// Farm pack loader (C1). Mock packs = real NASA POWER + SoilGrids + MODIS data cached by the old prototype,
// until Luca's pipeline (LU1) writes public/data/farms/. Switch DATA_ROOT then.
import type { FarmIndexEntry, FarmPack } from "@/lib/engine/types";

export const DATA_ROOT = "/data/mock/farms";
const cache = new Map<string, Promise<FarmPack>>();

export async function loadIndex(): Promise<FarmIndexEntry[]> {
  const r = await fetch(`${DATA_ROOT}/index.json`);
  if (!r.ok) throw new Error(`index.json: ${r.status}`);
  return r.json();
}

export function loadPack(id: string): Promise<FarmPack> {
  if (!cache.has(id)) {
    const p = fetch(`${DATA_ROOT}/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`${id}.json: ${r.status}`);
      return r.json() as Promise<FarmPack>;
    });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return cache.get(id)!;
}
