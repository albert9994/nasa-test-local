"use client";
// O1: MapLibre GL map. Esri World Imagery base + optional NASA GIBS MODIS NDVI overlay, farm markers from the index.
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";
import { setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { useApp } from "@/lib/store/app";
import { useMap } from "@/lib/store/map";

/** Start (YYYY-MM-DD) of the MODIS 16-day composite that contains late July (composites start on day 1 + 16k). */
export function lateJulyComposite(year: number): string {
  const jan1 = Date.UTC(year, 0, 1);
  const target = Math.floor((Date.UTC(year, 6, 28) - jan1) / 864e5); // 0-based day of year
  const start = Math.floor(target / 16) * 16;
  return new Date(jan1 + start * 864e5).toISOString().slice(0, 10);
}

// Turbopack cannot resolve maplibre's own worker automatically, so point it at the bundled worker file.
let workerSet = false;
function ensureWorker() {
  if (workerSet) return;
  workerSet = true;
  setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
}

const YEARS = Array.from({ length: 25 }, (_, i) => 2024 - i);

function styleFor(date: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      esri: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256, maxzoom: 18,
        attribution: "Esri, Maxar, Earthstar Geographics",
      },
      ndvi: {
        type: "raster",
        tiles: [`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_L3_NDVI_16Day/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`],
        tileSize: 256, maxzoom: 9,
        attribution: "NASA GIBS",
      },
    },
    layers: [
      { id: "esri", type: "raster", source: "esri" },
      { id: "ndvi", type: "raster", source: "ndvi", paint: { "raster-opacity": 0.7 } },
    ],
  };
}

export default function FarmMapInner() {
  const index = useApp((s) => s.index);
  const farmId = useApp((s) => s.farmId);
  const selectFarm = useApp((s) => s.selectFarm);
  const setPicked = useMap((s) => s.setPicked);
  const picked = useMap((s) => s.picked);
  ensureWorker();
  const ref = useRef<MapRef>(null);
  const [ndvi, setNdvi] = useState(false);
  const [year, setYear] = useState(2012);
  const date = lateJulyComposite(year);
  const style = useMemo(() => styleFor(date), [date]);
  const selected = index.find((f) => f.id === farmId);

  useEffect(() => {
    if (selected) ref.current?.flyTo({ center: [selected.lon, selected.lat], zoom: 7, duration: 1400 });
  }, [selected]);

  useEffect(() => {
    const m = ref.current?.getMap();
    if (m?.getLayer("ndvi")) m.setLayoutProperty("ndvi", "visibility", ndvi ? "visible" : "none");
  }, [ndvi, style]);

  return (
    <div className="relative h-[260px] w-full overflow-hidden rounded-[var(--radius)] border border-line lg:h-[340px]">
      <Map
        ref={ref}
        mapStyle={style}
        initialViewState={{ longitude: selected?.lon ?? -95, latitude: selected?.lat ?? 40, zoom: selected ? 7 : 3 }}
        style={{ width: "100%", height: "100%" }}
        onLoad={(e) => {
          if (e.target.getLayer("ndvi")) e.target.setLayoutProperty("ndvi", "visibility", ndvi ? "visible" : "none");
        }}
        onClick={(e) => setPicked({ lat: e.lngLat.lat, lon: e.lngLat.lng })}
        cursor="crosshair"
      >
        <NavigationControl showCompass={false} position="top-right" />
        {index.map((f) => {
          const sel = f.id === farmId;
          return (
            <Marker key={f.id} longitude={f.lon} latitude={f.lat} anchor="center"
              onClick={(e) => { e.originalEvent.stopPropagation(); selectFarm(f.id); }}>
              <button type="button" aria-label={f.name} title={f.name}
                className={`block rounded-full border-2 transition-all ${sel ? "size-5 border-white bg-gold shadow-[0_0_0_4px_rgba(232,182,76,.45)]" : "size-3.5 border-white bg-leaf"}`} />
            </Marker>
          );
        })}
        {picked && (
          <Marker longitude={picked.lon} latitude={picked.lat} anchor="center">
            <span className="block size-3 rounded-full border-2 border-white bg-water" />
          </Marker>
        )}
      </Map>
      <div className="absolute left-2 top-2 flex items-center gap-2 rounded-md bg-bg-elev/90 px-2 py-1 text-xs text-fg shadow">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={ndvi} onChange={(e) => setNdvi(e.target.checked)} />
          NASA NDVI
        </label>
        {ndvi && (
          <select aria-label="NDVI year" value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="rounded border border-line bg-bg px-1 py-0.5 text-xs">
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}
