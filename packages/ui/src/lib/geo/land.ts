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
