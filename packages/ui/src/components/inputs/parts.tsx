"use client";
// Small shared building blocks for the inputs panel.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function Section({ title, hint, defaultOpen = true, children, tour }: { title: string; hint?: string; defaultOpen?: boolean; children: ReactNode; tour?: string }) {
  return (
    <details open={defaultOpen} className="group border-t border-line first:border-t-0" data-tour={tour}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-base font-semibold tracking-tight">{title}</span>
          {hint && <span className="block text-xs text-fg-muted">{hint}</span>}
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 pb-4 pt-1">{children}</div>
    </details>
  );
}

/** Slider with a visible label and value; the Radix thumb gets the accessible name. */
export function Field({
  label, value, min, max, step, format, onChange, help, accent,
}: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void; help?: string; accent?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = ref.current?.querySelector('[role="slider"]');
    t?.setAttribute("aria-label", label);
    t?.setAttribute("aria-valuetext", format(value));
  });
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span id={id} className="text-sm">{label}</span>
        <span className={cn("num text-sm", accent)}>{format(value)}</span>
      </div>
      <div ref={ref} className="py-1">
        <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
      </div>
      {help && <p className="text-xs text-fg-muted">{help}</p>}
    </div>
  );
}

export function Chip({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={active} aria-label={label} onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3 text-sm transition-colors",
        active ? "border-primary bg-primary-soft text-primary" : "border-line text-fg-muted hover:bg-surface-2",
      )}
    >{children}</button>
  );
}

export const inputCls = "h-10 min-w-0 rounded-lg border border-line bg-surface px-2 text-sm text-fg";
