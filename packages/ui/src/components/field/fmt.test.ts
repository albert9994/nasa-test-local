import { describe, expect, it } from "vitest";
import { fmtRainCut, fmtRatio, fmtSignedMoney, fmtSignedPct, fmtWarm, fromUsd, toUsd } from "./fmt";

const clean = (s: string) => s.replace(/[  ]/g, " ");

describe("analysis number formatting", () => {
  it("formats warming with a sign and the locale decimal separator", () => {
    expect(fmtWarm("en", 1.4)).toBe("+1.4 °C");
    expect(fmtWarm("ro", 1.4)).toBe("+1,4 °C");
    expect(fmtWarm("en", -0.5)).toBe("−0.5 °C");
  });
  it("formats a rain cut as a positive share", () => {
    expect(clean(fmtRainCut("en", -0.2))).toBe("20 %");
    expect(clean(fmtRainCut("ro", -0.045))).toBe("5 %");
  });
  it("signs money deltas in the display currency", () => {
    expect(clean(fmtSignedMoney("en", "USD", 48))).toBe("+$48");
    expect(clean(fmtSignedMoney("en", "USD", -12))).toBe("−$12");
    expect(clean(fmtSignedMoney("en", "EUR", 100))).toBe("+€92");
    expect(clean(fmtSignedMoney("ro", "RON", 10))).toContain("+");
    expect(clean(fmtSignedMoney("en", "USD", 0.2))).toBe("$0");
  });
  it("signs percentages", () => {
    expect(clean(fmtSignedPct("en", 0.1))).toBe("+10 %");
    expect(clean(fmtSignedPct("ro", -0.05))).toBe("−5 %");
    expect(clean(fmtSignedPct("en", 0))).toBe("0 %");
  });
  it("ratio and currency round trip", () => {
    expect(fmtRatio(3, 25)).toBe("3/25");
    expect(toUsd("EUR", fromUsd("EUR", 460))).toBeCloseTo(460, -1);
  });
});
