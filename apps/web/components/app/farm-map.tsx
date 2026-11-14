"use client";
// O1 (subagent): MapLibre map (satellite + NASA GIBS MODIS NDVI overlay), farm markers from index.json. O5 adds click-anywhere.
import { Placeholder } from "@/components/ui/placeholder";
export function FarmMap() {
  return <Placeholder task="O1" title="Map" note="MapLibre + NASA GIBS NDVI, farm markers" />;
}
