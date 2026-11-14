// A "land" is whatever the user selected on the map: a drawn polygon, an OSM farmland parcel or a circle.
import { circleRing, haToRadiusM, openRing, ringAreaHa, ringCentroid, type LngLat, type Ring } from "./area";

export type LandKind = "polygon" | "parcel" | "circle";
export interface Land {
  kind: LandKind;
  /** Open ring, [lon, lat]. */
  ring: Ring;
  areaHa: number;
  centroid: { lat: number; lon: number };
  /** Circles only. */
  circle?: { center: LngLat; areaHa: number };
}

export function landFromRing(kind: "polygon" | "parcel", ring: Ring): Land | null {
  const r = openRing(ring);
  if (r.length < 3) return null;
  const areaHa = ringAreaHa(r);
  if (!(areaHa > 0)) return null;
  return { kind, ring: r, areaHa, centroid: ringCentroid(r) };
}

export function landFromCircle(center: LngLat, areaHa: number): Land {
  const ring = circleRing(center, haToRadiusM(areaHa));
  return { kind: "circle", ring, areaHa, centroid: { lat: center[1], lon: center[0] }, circle: { center, areaHa } };
}

/** GeoJSON polygon (closed ring, [lon, lat]) of a selected land, as stored on a farm field. */
export function landPolygon(land: Land): { type: "Polygon"; coordinates: number[][][] } {
  const r = land.ring;
  return { type: "Polygon", coordinates: [[...r, r[0]].map(([x, y]) => [x, y])] };
}

/** Open ring of a stored field polygon (drops the closing point). */
export function polygonRing(p: { coordinates: number[][][] } | undefined): LngLat[] | null {
  const r = p?.coordinates?.[0];
  if (!r || r.length < 4) return null;
  return openRing(r.map(([x, y]) => [x, y] as LngLat));
}
