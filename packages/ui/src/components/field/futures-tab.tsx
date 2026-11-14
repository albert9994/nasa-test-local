"use client";
// Futures to 2050: Monte Carlo fan chart, P(bad year), VaR/CVaR, probability of ruin, margin year range.
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getEngine, type QuantResult } from "@/lib/engine";
import { useCurrency, useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import { useAnalysis, type Ssp } from "@/lib/store/analysis";
import { Button } from "@/components/ui/button";
import { EChart, baseAxis, tooltipStyle } from "./echart";
import { fromUsd, toUsd } from "./fmt";
import { useF } from "./hooks";
import { Segmented } from "./segmented";
import { Hint, Panel, Skeleton, Spinner, Stat, inputCls } from "./ui";

export const PATHS = 1000;
const FROM = 2026, TO = 2050;

/** Runs quantSimulate in the engine (worker/WASM/native) with a loading state; debounced; stale runs are dropped. */
export function useQuant() {
  const handle = useApp((s) => s.handle);
  const rotation = useApp((s) => s.rotation);
  const opts = useApp((s) => s.opts);
  const { ssp, cashReserve } = useAnalysis();
  const [res, setRes] = useState<QuantResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const run = useRef(0);
  useEffect(() => {
    if (!handle || !rotation.length) return;
    const my = ++run.current;
    setBusy(true); setError(false);
    const timer = setTimeout(() => {
      getEngine().quantSimulate(handle, [rotation], opts, { paths: PATHS, fromYear: FROM, toYear: TO, ssp, cashReserve, seed: 20260 + nonce })
        .then((r) => { if (my === run.current) { setRes(r[0] ?? null); setBusy(false); } })
        .catch(() => { if (my === run.current) { setError(true); setBusy(false); } });
    }, 400);
    return () => clearTimeout(timer);
  }, [handle, rotation, opts, ssp, cashReserve, nonce]);
  return { res, busy, error, rerun: () => setNonce((n) => n + 1) };
}

function FanChart({ q, failNet }: { q: QuantResult; failNet: number }) {
  const t = useT();
  const f = useF();
  return (
    <EChart
      className="h-72" label={t("analysis.fan_aria")} deps={[q, failNet, f.locale, f.currency]}
      build={(k) => ({
        animationDuration: 500,
        grid: { left: 8, right: 14, top: 20, bottom: 8, containLabel: true },
        tooltip: {
          trigger: "axis", ...tooltipStyle(k),
          formatter: (p: unknown) => {
            const i = (p as { dataIndex: number }[])[0].dataIndex;
            return `<b>${q.years[i]}</b><br/>${t("analysis.fan_p50")}: ${f.money(q.income.p50[i])}<br/>${f.money(q.income.p10[i])} – ${f.money(q.income.p90[i])}`;
          },
        },
        xAxis: { type: "category", data: q.years.map(String), boundaryGap: false, ...baseAxis(k), splitLine: { show: false } },
        yAxis: { type: "value", ...baseAxis(k), axisLine: { show: false }, axisLabel: { color: k.muted, fontSize: 11, formatter: (v: number) => f.money(v) } },
        series: [
          {
            type: "custom", silent: true, z: 1, data: [0],
            renderItem: (_p: unknown, api: { coord(v: number[]): number[] }) => {
              const up = q.years.map((_, i) => api.coord([i, q.income.p90[i]]));
              const down = q.years.map((_, i) => api.coord([i, q.income.p10[i]])).reverse();
              return { type: "polygon", shape: { points: [...up, ...down] }, style: { fill: k.dataSoft, stroke: "none" } };
            },
          },
          { type: "line", name: "p90", data: q.income.p90, showSymbol: false, lineStyle: { color: k.data, width: 1, opacity: 0.45 }, z: 2 },
          { type: "line", name: "p10", data: q.income.p10, showSymbol: false, lineStyle: { color: k.data, width: 1, opacity: 0.45 }, z: 2 },
          {
            type: "line", name: "p50", data: q.income.p50, showSymbol: false, lineStyle: { color: k.data, width: 2.5 }, z: 3,
            markLine: { silent: true, symbol: "none", lineStyle: { color: k.heat, type: "dashed", width: 1.2 }, label: { formatter: t("analysis.fan_bad_line"), color: k.heat, fontSize: 11, position: "insideEndTop" }, data: [{ yAxis: failNet }] },
          },
        ],
      })}
    />
  );
}

function PBadChart({ q, failShare }: { q: QuantResult; failShare: number }) {
  const t = useT();
  const f = useF();
  return (
    <EChart
      className="h-44" label={t("analysis.pbad_aria")} deps={[q, failShare, f.locale]}
      build={(k) => ({
        animationDuration: 500,
        grid: { left: 8, right: 14, top: 14, bottom: 8, containLabel: true },
        tooltip: { trigger: "axis", ...tooltipStyle(k), formatter: (p: unknown) => { const i = (p as { dataIndex: number }[])[0].dataIndex; return `<b>${q.years[i]}</b><br/>${f.pct(q.pBadYear[i])}`; } },
        xAxis: { type: "category", data: q.years.map(String), ...baseAxis(k), splitLine: { show: false } },
        yAxis: { type: "value", min: 0, max: 1, ...baseAxis(k), axisLine: { show: false }, axisLabel: { color: k.muted, fontSize: 11, formatter: (v: number) => f.pct(v) } },
        series: [{
          type: "bar", barMaxWidth: 16, data: q.pBadYear.map((v) => ({ value: v, itemStyle: { color: v > failShare ? k.heat : k.leaf, borderRadius: [3, 3, 0, 0] } })),
          markLine: { silent: true, symbol: "none", lineStyle: { color: k.fg, type: "dashed", width: 1 }, label: { show: false }, data: [{ yAxis: failShare }] },
        }],
      })}
    />
  );
}

/** Range bar from FROM to TO with the p10-p90 span and the median dot. */
function MarginYearBar({ my }: { my: QuantResult["marginYear"] }) {
  const t = useT();
  const span = TO - FROM;
  const pos = (y: number | null) => (y == null ? 100 : Math.max(0, Math.min(100, ((y - FROM) / span) * 100)));
  const a = pos(my.p10), b = pos(my.p90);
  return (
    <div className="mt-3">
      <div className="relative h-3 rounded-full bg-surface-2" role="img" aria-label={t("analysis.kpi_my")}>
        <span className="absolute inset-y-0 rounded-full bg-warn/40" style={{ left: `${a}%`, width: `${Math.max(2, b - a)}%` }} />
        {my.p50 != null && <span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-warn" style={{ left: `${pos(my.p50)}%` }} />}
      </div>
      <div className="num mt-1 flex justify-between text-[11px] text-fg-muted"><span>{FROM}</span><span>{TO}</span></div>
    </div>
  );
}

export function FuturesTab() {
  const t = useT();
  const f = useF();
  const currency = useCurrency((s) => s.currency);
  const failNet = useApp((s) => s.opts.failNet);
  const failShare = useApp((s) => s.opts.failShare);
  const { ssp, setSsp, cashReserve, setCashReserve } = useAnalysis();
  const { res: q, busy, error, rerun } = useQuant();
  const mock = getEngine().kind === "mock";

  const mySentence = !q ? "" : q.marginYear.p50 != null
    ? t("analysis.my_sentence", { p10: q.marginYear.p10 ?? t("analysis.my_beyond"), p50: q.marginYear.p50, p90: q.marginYear.p90 ?? t("analysis.my_beyond") })
    : t("analysis.my_sentence_late");

  return (
    <div className="flex flex-col gap-4">
      <Panel title={t("analysis.fut_title")} sub={t("analysis.fut_intro", { paths: f.num(PATHS) })} tour="futures-controls"
        aside={<Button variant="outline" size="sm" onClick={rerun} disabled={busy}><RefreshCw className="size-3.5" aria-hidden />{t("analysis.fut_run")}</Button>}>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs text-fg-muted">{t("analysis.fut_scenario")}<Hint text={t("analysis.gl_ssp")} /></p>
            <Segmented<Ssp> label={t("analysis.fut_scenario")} value={ssp} onChange={setSsp} options={[{ value: "ssp245", label: t("analysis.ssp_245") }, { value: "ssp585", label: t("analysis.ssp_585") }]} />
          </div>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            <span className="flex items-center gap-1">{t("analysis.fut_reserve")} ({currency}/ha)<Hint text={t("glossary.ruin")} /></span>
            <input type="number" inputMode="decimal" min={0} step={50} className={`${inputCls} num w-32 text-fg`} value={fromUsd(currency, cashReserve)} onChange={(e) => setCashReserve(toUsd(currency, +e.target.value || 0))} />
          </label>
          {mock && <p className="rounded-full bg-warn-soft px-3 py-1 text-xs text-warn">{t("analysis.fut_mock")}</p>}
        </div>
        {busy && <div className="mt-3"><Spinner label={t("analysis.fut_running", { paths: f.num(PATHS) })} /></div>}
        {error && <p role="alert" className="mt-3 text-sm text-danger">{t("analysis.fut_error")}</p>}
      </Panel>

      {!q ? (
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
      ) : (
        <div className={busy ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"} aria-busy={busy}>
          <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="flex min-w-0 flex-col gap-4">
              <Panel title={t("analysis.fan_title", { paths: f.num(PATHS) })} tour="fan-chart"
                aside={<span className="flex items-center gap-3 text-xs text-fg-muted"><span className="flex items-center gap-1"><i className="h-0.5 w-4 bg-data" />{t("analysis.fan_p50")}<Hint text={t("analysis.gl_median")} /></span><span className="flex items-center gap-1"><i className="size-3 rounded-sm bg-data-soft" />{t("analysis.fan_band")}<Hint text={t("analysis.gl_p10p90")} /></span></span>}>
                <FanChart q={q} failNet={failNet} />
              </Panel>
              <Panel title={<span className="flex items-center gap-1">{t("analysis.pbad_title")}<Hint text={t("analysis.gl_pbad")} /></span>}>
                <PBadChart q={q} failShare={failShare} />
              </Panel>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <Panel title={t("analysis.kpi_my")} tour="margin-year" aside={<Hint text={t("analysis.gl_my")} />}>
                <p className="display num text-4xl">{q.marginYear.p50 ?? t("analysis.my_beyond")}</p>
                <p className="mt-1 text-sm text-fg-muted">{mySentence}</p>
                <MarginYearBar my={q.marginYear} />
              </Panel>
              <Panel tour="risk-numbers">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <Stat label={t("analysis.kpi_var")} hint={t("glossary.var95")} value={f.money(q.var95)} tone={q.var95 < failNet ? "danger" : undefined} />
                  <Stat label={t("analysis.kpi_cvar")} hint={t("analysis.gl_cvar")} value={f.money(q.cvar95)} tone={q.cvar95 < 0 ? "danger" : undefined} />
                  <Stat label={t("analysis.kpi_ruin")} hint={t("glossary.ruin")} value={f.pct(q.pRuin, q.pRuin > 0 && q.pRuin < 0.1 ? 1 : 0)} tone={q.pRuin > 0.2 ? "danger" : q.pRuin > 0.05 ? "warn" : "ok"} />
                  <Stat label={t("analysis.kpi_mean")} value={f.money(q.meanAnnual)} />
                  <Stat label={t("analysis.kpi_sd")} hint={t("analysis.gl_sd")} value={f.money(q.sdAnnual)} />
                </dl>
              </Panel>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
