"use client";
// Free-form land selection on a MapLibre map: pick an OSM farmland parcel, draw a polygon, or drop a circle (1–50 ha).
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { Layer, NavigationControl, Source, type MapMouseEvent, type MapRef } from "react-map-gl/maplibre";
import { setWorkerUrl, type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import { Check, Circle, Hand, Pencil, Undo2, Trash2, Sprout } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { closeRing, pointInRing, ringBBox, type LngLat } from "@/lib/geo/area";
import { landFromCircle, landFromRing, type Land } from "@/lib/geo/land";
import { fetchParcels, parcelAt, type Parcel } from "@/lib/geo/overpass";
import { SatelliteControls, cropMapFarmAt } from "@/components/satellite";
import type { PlaceHit } from "@/lib/geo/nominatim";
import { SearchBox } from "./search-box";

export type PickMode = "parcel" | "draw" | "circle";
export interface MapView { lat: number; lon: number; zoom: number }
export interface LandPickerProps {
  land: Land | null;
  onLandChange(land: Land | null): void;
  initialView?: MapView;
  onViewChange?(v: MapView): void;
  className?: string;
}

let workerSet = false;
function ensureWorker() {
  if (workerSet) return;
  workerSet = true;
  // Turbopack/Vite cannot find maplibre's worker on their own, so point at the bundled file.
  setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
}

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster", tileSize: 256, maxzoom: 18,
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "esri", type: "raster", source: "esri" }],
};

const DEFAULT_VIEW: MapView = { lat: 45.0, lon: 26.2, zoom: 6.4 };
const PARCEL_MIN_ZOOM = 13;
/** On phones the field snapshot sheet covers the lower ~58 % of the screen, so keep the land in the upper part. */
function fitPadding() {
  if (typeof window === "undefined" || window.innerWidth >= 768) return 80;
  return { top: 210, bottom: Math.round(window.innerHeight * 0.6), left: 28, right: 28 };
}
const EMPTY = { type: "FeatureCollection", features: [] } as const;

type FC = { type: "FeatureCollection"; features: unknown[] };
const polyFC = (ring: LngLat[] | null): FC =>
  ring && ring.length >= 3 ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [closeRing(ring)] } }] } : (EMPTY as unknown as FC);
const lineFC = (pts: LngLat[]): FC =>
  pts.length >= 2 ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts } }] } : (EMPTY as unknown as FC);
const pointsFC = (pts: LngLat[]): FC => ({ type: "FeatureCollection", features: pts.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } })) });
const parcelsFC = (ps: Parcel[]): FC => ({ type: "FeatureCollection", features: ps.map((p) => ({ type: "Feature", id: p.id, properties: { id: p.id }, geometry: { type: "Polygon", coordinates: [closeRing(p.ring)] } })) });

type ParcelStatus = "zoom" | "loading" | "ok" | "none" | "error";

