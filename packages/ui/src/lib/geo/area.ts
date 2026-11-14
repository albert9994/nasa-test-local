// Spherical geometry helpers for land selection. Coordinates are [lon, lat] in degrees (GeoJSON order).
export type LngLat = [number, number];
export type Ring = LngLat[];
export interface BBox { west: number; south: number; east: number; north: number }

const R = 6378137; // WGS84 equatorial radius (m), as used by Web Mercator
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Open ring (first point not repeated) → drop a closing duplicate if present. */
export function openRing(ring: Ring): Ring {
  if (ring.length > 1) {
    const a = ring[0], b = ring[ring.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1);
  }
  return ring;
}
export const closeRing = (ring: Ring): Ring => (ring.length ? [...openRing(ring), openRing(ring)[0]] : ring);

/** Area of a polygon on the sphere in m² (Chamberlain–Duquette); independent of winding. */
export function ringAreaM2(ring: Ring): number {
  const r = openRing(ring), n = r.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const [l1, p1] = r[i], [l2, p2] = r[(i + 1) % n];
    sum += rad(l2 - l1) * (2 + Math.sin(rad(p1)) + Math.sin(rad(p2)));
  }
  return Math.abs((sum * R * R) / 2);
}
export const ringAreaHa = (ring: Ring) => ringAreaM2(ring) / 10000;

/** Area-weighted centroid in a local equirectangular projection; falls back to the vertex mean for degenerate rings. */
export function ringCentroid(ring: Ring): { lat: number; lon: number } {
  const r = openRing(ring);
  if (!r.length) return { lat: 0, lon: 0 };
  const lat0 = r.reduce((s, p) => s + p[1], 0) / r.length;
  const lon0 = r.reduce((s, p) => s + p[0], 0) / r.length;
  const k = Math.cos(rad(lat0));
  const pts = r.map(([lo, la]) => [(lo - lon0) * k, la - lat0]);
  let a2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    a2 += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a2) < 1e-14) return { lat: lat0, lon: lon0 };
  return { lon: lon0 + cx / (3 * a2) / k, lat: lat0 + cy / (3 * a2) };
}

/** Point `distM` metres from `c` along `bearingRad` (great circle). */
export function destination([lon, lat]: LngLat, distM: number, bearingRad: number): LngLat {
  const d = distM / R, φ1 = rad(lat), λ1 = rad(lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(bearingRad));
  const λ2 = λ1 + Math.atan2(Math.sin(bearingRad) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
  return [((deg(λ2) + 540) % 360) - 180, deg(φ2)];
}

export const haToRadiusM = (ha: number) => Math.sqrt((ha * 10000) / Math.PI);
export const radiusMToHa = (m: number) => (Math.PI * m * m) / 10000;

export function circleRing(center: LngLat, radiusM: number, steps = 64): Ring {
  const out: Ring = [];
  for (let i = 0; i < steps; i++) out.push(destination(center, radiusM, (2 * Math.PI * i) / steps));
  return out;
}

/** Ray casting; ring may be open or closed. */
export function pointInRing([x, y]: LngLat, ring: Ring): boolean {
  const r = openRing(ring);
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function ringBBox(ring: Ring): BBox {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [x, y] of ring) { west = Math.min(west, x); east = Math.max(east, x); south = Math.min(south, y); north = Math.max(north, y); }
  return { west, south, east, north };
}

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dφ = rad(b.lat - a.lat), dλ = rad(b.lon - a.lon);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dλ / 2) ** 2;
  return (2 * R * Math.asin(Math.sqrt(h))) / 1000;
}
