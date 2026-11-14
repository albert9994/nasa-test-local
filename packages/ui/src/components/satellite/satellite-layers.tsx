"use client";
// Map control: toggles for NASA GIBS raster layers with a date picker, legend and source tooltip.
// Framework-neutral: pass the MapLibre map instance; the component adds/removes its own sources + layers
// ("fs-gibs-*") and re-adds them after the host swaps the style.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { useT } from "@/lib/i18n";
import { GIBS_LAYERS, clampDate, gibsTileUrl, latestDate, type GibsLayer } from "./gibs";

type State = Record<string, { on: boolean; date: string }>;
const srcId = (l: GibsLayer) => `fs-gibs-${l.id}`;

function apply(map: MlMap, l: GibsLayer, s: { on: boolean; date: string }, beforeId?: string) {
  const id = srcId(l);
  const present = !!map.getSource(id);
  if (!s.on) {
    if (map.getLayer(id)) map.removeLayer(id);
    if (present) map.removeSource(id);
    return;
  }
  const url = gibsTileUrl(l, s.date);
  const cur = map.getSource(id) as unknown as { tiles?: string[] } | undefined;
  if (cur && cur.tiles?.[0] === url) return;
  if (map.getLayer(id)) map.removeLayer(id);
  if (present) map.removeSource(id);
  map.addSource(id, { type: "raster", tiles: [url], tileSize: 256, maxzoom: l.maxZoom, attribution: "NASA GIBS" });
  // keep the crop map (if any) above the imagery
  const before = map.getLayer("fs-cropmap") ? "fs-cropmap" : beforeId && map.getLayer(beforeId) ? beforeId : undefined;
  map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": l.opacity } }, before);
}

/** `beforeId`: insert imagery below this layer of the host map (e.g. the host's field outlines) so they stay visible. */
export function SatelliteLayers({ map, beforeId, className = "" }: { map: MlMap | null; beforeId?: string; className?: string }) {
  const t = useT();
  const [st, setSt] = useState<State>(() =>
    Object.fromEntries(GIBS_LAYERS.map((l) => [l.id, { on: false, date: latestDate(l) }])));
  const stRef = useRef(st);
  stRef.current = st;

  const sync = useCallback(() => {
    if (!map) return;
    for (const l of GIBS_LAYERS) {
      try { apply(map, l, stRef.current[l.id], beforeId); } catch { /* style not ready yet; retried on styledata */ }
    }
  }, [map, beforeId]);

  useEffect(() => {
    if (!map) return;
    sync();
    map.on("styledata", sync);
    return () => {
      map.off("styledata", sync);
      try { for (const l of GIBS_LAYERS) apply(map, l, { on: false, date: "" }); } catch { /* map already disposed */ }
    };
  }, [map, sync]);

  useEffect(sync, [st, sync]);

  const set = (l: GibsLayer, patch: Partial<{ on: boolean; date: string }>) =>
    setSt((p) => ({ ...p, [l.id]: { ...p[l.id], ...patch } }));

  return (
    <fieldset className={`rounded-[var(--radius)] border border-line bg-surface p-3 text-sm shadow-[var(--shadow)] ${className}`} data-testid="satellite-layers">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">{t("satellite.layers")}</legend>
      <ul className="flex flex-col gap-2">
        {GIBS_LAYERS.map((l) => {
          const s = st[l.id];
          const max = latestDate(l);
          return (
            <li key={l.id}>
              <div className="flex items-center gap-2">
                <label className="flex flex-1 cursor-pointer items-center gap-2" title={`${t(`satellite.tip_${l.key}`)}\n${t("satellite.source")}: ${l.source} · ${s.date}`}>
                  <input type="checkbox" checked={s.on} onChange={(e) => set(l, { on: e.target.checked })} className="accent-[var(--primary)]" />
                  <span>{t(`satellite.layer_${l.key}`)}</span>
                </label>
              </div>
              {s.on && (
                <div className="ml-6 mt-1.5 flex flex-col gap-1.5 text-xs text-fg-muted">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5">
                      {t("satellite.date")}
                      <input type="date" value={s.date} min={l.start} max={max}
                        onChange={(e) => e.target.value && set(l, { date: clampDate(l, e.target.value) })}
                        className="rounded border border-line bg-bg px-1.5 py-0.5 text-xs text-fg" />
                    </label>
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => set(l, { date: max })}>{t("satellite.latest")}</button>
                  </div>
                  {l.legend ? (
                    <div aria-label={`${l.legend.unit} ${l.legend.min}–${l.legend.max}`}>
                      <div className="h-2 w-full max-w-[200px] rounded-full border border-line" style={{ background: l.legend.gradient }} />
                      <div className="flex max-w-[200px] justify-between"><span>{l.legend.min}</span><span>{l.legend.unit}</span><span>{l.legend.max}</span></div>
                    </div>
                  ) : <div>{t("satellite.legendBare")}</div>}
                  <div>{t("satellite.source")}: {l.source} · {s.date}</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
