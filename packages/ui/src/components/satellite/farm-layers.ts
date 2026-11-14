// Which bundled farms have a precomputed crop map (public/data/layers/<farm>/cropmap.json), and where they are.
import { haversineKm } from "@/lib/geo/area";

export const CROPMAP_FARMS: { id: string; lat: number; lon: number }[] = [
  { id: "iowa", lat: 42.03, lon: -93.62 },
  { id: "baragan", lat: 44.55, lon: 27.45 },
];
/** The crop map covers a ~16 km block; allow a little slack around it. */
export const CROPMAP_RADIUS_KM = 14;

/** The farm whose crop map covers this point, or null. The layer itself still hides if its file is missing. */
export function cropMapFarmAt(lat: number, lon: number): string | null {
  for (const f of CROPMAP_FARMS) if (haversineKm({ lat, lon }, f) <= CROPMAP_RADIUS_KM) return f.id;
  return null;
}
