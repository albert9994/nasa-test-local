"use client";
// What the host maps mount: a collapsible "Satellite layers" control (GIBS rasters) plus, when the view is inside a farm that has a
// precomputed crop map, the AI crop-map layer. Hosts decide the position through `className`.
import { useState } from "react";
import { Layers } from "lucide-react";
import type { Map as MlMap } from "maplibre-gl";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CropMapLayer } from "./crop-map-layer";
import { SatelliteLayers } from "./satellite-layers";

export function SatelliteControls({ map, cropFarm = null, beforeId, defaultOpen = false, className }: {
  map: MlMap | null;
  /** Farm id whose crop map covers the current view (see cropMapFarmAt); null/undefined = no crop-map layer. */
  cropFarm?: string | null;
  beforeId?: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("pointer-events-auto flex max-h-[calc(100%-1rem)] w-[min(18rem,calc(100vw-1.5rem))] flex-col gap-2", className)} data-testid="satellite-controls">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="inline-flex h-9 items-center gap-1.5 self-start rounded-full border border-line bg-surface px-3.5 text-[13px] font-medium text-fg shadow-[var(--shadow)] hover:bg-surface-2">
        <Layers className="size-4" aria-hidden />{t("satellite.layers")}
      </button>
      {/* kept mounted while closed so a layer that is switched on stays on the map */}
      <div className={cn("flex min-h-0 flex-col gap-2 overflow-y-auto pt-2", !open && "hidden")}>
        <SatelliteLayers map={map} beforeId={beforeId} />
        {cropFarm && <CropMapLayer map={map} farm={cropFarm} beforeId={beforeId} defaultOn={false} />}
      </div>
    </div>
  );
}
