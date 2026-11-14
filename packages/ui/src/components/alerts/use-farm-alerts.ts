"use client";
// Alerts inputs for the farm that is open in the analysis store: place and slope from the pack, crop from the current rotation, stage from today's date.
import { useMemo } from "react";
import type { Stage } from "@/lib/data/forecast";
import { currentCrop, stageOn } from "@/lib/data/phenology";
import type { CropId } from "@/lib/engine/types";
import { useApp } from "@/lib/store/app";
import { useAlerts, type AlertsState } from "./use-alerts";

export interface FarmAlertCtx { lat: number; lon: number; crop: CropId; stage: Stage; slopePct?: number }

export function useFarmAlertCtx(): FarmAlertCtx | null {
  const meta = useApp((s) => s.pack?.meta);
  const rotation = useApp((s) => s.rotation);
  const day = new Date().toDateString(); // re-evaluate when the day changes
  return useMemo(() => {
    if (!meta) return null;
    const crop = currentCrop(rotation) ?? currentCrop(meta.rotation);
    if (!crop) return null;
    return { lat: meta.lat, lon: meta.lon, crop, stage: stageOn(crop, new Date()), slopePct: meta.slope };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, rotation, day]);
}

export function useFarmAlerts(): AlertsState {
  const c = useFarmAlertCtx();
  return useAlerts(c?.lat ?? null, c?.lon ?? null, c?.crop ?? null, c?.stage ?? null, c?.slopePct);
}
