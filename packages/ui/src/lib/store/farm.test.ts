import { describe, expect, it } from "vitest";
import { circlePolygon, deriveRotation, minimalPeriod, polygonAreaHa, polygonCentroid } from "./farm";

describe("farm helpers", () => {
  it("reduces a repeating sequence to its period", () => {
    expect(minimalPeriod(["maize", "wheat", "maize", "wheat"])).toEqual(["maize", "wheat"]);
    expect(minimalPeriod(["maize", "wheat", "soybean", "maize"])).toEqual(["maize", "wheat", "soybean", "maize"]);
  });
  it("derives a rotation of at least two crops", () => {
    expect(deriveRotation(["wheat", "maize", "wheat"], "maize")).toEqual(["wheat", "maize"]);
    expect(deriveRotation([null, null, null], "maize")).toEqual(["maize", "wheat"]);
    expect(deriveRotation([null, null, null], "wheat")).toEqual(["wheat", "maize"]);
  });
  it("builds a polygon with the requested area around the centre", () => {
    const c = { lat: 44.5, lon: 27.4 };
    const p = circlePolygon(c, 50);
    expect(polygonAreaHa(p)).toBeGreaterThan(48);
    expect(polygonAreaHa(p)).toBeLessThan(50.5);
    const mid = polygonCentroid(p);
    expect(mid.lat).toBeCloseTo(c.lat, 4);
    expect(mid.lon).toBeCloseTo(c.lon, 4);
  });
});
