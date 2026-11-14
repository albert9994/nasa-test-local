import { describe, expect, it } from "vitest";
import type { FrontierResult, MarginResult } from "@/lib/engine";
import { fitCheck, frontierAt, riskOf, rotationCost, shareColor, tippingPoint } from "./numbers";

const fr = (rows: number[][]): FrontierResult => ({
  dTs: [0, 1, 2, 3], dPs: rows.map((_, i) => -i * 0.1), grid: rows,
});
const m = (o: Partial<MarginResult>): MarginResult => ({ already: false, basePFail: 0, dT: 1, dTcapped: false, dP: -0.1, dPcapped: false, ...o });

describe("tippingPoint", () => {
  const grid = fr([
    [0.0, 0.1, 0.3, 0.5],
    [0.1, 0.2, 0.4, 0.6],
    [0.3, 0.4, 0.6, 0.8],
  ]);
  it("interpolates the crossing along heat (row 0) and rain (column 0)", () => {
    const tp = tippingPoint(grid, 0.2);
    expect(tp.over).toBe(false);
    expect(tp.heat).toBeCloseTo(1.5); // 0.1 -> 0.3 crosses 0.2 halfway between +1 and +2
    expect(tp.rain).toBeCloseTo(0.15); // 0.1 -> 0.3 crosses 0.2 halfway between 10 % and 20 %
  });
  it("returns null when the limit is never crossed", () => {
    const tp = tippingPoint(fr([[0, 0.05], [0, 0.05]]), 0.2);
    expect(tp.heat).toBeNull();
    expect(tp.rain).toBeNull();
  });
  it("reports already over", () => {
    const tp = tippingPoint(grid, 0.0);
    expect(tp.over).toBe(false); // 0.0 is not above 0.0
    expect(tippingPoint(fr([[0.4, 0.5], [0.5, 0.6]]), 0.2).over).toBe(true);
  });
});

describe("frontierAt", () => {
  it("is bilinear and clamped", () => {
    const g = fr([[0, 0.2, 0.4, 0.6], [0.2, 0.4, 0.6, 0.8]]);
    expect(frontierAt(g, 0, 0)).toBe(0);
    expect(frontierAt(g, 1.5, 0)).toBeCloseTo(0.3);
    expect(frontierAt(g, 1, -0.05)).toBeCloseTo(0.3);
    expect(frontierAt(g, 9, -9)).toBeCloseTo(0.8);
  });
});

describe("riskOf", () => {
  it("maps margin to the traffic light", () => {
    expect(riskOf(m({ already: true }), 2)).toBe("over");
    expect(riskOf(m({ dT: 1 }), 2)).toBe("tight");
    expect(riskOf(m({ dT: 3 }), 2)).toBe("safe");
    expect(riskOf(m({ dT: 6, dTcapped: true }), 2)).toBe("safe");
  });
});

describe("rotationCost and fitCheck", () => {
  const rot = [{ crop: "maize" as const, cover: false }, { crop: "wheat" as const, cover: false }];
  it("averages crop costs, preferring overrides", () => {
    expect(rotationCost(rot, undefined, { costs: {} })).toBe(825); // (950 + 700) / 2
    expect(rotationCost(rot, { costs: { maize: 1000 } }, { costs: { wheat: 600 } })).toBe(800);
    expect(rotationCost([], undefined, { costs: {} })).toBe(0);
  });
  it("checks budget per crop and equipment only when some is ticked", () => {
    expect(fitCheck(rot, { equipment: [], sellable: [] })).toEqual({ fitsBudget: true, missing: [] });
    expect(fitCheck(rot, { maxCostPerHa: 800, equipment: [], sellable: [] }).fitsBudget).toBe(false);
    expect(fitCheck(rot, { equipment: ["corn_header"], sellable: [] }).missing).toEqual(["grain_drill"]);
  });
});

describe("shareColor", () => {
  it("uses tokens only", () => {
    expect(shareColor(0, 0.2)).toContain("var(--ok)");
    expect(shareColor(0.5, 0.2)).toContain("var(--risk-hi)");
  });
});
