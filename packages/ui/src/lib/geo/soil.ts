import type { FarmPack } from "@/lib/engine/types";

export type TextureClass =
  | "sand" | "loamySand" | "sandyLoam" | "loam" | "siltLoam" | "silt"
  | "sandyClayLoam" | "clayLoam" | "siltyClayLoam" | "sandyClay" | "siltyClay" | "clay";

/** USDA texture triangle (sand/clay in %, silt = rest). */
export function textureClass(sand: number, clay: number): TextureClass {
  const silt = 100 - sand - clay;
  if (silt + 1.5 * clay < 15) return "sand";
  if (silt + 1.5 * clay >= 15 && silt + 2 * clay < 30) return "loamySand";
  if ((clay >= 7 && clay < 20 && sand > 52 && silt + 2 * clay >= 30) || (clay < 7 && silt < 50 && silt + 2 * clay >= 30)) return "sandyLoam";
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return "loam";
  if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12)) return "siltLoam";
  if (silt >= 80 && clay < 12) return "silt";
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return "sandyClayLoam";
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return "clayLoam";
  if (clay >= 27 && clay < 40 && sand <= 20) return "siltyClayLoam";
  if (clay >= 35 && sand > 45) return "sandyClay";
  if (clay >= 40 && silt >= 40) return "siltyClay";
  if (clay >= 40 && sand <= 45 && silt < 40) return "clay";
  return "loam";
}

export interface SoilSummary { sand: number; clay: number; silt: number; soc: number | null; ph: number | null; texture: TextureClass }

const W: [string, number][] = [["0-5cm", 5], ["5-15cm", 10], ["15-30cm", 15]];

function avg(prop: Record<string, { mean: number }> | undefined): number | null {
  if (!prop) return null;
  let s = 0, w = 0;
  for (const [d, t] of W) { const v = prop[d]?.mean; if (typeof v === "number" && Number.isFinite(v)) { s += v * t; w += t; } }
  return w ? s / w : null;
}

/** Topsoil (0–30 cm, thickness-weighted) summary from a SoilGrids block; null when the pack has no soil. */
export function summariseSoil(soil: FarmPack["soil"] | undefined): SoilSummary | null {
  if (!soil) return null;
  const sand = avg(soil.sand), clay = avg(soil.clay);
  if (sand == null || clay == null) return null;
  const silt = avg(soil.silt) ?? Math.max(0, 100 - sand - clay);
  return { sand, clay, silt, soc: avg(soil.soc), ph: avg(soil.phh2o), texture: textureClass(sand, clay) };
}
