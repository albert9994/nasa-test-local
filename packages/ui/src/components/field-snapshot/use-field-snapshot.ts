"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import type { FarmPack } from "@/lib/engine/types";
import { buildLivePack } from "@/lib/data/live";
import { climateStats, type ClimateStats } from "@/lib/geo/stats";
import { summariseSoil, type SoilSummary } from "@/lib/geo/soil";
import { reversePlace } from "@/lib/geo/nominatim";
import type { Land } from "@/lib/geo/land";

export type StepState = "wait" | "active" | "ok" | "warn";
export interface Steps { place: StepState; weather: StepState; soil: StepState; calc: StepState }
export interface SnapshotData { pack: FarmPack; stats: ClimateStats; soil: SoilSummary | null }
export interface SnapshotState {
  status: "idle" | "loading" | "ready" | "error";
  steps: Steps;
  data: SnapshotData | null;
  place: string | null;
  error: string | null;
  retry(): void;
}
const WAIT: Steps = { place: "wait", weather: "wait", soil: "wait", calc: "wait" };

/** NASA POWER + SoilGrids pack for the land's centroid (cached by buildLivePack), the stats derived from it, and a place label. */
export function useFieldSnapshot(land: Land | null): SnapshotState {
  const { locale } = useT();
  const lat = land ? +land.centroid.lat.toFixed(3) : null, lon = land ? +land.centroid.lon.toFixed(3) : null;
  const [state, setState] = useState<Omit<SnapshotState, "retry" | "place">>({ status: "idle", steps: WAIT, data: null, error: null });
  const [place, setPlace] = useState<string | null | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (lat == null || lon == null) { setState({ status: "idle", steps: WAIT, data: null, error: null }); return; }
    let alive = true;
    const steps: Steps = { ...WAIT, weather: "active" };
    const push = (patch: Partial<Steps>, extra: Partial<typeof state> = {}) => {
      Object.assign(steps, patch);
      if (alive) setState((s) => ({ ...s, status: "loading", steps: { ...steps }, ...extra }));
    };
    setState({ status: "loading", steps: { ...steps }, data: null, error: null });
    const onProgress = (msg: string) => {
      if (msg.startsWith("Loaded from cache")) push({ weather: "ok", soil: "ok" });
      else if (msg.startsWith("Reading SoilGrids")) push({ weather: "ok", soil: "active" });
      else if (msg.startsWith("Soil unavailable")) push({ soil: "warn" });
    };
    buildLivePack(lat, lon, onProgress)
      .then(async (pack) => {
        if (!alive) return;
        push({ weather: "ok", soil: steps.soil === "warn" ? "warn" : "ok", calc: "active" });
        await new Promise((r) => setTimeout(r, 0)); // let the checklist paint before the (cheap) maths
        if (!alive) return;
        const data = { pack, stats: climateStats(pack), soil: summariseSoil(pack.soil) };
        steps.calc = "ok";
        setState({ status: "ready", steps: { ...steps }, data, error: null });
      })
      .catch((e) => { if (alive) setState({ status: "error", steps: { ...steps }, data: null, error: e instanceof Error ? e.message : "error" }); });
    return () => { alive = false; };
  }, [lat, lon, nonce]);

  useEffect(() => {
    if (lat == null || lon == null) { setPlace(undefined); return; }
    let alive = true;
    setPlace(undefined);
    reversePlace(lat, lon, locale).then((p) => { if (alive) setPlace(p); });
    return () => { alive = false; };
  }, [lat, lon, locale]);

  return { ...state, steps: { ...state.steps, place: state.status === "idle" ? "wait" : place === undefined ? "active" : "ok" }, place: place ?? null, retry: () => setNonce((n) => n + 1) };
}
