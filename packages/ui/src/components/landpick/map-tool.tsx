"use client";
// The free map tool: map + land selection + field snapshot panel (right column on desktop, bottom sheet on phones) + walkthrough.
// Framework-neutral: the host passes the header and the desktop-app link.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronUp, Link2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Tour, type TourStep } from "@/components/tour/tour";
import { FieldSnapshot, DesktopCta } from "@/components/field-snapshot";
import { landOf, type SavedField } from "@/lib/geo/saved";
import { buildMapSearch, parseMapUrl } from "@/lib/geo/url-state";
import type { Land } from "@/lib/geo/land";
import { LandPicker, type MapView } from "./land-picker";

export interface MapToolProps {
  /** Rendered above the map (logo, language switch, …). */
  header?: ReactNode;
  /** Where "See the desktop app" points. */
  desktopHref: string;
  /** Sync the selection and view to the address bar so a link reproduces them (web only). Default true. */
  syncUrl?: boolean;
}

export const MAP_TOUR_ID = "map-tool";

export function MapTool({ header, desktopHref, syncUrl = true }: MapToolProps) {
  const t = useT();
  const [ready, setReady] = useState(false);
  const [tourReady, setTourReady] = useState(false);
  const [land, setLand] = useState<Land | null>(null);
  const [ndvi, setNdvi] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [copied, setCopied] = useState(false);
  const [initialView, setInitialView] = useState<MapView | undefined>();
  const [fromUrl, setFromUrl] = useState(false);
  const view = useRef<MapView | null>(null);

  // read ?lat&lon&zoom&f= once on the client
  useEffect(() => {
    const u = parseMapUrl(window.location.search);
    if (u.land) { setLand(u.land); setFromUrl(true); setSheet(true); }
    if (u.ndvi) setNdvi(true);
    if (u.lat != null && u.lon != null) setInitialView({ lat: u.lat, lon: u.lon, zoom: u.zoom ?? 14 });
    setReady(true);
  }, []);

  // the walkthrough points at elements inside the lazily loaded map, so wait until they exist
  useEffect(() => {
    if (!ready) return;
    let tries = 0;
    const id = setInterval(() => {
      if (document.querySelector('[data-tour="search"]') || ++tries > 40) { clearInterval(id); setTourReady(true); }
    }, 150);
    return () => clearInterval(id);
  }, [ready]);

  // write it back (debounced)
  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const writeUrl = useCallback((l: Land | null, nd: boolean) => {
    if (!syncUrl || !view.current) return;
    clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      const v = view.current!;
      const q = buildMapSearch({ ...v, land: l, ndvi: nd });
      try { window.history.replaceState(window.history.state, "", `${window.location.pathname}?${q}${window.location.hash}`); } catch { /* ignore */ }
    }, 400);
  }, [syncUrl]);
  useEffect(() => { writeUrl(land, ndvi); }, [land, ndvi, writeUrl]);
  useEffect(() => () => clearTimeout(writeTimer.current), []);

  const onView = useCallback((v: MapView) => { view.current = v; writeUrl(land, ndvi); }, [land, ndvi, writeUrl]);
  const onLand = useCallback((l: Land | null) => { setLand(l); if (l) setSheet(true); }, []);
  const openSaved = useCallback((s: SavedField) => { const l = landOf(s); if (l) { setLand(l); setSheet(true); } }, []);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const steps: TourStep[] = useMemo(() => [
    { target: "search", titleKey: "mapTool.tourSearchT", bodyKey: "mapTool.tourSearchB", placement: "bottom", onEnter: () => setSheet(false) },
    { target: "modes", titleKey: "mapTool.tourModesT", bodyKey: "mapTool.tourModesB", placement: "bottom" },
    { target: "snapshot", titleKey: "mapTool.tourSnapshotT", bodyKey: "mapTool.tourSnapshotB", placement: "left", onEnter: () => setSheet(true) },
    { target: "impact", titleKey: "mapTool.tourImpactT", bodyKey: "mapTool.tourImpactB", placement: "left", onEnter: () => setSheet(true) },
    { target: "desktop-cta", titleKey: "mapTool.tourDesktopT", bodyKey: "mapTool.tourDesktopB", placement: "left", onEnter: () => setSheet(true) },
  ], []);

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-bg">
      {header}
      <div className="relative min-h-0 flex-1 md:grid md:grid-cols-[minmax(0,1fr)_25rem] lg:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="relative h-full min-h-0">
          {ready && <LandPicker land={land} onLandChange={onLand} initialView={initialView} onViewChange={onView} ndvi={ndvi} onNdviChange={setNdvi} />}
        </div>
        <aside
          data-tour="snapshot"
          aria-label={t("mapTool.panelTitle")}
          className={cn(
            "z-30 flex min-h-0 flex-col bg-bg",
            "md:static md:h-auto md:border-l md:border-line",
            "max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-3xl max-md:border-t max-md:border-line max-md:shadow-[0_-12px_32px_-12px_rgb(20_32_26/0.3)] max-md:transition-[height] max-md:duration-300",
            sheet ? "max-md:h-[58%]" : "max-md:h-[84px]",
          )}
        >
          <button type="button" onClick={() => setSheet(!sheet)} aria-expanded={sheet} aria-label={sheet ? t("mapTool.panelCollapse") : t("mapTool.panelExpand")}
            className="flex w-full flex-col items-center gap-1 pb-1 pt-2.5 md:hidden">
            <span className="h-1 w-10 rounded-full bg-line-strong" />
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              {land ? t("mapTool.snapshotTitle") : t("mapTool.emptyTitle")}
              {land && <span className="num font-normal text-fg-muted">· {t("mapTool.areaShort", { ha: land.areaHa < 10 ? land.areaHa.toFixed(1) : Math.round(land.areaHa) })}</span>}
              <ChevronUp className={cn("size-4 text-fg-muted transition-transform", sheet && "rotate-180")} />
            </span>
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <FieldSnapshot
              land={land}
              ndvi={ndvi}
              onNdviChange={setNdvi}
              onClear={() => setLand(null)}
              footer={
                <div className={cn("space-y-3", land ? "px-4 pb-6 sm:px-5" : "px-5 pb-6")}>
                  <DesktopCta land={land} href={desktopHref} onOpenSaved={openSaved} />
                  {land && (
                    <button type="button" onClick={copyLink} className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
                      <Link2 className="size-4" />{copied ? t("mapTool.linkCopied") : t("mapTool.copyLink")}
                    </button>
                  )}
                </div>
              }
            />
          </div>
        </aside>
      </div>
      {tourReady && <Tour id={MAP_TOUR_ID} steps={steps} autoStart={!fromUrl} />}
    </div>
  );
}
