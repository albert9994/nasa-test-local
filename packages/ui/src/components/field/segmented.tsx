"use client";
import { cn } from "@/lib/utils";

/** Small segmented control (radio group semantics). */
export function Segmented<T extends string | number>({ value, options, onChange, label, className }: {
  value: T; options: { value: T; label: string }[]; onChange(v: T): void; label: string; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-full border border-line bg-surface p-0.5 text-xs font-medium", className)}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={cn("rounded-full px-3 py-1.5 transition-colors", o.value === value ? "bg-primary text-primary-fg" : "text-fg-muted hover:text-fg")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
