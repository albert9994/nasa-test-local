"use client";
// Thin tree-shaken ECharts wrapper. Colours come from CSS variables (tokens), so charts follow the theme.
import { BarChart, CustomChart, LineChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

echarts.use([BarChart, CustomChart, LineChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

export interface Tokens {
  fg: string; muted: string; line: string; surface: string; primary: string; leaf: string; heat: string; data: string; water: string; warn: string; danger: string; ok: string;
  dataSoft: string;
}

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export function readTokens(): Tokens {
  return {
    fg: css("--fg"), muted: css("--fg-muted"), line: css("--line"), surface: css("--surface"), primary: css("--primary"), leaf: css("--leaf"),
    heat: css("--heat"), data: css("--data"), water: css("--water"), warn: css("--warn"), danger: css("--danger"), ok: css("--ok"), dataSoft: css("--data-soft"),
  };
}

export function baseAxis(k: Tokens) {
  return {
    axisLine: { lineStyle: { color: k.line } }, axisTick: { show: false },
    axisLabel: { color: k.muted, fontSize: 11, hideOverlap: true },
    splitLine: { lineStyle: { color: k.line } },
  };
}
export const tooltipStyle = (k: Tokens) => ({ backgroundColor: k.surface, borderColor: k.line, textStyle: { color: k.fg, fontSize: 12 }, extraCssText: "box-shadow:var(--shadow);border-radius:8px" });

/** `build` returns the ECharts option from the tokens; it re-runs when data or theme change. */
export function EChart({ build, label, className, deps }: { build: (k: Tokens) => echarts.EChartsCoreOption; label: string; className?: string; deps: unknown[] }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const latest = useRef(build);
  latest.current = build;

  useEffect(() => {
    const node = el.current!;
    const c = echarts.init(node);
    chart.current = c;
    const draw = () => c.setOption(latest.current(readTokens()), true);
    draw();
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(node);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => { ro.disconnect(); mo.disconnect(); c.dispose(); chart.current = null; };
  }, []);

  useEffect(() => { chart.current?.setOption(latest.current(readTokens()), true); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return <div ref={el} className={cn("h-64 w-full", className)} role="img" aria-label={label} />;
}
