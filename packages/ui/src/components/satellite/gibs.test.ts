import { describe, expect, it } from "vitest";
import { GIBS_LAYERS, clampDate, gibsTileUrl, latestDate, snapDate } from "./gibs";

const ndvi = GIBS_LAYERS.find((l) => l.key === "ndvi")!;
const lst = GIBS_LAYERS.find((l) => l.key === "lst")!;

describe("gibs", () => {
  it("builds WMTS tile URLs with the layer's own matrix set and extension", () => {
    expect(gibsTileUrl(ndvi, "2023-07-12")).toBe(
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_L3_NDVI_16Day/default/2023-07-12/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png");
    expect(gibsTileUrl(GIBS_LAYERS.find((l) => l.key === "truecolor")!, "2023-07-12")).toMatch(/\.jpg$/);
    expect(gibsTileUrl(lst, "2023-07-12")).toContain("GoogleMapsCompatible_Level7");
  });
  it("snaps 16-day composites to day 1 + 16k and leaves daily layers alone", () => {
    expect(snapDate(ndvi, "2023-07-28")).toBe("2023-07-28"); // doy 209 -> (209-1)=208 = 13*16
    expect(snapDate(ndvi, "2023-07-30")).toBe("2023-07-28");
    expect(snapDate(lst, "2023-07-30")).toBe("2023-07-30");
  });
  it("clamps dates to the layer's availability window", () => {
    const now = Date.UTC(2024, 5, 10);
    expect(clampDate(lst, "1999-01-01", now)).toBe(lst.start);
    expect(clampDate(lst, "2030-01-01", now)).toBe(latestDate(lst, now));
    expect(latestDate(lst, now)).toBe("2024-06-08");
  });
  it("every layer has a unique id and a legend or none for true colour", () => {
    expect(new Set(GIBS_LAYERS.map((l) => l.id)).size).toBe(GIBS_LAYERS.length);
    for (const l of GIBS_LAYERS.filter((x) => x.key.includes("color") || x.key === "viirs")) expect(l.legend).toBeNull();
  });
});
