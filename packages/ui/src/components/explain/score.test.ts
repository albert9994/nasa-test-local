import { describe, expect, it } from "vitest";
import type { MarginResult, Rotation, RotationResult } from "@/lib/engine/types";
import { computeScore, SCORE_WEIGHTS } from "./score";

const base = (p: Partial<RotationResult> = {}): RotationResult => ({
  years: Array.from({ length: 24 }, (_, i) => 2000 + i), farmNet: [], meanNet: 300, minNet: -100, worstYear: 2007,
  pFail: 0.1, fails: 2, yieldByCrop: {}, soilScore: 60, socChangePct: 0, erosion: 1, waterUse: 300, traced: null, ...p,
});
const margin = (p: Partial<MarginResult> = {}): MarginResult => ({ already: false, basePFail: 0.1, dT: 2, dTcapped: false, dP: 0, dPcapped: false, ...p });
const rot = (...c: string[]): Rotation => c.map((crop) => ({ crop: crop as never, cover: false }));

describe("computeScore", () => {
  it("returns the C12 shape and a consistent waterfall", () => {
    const s = computeScore({ label: "Wheat → Pea", rotation: rot("wheat", "pea"), base: base(), margin: margin() });
    expect(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(s.llm).toBeNull();
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.waterfall.map((w) => w[0])).toEqual(["base", "rules", "llm", "final"]);
    expect(s.waterfall[0][1]).toBe(s.base);
    expect(s.waterfall[3][1]).toBe(s.score);
    expect(s.base + s.waterfall[1][1]).toBe(s.score);
    expect(s.rules.some((r) => r.id === "legume_before_cereal")).toBe(true);
    expect(s.confidence).toBe("high");
  });
  it("scores a failing rotation lower than a safe one", () => {
    const bad = computeScore({ label: "x", rotation: rot("maize"), base: base({ pFail: 0.5, meanNet: 50 }), margin: margin({ already: true, basePFail: 0.5 }) });
    const good = computeScore({ label: "y", rotation: rot("wheat", "pea"), base: base(), margin: margin({ dT: 4 }) });
    expect(bad.score).toBeLessThan(good.score);
    expect(bad.rules.some((r) => r.id === "monoculture")).toBe(true);
  });
  it("lowers confidence with few years", () => {
    const s = computeScore({ label: "z", rotation: rot("wheat"), base: base({ years: [2000, 2001] }), margin: margin() });
    expect(s.confidence).toBe("low");
  });
});
