import { describe, expect, it } from "vitest";
import { landFromCircle, landFromRing } from "./land";
import { buildMapSearch, decodeLand, decodeRing, encodeLand, encodeRing, parseMapUrl } from "./url-state";

const ring: [number, number][] = [[27.45123, 44.55321], [27.4587, 44.55321], [27.4587, 44.55812], [27.45123, 44.55812]];

describe("url state", () => {
  it("ring encoding round-trips to 1e-5°", () => {
    const back = decodeRing(encodeRing(ring))!;
    back.forEach((p, i) => { expect(p[0]).toBeCloseTo(ring[i][0], 5); expect(p[1]).toBeCloseTo(ring[i][1], 5); });
  });
  it("handles negative coordinates", () => {
    const r: [number, number][] = [[-95.5, 41.2], [-95.4, 41.2], [-95.4, 41.3]];
    const back = decodeRing(encodeRing(r))!;
    expect(back[0][0]).toBeCloseTo(-95.5, 5);
    expect(back[2][1]).toBeCloseTo(41.3, 5);
  });
  it("polygon, parcel and circle lands round-trip through the URL", () => {
    for (const land of [landFromRing("polygon", ring)!, landFromRing("parcel", ring)!, landFromCircle([27.45, 44.55], 12)]) {
      const q = buildMapSearch({ lat: 44.55, lon: 27.45, zoom: 15.2, land });
      const parsed = parseMapUrl(q);
      expect(parsed.land?.kind).toBe(land.kind);
      expect(parsed.land?.areaHa).toBeCloseTo(land.areaHa, 1);
      expect(parsed.lat).toBeCloseTo(44.55, 3);
      expect(parsed.zoom).toBeCloseTo(15.2, 1);
    }
  });
  it("rejects bad input", () => {
    expect(decodeLand("circle:abc,1,2")).toBeNull();
    expect(decodeLand("circle:44,27,9999")).toBeNull();
    expect(decodeLand("polygon:zz")).toBeNull();
    expect(decodeLand("nope:1")).toBeNull();
    expect(parseMapUrl("lat=999&lon=1&zoom=50")).toEqual({});
  });
  it("encodeLand of a circle is compact and readable", () => {
    expect(encodeLand(landFromCircle([27.45, 44.55], 12))).toBe("circle:44.55000,27.45000,12");
  });
});
