import { describe, expect, it } from "vitest";
import type { MarginResult, PickResult, RotationResult } from "@/lib/engine";
import { buildAttention, type AttentionInput } from "./attention";

const years = Array.from({ length: 25 }, (_, i) => 2000 + i);
const res = (o: Partial<RotationResult> = {}): RotationResult => ({
  years, farmNet: years.map(() => 300), meanNet: 300, minNet: 100, worstYear: 2007, pFail: 0, fails: 0, yieldByCrop: {},
  soilScore: 60, socChangePct: 0.2, erosion: 1, waterUse: 400, traced: null, ...o,
});
const margin = (o: Partial<MarginResult> = {}): MarginResult => ({ already: false, basePFail: 0, dT: 3, dTcapped: false, dP: -0.3, dPcapped: false, ...o });
const pick = (label: PickResult["label"], fails: number): PickResult => ({ rot: [{ crop: "sorghum", cover: false }], label, why: "", base: res(), stress: res({ fails }) });
const input = (o: Partial<AttentionInput> = {}): AttentionInput => ({ base: res(), margin: margin(), picks: [], failShare: 0.2, t2050: 2, heat: null, ...o });

describe("buildAttention", () => {
  it("says everything is fine when nothing is wrong", () => {
    const items = buildAttention(input());
    expect(items.map((i) => i.id)).toEqual(["ok"]);
    expect(items[0].level).toBe("ok");
  });

  it("flags too many bad years first, with counts and tolerance", () => {
    const items = buildAttention(input({ base: res({ pFail: 0.32, fails: 8, socChangePct: -0.1 }), margin: margin({ already: true, dT: 0 }) }));
    expect(items[0].id).toBe("bad_years");
    expect(items[0].level).toBe("danger");
    expect(items[0].vars).toEqual({ n: 8, total: 25, tol: 5 });
    expect(items.map((i) => i.id)).toContain("soil");
  });

  it("reports heat at flowering only when it hit at least half of the worst years", () => {
    expect(buildAttention(input({ heat: { hit: 3, of: 8 } })).some((i) => i.id === "heat")).toBe(false);
    const hot = buildAttention(input({ heat: { hit: 6, of: 8 } })).find((i) => i.id === "heat");
    expect(hot?.vars).toEqual({ n: 6, of: 8 });
    expect(hot?.level).toBe("danger"); // 6 of 8 is at least 75 %
  });

  it("mentions the +2 °C test and the drought shield result", () => {
    const items = buildAttention(input({ margin: margin({ dT: 1.2 }), picks: [pick("Best balance", 3), pick("Drought shield", 0)] }));
    const s = items.find((i) => i.id === "stress")!;
    expect(s.vars).toEqual({ label: "Drought shield", fails: 0, total: 25 });
    expect(s.level).toBe("warn");
  });

  it("does not report a failed +2 °C test when the margin is capped (survives beyond +6 °C)", () => {
    expect(buildAttention(input({ margin: margin({ dT: 6, dTcapped: true }) })).some((i) => i.id === "stress")).toBe(false);
  });

  it("flags falling soil carbon and erosion, and orders danger before warn", () => {
    const items = buildAttention(input({ base: res({ socChangePct: -0.8, erosion: 2.5, minNet: -50 }) }));
    expect(items.map((i) => i.id)).toEqual(["soil", "erosion", "worst"]);
    expect(items[0].level).toBe("danger");
    expect(items[1].level).toBe("warn");
  });

  it("ranks by weight inside the same level", () => {
    const items = buildAttention(input({ base: res({ socChangePct: -0.2, erosion: 3, minNet: -10 }), heat: { hit: 5, of: 8 } }));
    const warn = items.filter((i) => i.level === "warn").map((i) => i.id);
    expect(warn).toEqual(["heat", "soil", "erosion", "worst"]);
  });
});
