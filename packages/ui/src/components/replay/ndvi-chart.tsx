"use client";
import { useMemo } from "react";
import type { FarmPack } from "@/lib/engine";

const W = 600, H = 130, L = 26, R = 6, T = 8, B = 16;
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MSTART = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

function median(v: number[]) {
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** MODIS NDVI of the replayed year against the median of all years. Renders nothing if the pack has no NDVI. */
export function NdviChart({ ndvi, year, doy }: { ndvi: FarmPack["ndvi"]; year: number; doy: number | null }) {
  const data = useMemo(() => {
    if (!ndvi || !ndvi[String(year)]) return null;
    const byDoy = new Map<number, number[]>();
    for (const rows of Object.values(ndvi)) for (const [d, v] of rows ?? []) if (v != null) (byDoy.get(d) ?? byDoy.set(d, []).get(d)!).push(v);
    const med = [...byDoy.entries()].sort((a, b) => a[0] - b[0]).map(([d, v]) => [d, median(v)] as [number, number]);
    const cur = ndvi[String(year)].filter((p): p is [number, number] => p[1] != null);
    if (!cur.length) return null;
    return { med, cur };
  }, [ndvi, year]);
  if (!data) return null;

  const x = (d: number) => L + ((d - 1) / 364) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const path = (pts: [number, number][]) => pts.map(([d, v], i) => `${i ? "L" : "M"}${x(d).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  return (
    <figure className="rounded-xl border border-line bg-bg p-3">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="font-medium">Greenness from space (MODIS NDVI)</span>
        <span className="flex items-center gap-3 text-fg-muted">
          <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-leaf" />{year}</span>
          <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-fg-muted/60" />median of all years</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`NDVI ${year} compared with the median year`}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={L - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--fg-muted)">{v.toFixed(v % 0.5 ? 2 : 1)}</text>
          </g>
        ))}
        {MSTART.map((d, i) => (
          <text key={i} x={x(d + 14)} y={H - 3} textAnchor="middle" fontSize={9} fill="var(--fg-muted)">{MONTHS[i]}</text>
        ))}
        <path d={path(data.med)} fill="none" stroke="var(--fg-muted)" strokeWidth={1} opacity={0.7} vectorEffect="non-scaling-stroke" />
        <path d={path(data.cur)} fill="none" stroke="var(--leaf)" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        {data.cur.map(([d, v]) => <circle key={d} cx={x(d)} cy={y(v)} r={1.8} fill="var(--leaf)" />)}
        {doy != null && (
          <line x1={x(Math.min(365, doy))} x2={x(Math.min(365, doy))} y1={T} y2={H - B} stroke="var(--gold)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
    </figure>
  );
}
