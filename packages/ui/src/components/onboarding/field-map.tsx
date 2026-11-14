"use client";
// The map contract used by the onboarding and the workspace. The full LandPicker (draw / pick a parcel) is built in
// parallel in components/landpick; to swap it in, render it from `FieldPicker` below with the same props (centre,
// existing fields, onPlace) and keep the rest of the onboarding unchanged.
import { clientOnly } from "@/lib/platform/client-only";
import type { LatLon, Polygon } from "@/lib/store/farm";

export type RiskLevel = "safe" | "tight" | "over";
export interface MapField { id: string; name: string; centroid: LatLon; geometry?: Polygon }
export interface FieldMapProps {
  center: LatLon;
  zoom?: number;
  fields: MapField[];
  selectedId?: string | null;
  riskById?: Record<string, RiskLevel | undefined>;
  /** Pin shown at the farm location. */
  marker?: LatLon | null;
  /** Click on empty land. */
  onMapClick?: (p: LatLon) => void;
  /** Click on an existing field. */
  onSelect?: (id: string) => void;
  /** Fit the camera to all fields instead of flying to `center`. */
  fitFields?: boolean;
  /** Show the satellite layers control (NASA GIBS + AI crop map where available). Used by the workspace. */
  satellite?: boolean;
  /** Screen space covered by floating panels, so fitted fields stay visible. */
  padding?: { top: number; right: number; bottom: number; left: number };
  /** Change it when the map container is resized by the host (e.g. a side panel opens) to refit the fields. */
  refitKey?: string | number;
  /** Where the satellite layers control sits. */
  satellitePosition?: string;
  className?: string;
}

const Inner = clientOnly<FieldMapProps>(() => import("./field-map-inner"), <div className="h-full min-h-[240px] w-full animate-pulse rounded-[var(--radius)] border border-line bg-surface-2" />);

export function FieldMap(props: FieldMapProps) {
  return <Inner {...props} />;
}

/** Swap point for the full LandPicker: same props, onMapClick receives the placed point. */
export const FieldPicker = FieldMap;
