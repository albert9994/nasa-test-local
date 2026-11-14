// Shareable map state: ?lat&lon&zoom&f=<kind>:<payload>. Polygons are delta-encoded (1e-5° ≈ 1 m) in base 36.
import type { LngLat, Ring } from "./area";
import { landFromCircle, landFromRing, type Land } from "./land";

const Q = 1e5;
const zig = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n);
const unzig = (n: number) => (n % 2 ? -(n + 1) / 2 : n / 2);

export function encodeRing(ring: Ring): string {
  let px = 0, py = 0;
  return ring.map(([lo, la]) => {
    const x = Math.round(lo * Q), y = Math.round(la * Q);
    const s = `${zig(x - px).toString(36)}_${zig(y - py).toString(36)}`;
    px = x; py = y;
    return s;
  }).join(".");
}
export function decodeRing(s: string): Ring | null {
  let px = 0, py = 0;
  const out: Ring = [];
  for (const part of s.split(".")) {
    const [a, b] = part.split("_");
    const dx = parseInt(a, 36), dy = parseInt(b, 36);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    px += unzig(dx); py += unzig(dy);
    out.push([px / Q, py / Q]);
  }
  return out.length >= 3 ? out : null;
}

export function encodeLand(land: Land): string {
  if (land.kind === "circle" && land.circle) {
    const [lo, la] = land.circle.center;
    return `circle:${la.toFixed(5)},${lo.toFixed(5)},${+land.circle.areaHa.toFixed(2)}`;
  }
  return `${land.kind}:${encodeRing(land.ring)}`;
}
export function decodeLand(s: string | null | undefined): Land | null {
  if (!s) return null;
  const i = s.indexOf(":");
  if (i < 0) return null;
  const kind = s.slice(0, i), payload = s.slice(i + 1);
  if (kind === "circle") {
    const [la, lo, ha] = payload.split(",").map(Number);
    if (![la, lo, ha].every(Number.isFinite) || Math.abs(la) > 90 || Math.abs(lo) > 180 || ha < 0.1 || ha > 500) return null;
    return landFromCircle([lo, la] as LngLat, ha);
  }
  if (kind === "polygon" || kind === "parcel") {
    const ring = decodeRing(payload);
    return ring ? landFromRing(kind, ring) : null;
  }
  return null;
}

export interface MapUrlState { lat: number; lon: number; zoom: number; land: Land | null; ndvi: boolean }

export function parseMapUrl(search: string): Partial<MapUrlState> {
  const p = new URLSearchParams(search);
  const num = (k: string) => { const v = p.get(k); return v == null || v === "" ? NaN : Number(v); };
  const lat = num("lat"), lon = num("lon"), zoom = num("zoom");
  const out: Partial<MapUrlState> = {};
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) { out.lat = lat; out.lon = lon; }
  if (Number.isFinite(zoom) && zoom >= 1 && zoom <= 20) out.zoom = zoom;
  const land = decodeLand(p.get("f"));
  if (land) out.land = land;
  if (p.get("ndvi") === "1") out.ndvi = true;
  return out;
}
export function buildMapSearch(s: { lat: number; lon: number; zoom: number; land: Land | null; ndvi?: boolean }): string {
  const p = new URLSearchParams();
  p.set("lat", s.lat.toFixed(4)); p.set("lon", s.lon.toFixed(4)); p.set("zoom", s.zoom.toFixed(1));
  if (s.land) p.set("f", encodeLand(s.land));
  if (s.ndvi) p.set("ndvi", "1");
  return p.toString();
}
