"use client";
// "+ Add field": click the map, name it, set hectares and this year's crop. The map is the swap point for the full LandPicker.
import { useState } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { FieldPicker } from "@/components/onboarding/field-map";
import { circlePolygon, FARM_CROPS, newField, useFarm } from "@/lib/store/farm";
import type { CropId } from "@/lib/engine/types";

const inputCls = "h-10 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-3 text-sm outline-none focus:border-primary";

export function AddFieldDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { place, fields, addField, demo } = useFarm();
  const first = fields[0]?.centroid ?? place ?? { lat: 45.9, lon: 25, };
  const [pt, setPt] = useState<{ lat: number; lon: number } | null>(null);
  const [name, setName] = useState(t("onboarding.fieldNameDefault", { n: fields.length + 1 }));
  const [ha, setHa] = useState(20);
  const [crop, setCrop] = useState<CropId>("maize");

  function create() {
    if (!pt) return;
    addField(newField({ name, centroid: pt, areaHa: ha, crop, history: [null, null, null], geometry: circlePolygon(pt, ha), packId: demo && fields[0]?.packId ? fields[0].packId : undefined }));
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgb(20_32_26/0.45)] p-6" role="dialog" aria-modal="true" aria-label={t("workspace.addFieldTitle")}>
      <div className="flex h-[min(640px,100%)] w-[min(960px,100%)] flex-col overflow-hidden rounded-[var(--radius)] border border-line bg-surface shadow-[var(--shadow)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-lg font-semibold tracking-tight">{t("workspace.addFieldTitle")}</h2>
          <button aria-label={t("common.close")} onClick={onClose} className="rounded-full p-1.5 hover:bg-surface-2"><X size={18} /></button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 p-4 md:grid-cols-[280px_1fr]">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">{t("onboarding.fieldName")}
              <input className={`${inputCls} text-fg`} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">{t("onboarding.hectares")}
              <input className={`${inputCls} num text-fg`} type="number" min={0.5} value={ha} onChange={(e) => setHa(Math.max(0.5, +e.target.value || 0.5))} /></label>
            <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">{t("workspace.cropNow")}
              <select className={`${inputCls} text-fg`} value={crop} onChange={(e) => setCrop(e.target.value as CropId)}>
                {FARM_CROPS.map((c) => <option key={c} value={c}>{t(`crops.${c}`)}</option>)}</select></label>
            <p className="text-sm text-fg-muted">{pt ? t("onboarding.fieldPlaced") : t("onboarding.addFieldHint")}</p>
            <Button className="mt-auto" disabled={!pt || !name.trim()} onClick={create}>{t("workspace.create")}</Button>
          </div>
          <FieldPicker center={first} zoom={13} fields={pt ? [...fields, { id: "new", name, centroid: pt, geometry: circlePolygon(pt, ha) }] : fields} selectedId={pt ? "new" : null} onMapClick={setPt} />
        </div>
      </div>
    </div>
  );
}
