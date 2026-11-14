"use client";
import { Plus, X } from "lucide-react";
import { useNames } from "@/components/field/hooks";
import { Button } from "@/components/ui/button";
import { CROPS, type CropId, type Rotation } from "@/lib/engine";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import { inputCls } from "./parts";

const IDS = Object.keys(CROPS) as CropId[];
const MAX = 4;

export function RotationBuilder() {
  const t = useT();
  const names = useNames();
  const rotation = useApp((s) => s.rotation);
  const setRotation = useApp((s) => s.setRotation);
  const mode = useApp((s) => s.mode);
  const set = (i: number, p: Partial<Rotation[number]>) => setRotation(rotation.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const label = rotation.length ? names.rotation(rotation) : t("inputs.no_crops");
  return (
    <div className="flex flex-col gap-3" data-tour="rotation-builder">
      <p className="text-sm" aria-live="polite">{rotation.length > 1 ? t("inputs.plan_repeating") : t("inputs.plan_single")} <span className="font-medium">{label}</span></p>
      <ul className="flex flex-col gap-2">
        {rotation.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2 p-2">
            <span className="num w-16 text-xs text-fg-muted">{t("inputs.year_n", { n: i + 1 })}</span>
            <select aria-label={t("inputs.crop_for_year", { n: i + 1 })} value={s.crop} onChange={(e) => set(i, { crop: e.target.value as CropId })} className={`${inputCls} flex-1 basis-28`}>
              {IDS.map((c) => <option key={c} value={c}>{names.crop(c)}</option>)}
            </select>
            <label className="flex min-h-9 items-center gap-1.5 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--leaf)]" checked={s.cover} onChange={(e) => set(i, { cover: e.target.checked })} />
              {mode === "farmer" ? t("inputs.cover_farmer") : t("inputs.cover_expert")}
              <span className="sr-only"> {t("inputs.year_n", { n: i + 1 })}</span>
            </label>
            <button
              type="button" aria-label={t("inputs.remove_year", { n: i + 1 })} disabled={rotation.length <= 1}
              onClick={() => setRotation(rotation.filter((_, j) => j !== i))}
              className="ml-auto grid size-9 place-items-center rounded-full text-fg-muted hover:bg-surface disabled:opacity-30"
            ><X className="size-4" aria-hidden /></button>
          </li>
        ))}
      </ul>
      <Button variant="outline" className="h-9 self-start" disabled={rotation.length >= MAX}
        onClick={() => setRotation([...rotation, { crop: rotation.length ? rotation[rotation.length - 1].crop : "maize", cover: false }])}>
        <Plus className="size-4" aria-hidden /> {t("inputs.add_year")}
      </Button>
    </div>
  );
}
