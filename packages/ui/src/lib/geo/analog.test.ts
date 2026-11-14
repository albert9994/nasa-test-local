import { describe, expect, it } from "vitest";
import { REF_TOWNS, findAnalog } from "./analog";
import { textureClass, summariseSoil } from "./soil";
import { climateStats } from "./stats";
import type { FarmPack, WeatherYear } from "@/lib/engine/types";

describe("analog", () => {
  it("has ~40+ reference towns", () => { expect(REF_TOWNS.length).toBeGreaterThanOrEqual(30); });
  it("a warmer future maps to a warmer town", () => {
    const now = findAnalog(44.55, 27.45, 22.5, 0)!;
    const future = findAnalog(44.55, 27.45, 22.5, 2.5)!;
    expect(future.town.summerT).toBeGreaterThan(now.town.summerT);
    expect(future.targetT).toBeCloseTo(22.5 - 1.8 + 2.5, 5);
  });
  it("uses southern towns for the southern hemisphere", () => {
    expect(findAnalog(-33, -60, 23, 2)!.town.lat).toBeLessThan(0);
  });
  it("returns null when nothing is close", () => { expect(findAnalog(0, 0, 40, 2)).toBeNull(); });
});

describe("soil", () => {
  it("USDA classes", () => {
    expect(textureClass(90, 3)).toBe("sand");
    expect(textureClass(40, 20)).toBe("loam");
    expect(textureClass(20, 50)).toBe("clay");
    expect(textureClass(10, 20)).toBe("siltLoam");
  });
  it("summarises 0–30 cm", () => {
    const m = (v: number) => ({ "0-5cm": { mean: v }, "5-15cm": { mean: v }, "15-30cm": { mean: v } });
    const s = summariseSoil({ sand: m(40), clay: m(20), silt: m(40), soc: m(18), phh2o: m(6.8) })!;
    expect(s.texture).toBe("loam");
    expect(s.ph).toBeCloseTo(6.8, 5);
    expect(summariseSoil(undefined)).toBeNull();
  });
});

function year(y: number, hot: boolean): WeatherYear {
  const n = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 864e5;
  const tmax = Array.from({ length: n }, (_, i) => (i >= 180 && i < 200 && hot ? 36 : 20));
  return { tmax, tmin: tmax.map((t) => t - 10), prcp: Array.from({ length: n }, () => 1) };
}
describe("climate stats", () => {
  it("counts heat days and finds the hottest year", () => {
    const pack = { meta: { id: "x", name: "x", lat: 45, lon: 26, rotation: ["maize"], elev: 80 }, weather: { 2001: year(2001, false), 2002: year(2002, true) } } as unknown as FarmPack;
    const s = climateStats(pack);
    expect(s.heatDays).toEqual([0, 20]);
    expect(s.hottest.year).toBe(2002);
    expect(s.annualRain).toBeGreaterThan(360);
    expect(s.seasonRain[0]).toBeCloseTo(183, 0); // Apr–Sep = 183 days × 1 mm
    expect(s.elev).toBe(80);
  });
});

import { lateJulyComposite } from "./gibs";
describe("gibs", () => {
  it("late-July composite starts on a 16-day boundary", () => {
    expect(lateJulyComposite(2012)).toBe("2012-07-27");
    expect(lateJulyComposite(2023)).toBe("2023-07-28");
  });
});
