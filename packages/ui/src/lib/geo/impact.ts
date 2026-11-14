// "How you could be affected": rotation → adaptation margin + bad years today vs ~2050, using the shared engine (C3).
import { getEngine, DEFAULT_OPTS, DEFAULT_SERIES } from "@/lib/engine";
import type { CropId, FarmPack, Opts, ScenarioPoint } from "@/lib/engine";
import { defaultRotation } from "@/lib/data/live";

export type Risk = "safe" | "tight" | "over";
export interface Impact {
  rotation: CropId[];
  risk: Risk;
  /** °C of extra warming the rotation takes before bad years exceed 1 in 5. */
  marginT: number;
  marginCapped: boolean;
  marginP: number;
  already: boolean;
  years: number;
  badToday: number;
  bad2050: number;
  dT2050: number;
  dP2050: number;
  meanNetToday: number;
  meanNet2050: number;
}

export const ROTATION_PRESETS: { id: string; crops: CropId[] }[] = [
  { id: "maize-wheat", crops: ["maize", "wheat"] },
  { id: "maize-soybean", crops: ["maize", "soybean"] },
  { id: "wheat-sunflower", crops: ["wheat", "sunflower"] },
  { id: "wheat-barley-pea", crops: ["wheat", "barley", "pea"] },
  { id: "wheat-sorghum", crops: ["wheat", "sorghum"] },
];

/** Typical local rotation: Romanian/European lowlands → maize→wheat; US Corn Belt → maize→soybean; else from the climate. */
export function defaultRotationFor(pack: FarmPack): CropId[] {
  const { lat, lon } = pack.meta;
  if (lon > -105 && lon < -80 && lat > 36 && lat < 49) return ["maize", "soybean"];
  if (lon > -10 && lon < 45 && lat > 40 && lat < 55) return ["maize", "wheat"];
  return defaultRotation(pack.weather);
}

export function pointAtYear(series: ScenarioPoint[], year: number): ScenarioPoint {
  const s = [{ year: 2020, dT: 0, dP: 0 }, ...series];
  for (let i = 1; i < s.length; i++) if (year <= s[i].year) {
    const a = s[i - 1], b = s[i], t = (year - a.year) / (b.year - a.year);
    return { year, dT: a.dT + t * (b.dT - a.dT), dP: a.dP + t * (b.dP - a.dP) };
  }
  return { ...s[s.length - 1], year };
}

export async function computeImpact(pack: FarmPack, rotation: CropId[], year = 2050): Promise<Impact> {
  const eng = getEngine();
  const h = await eng.prepareFarm(pack);
  const rot = rotation.map((crop) => ({ crop, cover: false }));
  const opts: Opts = { ...DEFAULT_OPTS };
  const series = pack.scenarios?.ssp245?.series ?? DEFAULT_SERIES;
  const pt = pointAtYear(series, year);
  const [m, now, fut] = await Promise.all([
    eng.adaptationMargin(h, rot, opts),
    eng.simulateRotation(h, rot, opts),
    eng.simulateRotation(h, rot, { ...opts, dT: pt.dT, dP: pt.dP }),
  ]);
  const risk: Risk = m.already ? "over" : m.dTcapped || m.dT >= pt.dT ? "safe" : "tight";
  return {
    rotation, risk, marginT: m.dT, marginCapped: m.dTcapped, marginP: m.dP, already: m.already,
    years: now.years.length, badToday: now.fails, bad2050: fut.fails, dT2050: pt.dT, dP2050: pt.dP,
    meanNetToday: now.meanNet, meanNet2050: fut.meanNet,
  };
}
