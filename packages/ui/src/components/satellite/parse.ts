// Pure parsers/helpers for the satellite layers (no React, no DOM): crop-map GeoJSON, its metadata and the HLS series.
// Every parser returns null on malformed input so the UI can simply render nothing when a layer file is missing.

export type CropClass = "maize" | "soybean" | "winter_cereal" | "spring_cereal" | "other";
export const CROP_CLASSES: CropClass[] = ["maize", "soybean", "winter_cereal", "spring_cereal", "other"];

/** Class colours (fill). Chosen to stay distinct on Esri imagery and on the light UI. */
export const CROP_COLORS: Record<CropClass, string> = {
  maize: "#e0b61f",
  soybean: "#3e8e4f",
  winter_cereal: "#c2410c",
  spring_cereal: "#8a5a3b",
  other: "#8a928c",
};

export type Ring = [number, number][];
export interface CropFeature {
  cls: CropClass;
  confidence: number; // 0..1
  /** Outer ring of the patch polygon (lon, lat). */
  ring: Ring;
}
export interface CropMap {
  features: CropFeature[];
  /** The original GeoJSON, ready for a MapLibre geojson source. */
  geojson: { type: "FeatureCollection"; features: unknown[] };
}

export type CropMethod = "prithvi-probe" | "prithvi-kmeans" | "usda-cdl" | "worldcereal";
export interface CropMeta {
  farm: string;
  method: CropMethod;
  model: string | null; // e.g. ibm-nasa-geospatial/Prithvi-EO-2.0-100M-TL, null when the layer is not Prithvi
  labels: string; // label source, e.g. "USDA CDL 2023"
  year: number | null;
  dates: string[];
  scenes: string[];
  accuracy: number | null;
  macroF1: number | null;
  agreement: number | null; // k-means vs reference labels (Baragan)
  /** Plain spectral classifier on the same split (no foundation model); null when not reported. */
  baselineMacroF1: number | null;
  baselineAccuracy: number | null;
  beta: boolean;
  patchMeters: number | null;
  note: string;
}

export interface HlsSeries {
  source: string;
  dates: string[]; // ISO yyyy-mm-dd, ascending
  ndvi: (number | null)[];
  ndmi: (number | null)[];
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const asObj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);

export function normalizeClass(v: unknown): CropClass {
  const s = String(v ?? "").toLowerCase();
  if (s === "corn" || s === "maize") return "maize";
  if (s === "soy" || s === "soybean" || s === "soybeans") return "soybean";
  if (s === "winter_cereal" || s === "winter_cereals" || s === "winter_wheat") return "winter_cereal";
  if (s === "spring_cereal" || s === "spring_cereals") return "spring_cereal";
  return "other";
}

export function parseCropMap(raw: unknown): CropMap | null {
  const o = asObj(raw);
  if (!o || o.type !== "FeatureCollection" || !Array.isArray(o.features)) return null;
  const features: CropFeature[] = [];
  for (const f of o.features) {
    const fo = asObj(f);
    const g = asObj(fo?.geometry);
    const p = asObj(fo?.properties);
    if (!g || g.type !== "Polygon" || !Array.isArray(g.coordinates)) continue;
    const ring = (g.coordinates as unknown[])[0];
    if (!Array.isArray(ring) || ring.length < 4) continue;
    const pts: Ring = [];
    for (const c of ring) {
      if (!Array.isArray(c) || !isNum(c[0]) || !isNum(c[1])) { pts.length = 0; break; }
      pts.push([c[0], c[1]]);
    }
    if (pts.length < 4) continue;
    const conf = p && isNum(p.confidence) ? Math.min(1, Math.max(0, p.confidence)) : 1;
    features.push({ cls: normalizeClass(p?.class), confidence: conf, ring: pts });
  }
  if (!features.length) return null;
  return { features, geojson: o as unknown as CropMap["geojson"] };
}

