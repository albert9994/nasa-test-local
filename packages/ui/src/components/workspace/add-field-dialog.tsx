"use client";
// "+ Add field": select the land exactly like on the website (click an OSM farmland parcel, draw the outline, or drop a
// circle), then name it and set the crops. The selected outline becomes the field's geometry.
import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LandPicker } from "@/components/landpick/land-picker";
import { landPolygon, polygonRing, type Land } from "@/lib/geo/land";
import { FARM_CROPS, newField, useFarm } from "@/lib/store/farm";
import type { CropId } from "@/lib/engine/types";

export const fieldInputCls = "h-10 w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface px-3 text-sm text-fg outline-none transition-colors hover:border-fg-subtle focus:border-primary focus:ring-3 focus:ring-primary/15";

export function CropSelect({ value, onChange, allowUnknown, label, className }: { value: CropId | null; onChange(c: CropId | null): void; allowUnknown?: boolean; label: string; className?: string }) {
  const t = useT();
  return (
    <select aria-label={label} className={cn(fieldInputCls, "cursor-pointer", className)} value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as CropId | null)}>
      {allowUnknown && <option value="">{t("onboarding.unknown")}</option>}
      {FARM_CROPS.map((c) => <option key={c} value={c}>{t(`crops.${c}`)}</option>)}
    </select>
  );
}

export function AddFieldDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const { place, fields, addField, demo } = useFarm();
  const first = fields[0]?.centroid ?? place ?? { lat: 45.9, lon: 25 };
  const [land, setLand] = useState<Land | null>(null);
  const [name, setName] = useState(t("onboarding.fieldNameDefault", { n: fields.length + 1 }));
  const [crop, setCrop] = useState<CropId>("maize");
  const [history, setHistory] = useState<(CropId | null)[]>([null, null, null]);
  const existing = useMemo(() => fields.flatMap((f) => { const ring = polygonRing(f.geometry); return ring ? [{ id: f.id, name: f.name, ring }] : []; }), [fields]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function create() {
    if (!land || !name.trim()) return;
    addField(newField({
      name: name.trim(), centroid: land.centroid, areaHa: Math.round(land.areaHa * 10) / 10, crop, history, geometry: landPolygon(land),
      packId: demo && fields[0]?.packId ? fields[0].packId : undefined,
    }));
    onClose();
  }
  const ha = land ? land.areaHa.toLocaleString(locale === "ro" ? "ro-RO" : "en-US", { maximumFractionDigits: 1 }) : null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-scrim p-6 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={t("workspace.addFieldTitle")}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-full max-h-[820px] w-full max-w-[1280px] overflow-hidden rounded-[var(--radius)] border border-line bg-surface shadow-[var(--shadow-lg)]">
        <div className="relative min-w-0 flex-1">
          <LandPicker land={land} onLandChange={setLand} existing={existing} initialView={{ lat: first.lat, lon: first.lon, zoom: 14 }} />
        </div>
        <div className="flex w-[340px] shrink-0 flex-col border-l border-line">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t("workspace.addFieldTitle")}</h2>
              <p className="mt-1 text-sm text-fg-muted">{t("workspace.pickLandBody")}</p>
            </div>
            <button type="button" aria-label={t("common.close")} onClick={onClose} className="-mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg"><X className="size-4" aria-hidden /></button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <div className={cn("rounded-xl border p-3.5", land ? "border-primary/40 bg-primary-soft" : "border-dashed border-line-strong")}>
              <p className="text-xs font-medium text-fg-muted">{t("workspace.landArea")}</p>
              {land ? (
                <p className="mt-0.5 flex items-center gap-2 text-2xl font-semibold tracking-tight"><span className="num">{ha}</span><span className="text-base font-medium text-fg-muted">ha</span><Check className="ml-auto size-5 text-primary" aria-hidden /></p>
              ) : <p className="mt-0.5 text-sm text-fg-muted">{t("workspace.landNone")}</p>}
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">{t("onboarding.fieldName")}
              <input className={cn(fieldInputCls, "font-normal")} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">{t("workspace.cropNow")}
              <CropSelect className="font-normal" label={t("workspace.cropNow")} value={crop} onChange={(c) => setCrop(c ?? "maize")} />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium">{t("onboarding.cropsTitle")}</legend>
              {[2, 1, 0].map((i) => (
                <label key={i} className="grid grid-cols-[96px_1fr] items-center gap-2 text-xs text-fg-muted">
                  {i === 2 ? t("onboarding.lastYear") : t("onboarding.yearsAgo", { n: 3 - i })}
                  <CropSelect allowUnknown label={i === 2 ? t("onboarding.lastYear") : t("onboarding.yearsAgo", { n: 3 - i })} value={history[i]}
                    onChange={(c) => setHistory((h) => h.map((x, j) => (j === i ? c : x)))} />
                </label>
              ))}
            </fieldset>
          </div>
          <div className="flex gap-2 border-t border-line p-4">
            <Button variant="outline" className="flex-1" onClick={onClose}>{t("common.back")}</Button>
            <Button className="flex-1" disabled={!land || !name.trim()} onClick={create}>{t("workspace.create")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
