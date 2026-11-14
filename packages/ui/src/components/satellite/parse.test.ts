import { describe, expect, it } from "vitest";
import { cropShares, doyOf, normalizeClass, parseCropMap, parseCropMeta, parseHlsSeries, seriesForYear, yearsOf } from "./parse";

const sq = (x: number, y: number, s = 0.01) => [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]];
const fc = (features: unknown[]) => ({ type: "FeatureCollection", features });
const feat = (x: number, y: number, cls: string, confidence?: number) => ({
  type: "Feature", properties: { class: cls, confidence }, geometry: { type: "Polygon", coordinates: sq(x, y) },
});

describe("parseCropMap", () => {
  it("parses polygons, normalises classes and clamps confidence", () => {
    const m = parseCropMap(fc([feat(0, 0, "corn", 0.9), feat(1, 0, "soybean", 3), feat(2, 0, "weird")]));
    expect(m?.features.map((f) => f.cls)).toEqual(["maize", "soybean", "other"]);
    expect(m?.features[1].confidence).toBe(1);
  });
  it("skips malformed features and returns null for junk", () => {
    expect(parseCropMap(null)).toBeNull();
    expect(parseCropMap({ type: "Feature" })).toBeNull();
    expect(parseCropMap(fc([{ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] } }]))).toBeNull();
    const m = parseCropMap(fc([feat(0, 0, "corn"), { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[0, 0], ["a", 1]]] } }]));
    expect(m?.features).toHaveLength(1);
  });
  it("normalizeClass", () => {
    expect(normalizeClass("Maize")).toBe("maize");
    expect(normalizeClass("winter_cereals")).toBe("winter_cereal");
  });
});

describe("cropShares", () => {
  it("counts only patches whose centre is inside the field", () => {
    const map = parseCropMap(fc([feat(0, 0, "corn"), feat(0.02, 0, "soybean"), feat(0.04, 0, "corn"), feat(5, 5, "corn")]))!;
    const field: [number, number][] = [[-0.001, -0.001], [0.03, -0.001], [0.03, 0.02], [-0.001, 0.02], [-0.001, -0.001]];
    const { shares, n } = cropShares(map, field);
    expect(n).toBe(2);
    expect(shares.maize).toBeCloseTo(0.5);
    expect(shares.soybean).toBeCloseTo(0.5);
  });
  it("handles an empty overlap", () => {
    const map = parseCropMap(fc([feat(0, 0, "corn")]))!;
    expect(cropShares(map, [[9, 9], [10, 9], [10, 10], [9, 10], [9, 9]]).n).toBe(0);
  });
});

describe("parseCropMeta", () => {
  it("requires a known method and defaults beta to true", () => {
    expect(parseCropMeta({ method: "nope" })).toBeNull();
    const m = parseCropMeta({ farm: "iowa", method: "usda-cdl", labels: "USDA CDL 2023", macro_f1: 0.9 });
    expect(m?.beta).toBe(true);
    expect(m?.model).toBeNull();
    expect(m?.macroF1).toBe(0.9);
  });
});

describe("parseHlsSeries", () => {
  it("drops bad rows, sorts by date and keeps null NDMI", () => {
    const s = parseHlsSeries({ source: "HLS", dates: ["2023-07-02", "2022-06-01", "bad", "2023-08-01"], ndvi: [0.8, 0.5, 0.1, null], ndmi: [0.3, null, 0, 0] });
    expect(s?.dates).toEqual(["2022-06-01", "2023-07-02"]);
    expect(s?.ndvi).toEqual([0.5, 0.8]);
    expect(s?.ndmi).toEqual([null, 0.3]);
    expect(parseHlsSeries({ dates: [], ndvi: [] })).toBeNull();
    expect(parseHlsSeries(undefined)).toBeNull();
  });
  it("builds year + median curves", () => {
    const s = parseHlsSeries({ source: "x", dates: ["2022-07-01", "2023-07-03", "2023-01-05"], ndvi: [0.6, 0.8, 0.2], ndmi: [] })!;
    expect(yearsOf(s)).toEqual([2022, 2023]);
    const { cur, med } = seriesForYear(s, "ndvi", 2023);
    expect(cur.map((p) => p[0])).toEqual([doyOf("2023-01-05"), doyOf("2023-07-03")]);
    expect(med.length).toBe(2);
    expect(med.find((p) => p[0] > 150)?.[1]).toBeCloseTo(0.7);
  });
});
