"use client";
import { useId } from "react";
import { Sun } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type TankState = "pending" | "ok" | "stress" | "heat";

// Vessel geometry (viewBox 0 0 64 88)
const X0 = 8, X1 = 56, TOP = 6, BOT = 80, H = BOT - TOP;
const vessel = `M${X0} ${TOP} V${BOT - 10} Q${X0} ${BOT} ${X0 + 10} ${BOT} H${X1 - 10} Q${X1} ${BOT} ${X1} ${BOT - 10} V${TOP}`;

/** Animated soil-water tank. fill 0-1. Amber when ks < 0.6 (stress zone below the dashed line); red on heat days. */
export function SoilTank({ fill, state, hot, dim }: { fill: number; state: TankState; hot: boolean; dim?: boolean }) {
  const id = useId();
  const t = useT();
  const f = Math.max(0, Math.min(1, fill));
  const colour = state === "heat" ? "var(--heat)" : state === "stress" ? "var(--warn)" : "var(--water)";
  const y = H * (1 - f);
  return (
    <div className="relative shrink-0" style={{ width: 64, height: 88 }}>
      <svg viewBox="0 0 64 88" width={64} height={88} role="img"
        aria-label={state === "pending" ? t("replay.tank_pending") : t("replay.tank_aria", { pct: Math.round(f * 100) })}
        className={cn(dim && "opacity-70")}>
        <defs>
          <clipPath id={id}><path d={`${vessel} Z`} /></clipPath>
        </defs>
        {state === "pending" ? (
          <>
            <path d={`${vessel}`} fill="none" stroke="var(--line)" strokeWidth={2} strokeDasharray="3 3" />
            <rect x={X0} y={BOT - 12} width={X1 - X0} height={12} rx={4} fill="var(--soil)" opacity={0.25} />
          </>
        ) : (
          <g clipPath={`url(#${id})`}>
            <rect x={X0} y={TOP} width={X1 - X0} height={H} fill="var(--soil)" opacity={0.1} />
            <g style={{ transform: `translateY(${y}px)`, transition: "transform 160ms linear" }}>
              <rect x={X0} y={TOP} width={X1 - X0} height={H} fill={colour} opacity={0.85} style={{ transition: "fill 300ms" }} />
              <rect x={X0} y={TOP} width={X1 - X0} height={2.5} fill="var(--surface)" opacity={0.45} />
            </g>
          </g>
        )}
        {state !== "pending" && (
          <>
            <line x1={X0} x2={X1} y1={TOP + H * 0.7} y2={TOP + H * 0.7} stroke="var(--fg)" strokeWidth={1} strokeDasharray="2 3" opacity={0.45} />
            <path d={vessel} fill="none" stroke="var(--fg)" strokeWidth={2} opacity={0.7} strokeLinecap="round" />
          </>
        )}
      </svg>
      {state !== "pending" && (
        <span className="num absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] leading-none text-fg-muted">{Math.round(f * 100)}%</span>
      )}
      <Sun
        aria-label={hot ? t("replay.heat_aria") : undefined}
        className={cn("absolute -left-1 -top-1 size-4 transition-colors", hot ? "animate-pulse text-heat" : "text-fg-muted/30")}
      />
    </div>
  );
}