export function parseCropMeta(raw: unknown): CropMeta | null {
  const o = asObj(raw);
  if (!o) return null;
  const method = o.method;
  if (method !== "prithvi-probe" && method !== "prithvi-kmeans" && method !== "usda-cdl" && method !== "worldcereal") return null;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const num = (v: unknown) => (isNum(v) ? v : null);
  return {
    farm: String(o.farm ?? ""),
    method,
    model: typeof o.model === "string" ? o.model : null,
    labels: String(o.labels ?? ""),
    year: num(o.year),
    dates: strs(o.dates),
    scenes: strs(o.scenes),
    accuracy: num(o.accuracy),
    macroF1: num(o.macro_f1),
    agreement: num(o.agreement),
    baselineMacroF1: num(o.baseline_spectral_macro_f1),
    baselineAccuracy: num(o.baseline_spectral_accuracy),
    beta: o.beta !== false,
    patchMeters: num(o.patch_m),
    note: String(o.note ?? ""),
  };
}

export function isPrithvi(meta: CropMeta | null): boolean {
  return !!meta && (meta.method === "prithvi-probe" || meta.method === "prithvi-kmeans");
}

export function parseHlsSeries(raw: unknown): HlsSeries | null {
  const o = asObj(raw);
  if (!o || !Array.isArray(o.dates) || !Array.isArray(o.ndvi)) return null;
  const dates = o.dates as unknown[];
  const ndviIn = o.ndvi as unknown[];
  const ndmiIn = Array.isArray(o.ndmi) ? (o.ndmi as unknown[]) : [];
  const rows: { d: string; v: number | null; m: number | null }[] = [];
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const v = ndviIn[i], m = ndmiIn[i];
    if (!isNum(v)) continue; // a scene without NDVI is not a data point
    rows.push({ d, v, m: isNum(m) ? m : null });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return { source: String(o.source ?? ""), dates: rows.map((r) => r.d), ndvi: rows.map((r) => r.v), ndmi: rows.map((r) => r.m) };
}

// ---------- geometry ----------
export function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function centroid(ring: Ring): [number, number] {
  let x = 0, y = 0;
  const n = ring.length - 1 || 1; // closed ring repeats the first point
  for (let i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1]; }
  return [x / n, y / n];
}

/** Share of each crop class among the crop-map patches whose centre falls inside the field polygon (outer ring, lon/lat). */
export function cropShares(map: CropMap, field: Ring): { shares: Record<CropClass, number>; n: number } {
  const counts: Record<CropClass, number> = { maize: 0, soybean: 0, winter_cereal: 0, spring_cereal: 0, other: 0 };
  let n = 0;
  for (const f of map.features) {
    const [cx, cy] = centroid(f.ring);
    if (pointInRing(cx, cy, field)) { counts[f.cls]++; n++; }
  }
  const shares = { ...counts };
  for (const k of CROP_CLASSES) shares[k] = n ? counts[k] / n : 0;
  return { shares, n };
}

// ---------- time series ----------
export function doyOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1;
}

export function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** One year of points [doy, value], plus the median curve of all years on 16-day bins. */
export function seriesForYear(s: HlsSeries, key: "ndvi" | "ndmi", year: number) {
  const vals = s[key];
  const cur: [number, number][] = [];
  const bins = new Map<number, number[]>();
  s.dates.forEach((d, i) => {
    const v = vals[i];
    if (v == null) return;
    const doy = doyOf(d);
    const bin = Math.floor((doy - 1) / 16) * 16 + 8;
    (bins.get(bin) ?? bins.set(bin, []).get(bin)!).push(v);
    if (Number(d.slice(0, 4)) === year) cur.push([doy, v]);
  });
  const med = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([d, v]) => [d, median(v)] as [number, number]);
  return { cur, med };
}

export function yearsOf(s: HlsSeries): number[] {
  return [...new Set(s.dates.map((d) => Number(d.slice(0, 4))))].sort((a, b) => a - b);
}
