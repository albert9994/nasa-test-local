"use client";
// Field-level satellite view: HLS NDVI/NDMI series (this year vs median), crop mix from the AI crop map, honest sources.
// Mount in the analysis panels slot (data-slot="satellite"). Renders nothing when neither layer file exists.
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { CROP_CLASSES, CROP_COLORS, cropShares, doyOf, seriesForYear, yearsOf, type CropClass, type HlsSeries, type Ring } from "./parse";
import { CropMapBadge } from "./crop-map-layer";
import { DEFAULT_DATA_BASE, useCropMap, useCropMeta, useHlsSeries } from "./use-layer-data";

const W = 600, H = 140, L = 30, R = 6, T = 8, B = 16;
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MSTART = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

function SeriesChart({ series, k, year, title, lo, hi }: { series: HlsSeries; k: "ndvi" | "ndmi"; year: number; title: string; lo: number; hi: number }) {
  const t = useT();
  const { cur, med } = useMemo(() => seriesForYear(series, k, year), [series, k, year]);
  if (!cur.length && !med.length) return null;
  const x = (d: number) => L + ((d - 1) / 364) * (W - L - R);
  const y = (v: number) => T + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - T - B);
  const path = (pts: [number, number][]) => pts.map(([d, v], i) => `${i ? "L" : "M"}${x(d).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <figure className="rounded-xl border border-line bg-bg p-3">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="font-medium">{title}</span>
        <span className="flex items-center gap-3 text-fg-muted">
          <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-leaf" />{t("satellite.thisYear", { year })}</span>
          <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-fg-muted/60" />{t("satellite.medianYears")}</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${title} ${year}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={L - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--fg-muted)">{v.toFixed(1)}</text>
          </g>
        ))}
        {MSTART.map((d, i) => <text key={i} x={x(d + 14)} y={H - 3} textAnchor="middle" fontSize={9} fill="var(--fg-muted)">{MONTHS[i]}</text>)}
        {med.length > 1 && <path d={path(med)} fill="none" stroke="var(--fg-muted)" strokeWidth={1} opacity={0.7} vectorEffect="non-scaling-stroke" />}
        {cur.length > 1 && <path d={path(cur)} fill="none" stroke="var(--leaf)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />}
        {cur.map(([d, v]) => <circle key={d} cx={x(d)} cy={y(v)} r={2.4} fill="var(--leaf)" />)}
      </svg>
    </figure>
  );
}

function Pie({ shares }: { shares: Record<CropClass, number> }) {
  const t = useT();
  let a0 = -Math.PI / 2;
  const R0 = 46;
  const arcs = CROP_CLASSES.filter((c) => shares[c] > 0).map((c) => {
    const a1 = a0 + shares[c] * 2 * Math.PI;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number) => `${(50 + R0 * Math.cos(a)).toFixed(2)} ${(50 + R0 * Math.sin(a)).toFixed(2)}`;
    const d = shares[c] >= 0.9999 ? `M50 ${50 - R0}A${R0} ${R0} 0 1 1 49.99 ${50 - R0}Z` : `M50 50L${p(a0)}A${R0} ${R0} 0 ${big} 1 ${p(a1)}Z`;
    a0 = a1;
    return <path key={c} d={d} fill={CROP_COLORS[c]} stroke="var(--surface)" strokeWidth={1} />;
  });
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="size-24 shrink-0" role="img" aria-label="crop mix">{arcs}</svg>
      <ul className="space-y-1 text-xs">
        {CROP_CLASSES.filter((c) => shares[c] > 0).map((c) => (
          <li key={c} className="flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm" style={{ background: CROP_COLORS[c] }} />
            <span>{t(`satellite.class_${c}`)}</span>
            <span className="tabular-nums text-fg-muted">{Math.round(shares[c] * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SatellitePanel({ farm, field = null, year, dataBase = DEFAULT_DATA_BASE, blockKm = 8.2, className = "" }: {
  farm: string;
  /** Outer ring of the field polygon in lon/lat. Without it the whole crop map is summarised. */
  field?: Ring | null;
  year?: number;
  dataBase?: string;
  blockKm?: number;
  className?: string;
}) {
  const t = useT();
  const hls = useHlsSeries(farm, dataBase);
  const cm = useCropMap(farm, dataBase);
  const meta = useCropMeta(farm, dataBase);
  const series = hls.status === "ok" ? hls.data : null;
  const years = useMemo(() => (series ? yearsOf(series) : []), [series]);
  const [picked, setPicked] = useState<number | null>(null);
  const yr = picked ?? (year && years.includes(year) ? year : years[years.length - 1]);

  const crops = useMemo(() => {
    if (cm.status !== "ok") return null;
    if (field) return cropShares(cm.data, field);
    const counts = Object.fromEntries(CROP_CLASSES.map((c) => [c, 0])) as Record<CropClass, number>;
    for (const f of cm.data.features) counts[f.cls]++;
    const n = cm.data.features.length;
    return { n, shares: Object.fromEntries(CROP_CLASSES.map((c) => [c, counts[c] / n])) as Record<CropClass, number> };
  }, [cm, field]);

  if (hls.status === "loading" || cm.status === "loading") return null;
  if (hls.status === "missing" && cm.status === "missing") return null;
  const m = meta.status === "ok" ? meta.data : null;
  const inYear = series && yr ? series.dates.filter((d) => d.startsWith(String(yr))) : [];
  const cmLabel = m ? `${t(`satellite.${m.method.startsWith("prithvi") ? "cropMapBadgePrithvi" : m.method === "worldcereal" ? "cropMapBadgeWc" : "cropMapBadgeCdl"}`)}${m.year ? ` ${m.year}` : ""}` : "";

  return (
    <section className={`space-y-3 rounded-[var(--radius)] border border-line bg-surface p-4 shadow-[var(--shadow)] ${className}`} data-testid="satellite-panel">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t("satellite.panel")}</h3>
        {years.length > 1 && (
          <label className="flex items-center gap-1.5 text-xs text-fg-muted">
            {t("satellite.year")}
            <select value={yr} onChange={(e) => setPicked(Number(e.target.value))} className="rounded border border-line bg-bg px-1.5 py-0.5 text-fg">
              {[...years].reverse().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        )}
      </header>

      {series && yr ? (
        <>
          <SeriesChart series={series} k="ndvi" year={yr} title={t("satellite.ndviTitle")} lo={0} hi={1} />
          <SeriesChart series={series} k="ndmi" year={yr} title={t("satellite.ndmiTitle")} lo={-0.4} hi={0.8} />
          <p className="text-xs text-fg-muted">
            {inYear.length
              ? t("satellite.scenes", { n: inYear.length, date: inYear[inYear.length - 1] })
              : t("satellite.noScenesYear", { year: yr })}
          </p>
          <p className="text-xs text-fg-muted">{t("satellite.block", { size: blockKm })}</p>
        </>
      ) : <p className="text-sm text-fg-muted">{t("satellite.noSeries")}</p>}

      <div className="space-y-2 border-t border-line pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">{t("satellite.cropsInField")}</h4>
          {m && <CropMapBadge meta={m} />}
        </div>
        {crops && crops.n > 0 ? (
          <>
            <Pie shares={crops.shares} />
            <p className="text-xs text-fg-muted">{t("satellite.cropsPatches", { n: crops.n, m: m?.patchMeters ?? 480 })}</p>
          </>
        ) : (
          <p className="text-sm text-fg-muted">{cm.status === "ok" ? t("satellite.outsideCrop") : t("satellite.noCropMap")}</p>
        )}
      </div>

      <p className="text-xs text-fg-subtle">{cm.status === "ok" && cmLabel ? t("satellite.honest", { cm: cmLabel }) : t("satellite.honestNone")}</p>
    </section>
  );
}
