// O5: "click anywhere" → NASA POWER daily + SoilGrids WCS → C1 pack in memory.
// Ported from the old prototype (web/js/data.js). Parsing helpers are pure and exported for tests.
import type { CropId, FarmPack, SoilDepth, WeatherYear } from "@/lib/engine/types";

export const FIRST_YEAR = 2001;
export const LAST_YEAR = 2025;
export const POWER_PARAMS = "T2M_MAX,T2M_MIN,PRECTOTCORR,GWETROOT,ALLSKY_SFC_SW_DWN,RH2M,WS2M";
const POWER_KEYS: Record<string, keyof WeatherYear> = {
  T2M_MAX: "tmax", T2M_MIN: "tmin", PRECTOTCORR: "prcp", GWETROOT: "gwet",
  ALLSKY_SFC_SW_DWN: "rad", RH2M: "rh", WS2M: "wind",
};

export type SoilBlock = NonNullable<FarmPack["soil"]>;
export type Progress = (msg: string, kind?: "info" | "warn" | "ok") => void;

// ---------- NASA POWER ----------
export function powerUrl(lat: number, lon: number): string {
  return `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${POWER_PARAMS}` +
    `&community=AG&longitude=${lon}&latitude=${lat}&start=${FIRST_YEAR}0101&end=${LAST_YEAR}1231&format=JSON`;
}

export const daysInYear = (y: number) => (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 864e5;

/** POWER `properties.parameter` → per-year daily arrays (Jan 1 → Dec 31). −999 → previous day's value. */
export function parsePowerWeather(
  parameter: Record<string, Record<string, number>>,
  y0 = FIRST_YEAR, y1 = LAST_YEAR,
): Record<string, WeatherYear> {
  const out: Record<string, WeatherYear> = {};
  const last: Record<string, number | undefined> = {};
  for (let y = y0; y <= y1; y++) {
    const n = daysInYear(y);
    const rec: Record<string, number[]> = {};
    for (const [pk, k] of Object.entries(POWER_KEYS)) {
      const src = parameter[pk];
      if (!src) continue;
      const arr: number[] = [];
      for (let d = 0; d < n; d++) {
        const key = new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10).replace(/-/g, "");
        let v = src[key];
        if (v == null || !Number.isFinite(v) || v <= -998) v = last[pk] ?? NaN;
        last[pk] = v;
        arr.push(v);
      }
      // leading gap: back-fill with the first valid value
      const first = arr.find((v) => Number.isFinite(v));
      for (let i = 0; i < arr.length && !Number.isFinite(arr[i]); i++) arr[i] = first ?? 0;
      rec[k] = arr;
    }
    if (!rec.tmax || !rec.tmin || !rec.prcp) throw new Error("NASA POWER response is missing required variables");
    out[String(y)] = rec as unknown as WeatherYear;
  }
  return out;
}

/** Default rotation: hot and dry → wheat/sorghum, else maize/soybean. */
export function defaultRotation(weather: Record<string, WeatherYear>): CropId[] {
  const ys = Object.values(weather);
  const meanT = ys.reduce((s, w) => s + w.tmax.reduce((a, b) => a + b, 0) / w.tmax.length / 2 + w.tmin.reduce((a, b) => a + b, 0) / w.tmin.length / 2, 0) / ys.length;
  const rain = ys.reduce((s, w) => s + w.prcp.reduce((a, b) => a + b, 0), 0) / ys.length;
  return meanT > 14 && rain < 600 ? ["wheat", "sorghum"] : ["maize", "soybean"];
}

export const fmtCoord = (v: number) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
export const cacheKey = (lat: number, lon: number) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

interface PowerJson { properties?: { parameter?: Record<string, Record<string, number>> }; geometry?: { coordinates?: number[] } }

