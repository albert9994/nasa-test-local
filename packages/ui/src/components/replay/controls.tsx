"use client";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n";
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
  const t = useT();
  const ticks = monthTicks(p.year, t.locale);
  const atEnd = p.day >= p.days - 1;
  return (
    <div className="sticky top-0 z-10 -mx-1 rounded-xl border border-line bg-surface/95 p-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">{t("replay.year")}</span>
          <select
            value={p.year}
            onChange={(e) => p.onYear(Number(e.target.value))}
            className="num h-9 rounded-lg border border-line bg-surface px-2 text-sm"
          >
            {p.years.map((y) => (
              <option key={y} value={y}>{y}{y === p.worstYear ? ` (${t("replay.worst_tag")})` : ""}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button" onClick={p.onToggle}
            aria-label={p.playing ? t("replay.pause") : atEnd ? t("replay.again") : t("replay.play")}
            className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-fg transition-transform active:scale-95"
          >
            {p.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button
            type="button" onClick={p.onRestart} aria-label={t("replay.restart")}
            className="flex size-9 items-center justify-center rounded-full border border-line text-fg-muted hover:text-fg"
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
        <div role="group" aria-label={t("replay.speed")} className="flex overflow-hidden rounded-md border border-line text-xs">
          {([1, 2, 4] as Speed[]).map((s) => (
            <button
              key={s} type="button" onClick={() => p.onSpeed(s)} aria-pressed={p.speed === s}
              className={cn("num px-2.5 py-1.5", p.speed === s ? "bg-primary text-primary-fg" : "text-fg-muted hover:text-fg")}
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="num ml-auto text-sm" aria-live="off">{fmtDate(p.year, p.day, t.locale)}</div>
      </div>
      <div className="relative mt-2">
        <input
          type="range" min={0} max={p.days - 1} step={1} value={p.day}
          onChange={(e) => p.onDay(Number(e.target.value))}
          aria-label={t("replay.day_aria")}
          className="block h-5 w-full cursor-pointer accent-[var(--primary)]"
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
