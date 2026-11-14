"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Compact bar chart (one bar per year) with hover read-out. Pure HTML/CSS, no chart library. */
export function YearBars({ years, values, color, accent, accentIndex, format, label, className }: {
  years: number[]; values: number[]; color: string; accent: string; accentIndex?: number;
  format(v: number): string; label: string; className?: string;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  const shown = hi ?? accentIndex ?? null;
  return (
    <div className={className}>
      <div className="num mb-1.5 h-4 text-xs text-fg-muted" aria-live="polite">{shown != null && years[shown] != null ? `${years[shown]}: ${format(values[shown])}` : ""}</div>
      <div className="flex h-16 items-end gap-[3px]" role="img" aria-label={label} onMouseLeave={() => setHi(null)}>
        {values.map((v, i) => (
          <span key={years[i]} onMouseEnter={() => setHi(i)} title={`${years[i]}: ${format(v)}`}
            className={cn("flex-1 rounded-[3px] transition-opacity", hi != null && hi !== i && "opacity-60")}
            style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: i === accentIndex ? accent : color, opacity: i === accentIndex || hi === i ? 1 : 0.6 }} />
        ))}
      </div>
      <div className="num mt-1 flex justify-between text-[10px] text-fg-subtle"><span>{years[0]}</span><span>{years[years.length - 1]}</span></div>
    </div>
  );
}
