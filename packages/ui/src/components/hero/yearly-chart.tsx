"use client";
// O3: year-by-year farm net income with the bad-year line.
// Ionut's chart toolkit will replace this; swap only the `renderOption` builder / `EChart` wrapper.
import { BarChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import { useApp } from "@/lib/store/app";
import { fmtMoney } from "@/lib/utils";

echarts.use([BarChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

interface Data { years: number[]; net: number[]; failNet: number; worstYear: number }

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function renderOption(d: Data): echarts.EChartsCoreOption {
  const heat = css("--heat"), leaf = css("--leaf"), fg = css("--fg"), muted = css("--fg-muted"), line = css("--line"), bg = css("--bg-elev");
  return {
    animationDuration: 400,
    grid: { left: 8, right: 12, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      backgroundColor: bg, borderColor: line, textStyle: { color: fg, fontSize: 12 },
      formatter: (p: unknown) => {
        const i = (p as { dataIndex: number }[])[0].dataIndex;
        return `<b>${d.years[i]}</b><br/>${fmtMoney(d.net[i])} /ha${d.net[i] < d.failNet ? " (bad year)" : ""}`;
      },
    },
    xAxis: { type: "category", data: d.years.map(String), axisLine: { lineStyle: { color: line } }, axisTick: { show: false }, axisLabel: { color: muted, fontSize: 11, hideOverlap: true } },
    yAxis: { type: "value", axisLabel: { color: muted, fontSize: 11, formatter: (v: number) => fmtMoney(v) }, splitLine: { lineStyle: { color: line } } },
    series: [{
      type: "bar", barMaxWidth: 28,
      data: d.net.map((v, i) => ({
        value: v,
        itemStyle: { color: v < d.failNet ? heat : leaf, borderRadius: v >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3] },
        ...(d.years[i] === d.worstYear ? { label: { show: true, formatter: `${d.worstYear} worst`, position: v >= 0 ? "top" : "bottom", color: heat, fontSize: 11 } } : {}),
      })),
      markLine: {
        silent: true, symbol: "none", lineStyle: { color: fg, type: "dashed", width: 1.5 },
        label: { formatter: "bad-year line", color: muted, fontSize: 11, position: "insideEndTop" },
        data: [{ yAxis: d.failNet }],
      },
    }],
  };
}

/** Thin ECharts wrapper: owns the instance, ResizeObserver and theme (CSS var) refresh. */
function EChart({ data }: { data: Data }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const latest = useRef(data);
  latest.current = data;

  useEffect(() => {
    const node = el.current!;
    const c = echarts.init(node);
    chart.current = c;
    c.setOption(renderOption(latest.current));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(node);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const retheme = () => c.setOption(renderOption(latest.current));
    mq.addEventListener("change", retheme);
    const mo = new MutationObserver(retheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => { ro.disconnect(); mq.removeEventListener("change", retheme); mo.disconnect(); c.dispose(); chart.current = null; };
  }, []);

  useEffect(() => { chart.current?.setOption(renderOption(data), true); }, [data]);

  return <div ref={el} className="h-64 w-full" role="img" aria-label="Net income per year" />;
}

export function YearlyChart() {
  const base = useApp((s) => s.base);
  const failNet = useApp((s) => s.opts.failNet);
  const computing = useApp((s) => s.computing);
  const data = base ? { years: base.years, net: base.farmNet, failNet, worstYear: base.worstYear } : null;
  const memo = useRef<Data | null>(null);
  if (data && (!memo.current || memo.current.years !== data.years || memo.current.net !== data.net || memo.current.failNet !== failNet)) memo.current = data;

  return (
    <section className="min-w-0 rounded-[var(--radius)] border border-line bg-bg-elev p-5" aria-busy={computing}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm text-fg-muted">Net income per year ($/ha)</h2>
        <span className="text-xs text-fg-muted">red = bad year</span>
      </div>
      {memo.current ? <EChart data={memo.current} /> : <div className="h-64 animate-pulse rounded bg-line" />}
    </section>
  );
}
