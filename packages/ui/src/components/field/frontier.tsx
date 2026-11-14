"use client";
// Climate risk tab: failure frontier heatmap (SVG, tokens) + tipping-point sentences.
import { useEffect, useMemo, useState } from "react";
import { getEngine, type FrontierResult } from "@/lib/engine";
import { use2050 } from "@/components/hero/hero-card";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import { useF } from "./hooks";
import { frontierAt, shareColor, tippingPoint } from "./numbers";
import { Panel, Skeleton, Spinner } from "./ui";

export function useFrontier() {
  const handle = useApp((s) => s.handle);
  const rotation = useApp((s) => s.rotation);
  const opts = useApp((s) => s.opts);
  const [fr, setFr] = useState<FrontierResult | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!handle || !rotation.length) return;
    let alive = true;
    setBusy(true);
    const timer = setTimeout(() => {
      getEngine().frontier(handle, rotation, opts).then((r) => { if (alive) { setFr(r); setBusy(false); } }).catch(() => { if (alive) setBusy(false); });
    }, 150);
    return () => { alive = false; clearTimeout(timer); };
  }, [handle, rotation, opts]);
  return { fr, busy };
}

const CELL = 44, LEFT = 56, TOP = 14, BOTTOM = 46;

function Heatmap({ fr, tol, t2050, p2050 }: { fr: FrontierResult; tol: number; t2050: number; p2050: number }) {
  const t = useT();
  const f = useF();
  const nC = fr.dTs.length, nR = fr.dPs.length;
  const W = LEFT + nC * CELL + 8, H = TOP + nR * CELL + BOTTOM;
  const xOf = (dT: number) => LEFT + ((Math.max(0, Math.min(fr.dTs[nC - 1], dT)) - fr.dTs[0]) / (fr.dTs[nC - 1] - fr.dTs[0] || 1)) * (nC - 1) * CELL + CELL / 2;
  const yOf = (dP: number) => TOP + (Math.max(0, Math.min(Math.abs(fr.dPs[nR - 1]), Math.abs(dP))) / (Math.abs(fr.dPs[nR - 1]) || 1)) * (nR - 1) * CELL + CELL / 2;

  // contour = every cell edge between a cell above the tolerance and one inside it
  const edges = useMemo(() => {
    const out: string[] = [];
    const over = (r: number, c: number) => (fr.grid[r]?.[c] ?? 0) > tol;
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
      const x = LEFT + c * CELL, y = TOP + r * CELL;
      if (c + 1 < nC && over(r, c) !== over(r, c + 1)) out.push(`M${x + CELL} ${y}v${CELL}`);
      if (r + 1 < nR && over(r, c) !== over(r + 1, c)) out.push(`M${x} ${y + CELL}h${CELL}`);
    }
    return out.join("");
  }, [fr, tol, nR, nC]);

  const tol1 = Math.round(1 / tol);
  const todayX = xOf(0), todayY = yOf(0);
  const x50 = xOf(t2050), y50 = yOf(p2050);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={t("analysis.risk_title")} data-tour="frontier-map">
        <title>{t("analysis.risk_title")}</title>
        {fr.grid.map((row, r) => row.map((v, c) => (
          <rect key={`${r}-${c}`} x={LEFT + c * CELL} y={TOP + r * CELL} width={CELL} height={CELL} fill={shareColor(v, tol)} stroke="var(--surface)" strokeWidth={1}>
            <title>{t("analysis.risk_cell", { dT: f.warm(fr.dTs[c]), rain: f.rainCut(fr.dPs[r]), share: f.pct(v) })}</title>
          </rect>
        )))}
        {fr.grid.map((row, r) => row.map((v, c) => (
          <text key={`t${r}-${c}`} x={LEFT + c * CELL + CELL / 2} y={TOP + r * CELL + CELL / 2 + 3.5} textAnchor="middle" fontSize={10} className="num" fill="var(--fg)" opacity={0.7} pointerEvents="none">
            {Math.round(v * 100)}
          </text>
        )))}
        <path d={edges} fill="none" stroke="var(--fg)" strokeWidth={2.5} strokeLinecap="square" />
        {/* markers */}
        <g>
          <circle cx={todayX} cy={todayY} r={9} fill="var(--surface)" stroke="var(--primary)" strokeWidth={3} />
          <text x={todayX + 14} y={todayY - 12} fontSize={11} fontWeight={600} fill="var(--primary)" stroke="var(--surface)" strokeWidth={3} paintOrder="stroke">{t("analysis.risk_today")}</text>
          <path d={`M${x50} ${y50 - 11}l10 10l-10 10l-10 -10z`} fill="var(--surface)" stroke="var(--data)" strokeWidth={3} />
          <text x={x50 + 14} y={y50 + 22} fontSize={11} fontWeight={600} fill="var(--data)" stroke="var(--surface)" strokeWidth={3} paintOrder="stroke">{t("analysis.risk_2050")}</text>
        </g>
        {/* axes */}
        {fr.dTs.map((v, c) => (c % 2 === 0 ? <text key={`x${c}`} x={LEFT + c * CELL + CELL / 2} y={TOP + nR * CELL + 16} textAnchor="middle" fontSize={11} fill="var(--fg-muted)">{`+${f.num(v, 1)}`}</text> : null))}
        {fr.dPs.map((v, r) => (r % 2 === 0 ? <text key={`y${r}`} x={LEFT - 8} y={TOP + r * CELL + CELL / 2 + 4} textAnchor="end" fontSize={11} fill="var(--fg-muted)">{v === 0 ? "0" : `−${Math.round(Math.abs(v) * 100)}`}</text> : null))}
        <text x={LEFT + (nC * CELL) / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--fg)">{t("analysis.risk_heat_axis")} (°C)</text>
        <text transform={`translate(12 ${TOP + (nR * CELL) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="var(--fg)">{t("analysis.risk_rain_axis")} (%)</text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-fg-muted">
        <span className="flex items-center gap-2">
          {t("analysis.risk_legend")}:
          <span className="inline-flex items-center gap-1">{t("analysis.risk_legend_low")}
            <span aria-hidden className="inline-block h-2.5 w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${shareColor(0, tol)}, ${shareColor(tol, tol)}, ${shareColor(0.6, tol)})` }} />
            {t("analysis.risk_legend_high")}</span>
        </span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-5 bg-fg" style={{ height: 3 }} />{t("analysis.risk_contour", { tol: tol1 })}</span>
      </figcaption>
      <table className="sr-only">
        <caption>{t("analysis.risk_table")}</caption>
        <thead><tr><th />{fr.dTs.map((d) => <th key={d} scope="col">{f.warm(d)}</th>)}</tr></thead>
        <tbody>{fr.grid.map((row, r) => <tr key={r}><th scope="row">{f.rainCut(fr.dPs[r])}</th>{row.map((v, c) => <td key={c}>{f.pct(v)}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}

export function TippingSentences({ fr }: { fr: FrontierResult }) {
  const t = useT();
  const f = useF();
  const tol = useApp((s) => s.opts.failShare);
  const p = use2050();
  const tp = useMemo(() => tippingPoint(fr, tol), [fr, tol]);
  const share2050 = frontierAt(fr, p.dT, p.dP);
  const lines: string[] = [];
  if (tp.over) lines.push(t("analysis.tip_over"));
  else {
    lines.push(tp.heat != null ? t("analysis.tip_heat", { dT: f.warm(tp.heat) }) : t("analysis.tip_none_heat"));
    lines.push(tp.rain != null ? t("analysis.tip_rain", { dP: `${f.num(tp.rain * 100)} %` }) : t("analysis.tip_none_rain"));
  }
  lines.push(t("analysis.tip_2050", {
    dT: f.warm(p.dT), dP: `−${f.num(Math.abs(p.dP) * 100)} %`, share: f.pct(share2050),
    verdict: share2050 > tol ? t("analysis.tip_2050_out") : t("analysis.tip_2050_in"),
  }));
  return (
    <div className="rounded-xl bg-primary-soft p-4" data-tour="tipping-point">
      <h3 className="text-sm font-semibold text-primary">{t("analysis.tip_title")}</h3>
      <ul className="mt-2 space-y-1.5 text-sm leading-snug">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}

export function FrontierPanel() {
  const t = useT();
  const { fr, busy } = useFrontier();
  const tol = useApp((s) => s.opts.failShare);
  const p = use2050();
  return (
    <Panel title={t("analysis.risk_title")} sub={t("analysis.risk_intro")} tour="frontier" aside={busy && fr ? <Spinner label={t("analysis.computing")} /> : null}>
      {!fr ? (
        <div className="space-y-3"><Spinner label={t("analysis.risk_loading")} /><Skeleton className="h-72" /></div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
          <div className="overflow-x-auto"><div className="min-w-[420px]"><Heatmap fr={fr} tol={tol} t2050={p.dT} p2050={Math.abs(p.dP)} /></div></div>
          <TippingSentences fr={fr} />
        </div>
      )}
    </Panel>
  );
}
