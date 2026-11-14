// "What needs attention": ranked, plain-language items derived from the engine results. Pure, so it is unit-tested.
import type { MarginResult, PickResult, RotationResult } from "@/lib/engine";
import type { TabId } from "@/lib/store/analysis";

export type Level = "danger" | "warn" | "ok";
export type AttentionId = "bad_years" | "heat" | "soil" | "stress" | "erosion" | "worst" | "margin_tight" | "ok";

export interface AttentionItem {
  id: AttentionId;
  level: Level;
  /** sort weight inside a level, higher first */
  weight: number;
  /** i18n key suffix under analysis.att_ and its variables (money/temperatures are formatted by the caller as raw numbers) */
  vars: Record<string, number | string>;
  /** where "open" takes the farmer */
  go: TabId;
}

export interface AttentionInput {
  base: RotationResult;
  margin: MarginResult;
  picks: PickResult[];
  failShare: number;
  t2050: number;
  /** worst years in which heat at flowering hit, out of the k worst years looked at; null when not computed */
  heat: { hit: number; of: number } | null;
}

const LEVEL_RANK: Record<Level, number> = { danger: 0, warn: 1, ok: 2 };

export function buildAttention(i: AttentionInput): AttentionItem[] {
  const { base, margin, picks, failShare, t2050, heat } = i;
  const items: AttentionItem[] = [];
  const total = base.years.length;
  const tol = Math.max(2, Math.round(1 / (failShare || 0.2)));

  if (base.pFail > failShare) {
    items.push({ id: "bad_years", level: "danger", weight: 100 + Math.round((base.pFail - failShare) * 100), vars: { n: base.fails, total, tol }, go: "rotations" });
  }
  const shield = picks.find((p) => p.label === "Drought shield") ?? picks[0];
  const failsTest = margin.already || (!margin.dTcapped && margin.dT < 2);
  if (failsTest) {
    items.push({
      id: "stress", level: margin.already ? "danger" : "warn", weight: margin.already ? 90 : 60,
      vars: shield ? { label: shield.label, fails: shield.stress.fails, total: shield.stress.years.length } : {}, go: "rotations",
    });
  } else if (!margin.already && !margin.dTcapped && margin.dT < t2050 + 0.5) {
    items.push({ id: "margin_tight", level: "warn", weight: 55, vars: { dT: margin.dT, t2050 }, go: "risk" });
  }
  if (heat && heat.of > 0 && heat.hit >= Math.ceil(heat.of * 0.5)) {
    items.push({ id: "heat", level: heat.hit >= heat.of * 0.75 ? "danger" : "warn", weight: 70 + heat.hit, vars: { n: heat.hit, of: heat.of }, go: "replay" });
  }
  if (base.socChangePct < 0) {
    items.push({ id: "soil", level: base.socChangePct < -0.5 ? "danger" : "warn", weight: 50 + Math.round(Math.abs(base.socChangePct) * 20), vars: { pct: Math.abs(base.socChangePct) }, go: "rotations" });
  }
  if (base.erosion >= 2) {
    items.push({ id: "erosion", level: base.erosion >= 4 ? "danger" : "warn", weight: 40 + Math.round(base.erosion), vars: { t: base.erosion }, go: "rotations" });
  }
  if (base.minNet < 0) {
    items.push({ id: "worst", level: "warn", weight: 30, vars: { year: base.worstYear, usd: Math.abs(base.minNet) }, go: "replay" });
  }
  if (!items.length) items.push({ id: "ok", level: "ok", weight: 0, vars: {}, go: "overview" });
  return items.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.weight - a.weight);
}
