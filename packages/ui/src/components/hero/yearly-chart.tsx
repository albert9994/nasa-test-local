"use client";
// Year-by-year farm income with the bad-year line. Colours from tokens, money via useFormat.
import { useMemo } from "react";
import { useFormat, useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import { EChart, baseAxis, tooltipStyle } from "@/components/field/echart";
import { Panel, Skeleton } from "@/components/field/ui";

export function YearlyChart() {
  const t = useT();
  const f = useFormat();
  const base = useApp((s) => s.base);
  const failNet = useApp((s) => s.opts.failNet);
  const computing = useApp((s) => s.computing);

  const labels = useMemo(() => ({
    bad: t("analysis.chart_bad"), line: t("analysis.chart_bad_line"),
  }), [t]);

  return (
    <Panel
      title={t("analysis.chart_title")} sub={t("analysis.chart_unit")} tour="income-chart"
      aside={
        <span className="flex items-center gap-3 text-xs text-fg-muted">
          <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-leaf" />{t("analysis.chart_legend_ok")}</span>
          <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-heat" />{t("analysis.chart_legend_bad")}</span>
        </span>
      }
    >
      <div aria-busy={computing}>
        {base ? (
          <EChart
            label={t("analysis.chart_aria")}
            deps={[base.years, base.farmNet, failNet, f.locale, f.currency, labels]}
            build={(k) => ({
              animationDuration: 400,
              grid: { left: 8, right: 12, top: 28, bottom: 8, containLabel: true },
              tooltip: {
                trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipStyle(k),
                formatter: (p: unknown) => {
                  const i = (p as { dataIndex: number }[])[0].dataIndex;
                  return `<b>${base.years[i]}</b><br/>${f.money(base.farmNet[i])}${base.farmNet[i] < failNet ? ` (${labels.bad})` : ""}`;
                },
              },
              xAxis: { type: "category", data: base.years.map(String), ...baseAxis(k), splitLine: { show: false } },
              yAxis: { type: "value", ...baseAxis(k), axisLine: { show: false }, axisLabel: { color: k.muted, fontSize: 11, formatter: (v: number) => f.money(v) } },
              series: [{
                type: "bar", barMaxWidth: 28,
                data: base.farmNet.map((v, i) => ({
                  value: v,
                  itemStyle: { color: v < failNet ? k.heat : k.leaf, borderRadius: v >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3] },
                  ...(base.years[i] === base.worstYear ? { label: { show: true, formatter: t("analysis.chart_worst", { year: base.worstYear }), position: v >= 0 ? "top" : "bottom", color: k.heat, fontSize: 11 } } : {}),
                })),
                markLine: {
                  silent: true, symbol: "none", lineStyle: { color: k.fg, type: "dashed", width: 1.2 },
                  label: { formatter: labels.line, color: k.muted, fontSize: 11, position: "insideStartTop", backgroundColor: k.surface, padding: [2, 6], borderRadius: 4 },
                  data: [{ yAxis: failNet }],
                },
              }],
            })}
          />
        ) : <Skeleton className="h-64" />}
      </div>
    </Panel>
  );
}
