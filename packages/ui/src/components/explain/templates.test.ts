import { describe, expect, it } from "vitest";
import type { FactSheet } from "@/lib/engine/types";
import { buildTemplate, DISCLAIMER, numberRegistry, segmentText } from "./templates";

const fs: FactSheet = {
  farm: { name: "Bărăgan", lat: 44.55, lon: 27.45, soil: "silty clay loam", climate: "13.2 °C, 524 mm/yr" },
  rotation: "Maize → Winter wheat",
  rule: { badYear: "net < 0 $/ha", tolerance: "1 year in 5" },
  today: { badYears: "8/24", meanNet: 276, worstYear: 2007 },
  margin: { dT: 0, dP: 0, status: "already_over", safeUntil: { ssp245: "now", ssp585: "now" } },
  worstYearWhy: ["maize: drought (31 stress days)", "maize: 14 days above 35 °C at flowering"],
  alternatives: [
    { label: "Drought shield", rotation: "Wheat → Sorghum → Fallow", badYears: "0/24", deltaNet: 48, margin: { dT: 6 }, soilScore: 37, fitsBudget: true, missingEquipment: [] },
    { label: "Soil builder", rotation: "Wheat → Pea", badYears: "2/24", deltaNet: -12, margin: { dT: 3.5 }, soilScore: 61, fitsBudget: false, missingEquipment: ["grain_drill"] },
  ],
  soil: { score: 39, carbonTrendPctYr: -0.54, erosionTHaYr: 1.4 },
  sources: ["NASA POWER"],
};

describe("buildTemplate", () => {
  it("uses fact sheet numbers and ends with the disclaimer (EN)", () => {
    const t = buildTemplate(fs, "en");
    expect(t).toContain("8/24");
    expect(t).toContain("2007");
    expect(t).toContain("$276/ha");
    expect(t).toContain("drought");
    expect(t).toContain("0/24");
    expect(t).toContain("+$48/ha");
    expect(t).toContain("−$12/ha");
    expect(t).toContain("grain_drill");
    expect(t.trim().endsWith(DISCLAIMER.en)).toBe(true);
  });
  it("renders Romanian and ends with the RO disclaimer", () => {
    const t = buildTemplate(fs, "ro");
    expect(t).toContain("Cel mai slab an a fost 2007");
    expect(t.trim().endsWith("Ajutor de planificare, nu o garanție.")).toBe(true);
  });
  it("handles a safe margin and no alternatives", () => {
    const t = buildTemplate({ ...fs, margin: { dT: 2.5, dP: 0, status: "safe", safeUntil: { ssp245: "2041", ssp585: "2036" } }, alternatives: [], worstYearWhy: [] }, "en");
    expect(t).toContain("+2.5 °C");
    expect(t).toContain("2041");
    expect(t).not.toContain("What you can do");
  });
});

describe("number highlighting", () => {
  const reg = numberRegistry(fs);
  it("maps known numbers to fact-sheet fields", () => {
    const segs = segmentText("8/24 years, worst 2007, mean $276 and 99 unknown", reg).filter((s) => s.ref);
    expect(segs.map((s) => [s.text, s.ref!.field])).toEqual([
      ["8/24", "today.badYears"], ["2007", "today.worstYear"], ["276", "today.meanNet"],
    ]);
    expect(segs[0].ref!.explain.en).toContain("24 years of NASA POWER");
  });
  it("does not highlight digits inside bigger numbers", () => {
    expect(segmentText("12760 and 20070", reg).some((s) => s.ref)).toBe(false);
  });
});

describe("template localisation", () => {
  it("shows money in the app currency, not always USD", () => {
    const t = buildTemplate(fs, "en", "EUR");
    expect(t).toContain("€254/ha");
    expect(t).not.toContain("$276");
  });
  it("renders worst-year reasons from codes in Romanian", () => {
    const t = buildTemplate({ ...fs, worstYearWhyCodes: [{ code: "drought", crop: "maize", stressDays: 31 }, { code: "heat_flowering", crop: "maize", days: 14 }] }, "ro");
    expect(t).toContain("porumb: secetă (31 zile de stres hidric)");
    expect(t).not.toContain("stress days");
  });
});
