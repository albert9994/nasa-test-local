import { describe, expect, it } from "vitest";
import { cellFor, parcelQuery, parseOverpass } from "./overpass";

const way = (id: number, pts: [number, number][], tags: Record<string, string> = { landuse: "farmland" }) => ({
  type: "way", id, tags, geometry: pts.map(([lon, lat]) => ({ lat, lon })),
});
// ~ 10 ha (≈ 316 m square at 45°N)
const sq: [number, number][] = [[26, 45], [26.004, 45], [26.004, 45.0028], [26, 45.0028], [26, 45]];

describe("overpass", () => {
  it("parses closed farmland ways into parcels with area and centroid", () => {
    const [p] = parseOverpass({ elements: [way(7, sq, { landuse: "farmland", crop: "wheat" })] });
    expect(p.id).toBe(7);
    expect(p.ring).toHaveLength(4); // closing vertex dropped
    expect(p.areaHa).toBeGreaterThan(8);
    expect(p.areaHa).toBeLessThan(12);
    expect(p.centroid.lon).toBeCloseTo(26.002, 3);
    expect(p.crop).toBe("wheat");
  });
  it("drops open ways, tiny slivers, huge areas and non-ways", () => {
    const open = way(1, sq.slice(0, 4));
    const tiny = way(2, [[26, 45], [26.0001, 45], [26.0001, 45.0001], [26, 45.0001], [26, 45]]);
    const huge = way(3, [[26, 45], [27, 45], [27, 46], [26, 46], [26, 45]]);
    const node = { type: "node", id: 4, lat: 1, lon: 1 };
    expect(parseOverpass({ elements: [open, tiny, huge, node] })).toEqual([]);
  });
  it("is robust to garbage", () => {
    expect(parseOverpass(null)).toEqual([]);
    expect(parseOverpass({})).toEqual([]);
    expect(parseOverpass({ elements: [{ type: "way", id: 1 }] })).toEqual([]);
  });
  it("builds a farmland bbox query; nearby points share a cache cell", () => {
    const a = cellFor(44.5501, 27.4501), b = cellFor(44.5599, 27.4599);
    expect(a.key).toBe(b.key);
    const q = parcelQuery(a.bbox);
    expect(q).toContain('way["landuse"="farmland"]');
    expect(q).toContain("out geom");
    expect(a.bbox.west).toBeLessThan(27.45);
    expect(a.bbox.east).toBeGreaterThan(27.46);
  });
});
