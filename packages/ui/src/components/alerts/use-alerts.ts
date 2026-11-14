"use client";
// Shared hook behind the alerts panel and the "what needs attention" list: one forecast request per place, cached 10 min.
import { useEffect, useState } from "react";
import { alerts as computeAlerts, fetchForecast, type Alert, type Forecast, type Stage } from "@/lib/data/forecast";
import type { CropId } from "@/lib/engine/types";

export type AlertsState = { status: "loading" } | { status: "error" } | { status: "ok"; items: Alert[] };

const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; p: Promise<Forecast> }>();
const key = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

function forecastFor(lat: number, lon: number): Promise<Forecast> {
  const k = key(lat, lon);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = fetchForecast(lat, lon);
  cache.set(k, { at: Date.now(), p });
  p.catch(() => { if (cache.get(k)?.p === p) cache.delete(k); });
  return p;
}

export function useAlerts(lat: number | null, lon: number | null, crop: CropId | null, stage: Stage | null, slopePct?: number): AlertsState {
  const [state, setState] = useState<AlertsState>({ status: "loading" });
  useEffect(() => {
    if (lat == null || lon == null || !crop || !stage) { setState({ status: "error" }); return; }
    let alive = true;
    setState({ status: "loading" });
    forecastFor(lat, lon)
      .then((f) => alive && setState({ status: "ok", items: computeAlerts(f, crop, stage, { slopePct }) }))
      .catch((e) => { if (alive) { console.warn("[alerts]", e); setState({ status: "error" }); } });
    return () => { alive = false; };
  }, [lat, lon, crop, stage, slopePct]);
  return state;
}
