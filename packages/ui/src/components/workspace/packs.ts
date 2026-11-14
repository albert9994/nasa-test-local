// Loads the data pack of a field and keeps a copy on disk (host cache) so the app works offline after the first load.
import { buildLivePack, cacheKey } from "@/lib/data/live";
import { loadPack } from "@/lib/data/packs";
import type { FarmPack } from "@/lib/engine/types";
import type { Field } from "@/lib/store/farm";
import { getHost } from "@/lib/store/farm-storage";

export interface LoadedPack { pack: FarmPack; fromCache: boolean }

async function fromCache(key: string): Promise<FarmPack | null> {
  try {
    const raw = await getHost().cacheGet(key);
    return raw ? (JSON.parse(raw) as FarmPack) : null;
  } catch { return null; }
}
function toCache(key: string, pack: FarmPack) {
  void getHost().cacheSet(key, JSON.stringify(pack)).catch(() => { /* disk full or blocked: not critical */ });
}

const inflight = new Map<string, Promise<LoadedPack>>();

/** Demo fields use the bundled pack; custom fields get NASA POWER + SoilGrids built from the centroid (cached after the first time). */
export function loadFieldPack(f: Field): Promise<LoadedPack> {
  const key = f.packId ? `pack-${f.packId}` : `pack-live-${cacheKey(f.centroid.lat, f.centroid.lon)}`;
  if (!inflight.has(key)) {
    const p = (async (): Promise<LoadedPack> => {
      const cached = await fromCache(key);
      if (f.packId) {
        try {
          const pack = await loadPack(f.packId);
          if (!cached) toCache(key, pack);
          return { pack, fromCache: false };
        } catch (e) {
          if (cached) return { pack: cached, fromCache: true };
          throw e;
        }
      }
      if (cached) return { pack: cached, fromCache: true };
      const pack = await buildLivePack(f.centroid.lat, f.centroid.lon);
      toCache(key, pack);
      return { pack, fromCache: false };
    })();
    p.catch(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key)!;
}

/** The pack as the analysis should see it: this field's name and rotation on top of the shared weather/soil data. */
export function packForField(pack: FarmPack, f: Field): FarmPack {
  return { ...pack, meta: { ...pack.meta, name: f.name, lat: f.centroid.lat, lon: f.centroid.lon, rotation: f.rotation } };
}
