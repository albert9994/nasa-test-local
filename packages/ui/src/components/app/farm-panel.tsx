"use client";
// O1: farm info (name, coordinates, soil texture, climate normals, data sources). Tolerates missing soil/ndvi/scenarios.
import { useMemo } from "react";
import { useF } from "@/components/field/hooks";
import { localName, useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import type { FarmPack, SoilProp } from "@/lib/engine";

const SOURCE_LINKS: Record<string, { label: string; href: string }> = {
  weather: { label: "NASA POWER", href: "https://power.larc.nasa.gov/" },
  soil: { label: "ISRIC SoilGrids", href: "https://soilgrids.org/" },
  ndvi: { label: "NASA MODIS (ORNL DAAC)", href: "https://modis.ornl.gov/" },
  scenarios: { label: "CMIP6 / NEX-GDDP", href: "https://www.nccs.nasa.gov/services/data-collections/land-based-products/nex-gddp-cmip6" },
};

function topsoilMean(p?: SoilProp): number | null {
  const v = p?.["0-5cm"]?.mean ?? p?.["5-15cm"]?.mean ?? p?.["15-30cm"]?.mean;
  return typeof v === "number" ? v : null;
}

function soilTexture(pack: FarmPack, t: ReturnType<typeof useT>, num: (v: number) => string): string {
  const sand = topsoilMean(pack.soil?.sand), clay = topsoilMean(pack.soil?.clay);
  if (sand == null || clay == null) return t("farm.default_loam");
  const silt = 100 - sand - clay;
  const k = clay >= 40 ? "clay" : clay >= 27 ? (sand > 45 ? "sandy_clay_loam" : "clay_loam")
    : sand >= 70 ? "sandy_loam" : silt >= 50 ? "silt_loam" : "loam";
  return `${t(`farm.t_${k}`)} (${num(Math.round(sand))} % ${t("farm.sand")}, ${num(Math.round(clay))} % ${t("farm.clay")})`;
}

function normals(pack: FarmPack) {
  const years = Object.keys(pack.weather ?? {}).sort();
  let tSum = 0, tN = 0, rain = 0;
  for (const y of years) {
    const w = pack.weather[y];
    w.tmax.forEach((t, i) => { tSum += (t + (w.tmin[i] ?? t)) / 2; tN++; });
    rain += w.prcp.reduce((a, b) => a + b, 0);
  }
  return {
    n: years.length, first: years[0], last: years[years.length - 1],
    temp: tN ? tSum / tN : null, rain: years.length ? rain / years.length : null,
  };
}

export function FarmPanel() {
  const t = useT();
  const f = useF();
  const pack = useApp((s) => s.pack);
  const n = useMemo(() => (pack ? normals(pack) : null), [pack]);
  if (!pack || !n) return null;
  const { meta } = pack;
  const rows: [string, string][] = [
    [t("farm.coords"), `${f.num(meta.lat, 2)}°, ${f.num(meta.lon, 2)}°`],
    [t("farm.elevation"), meta.elev != null ? `${f.num(meta.elev)} m` : t("farm.na")],
    [t("farm.slope"), meta.slope != null ? `${f.num(meta.slope, 1)}°` : t("farm.na")],
    [t("farm.soil"), soilTexture(pack, t, f.num)],
    [t("farm.mean_temp"), n.temp != null ? `${f.num(n.temp, 1)} °C` : t("farm.na")],
    [t("farm.annual_rain"), n.rain != null ? `${f.num(n.rain)} mm` : t("farm.na")],
    [t("farm.years_data"), n.n ? `${n.n} (${n.first}–${n.last})` : t("farm.none")],
  ];
  const sources = Object.entries(meta.sources ?? {});
  return (
    <section className="rounded-[var(--radius)] border border-line bg-surface p-4 text-sm shadow-[var(--shadow)]">
      <h2 className="text-lg font-semibold leading-tight tracking-tight">{localName(meta, t.locale)}</h2>
      {meta.note && <p className="mt-1 text-fg-muted">{meta.note}</p>}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-muted">{k}</dt>
            <dd className="num min-w-0 break-words text-right">{v}</dd>
          </div>
        ))}
      </dl>
      {sources.length > 0 && (
        <div className="mt-3 border-t border-line pt-2 text-xs text-fg-muted">
          <p className="mb-1 font-medium text-fg">{t("farm.sources")}</p>
          <ul className="space-y-1">
            {sources.map(([k, desc]) => {
              const l = SOURCE_LINKS[k];
              return (
                <li key={k}>
                  {l ? <a href={l.href} target="_blank" rel="noreferrer" className="text-data underline">{l.label}</a> : <span className="text-fg">{k}</span>}
                  <span>{`: ${desc}`}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
