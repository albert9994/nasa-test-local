import { describe, expect, it } from "vitest";
import { circleRing, haToRadiusM, pointInRing, ringAreaHa, ringCentroid, type Ring } from "./area";

// 1 km × 1 km square at the equator-ish: 0.008983° lat ≈ 1000 m
const sq = (lon: number, lat: number, dLat = 0.0089832): Ring => {
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  return [[lon, lat], [lon + dLon, lat], [lon + dLon, lat + dLat], [lon, lat + dLat]];
};

describe("area", () => {
  it("1 km² square ≈ 100 ha at 0° and at 45° N", () => {
    expect(ringAreaHa(sq(10, 0))).toBeGreaterThan(99);
    expect(ringAreaHa(sq(10, 0))).toBeLessThan(101);
    expect(ringAreaHa(sq(26, 45))).toBeGreaterThan(99);
    expect(ringAreaHa(sq(26, 45))).toBeLessThan(101);
  });
  it("is independent of winding and of a repeated closing vertex", () => {
    const r = sq(26, 45);
    expect(ringAreaHa([...r].reverse())).toBeCloseTo(ringAreaHa(r), 6);
    expect(ringAreaHa([...r, r[0]])).toBeCloseTo(ringAreaHa(r), 6);
  });
  it("degenerate rings have zero area", () => {
    expect(ringAreaHa([])).toBe(0);
    expect(ringAreaHa([[1, 1], [2, 2]])).toBe(0);
  });
  it("centroid of a square is its centre", () => {
    const r = sq(26, 45);
    const c = ringCentroid(r);
    expect(c.lon).toBeCloseTo((r[0][0] + r[1][0]) / 2, 6);
    expect(c.lat).toBeCloseTo((r[0][1] + r[2][1]) / 2, 6);
  });
  it("centroid of an L-shape is inside the bounding box and off-centre", () => {
    const c = ringCentroid([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]]);
    expect(c.lon).toBeCloseTo(0.8333, 1);
    expect(c.lat).toBeCloseTo(0.8333, 1);
  });
  it("circle ring has the requested area", () => {
    for (const ha of [1, 12, 50]) {
      const ring = circleRing([27.4, 44.5], haToRadiusM(ha), 128);
      expect(ringAreaHa(ring) / ha).toBeGreaterThan(0.99);
      expect(ringAreaHa(ring) / ha).toBeLessThan(1.01);
    }
  });
  it("point in ring", () => {
    const r = sq(26, 45);
    expect(pointInRing([26.005, 45.004], r)).toBe(true);
    expect(pointInRing([26.5, 45.004], r)).toBe(false);
  });
});
