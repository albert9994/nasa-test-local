import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import {
  assembleSoil, cacheKey, daysInYear, defaultRotation, medianScaled, parsePowerWeather, powerToPack, powerUrl, readTiffInt16, soilUrl,
} from "./live";

const dkey = (y: number, d: number) => new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10).replace(/-/g, "");
function fixture(fill: (pk: string, y: number, d: number) => number) {
  const parameter: Record<string, Record<string, number>> = {};
  for (const pk of ["T2M_MAX", "T2M_MIN", "PRECTOTCORR", "GWETROOT", "ALLSKY_SFC_SW_DWN", "RH2M", "WS2M"]) {
    parameter[pk] = {};
    for (let y = 2001; y <= 2025; y++) for (let d = 0; d < daysInYear(y); d++) parameter[pk][dkey(y, d)] = fill(pk, y, d);
  }
  return parameter;
}

describe("POWER → weather", () => {
  it("splits into 25 calendar years with leap years and maps names", () => {
    const w = parsePowerWeather(fixture((pk) => (pk === "T2M_MAX" ? 20 : 5)));
    expect(Object.keys(w)).toHaveLength(25);
    expect(w["2001"].tmax).toHaveLength(365);
    expect(w["2004"].tmax).toHaveLength(366);
    expect(w["2004"].prcp[0]).toBe(5);
    expect(Object.keys(w["2001"]).sort()).toEqual(["gwet", "prcp", "rad", "rh", "tmax", "tmin", "wind"]);
  });
  it("replaces -999 with the previous day, across year boundaries", () => {
    const w = parsePowerWeather(fixture((pk, y, d) => (pk === "T2M_MAX" ? (y === 2002 && d === 0 ? -999 : y === 2001 ? 10 + (d % 7) : 3) : 1)));
    expect(w["2002"].tmax[0]).toBe(10 + (364 % 7));
    const w2 = parsePowerWeather(fixture((pk, y, d) => (pk === "T2M_MAX" && y === 2001 && d < 2 ? -999 : 8)));
    expect(w2["2001"].tmax.slice(0, 3)).toEqual([8, 8, 8]);
  });
  it("throws when required variables are missing", () => {
    expect(() => parsePowerWeather({})).toThrow();
  });
});

describe("pack meta", () => {
  const warm = fixture((pk) => (pk === "T2M_MAX" ? 30 : pk === "T2M_MIN" ? 15 : pk === "PRECTOTCORR" ? 0.5 : 1));
  const cool = fixture((pk) => (pk === "T2M_MAX" ? 15 : pk === "T2M_MIN" ? 5 : pk === "PRECTOTCORR" ? 2 : 1));
  it("picks hot/dry rotation vs default", () => {
    expect(defaultRotation(parsePowerWeather(warm))).toEqual(["wheat", "sorghum"]);
    expect(defaultRotation(parsePowerWeather(cool))).toEqual(["maize", "soybean"]);
  });
  it("builds id, name, elevation, optional soil", () => {
    const pack = powerToPack({ properties: { parameter: cool }, geometry: { coordinates: [-93.1, 41.2, 301.5] } }, 41.2, -93.1);
    expect(pack.meta.id).toBe("live-41.2--93.1");
    expect(pack.meta.name).toBe("Field at 41.20, −93.10");
    expect(pack.meta.elev).toBe(301.5);
    expect(pack.soil).toBeUndefined();
    const withSoil = powerToPack({ properties: { parameter: cool } }, 1, 2, { sand: { "0-5cm": { mean: 40 } } });
    expect(withSoil.soil?.sand?.["0-5cm"]?.mean).toBe(40);
    expect(withSoil.meta.elev).toBeUndefined();
  });
  it("builds URLs and cache keys", () => {
    expect(powerUrl(41.2, -93.1)).toContain("longitude=-93.1&latitude=41.2&start=20010101&end=20251231");
    expect(soilUrl("sand", "0-5cm", 41, -93)).toContain("COVERAGEID=sand_0-5cm_mean");
    expect(cacheKey(41.20004, -93.1)).toBe("41.200,-93.100");
  });
});

describe("soil helpers", () => {
  it("median scales and ignores nodata", () => {
    expect(medianScaled([-32768, 0, 300, 100, 200], 10)).toBe(20);
    expect(medianScaled([-32768, 0], 10)).toBeNull();
    expect(medianScaled([150, 160], 100)).toBe(1.55);
  });
  it("assembleSoil needs topsoil sand and fills depth gaps", () => {
    expect(assembleSoil([["clay", "0-5cm", 20]])).toBeNull();
    const s = assembleSoil([["sand", "0-5cm", 40], ["sand", "30-60cm", 50]])!;
    expect(s.sand?.["5-15cm"]?.mean).toBe(40);
    expect(s.sand?.["60-100cm"]?.mean).toBe(50);
  });
});

/** Build a tiny little-endian int16 GeoTIFF (single strip). */
function tiff(vals: number[], w: number, h: number, deflate: boolean, predictor = 1): Uint8Array {
  let data = new Int16Array(vals);
  if (predictor === 2) {
    const d = new Int16Array(vals.length);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) d[r * w + c] = c === 0 ? vals[r * w] : vals[r * w + c] - vals[r * w + c - 1];
    data = d;
  }
  let raw: Uint8Array = new Uint8Array(data.buffer);
  if (deflate) raw = new Uint8Array(deflateSync(raw));
  const entries = [[256, 3, 1, w], [257, 3, 1, h], [259, 3, 1, deflate ? 8 : 1], [273, 4, 1, 0], [278, 3, 1, h], [279, 4, 1, raw.length], [317, 3, 1, predictor]];
  const ifdOff = 8, dataOff = ifdOff + 2 + entries.length * 12 + 4;
  entries[3][3] = dataOff;
  const out = new Uint8Array(dataOff + raw.length), dv = new DataView(out.buffer);
  out[0] = 0x49; out[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, ifdOff, true);
  dv.setUint16(ifdOff, entries.length, true);
  entries.forEach(([tag, typ, cnt, val], i) => {
    const e = ifdOff + 2 + i * 12;
    dv.setUint16(e, tag, true); dv.setUint16(e + 2, typ, true); dv.setUint32(e + 4, cnt, true);
    if (typ === 3) dv.setUint16(e + 8, val, true); else dv.setUint32(e + 8, val, true);
  });
  out.set(raw, dataOff);
  return out;
}

describe("GeoTIFF reader", () => {
  const vals = [100, 110, 120, 130, 140, 150, -32768, 170, 180];
  it("reads uncompressed", async () => expect(await readTiffInt16(tiff(vals, 3, 3, false))).toEqual(vals));
  it("reads deflate", async () => expect(await readTiffInt16(tiff(vals, 3, 3, true))).toEqual(vals));
  it("reads deflate + predictor 2", async () => expect(await readTiffInt16(tiff(vals, 3, 3, true, 2))).toEqual(vals));
  it("rejects non-TIFF", async () => expect(readTiffInt16(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toThrow());
});
