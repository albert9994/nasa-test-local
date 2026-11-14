// O5 (subagent): "click anywhere" → NASA POWER daily + SoilGrids WCS → C1 pack in memory.
import type { FarmPack } from "@/lib/engine/types";
export async function buildLivePack(lat: number, lon: number): Promise<FarmPack> {
  throw new Error(`live pack for ${lat},${lon} not implemented yet (O5)`);
}