export function powerToPack(j: PowerJson, lat: number, lon: number, soil?: SoilBlock | null): FarmPack {
  const param = j.properties?.parameter;
  if (!param) throw new Error("NASA POWER returned no data for this point");
  const weather = parsePowerWeather(param);
  const elev = j.geometry?.coordinates?.[2];
  const pack: FarmPack = {
    meta: {
      id: `live-${lat}-${lon}`,
      name: `Field at ${fmtCoord(lat)}, ${fmtCoord(lon)}`,
      lat, lon, slope: 1.5,
      rotation: defaultRotation(weather),
      ...(typeof elev === "number" && Number.isFinite(elev) ? { elev } : {}),
      note: "Live point: NASA POWER daily weather" + (soil ? " + ISRIC SoilGrids" : ", default loam soil"),
      sources: {
        weather: "NASA POWER daily, community=AG",
        ...(soil ? { soil: "ISRIC SoilGrids 2.0 250 m (WCS, median of nearby pixels)" } : {}),
      },
    },
    weather,
  };
  if (soil) pack.soil = soil;
  return pack;
}

// ---------- SoilGrids WCS ----------
/** Conversion from SoilGrids mapped units to conventional ones (C1: sand/clay/silt %, soc g/kg, bdod g/cm3, pH). */
export const SOIL_FACTORS = { sand: 10, clay: 10, silt: 10, soc: 10, bdod: 100, phh2o: 10 } as const;
export const SOIL_DEPTHS: SoilDepth[] = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm"];

export function soilUrl(prop: string, depth: string, lat: number, lon: number, half = 0.01): string {
  return `https://maps.isric.org/mapserv?map=/map/${prop}.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage` +
    `&COVERAGEID=${prop}_${depth}_mean&FORMAT=GEOTIFF_INT16` +
    `&SUBSET=X(${lon - half},${lon + half})&SUBSET=Y(${lat - half},${lat + half})` +
    `&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326`;
}

/** Median of valid raster values (> 0, not the int16 nodata), scaled by the SoilGrids factor. */
export function medianScaled(vals: ArrayLike<number>, factor: number): number | null {
  const v = Array.from(vals).filter((x) => x > 0 && x !== -32768).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  const m = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return Math.round((m / factor) * 1000) / 1000;
}

/** Assemble the C1 soil block from [prop, depth, value] triples; null if the topsoil sand is missing. */
export function assembleSoil(res: [string, string, number | null][]): SoilBlock | null {
  const soil: Record<string, Record<string, { mean: number }>> = {};
  for (const [p, d, v] of res) {
    if (v == null) continue;
    (soil[p] ??= {})[d] = { mean: v };
  }
  if (soil.sand?.["0-5cm"] == null) return null;
  // fill depth gaps from the nearest shallower layer so every property is complete
  for (const p of Object.keys(soil)) {
    let prev: { mean: number } | undefined;
    for (const d of SOIL_DEPTHS) {
      if (soil[p][d]) prev = soil[p][d];
      else if (prev) soil[p][d] = { ...prev };
    }
  }
  return soil as SoilBlock;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const out = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(out);
}

