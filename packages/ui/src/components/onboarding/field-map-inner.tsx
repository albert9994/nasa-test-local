"use client";
// MapLibre map used by the onboarding (place the farm, place fields) and by the workspace (farm overview).
// Esri World Imagery base, field polygons coloured by risk, click handlers. Lazy-loaded through ./field-map.tsx.
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Source, type MapRef } from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import type { FieldMapProps } from "./field-map";

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256, maxzoom: 18, attribution: "Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "esri", type: "raster", source: "esri" }],
};

const RISK_COLOR = { safe: "#2f7d4a", tight: "#d9a23a", over: "#e0592a", none: "#5ba3e8" } as const;

function bounds(coords: [number, number][]): [[number, number], [number, number]] | null {
  if (!coords.length) return null;
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of coords) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [[w, s], [e, n]];
}

export default function FieldMapInner({ center, zoom = 12, fields, selectedId, riskById, marker, onMapClick, onSelect, fitFields, className }: FieldMapProps) {
  const ref = useRef<MapRef>(null);
  const [ready, setReady] = useState(false);
  const data = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: fields.filter((f) => f.geometry).map((f) => ({
      type: "Feature" as const, geometry: f.geometry!,
      properties: { id: f.id, risk: riskById?.[f.id] ?? "none", selected: f.id === selectedId ? 1 : 0 },
    })),
  }), [fields, riskById, selectedId]);

  const fitCoords = useMemo(() => fields.flatMap((f) => f.geometry?.coordinates[0] as [number, number][] ?? [[f.centroid.lon, f.centroid.lat]]), [fields]);
  const fitSig = fitFields ? fields.map((f) => f.id).join(",") : "";

  // Move the camera when the target changes (new place) or when the set of fields changes in overview mode.
  useEffect(() => {
    const m = ref.current;
    if (!m || !ready) return;
    if (fitFields) {
      const b = bounds(fitCoords);
      if (b) { m.fitBounds(b, { padding: 60, maxZoom: 15, duration: 800 }); return; }
    }
    m.flyTo({ center: [center.lon, center.lat], zoom, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lon, zoom, fitSig, ready]);

  return (
    <div className={className ?? "relative h-full min-h-[240px] w-full overflow-hidden rounded-[var(--radius)] border border-line"}>
      <Map
        ref={ref}
        mapStyle={STYLE}
        initialViewState={{ longitude: center.lon, latitude: center.lat, zoom }}
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={["fields-fill"]}
        onLoad={() => setReady(true)}
        cursor={onMapClick ? "crosshair" : "grab"}
        onClick={(e) => {
          const hit = e.features?.[0]?.properties?.id as string | undefined;
          if (hit && onSelect) { onSelect(hit); return; }
          onMapClick?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        }}
      >
        <NavigationControl showCompass={false} position="top-right" />
        <Source id="fields" type="geojson" data={data}>
          <Layer id="fields-fill" type="fill" paint={{
            "fill-color": ["match", ["get", "risk"], "safe", RISK_COLOR.safe, "tight", RISK_COLOR.tight, "over", RISK_COLOR.over, RISK_COLOR.none],
            "fill-opacity": ["case", ["==", ["get", "selected"], 1], 0.55, 0.38],
          }} />
          <Layer id="fields-line" type="line" paint={{
            "line-color": "#ffffff",
            "line-width": ["case", ["==", ["get", "selected"], 1], 3, 1.5],
          }} />
        </Source>
        {fields.map((f) => (
          <Marker key={f.id} longitude={f.centroid.lon} latitude={f.centroid.lat} anchor="center" style={{ pointerEvents: "none" }}>
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-[#14201a] shadow">{f.name}</span>
          </Marker>
        ))}
        {marker && (
          <Marker longitude={marker.lon} latitude={marker.lat} anchor="bottom">
            <svg width="28" height="36" viewBox="0 0 28 36" aria-hidden><path d="M14 0C6.3 0 0 6.2 0 13.8 0 24 14 36 14 36s14-12 14-22.2C28 6.2 21.7 0 14 0z" fill="#1f5135" stroke="#fff" strokeWidth="2" /><circle cx="14" cy="14" r="5" fill="#fff" /></svg>
          </Marker>
        )}
      </Map>
    </div>
  );
}
