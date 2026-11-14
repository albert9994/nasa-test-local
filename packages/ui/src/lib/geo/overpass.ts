// OSM Overpass: farmland parcels (landuse=farmland) around the map centre, cached per grid cell.
import { openRing, ringAreaHa, ringCentroid, type BBox, type LngLat, type Ring } from "./area";

export interface Parcel { id: number; ring: Ring; areaHa: number; centroid: { lat: number; lon: number }; crop?: string }

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
/** Tried in order when the main instance is slow (> 14 s) or errors; the public servers are often busy. */
export const OVERPASS_FALLBACKS = ["https://overpass.kumi.systems/api/interpreter"];
const ATTEMPT_MS = 14000;
const CELL = 0.01; // degrees; the query box is the snapped cell grown by one cell each way (≈ 3.3 × 2.4 km): small queries stay fast on the busy public servers
export const MIN_PARCEL_HA = 0.2;
export const MAX_PARCEL_HA = 1500;

export function cellFor(lat: number, lon: number) {
  const ci = Math.floor(lon / CELL), cj = Math.floor(lat / CELL);
  return { key: `${ci},${cj}`, bbox: { west: (ci - 1) * CELL, east: (ci + 2) * CELL, south: (cj - 1) * CELL, north: (cj + 2) * CELL } as BBox };
}

export function parcelQuery(b: BBox): string {
  const box = [b.south, b.west, b.north, b.east].map((v) => v.toFixed(5)).join(",");
  return `[out:json][timeout:25];way["landuse"="farmland"](${box});out geom;`;
}

interface OverpassWay { type: string; id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }

/** Overpass JSON (`out geom`) → polygons; drops open ways, slivers and absurdly large areas. */
export function parseOverpass(json: unknown): Parcel[] {
  const els = (json as { elements?: OverpassWay[] } | null)?.elements;
  if (!Array.isArray(els)) return [];
  const out: Parcel[] = [];
  for (const e of els) {
    if (e.type !== "way" || !Array.isArray(e.geometry) || e.geometry.length < 4) continue;
    const g = e.geometry;
    const first = g[0], last = g[g.length - 1];
    if (first.lat !== last.lat || first.lon !== last.lon) continue; // not closed → not an area
    const ring = openRing(g.map((p): LngLat => [p.lon, p.lat]));
    if (ring.length < 3) continue;
    const areaHa = ringAreaHa(ring);
    if (areaHa < MIN_PARCEL_HA || areaHa > MAX_PARCEL_HA) continue;
    out.push({ id: e.id, ring, areaHa, centroid: ringCentroid(ring), crop: e.tags?.crop });
  }
  return out;
}

const cache = new Map<string, Promise<Parcel[]>>();
let lastCall = 0;

/** Fetch (and cache) parcels for the grid cell containing the point. Calls are spaced ≥ 1 s apart. */
export function fetchParcels(lat: number, lon: number, signal?: AbortSignal): Promise<Parcel[]> {
  const { key, bbox } = cellFor(lat, lon);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const wait = lastCall + 1000 - Date.now();
    lastCall = Math.max(Date.now(), lastCall) + (wait > 0 ? wait : 0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const body = `data=${encodeURIComponent(parcelQuery(bbox))}`;
    let lastErr: unknown = new Error("Overpass unavailable");
    for (const url of [OVERPASS_URL, ...OVERPASS_FALLBACKS]) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), ATTEMPT_MS);
      const onAbort = () => ctl.abort();
      signal?.addEventListener("abort", onAbort);
      try {
        const res = await fetch(url, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        return parseOverpass(await res.json());
      } catch (e) {
        lastErr = e;
        if (signal?.aborted) break;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    }
    throw lastErr;
  })();
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  return p;
}

export function parcelAt(parcels: Parcel[], lon: number, lat: number, inside: (pt: LngLat, ring: Ring) => boolean): Parcel | null {
  let best: Parcel | null = null;
  for (const p of parcels) if (inside([lon, lat], p.ring) && (!best || p.areaHa < best.areaHa)) best = p;
  return best;
}
