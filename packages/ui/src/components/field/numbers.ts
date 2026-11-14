// Pure analysis helpers (no React): risk level, tipping point, rotation costs, budget/equipment fit, heat colour.
import { CROPS, type Constraints, type CropId, type Equipment, type FarmMeta, type FrontierResult, type MarginResult, type Opts, type Rotation } from "@/lib/engine";

export type Risk = "safe" | "tight" | "over";

/** i18n suffix of an engine pick label ("Best balance" -> "best"). */
export const pickKey = (label: string): "best" | "drought" | "soil" => (label === "Drought shield" ? "drought" : label === "Soil builder" ? "soil" : "best");

/** Traffic light of the adaptation margin against the 2050 projection. */
export function riskOf(m: MarginResult, t2050: number): Risk {
  if (m.already) return "over";
  if (m.dTcapped || m.dT > t2050 + 0.5) return "safe";
  return "tight";
}

export interface Tipping {
  /** warming (°C) at which bad years pass the tolerance with today's rain; null = never within the tested range */
  heat: number | null;
  /** rain cut (positive fraction) at which they pass it with today's temperatures; null = never within range */
  rain: number | null;
  /** already over today (cell 0,0 is above tolerance) */
  over: boolean;
}

function crossing(xs: number[], ys: number[], tol: number): number | null {
  if (!ys.length) return null;
  if (ys[0] > tol) return xs[0];
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] > tol) {
      const a = ys[i - 1], b = ys[i];
      const t = b === a ? 0 : (tol - a) / (b - a);
      return xs[i - 1] + Math.max(0, Math.min(1, t)) * (xs[i] - xs[i - 1]);
    }
  }
  return null;
}

/** Tipping points along the two axes of the failure frontier (grid[dP][dT]). Linear interpolation between grid points. */
export function tippingPoint(fr: FrontierResult, tolerance: number): Tipping {
  const row0 = fr.grid[0] ?? [];
  const col0 = fr.grid.map((r) => r[0]);
  const over = (row0[0] ?? 0) > tolerance;
  return {
    over,
    heat: crossing(fr.dTs, row0, tolerance),
    rain: crossing(fr.dPs.map((p) => Math.abs(p)), col0, tolerance),
  };
}

/** Bilinear lookup of the share of bad years at (dT, dP) on the frontier grid; dP is negative. */
export function frontierAt(fr: FrontierResult, dT: number, dP: number): number {
  const clampIdx = (arr: number[], v: number, sign: 1 | -1) => {
    const vals = arr.map((x) => x * sign);
    const x = v * sign;
    if (x <= vals[0]) return 0;
    if (x >= vals[vals.length - 1]) return vals.length - 1;
    for (let i = 1; i < vals.length; i++) if (x <= vals[i]) return i - 1 + (x - vals[i - 1]) / (vals[i] - vals[i - 1]);
    return vals.length - 1;
  };
  const ci = clampIdx(fr.dTs, dT, 1), ri = clampIdx(fr.dPs, dP, -1);
  const c0 = Math.floor(ci), r0 = Math.floor(ri), c1 = Math.min(c0 + 1, fr.dTs.length - 1), r1 = Math.min(r0 + 1, fr.dPs.length - 1);
  const tc = ci - c0, tr = ri - r0;
  const g = (r: number, c: number) => fr.grid[r]?.[c] ?? 0;
  return (g(r0, c0) * (1 - tc) + g(r0, c1) * tc) * (1 - tr) + (g(r1, c0) * (1 - tc) + g(r1, c1) * tc) * tr;
}

/** CSS colour for a share of bad years: green up to the tolerance, through amber, to red. Reads tokens, so it follows the theme. */
export function shareColor(share: number, tolerance: number): string {
  const tol = Math.max(0.01, tolerance);
  if (share <= tol) {
    const k = Math.round((1 - share / tol) * 70 + 15);
    return `color-mix(in oklab, var(--ok) ${k}%, var(--surface))`;
  }
  const k = Math.min(1, (share - tol) / Math.max(0.01, 0.6 - tol));
  return `color-mix(in oklab, var(--danger) ${Math.round(35 + k * 60)}%, var(--warn-soft))`;
}

/** Average crop costs per hectare over the rotation (opts > farm > crop defaults). */
export function rotationCost(rot: Rotation, meta: Pick<FarmMeta, "costs"> | undefined, opts: Pick<Opts, "costs">): number {
  if (!rot.length) return 0;
  const sum = rot.reduce((s, st) => s + (opts.costs[st.crop] ?? meta?.costs?.[st.crop] ?? CROPS[st.crop].cost), 0);
  return Math.round(sum / rot.length);
}

export interface Fit { fitsBudget: boolean; missing: Equipment[] }

/** Same rule as the engine's optimiser: every crop cost within budget; equipment only checked when the farmer ticked some. */
export function fitCheck(rot: Rotation, c: Constraints, meta?: Pick<FarmMeta, "costs">, opts?: Pick<Opts, "costs">): Fit {
  const cost = (crop: CropId) => opts?.costs[crop] ?? meta?.costs?.[crop] ?? CROPS[crop].cost;
  const fitsBudget = !c.maxCostPerHa || rot.every((s) => cost(s.crop) <= c.maxCostPerHa!);
  const need = new Set<Equipment>();
  for (const s of rot) { const e = CROPS[s.crop].equipment as Equipment | undefined; if (e) need.add(e); }
  const missing = c.equipment.length ? [...need].filter((e) => !c.equipment.includes(e)) : [];
  return { fitsBudget, missing };
}
