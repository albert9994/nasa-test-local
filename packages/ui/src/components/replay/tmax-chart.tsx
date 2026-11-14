"use client";
import { monthTicks } from "./calendar";

const W = 600, H = 64, PT = 4, PB = 4;

/** Tmax over the crop's season on the shared calendar, with the heat threshold and the current-day cursor. */
export function TmaxChart({
  year, days, t0, tmax, heat, domain, day,
}: {
  year: number; days: number; t0: number; tmax: number[]; heat: number; domain: [number, number]; day: number;
}) {
  const x = (d: number) => (d / (days - 1)) * W;
  const y = (v: number) => PT + (1 - (v - domain[0]) / (domain[1] - domain[0])) * (H - PT - PB);
  const line = tmax.map((v, i) => `${i ? "L" : "M"}${x(t0 + i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const hotPath = tmax.map((v, i) => (v > heat ? `M${x(t0 + i).toFixed(1)} ${y(v).toFixed(1)}h1.6v${(y(heat) - y(v)).toFixed(1)}h-1.6z` : "")).join("");
  const xe = x(t0 + tmax.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Daily maximum temperature, heat threshold ${heat} °C`}>
      {monthTicks(year).map((m) => (
        <line key={m.day} x1={x(m.day)} x2={x(m.day)} y1={0} y2={H} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      <rect x={x(t0)} y={PT} width={Math.max(0, xe - x(t0))} height={H - PT - PB} fill="var(--leaf)" opacity={0.07} />
      <line x1={x(t0)} x2={xe} y1={y(heat)} y2={y(heat)} stroke="var(--heat)" strokeWidth={1.2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
      <path d={hotPath} fill="var(--heat)" opacity={0.55} />
      <path d={line} fill="none" stroke="var(--fg)" strokeWidth={1.2} opacity={0.75} vectorEffect="non-scaling-stroke" />
      <line x1={x(day)} x2={x(day)} y1={0} y2={H} stroke="var(--gold)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
