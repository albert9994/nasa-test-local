"use client";
// Renders cropmap.json on a MapLibre map (class colour, confidence -> opacity) with a provenance badge and legend.
// Renders nothing (and touches nothing on the map) when the layer files are missing.
import { useEffect, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { useT } from "@/lib/i18n";
import { CROP_CLASSES, CROP_COLORS, isPrithvi, type CropClass, type CropMeta } from "./parse";
import { DEFAULT_DATA_BASE, useCropMap, useCropMeta } from "./use-layer-data";

const ID = "fs-cropmap";

export function cropBadgeKey(meta: CropMeta | null): string {
  if (!meta) return "satellite.cropMap";
  if (isPrithvi(meta)) return "satellite.cropMapBadgePrithvi";
  return meta.method === "worldcereal" ? "satellite.cropMapBadgeWc" : "satellite.cropMapBadgeCdl";
}

export function CropMapBadge({ meta }: { meta: CropMeta | null }) {
  const t = useT();
  return (
    <span className="inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
      {t(cropBadgeKey(meta))}
    </span>
  );
}

export function CropMapMeta({ meta }: { meta: CropMeta }) {
  const t = useT();
  const pct = (v: number | null) => (v == null ? "–" : v.toFixed(2));
  return (
    <ul className="space-y-0.5 text-xs text-fg-muted">
      {meta.model && <li>{t("satellite.metaModel", { model: meta.model })}</li>}
      {meta.labels && <li>{t("satellite.metaLabels", { labels: meta.labels })}</li>}
      {meta.accuracy != null && <li>{t("satellite.metaAccuracy", { acc: pct(meta.accuracy), f1: pct(meta.macroF1) })}</li>}
      {meta.agreement != null && <li>{t("satellite.metaAgreement", { agr: pct(meta.agreement) })}</li>}
      {!isPrithvi(meta) && <li>{t("satellite.metaCdlNote")}</li>}
      {meta.beta && isPrithvi(meta) && <li>{t("satellite.metaBeta")}</li>}
      {meta.note && <li>{meta.note}</li>}
    </ul>
  );
}

export function CropMapLayer({ map, farm, dataBase = DEFAULT_DATA_BASE, defaultOn = true, beforeId, className = "" }: {
  map: MlMap | null; farm: string; dataBase?: string; defaultOn?: boolean; /** insert below this host layer */ beforeId?: string; className?: string;
}) {
  const t = useT();
  const cm = useCropMap(farm, dataBase);
  const meta = useCropMeta(farm, dataBase);
  const [on, setOn] = useState(defaultOn);
  const geojson = cm.status === "ok" ? cm.data.geojson : null;

  useEffect(() => {
    if (!map || !geojson || !on) return;
    const add = () => {
      try {
        if (!map.getSource(ID)) map.addSource(ID, { type: "geojson", data: geojson });
        if (!map.getLayer(ID)) {
          map.addLayer({
            id: ID, type: "fill", source: ID,
            paint: {
              "fill-color": ["match", ["get", "class"], ...CROP_CLASSES.flatMap((c) => [c, CROP_COLORS[c]]), CROP_COLORS.other] as unknown as string,
              "fill-opacity": ["interpolate", ["linear"], ["coalesce", ["get", "confidence"], 1], 0.4, 0.3, 1, 0.8],
              "fill-outline-color": "rgba(255,255,255,0.35)",
            },
          }, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
        }
      } catch { /* style not ready; retried on styledata */ }
    };
    add();
    map.on("styledata", add);
    return () => {
      map.off("styledata", add);
      try {
        if (map.getLayer(ID)) map.removeLayer(ID);
        if (map.getSource(ID)) map.removeSource(ID);
      } catch { /* map disposed */ }
    };
  }, [map, geojson, on, beforeId]);

  if (cm.status !== "ok") return null;
  const m = meta.status === "ok" ? meta.data : null;
  const used = new Set(cm.data.features.map((f) => f.cls));
  return (
    <section className={`rounded-[var(--radius)] border border-line bg-surface p-3 text-sm shadow-[var(--shadow)] ${className}`} data-testid="crop-map-layer">
      <div className="flex items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 font-medium">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="accent-[var(--primary)]" />
          {t("satellite.cropMapShow")}
        </label>
        <CropMapBadge meta={m} />
      </div>
      {on && (
        <div className="mt-2 space-y-2">
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {CROP_CLASSES.filter((c) => used.has(c)).map((c: CropClass) => (
              <li key={c} className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: CROP_COLORS[c] }} />{t(`satellite.class_${c}`)}</li>
            ))}
          </ul>
          <p className="text-xs text-fg-muted">{t("satellite.confidence")}</p>
          {m && <CropMapMeta meta={m} />}
        </div>
      )}
    </section>
  );
}
