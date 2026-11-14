"use client";
// O1: farm info (name, coordinates, soil texture, climate normals, data sources). Tolerates missing soil/ndvi/scenarios.
import { useMemo } from "react";
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

function soilTexture(pack: FarmPack): string {
  const sand = topsoilMean(pack.soil?.sand), clay = topsoilMean(pack.soil?.clay);
  if (sand == null || clay == null) return "default loam";
  const silt = 100 - sand - clay;
  const name = clay >= 40 ? "clay" : clay >= 27 ? (sand > 45 ? "sandy clay loam" : "clay loam")
    : sand >= 70 ? "sandy loam" : silt >= 50 ? "silt loam" : "loam";
  return `${name} (${Math.round(sand)}% sand, ${Math.round(clay)}% clay)`;
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
  const pack = useApp((s) => s.pack);
  const n = useMemo(() => (pack ? normals(pack) : null), [pack]);
  if (!pack || !n) return null;
  const { meta } = pack;
  const rows: [string, string][] = [
    ["Coordinates", `${meta.lat.toFixed(2)}°, ${meta.lon.toFixed(2)}°`],
    ["Elevation", meta.elev != null ? `${Math.round(meta.elev)} m` : "n/a"],
    ["Slope", meta.slope != null ? `${meta.slope}°` : "n/a"],
    ["Soil", soilTexture(pack)],
    ["Mean temperature", n.temp != null ? `${n.temp.toFixed(1)} °C` : "n/a"],
    ["Annual rain", n.rain != null ? `${Math.round(n.rain)} mm` : "n/a"],
    ["Years of data", n.n ? `${n.n} (${n.first}–${n.last})` : "none"],
  ];
  const sources = Object.entries(meta.sources ?? {});
  return (
    <section className="rounded-[var(--radius)] border border-line bg-bg-elev p-4 text-sm">
      <h2 className="display text-lg leading-tight">{meta.name}</h2>
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
          <p className="mb-1 font-medium text-fg">Data sources</p>
          <ul className="space-y-1">
            {sources.map(([k, desc]) => {
              const l = SOURCE_LINKS[k];
              return (
                <li key={k}>
                  {l ? <a href={l.href} target="_blank" rel="noreferrer" className="text-water underline">{l.label}</a> : <span className="text-fg">{k}</span>}
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