/** Minimal GeoTIFF reader: int16, strips or tiles, none/deflate compression, predictor 1 or 2. */
export async function readTiffInt16(buf: Uint8Array): Promise<number[]> {
  if (!((buf[0] === 0x49 && buf[1] === 0x49) || (buf[0] === 0x4d && buf[1] === 0x4d))) throw new Error("not a TIFF");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const le = buf[0] === 0x49;
  const u16 = (o: number) => dv.getUint16(o, le), u32 = (o: number) => dv.getUint32(o, le);
  const ifd = u32(4), n = u16(ifd);
  const tags: Record<number, number[]> = {};
  const size: Record<number, number> = { 1: 1, 3: 2, 4: 4, 8: 2, 9: 4 };
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12, tag = u16(e), typ = u16(e + 2), cnt = u32(e + 4);
    if (!size[typ]) continue;
    const off = size[typ] * cnt <= 4 ? e + 8 : u32(e + 8);
    const arr: number[] = [];
    for (let k = 0; k < cnt; k++) {
      const o = off + k * size[typ];
      arr.push(typ === 1 ? buf[o] : typ === 3 ? u16(o) : typ === 4 ? u32(o) : typ === 8 ? dv.getInt16(o, le) : dv.getInt32(o, le));
    }
    tags[tag] = arr;
  }
  const w = tags[256][0], h = tags[257][0], comp = tags[259]?.[0] ?? 1, pred = tags[317]?.[0] ?? 1;
  const tiled = !!tags[322];
  const bw = tiled ? tags[322][0] : w, bh = tiled ? tags[323][0] : (tags[278]?.[0] ?? h);
  const offs = tiled ? tags[324] : tags[273], cnts = tiled ? tags[325] : tags[279];
  const img: (number | null)[] = new Array(w * h).fill(null);
  const across = Math.ceil(w / bw);
  for (let b = 0; b < offs.length; b++) {
    let raw = buf.subarray(offs[b], offs[b] + cnts[b]);
    if (comp === 8 || comp === 32946) raw = await inflate(raw);
    const rdv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const rows = Math.floor(raw.byteLength / 2 / bw);
    const bx = tiled ? (b % across) * bw : 0, by = tiled ? Math.floor(b / across) * bh : b * bh;
    for (let r = 0; r < rows; r++) {
      let prev = 0;
      for (let c = 0; c < bw; c++) {
        let v = rdv.getInt16((r * bw + c) * 2, le);
        if (pred === 2) { v = ((v + prev + 32768) & 0xffff) - 32768; prev = v; }
        const x = bx + c, y = by + r;
        if (x < w && y < h) img[y * w + x] = v;
      }
    }
  }
  return img.filter((v): v is number => v != null);
}

async function fetchSoilWCS(lat: number, lon: number, signal: AbortSignal): Promise<SoilBlock | null> {
  const jobs: [string, string][] = [];
  for (const p of Object.keys(SOIL_FACTORS)) for (const d of SOIL_DEPTHS) jobs.push([p, d]);
  const res = await Promise.all(jobs.map(async ([p, d]): Promise<[string, string, number | null]> => {
    try {
      const r = await fetch(soilUrl(p, d, lat, lon), { signal });
      if (!r.ok) return [p, d, null];
      const vals = await readTiffInt16(new Uint8Array(await r.arrayBuffer()));
      return [p, d, medianScaled(vals, SOIL_FACTORS[p as keyof typeof SOIL_FACTORS])];
    } catch {
      return [p, d, null];
    }
  }));
  return assembleSoil(res);
}

// ---------- main entry ----------
const cache = new Map<string, Promise<FarmPack>>();

/** Build a C1 pack for any point. Soil failure/timeout → pack without `soil` (engine uses default loam). */
export function buildLivePack(lat: number, lon: number, onProgress?: Progress): Promise<FarmPack> {
  const key = cacheKey(lat, lon);
  const hit = cache.get(key);
  if (hit) { onProgress?.("Loaded from cache", "ok"); return hit; }
  const p = run(+lat.toFixed(3), +lon.toFixed(3), onProgress);
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  return p;
}

async function run(lat: number, lon: number, onProgress?: Progress): Promise<FarmPack> {
  onProgress?.("Fetching 25 years of NASA POWER weather…");
  const ctl = new AbortController();
  const soilTimer = setTimeout(() => ctl.abort(), 8000);
  const soilP = fetchSoilWCS(lat, lon, ctl.signal).catch(() => null);
  const powerCtl = new AbortController();
  const powerTimer = setTimeout(() => powerCtl.abort(), 45000);
  let j: PowerJson;
  try {
    const r = await fetch(powerUrl(lat, lon), { signal: powerCtl.signal });
    if (!r.ok) throw new Error(`NASA POWER error ${r.status}`);
    j = await r.json();
  } catch (e) {
    ctl.abort();
    throw e instanceof Error && e.name === "AbortError" ? new Error("NASA POWER timed out") : e;
  } finally {
    clearTimeout(powerTimer);
  }
  onProgress?.("Reading SoilGrids soil…");
  const soil = await soilP;
  clearTimeout(soilTimer);
  if (!soil) onProgress?.("Soil unavailable, using default loam", "warn");
  const pack = powerToPack(j, lat, lon, soil);
  onProgress?.("Ready", "ok");
  return pack;
}
