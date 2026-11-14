// Client-side FieldShift Score (C12 shape) used when /api/score is unavailable.
// Deterministic: subscores from the engine results + a couple of simple rules. llm is always null here.
import { CROPS } from "../../lib/engine/mock";
import type { MarginResult, Rotation, RotationResult, ScoreResult } from "@/lib/engine/types";

export const SCORE_WEIGHTS = { climate: 0.3, financialRisk: 0.25, profit: 0.25, soil: 0.1, water: 0.05, feasibility: 0.05 };

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function computeScore(input: { label: string; rotation: Rotation; base: RotationResult; margin: MarginResult }): ScoreResult {
  const { rotation, base, margin, label } = input;
  const climate = margin.already
    ? clamp(35 - (margin.basePFail - 0.2) * 100, 0, 35)
    : clamp(40 + margin.dT * 12, 40, 100);
  const subscores = {
    climate: Math.round(climate),
    financialRisk: Math.round(clamp(100 - base.pFail * 200)),
    profit: Math.round(clamp(base.meanNet / 5)),
    soil: Math.round(clamp(base.soilScore)),
    water: Math.round(clamp(100 - base.waterUse / 6)),
    feasibility: 95,
  };
  const baseScore = Math.round(
    (Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[]).reduce((s, k) => s + subscores[k] * SCORE_WEIGHTS[k], 0),
  );

  const rules: ScoreResult["rules"] = [];
  const crops = rotation.map((r) => r.crop);
  const n = crops.length;
  const legumeBeforeCereal = crops.some((c, i) => CROPS[c].legume && !CROPS[crops[(i + 1) % n]].legume && crops[(i + 1) % n] !== "fallow");
  if (n > 1 && legumeBeforeCereal) rules.push({ id: "legume_before_cereal", delta: 3, reason: "a legume leaves nitrogen for the next crop" });
  const repeats = crops.some((c, i) => n > 1 && c !== "fallow" && c === crops[(i + 1) % n]);
  if (n === 1 || repeats) rules.push({ id: "monoculture", delta: -4, reason: "the same crop back to back builds disease and pest pressure" });
  if (rotation.some((r) => r.cover)) rules.push({ id: "cover_crop", delta: 2, reason: "a cover crop protects soil between main crops" });
  if (crops.filter((c) => c === "fallow").length > n / 2) rules.push({ id: "fallow_heavy", delta: -3, reason: "more than half of the years earn nothing" });

  const rulesDelta = rules.reduce((s, r) => s + r.delta, 0);
  const score = Math.round(clamp(baseScore + rulesDelta));
  const nYears = base.years.length;
  const confidence: ScoreResult["confidence"] = nYears < 10 ? "low" : nYears >= 20 && !margin.dTcapped ? "high" : "medium";
  return {
    rotation: label, score, confidence, subscores,
    weights: { ...SCORE_WEIGHTS }, base: baseScore, rules, excludedBy: null, llm: null,
    waterfall: [["base", baseScore], ["rules", rulesDelta], ["llm", 0], ["final", score]],
  };
}