export default function LandPickerInner({ land, onLandChange, initialView, onViewChange, className }: LandPickerProps) {
  const t = useT();
  ensureWorker();
  const ref = useRef<MapRef>(null);
  const [mode, setMode] = useState<PickMode>("parcel");
  const [draft, setDraft] = useState<LngLat[]>([]);
  const [circleHa, setCircleHa] = useState(land?.circle?.areaHa ?? 10);
  const [zoom, setZoom] = useState(initialView?.zoom ?? DEFAULT_VIEW.zoom);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [status, setStatus] = useState<ParcelStatus>("zoom");
  const [missHint, setMissHint] = useState(false);
  const [hover, setHover] = useState<Parcel | null>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);
  const seen = useRef(new Map<number, Parcel>());
  const initialLand = useRef(land); // only a land that came with the first render (URL) frames the map on load
  const own = useRef<Land | null>(null); // last land produced by this component (so external changes can re-frame the map)
  const view = initialView ?? DEFAULT_VIEW;

  const emit = useCallback((l: Land | null, reveal = true) => {
    own.current = l;
    onLandChange(l);
    if (l && reveal && window.innerWidth < 768) { // phones: bring the new selection above the bottom sheet
      const b = ringBBox(l.ring), m = ref.current;
      m?.fitBounds([[b.west, b.south], [b.east, b.north]], { padding: fitPadding(), maxZoom: m.getZoom(), duration: 600 });
    }
  }, [onLandChange]);

  // frame the map on a land that was set from outside (URL, saved field)
  useEffect(() => {
    if (!land || land === own.current) return;
    const b = ringBBox(land.ring);
    ref.current?.fitBounds([[b.west, b.south], [b.east, b.north]], { padding: fitPadding(), maxZoom: 17, duration: 900 });
  }, [land]);

  // ---------- farmland parcels (Overpass) ----------
  const loadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadParcels = useCallback(() => {
    const m = ref.current;
    if (!m) return;
    const z = m.getZoom();
    if (z < PARCEL_MIN_ZOOM) { setStatus("zoom"); return; }
    const c = m.getCenter();
    setStatus((s) => (s === "ok" ? s : "loading"));
    fetchParcels(c.lat, c.lng)
      .then((list) => {
        for (const p of list) seen.current.set(p.id, p);
        if (seen.current.size > 4000) for (const k of [...seen.current.keys()].slice(0, 1000)) seen.current.delete(k);
        const all = [...seen.current.values()];
        setParcels(all);
        const b = m.getBounds();
        const inView = all.some((p) => p.centroid.lon > b.getWest() && p.centroid.lon < b.getEast() && p.centroid.lat > b.getSouth() && p.centroid.lat < b.getNorth());
        setStatus(inView ? "ok" : "none");
      })
      .catch(() => setStatus("error"));
  }, []);
  const onMoveEnd = useCallback(() => {
    const m = ref.current;
    if (!m) return;
    const c = m.getCenter(), z = m.getZoom();
    setZoom(z);
    setCenter({ lat: c.lat, lon: c.lng });
    onViewChange?.({ lat: c.lat, lon: c.lng, zoom: z });
    clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(loadParcels, 700);
  }, [loadParcels, onViewChange]);
  useEffect(() => () => clearTimeout(loadTimer.current), []);

  // ---------- interactions ----------
  const finish = useCallback(() => {
    if (draft.length < 3) return;
    const l = landFromRing("polygon", draft);
    setDraft([]);
    if (l) emit(l);
  }, [draft, emit]);

  const onClick = (e: MapMouseEvent) => {
    const p: LngLat = [e.lngLat.lng, e.lngLat.lat];
    setMissHint(false);
    if (mode === "draw") {
      if (land && draft.length === 0) emit(null); // starting a new shape replaces the old selection
      const m = ref.current;
      const last = draft[draft.length - 1];
      if (m && last) {
        const a = m.project(last);
        if (Math.hypot(a.x - e.point.x, a.y - e.point.y) < 6) return; // second click of a double-click
      }
      setDraft((d) => [...d, p]);
    } else if (mode === "circle") {
      emit(landFromCircle(p, circleHa));
    } else {
      const hit = parcelAt(parcels, p[0], p[1], pointInRing);
      if (hit) { const l = landFromRing("parcel", hit.ring); if (l) emit(l); } else setMissHint(true);
    }
  };
  const onMouseMove = (e: MapMouseEvent) => {
    if (mode !== "parcel" || zoom < PARCEL_MIN_ZOOM) { if (hover) setHover(null); return; }
    const h = parcelAt(parcels, e.lngLat.lng, e.lngLat.lat, pointInRing);
    if ((h?.id ?? null) !== (hover?.id ?? null)) setHover(h);
  };

  const changeMode = (m: PickMode) => { setMode(m); setDraft([]); setMissHint(false); setHover(null); };
  const clearAll = () => { setDraft([]); emit(null); };
  const onCircleHa = (ha: number) => {
    setCircleHa(ha);
    if (land?.kind === "circle" && land.circle) emit(landFromCircle(land.circle.center, ha), false);
  };

  const onPlace = (h: PlaceHit) => {
    const m = ref.current;
    if (!m) return;
    m.flyTo({ center: [h.lon, h.lat], zoom: 14, duration: 1200 });
  };

  const hint = useMemo(() => {
    if (mode === "draw") return draft.length ? t("mapTool.hintDrawMore", { n: draft.length }) : t("mapTool.hintDraw");
    if (mode === "circle") return t("mapTool.hintCircle");
    if (missHint) return t("mapTool.hintParcelMiss");
    switch (status) {
      case "zoom": return t("mapTool.hintParcelZoom");
      case "loading": return t("mapTool.hintParcelLoading");
      case "none": return t("mapTool.hintParcelNone");
      case "error": return t("mapTool.hintParcelError");
      default: return t("mapTool.hintParcel");
    }
  }, [mode, draft.length, missHint, status, t]);

  const draftRing = draft.length >= 3 ? draft : null;
  const modes: [PickMode, string, typeof Hand][] = [["parcel", "mapTool.modeParcel", Sprout], ["draw", "mapTool.modeDraw", Pencil], ["circle", "mapTool.modeCircle", Circle]];
  // AI crop map: only where a precomputed map exists (Iowa and Bărăgan blocks), judged by the selected land or the map centre
  const cropFarm = useMemo(() => { const c = land?.centroid ?? center ?? view; return cropMapFarmAt(c.lat, c.lon); }, [land, center, view]);
  const cursor = mode === "parcel" ? (hover ? "pointer" : "grab") : "crosshair";

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-primary-soft max-md:[&_.maplibregl-ctrl-top-right]:hidden", className)}>
      <MapGL
        ref={ref}
        mapStyle={BASE_STYLE}
        initialViewState={{ longitude: view.lon, latitude: view.lat, zoom: view.zoom }}
        maxZoom={19}
        style={{ width: "100%", height: "100%" }}
        doubleClickZoom={mode !== "draw"}
        cursor={cursor}
        onClick={onClick}
        onDblClick={() => { if (mode === "draw") finish(); }}
        onMouseMove={onMouseMove}
        onMoveEnd={onMoveEnd}
        onLoad={() => {
          setMap(ref.current?.getMap() ?? null);
          const l0 = initialLand.current;
          if (l0) { const b = ringBBox(l0.ring); ref.current?.fitBounds([[b.west, b.south], [b.east, b.north]], { padding: fitPadding(), maxZoom: 17, duration: 0 }); }
          onMoveEnd();
        }}
      >
        <NavigationControl showCompass={false} position="top-right" />
        <Source id="parcels" type="geojson" data={parcelsFC(parcels)}>
          <Layer id="parcels-fill" type="fill" minzoom={PARCEL_MIN_ZOOM - 0.5} layout={{ visibility: mode === "parcel" ? "visible" : "none" }} paint={{ "fill-color": "#ffffff", "fill-opacity": 0.08 }} />
          <Layer id="parcels-line" type="line" minzoom={PARCEL_MIN_ZOOM - 0.5} layout={{ visibility: mode === "parcel" ? "visible" : "none" }} paint={{ "line-color": "#ffffff", "line-width": 1.4, "line-opacity": 0.85 }} />
        </Source>
        <Source id="hover" type="geojson" data={polyFC(hover ? hover.ring : null)}>
          <Layer id="hover-fill" type="fill" paint={{ "fill-color": "#ffffff", "fill-opacity": 0.28 }} />
        </Source>
        <Source id="selected" type="geojson" data={polyFC(land ? land.ring : null)}>
          <Layer id="selected-fill" type="fill" paint={{ "fill-color": "#3e8e4f", "fill-opacity": 0.38 }} />
          <Layer id="selected-line-outer" type="line" paint={{ "line-color": "#14201a", "line-width": 5, "line-opacity": 0.45 }} layout={{ "line-join": "round" }} />
          <Layer id="selected-line" type="line" paint={{ "line-color": "#ffffff", "line-width": 2.5 }} layout={{ "line-join": "round" }} />
        </Source>
        <Source id="draft-fill" type="geojson" data={polyFC(draftRing)}>
          <Layer id="draft-fill" type="fill" paint={{ "fill-color": "#ffffff", "fill-opacity": 0.18 }} />
        </Source>
        <Source id="draft-line" type="geojson" data={lineFC(draftRing ? [...draft, draft[0]] : draft)}>
          <Layer id="draft-line" type="line" paint={{ "line-color": "#ffffff", "line-width": 2.5, "line-dasharray": [2, 1.5] }} />
        </Source>
        <Source id="draft-pts" type="geojson" data={pointsFC(draft)}>
          <Layer id="draft-pts" type="circle" paint={{ "circle-radius": 5.5, "circle-color": "#ffffff", "circle-stroke-color": "#1f5135", "circle-stroke-width": 2.5 }} />
        </Source>
      </MapGL>

      {/* top-left controls */}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex max-w-[26rem] flex-col gap-2 sm:left-4 sm:right-auto sm:top-4 sm:w-[26rem]">
        <div data-tour="search" className="pointer-events-auto"><SearchBox onPick={onPlace} /></div>
        <div className="pointer-events-auto flex flex-col gap-2" data-tour="modes">
          <div role="group" aria-label={t("mapTool.modeLabel")} className="grid grid-cols-3 gap-1 rounded-full border border-line bg-surface p-1 shadow-[var(--shadow)]">
            {modes.map(([m, k, Icon]) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => changeMode(m)}
                className={cn("flex h-9 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-medium transition-colors", mode === m ? "bg-primary text-primary-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}>
                <Icon className="size-3.5 shrink-0" /><span className="truncate">{t(k)}</span>
              </button>
            ))}
          </div>
          <p role="status" className="rounded-2xl border border-line bg-surface/95 px-3.5 py-2 text-[13px] leading-snug text-fg-muted shadow-[var(--shadow)]">{hint}</p>
          {mode === "draw" && (
            <div className="flex gap-1.5">
              <button type="button" disabled={draft.length < 3} onClick={finish} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-fg shadow-[var(--shadow)] disabled:opacity-45"><Check className="size-3.5" />{t("mapTool.finish")}</button>
              <button type="button" disabled={!draft.length} onClick={() => setDraft((d) => d.slice(0, -1))} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] font-medium shadow-[var(--shadow)] disabled:opacity-45"><Undo2 className="size-3.5" />{t("mapTool.undo")}</button>
              <button type="button" disabled={!draft.length && !land} onClick={clearAll} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] font-medium shadow-[var(--shadow)] disabled:opacity-45"><Trash2 className="size-3.5" />{t("mapTool.clear")}</button>
            </div>
          )}
          {mode === "circle" && (
            <div className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-[var(--shadow)]">
              <div className="mb-2 flex items-center justify-between text-[13px]"><span className="font-medium">{t("mapTool.radius")}</span><span className="num text-fg-muted">{t("mapTool.areaShort", { ha: circleHa })}</span></div>
              <Slider min={1} max={50} step={1} value={[circleHa]} onValueChange={([v]) => onCircleHa(v)} aria-label={t("mapTool.radius")} />
            </div>
          )}
        </div>
        <SatelliteControls map={map} cropFarm={cropFarm} beforeId="parcels-fill" className="max-h-[max(8rem,calc(42dvh-14rem))] md:max-h-[50dvh]" />
      </div>
    </div>
  );
}
