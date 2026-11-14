"use client";
import { useEffect, useState } from "react";
import { parseCropMap, parseCropMeta, parseHlsSeries, type CropMap, type CropMeta, type HlsSeries } from "./parse";

export const DEFAULT_DATA_BASE = "/data/layers";

export type Loaded<T> = { status: "loading" } | { status: "missing" } | { status: "ok"; data: T };

/** Fetch + parse a JSON file; any network, HTTP or parse failure becomes "missing" (never throws). */
export function useJson<T>(url: string | null, parse: (raw: unknown) => T | null): Loaded<T> {
  const [state, setState] = useState<{ url: string | null; r: Loaded<T> }>({ url: null, r: { status: "loading" } });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const data = parse(await res.json());
        if (alive) setState({ url, r: data ? { status: "ok", data } : { status: "missing" } });
      } catch {
        if (alive) setState({ url, r: { status: "missing" } });
      }
    })();
    return () => { alive = false; };
    // parse functions are module-level constants
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  if (!url) return { status: "missing" };
  return state.url === url ? state.r : { status: "loading" };
}

export const useCropMap = (farm: string, base = DEFAULT_DATA_BASE) => useJson<CropMap>(`${base}/${farm}/cropmap.json`, parseCropMap);
export const useCropMeta = (farm: string, base = DEFAULT_DATA_BASE) => useJson<CropMeta>(`${base}/${farm}/cropmap_meta.json`, parseCropMeta);
export const useHlsSeries = (farm: string, base = DEFAULT_DATA_BASE) => useJson<HlsSeries>(`${base}/${farm}/hls_ndvi.json`, parseHlsSeries);
