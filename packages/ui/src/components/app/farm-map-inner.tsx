"use client";
// O1: MapLibre GL map. Esri World Imagery base, farm markers from the index, and the satellite layers control (NASA GIBS + AI crop map).
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import Map, { Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";
import { setWorkerUrl, type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import { SatelliteControls, cropMapFarmAt } from "@/components/satellite";
import { useApp } from "@/lib/store/app";
import { useMap } from "@/lib/store/map";

// Turbopack cannot resolve maplibre's own worker automatically, so point it at the bundled worker file.
let workerSet = false;
function ensureWorker() {
  if (workerSet) return;
  workerSet = true;
  setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
}

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256, maxzoom: 18,
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "esri", type: "raster", source: "esri" }],
};

export default function FarmMapInner() {
  const index = useApp((s) => s.index);
  const farmId = useApp((s) => s.farmId);
  const selectFarm = useApp((s) => s.selectFarm);
  const setPicked = useMap((s) => s.setPicked);
  const picked = useMap((s) => s.picked);
  ensureWorker();
  const ref = useRef<MapRef>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const selected = index.find((f) => f.id === farmId);

  // the crop map belongs to the farm it was computed for: show its layer only while that farm is open
  const cropFarm = selected ? cropMapFarmAt(selected.lat, selected.lon) : null;

  const farmZoom = cropFarm ? 10 : 7; // close enough to see the ~16 km crop-map block
  useEffect(() => {
    if (selected) ref.current?.flyTo({ center: [selected.lon, selected.lat], zoom: farmZoom, duration: 1400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div className="relative h-[260px] w-full overflow-hidden rounded-[var(--radius)] border border-line lg:h-[340px]">
      <Map
        ref={ref}
        mapStyle={STYLE}
        initialViewState={{ longitude: selected?.lon ?? -95, latitude: selected?.lat ?? 40, zoom: selected ? farmZoom : 3 }}
        style={{ width: "100%", height: "100%" }}
        onLoad={(e) => setMap(e.target)}
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
      <SatelliteControls map={map} cropFarm={cropFarm} className="absolute left-2 top-2" />
    </div>
  );
}
