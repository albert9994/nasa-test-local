"use client";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CROPS, cropName, rotationLabel, type CropId, type Rotation } from "@/lib/engine";
import { useApp } from "@/lib/store/app";
import { inputCls } from "./parts";

const IDS = Object.keys(CROPS) as CropId[];
const MAX = 4;

export function RotationBuilder() {
  const rotation = useApp((s) => s.rotation);
  const setRotation = useApp((s) => s.setRotation);
  const mode = useApp((s) => s.mode);
  const set = (i: number, p: Partial<Rotation[number]>) => setRotation(rotation.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const label = rotation.length ? rotationLabel(rotation) : "no crops yet";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" aria-live="polite">{rotation.length > 1 ? "Your plan, repeating: " : "Your crop: "}<span className="font-medium">{label}</span></p>
      <ul className="flex flex-col gap-2">
        {rotation.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bg p-2">
            <span className="num w-14 text-xs text-fg-muted">Year {i + 1}</span>
            <select
              aria-label={`Crop for year ${i + 1}`} value={s.crop} onChange={(e) => set(i, { crop: e.target.value as CropId })}
              className={`${inputCls} flex-1 basis-28`}
            >
              {IDS.map((c) => <option key={c} value={c}>{cropName(c)}</option>)}
            </select>
            <label className="flex min-h-9 items-center gap-1.5 text-sm">
              <input
                type="checkbox" className="size-4 accent-[var(--leaf)]" checked={s.cover}
                onChange={(e) => set(i, { cover: e.target.checked })}
              />
              {mode === "farmer" ? "Rye cover after" : "Rye cover"}
              <span className="sr-only"> year {i + 1}</span>
            </label>
            <button
              type="button" aria-label={`Remove year ${i + 1}`} disabled={rotation.length <= 1}
              onClick={() => setRotation(rotation.filter((_, j) => j !== i))}
              className="ml-auto grid size-9 place-items-center rounded-full text-fg-muted hover:bg-bg-elev disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            ><X className="size-4" aria-hidden /></button>
          </li>
        ))}
      </ul>
      <Button
        variant="outline" className="h-9 self-start" disabled={rotation.length >= MAX}
        onClick={() => setRotation([...rotation, { crop: rotation.length ? rotation[rotation.length - 1].crop : "maize", cover: false }])}
      ><Plus className="size-4" aria-hidden /> Add a year</Button>
    </div>
  );
}
