"use client";
// O5: popup "Analyse this field" for the point in useMap().picked → buildLivePack → useApp().usePack.
// Also handles the deep link /app?lat=..&lon=.. (inside Suspense, as Next 16 requires for useSearchParams).
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin, X } from "lucide-react";
import { useMap } from "@/lib/store/map";
import { useApp } from "@/lib/store/app";
import { buildLivePack, fmtCoord } from "@/lib/data/live";
import { Toasts, dismissToast, toast } from "@/components/app/toasts";

async function analyse(lat: number, lon: number): Promise<boolean> {
  let id: number | null = null;
  const say = (msg: string, kind?: "info" | "ok" | "warn") => {
    if (id != null) dismissToast(id);
    id = toast(msg, kind, kind === "info" || !kind ? 0 : 3500);
  };
  try {
    const pack = await buildLivePack(lat, lon, say);
    await useApp.getState().usePack(pack);
    return true;
  } catch (e) {
    if (id != null) dismissToast(id);
    toast(`Could not load this point (${e instanceof Error ? e.message : "error"}). Keeping the current farm.`, "error", 6000);
    return false;
  }
}

function DeepLink() {
  const sp = useSearchParams();
  const done = useRef("");
  const lat = sp.get("lat"), lon = sp.get("lon");
  useEffect(() => {
    if (lat == null || lon == null || done.current === `${lat},${lon}`) return;
    const la = Number(lat), lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return;
    done.current = `${lat},${lon}`;
    void analyse(la, lo);
  }, [lat, lon]);
  return null;
}

export function LiveClick() {
  const picked = useMap((s) => s.picked);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    const p = useMap.getState().picked;
    if (!p) return;
    setBusy(true);
    useMap.getState().setPicked(null);
    await analyse(p.lat, p.lon);
    setBusy(false);
  }, []);

  return (
    <>
      <Suspense fallback={null}><DeepLink /></Suspense>
      {picked && !busy && (
        <div className="fixed bottom-20 left-1/2 z-40 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-line bg-bg-elev p-3 text-fg shadow-xl">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-gold" />
            <p className="flex-1 text-sm">
              Analyse this field at <span className="num">{fmtCoord(picked.lat)}, {fmtCoord(picked.lon)}</span>
            </p>
            <button aria-label="Close" onClick={() => useMap.getState().setPicked(null)} className="text-fg-muted hover:text-fg">
              <X className="size-4" />
            </button>
          </div>
          <button onClick={run} className="mt-2 w-full rounded-full bg-gold px-4 py-2 text-sm font-medium text-bg">
            Analyse this field
          </button>
        </div>
      )}
      <Toasts />
    </>
  );
}
