"use client";
import { Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Speed } from "@/lib/store/replay";
import { fmtDate, monthTicks } from "./calendar";

interface Props {
  years: number[];
  year: number;
  days: number;
  day: number;
  playing: boolean;
  speed: Speed;
  worstYear?: number;
  onYear(y: number): void;
  onDay(d: number): void;
  onToggle(): void;
  onRestart(): void;
  onSpeed(s: Speed): void;
}

export function ReplayControls(p: Props) {
  const ticks = monthTicks(p.year);
  const atEnd = p.day >= p.days - 1;
  return (
    <div className="sticky top-0 z-10 -mx-1 rounded-xl border border-line bg-bg-elev/95 p-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Year</span>
          <select
            value={p.year}
            onChange={(e) => p.onYear(Number(e.target.value))}
            className="num rounded-md border border-line bg-bg px-2 py-1 text-sm"
          >
            {p.years.map((y) => (
              <option key={y} value={y}>{y}{y === p.worstYear ? " (worst)" : ""}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button" onClick={p.onToggle}
            aria-label={p.playing ? "Pause" : atEnd ? "Replay" : "Play"}
            className="flex size-9 items-center justify-center rounded-full bg-gold text-primary-fg transition-transform active:scale-95"
          >
            {p.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button
            type="button" onClick={p.onRestart} aria-label="Restart"
            className="flex size-9 items-center justify-center rounded-full border border-line text-fg-muted hover:text-fg"
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
        <div role="group" aria-label="Speed" className="flex overflow-hidden rounded-md border border-line text-xs">
          {([1, 2, 4] as Speed[]).map((s) => (
            <button
              key={s} type="button" onClick={() => p.onSpeed(s)} aria-pressed={p.speed === s}
              className={cn("num px-2.5 py-1.5", p.speed === s ? "bg-fg text-bg" : "text-fg-muted hover:text-fg")}
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="num ml-auto text-sm" aria-live="off">{fmtDate(p.year, p.day)}</div>
      </div>
      <div className="relative mt-2">
        <input
          type="range" min={0} max={p.days - 1} step={1} value={p.day}
          onChange={(e) => p.onDay(Number(e.target.value))}
          aria-label="Day of the replay"
          className="block h-5 w-full cursor-pointer accent-[var(--gold)]"
        />
        <div className="pointer-events-none relative h-3 text-[10px] text-fg-muted">
          {ticks.map((m) => (
            <span key={m.day} className="absolute -translate-x-1/2" style={{ left: `${(m.day / (p.days - 1)) * 100}%` }}>{m.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
