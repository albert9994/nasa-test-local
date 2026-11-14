"use client";
// Framed preview of the free map tool for the hero: real Esri World Imagery tiles (Bărăgan) + an example field card.
// The numbers are a real run of the engine on NASA POWER 2001–2025 for that area and are labelled "Example".
import { useT } from "@/lib/i18n";

const Z = 14;
const LAT = 44.55, LON = 27.45;
const tile = (lat: number, lon: number) => {
  const n = 2 ** Z, r = (lat * Math.PI) / 180;
  return { x: Math.floor(((lon + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n) };
};
const t0 = tile(LAT, LON);
const TILES = [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0]].map(([dx, dy]) => ({ x: t0.x + dx, y: t0.y + dy, col: dx + 1, row: dy + 1 }));
/** Days above 35 °C per year, 2001–2025 (NASA POWER, Bărăgan example point). */
const HEAT = [16, 16, 12, 3, 5, 9, 28, 16, 14, 21, 10, 41, 7, 8, 37, 21, 19, 4, 26, 11, 15, 27, 34, 55, 36];

export function ProductPreview() {
  const t = useT();
  const max = Math.max(...HEAT);
  return (
    <figure className="w-full">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_60px_-24px_rgb(20_32_26/0.35)]">
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" />
          <span className="num ml-3 truncate rounded-md bg-surface px-3 py-0.5 text-xs text-fg-muted">{t("site.pvBrowserUrl")}</span>
        </div>
        <div className="grid sm:grid-cols-[1.35fr_1fr]">
          <div className="relative aspect-[4/3] overflow-hidden bg-primary-soft sm:aspect-auto sm:min-h-[340px]">
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-2" aria-hidden>
              {TILES.map((tl) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`${tl.x}-${tl.y}`} alt="" loading="eager" decoding="async" draggable={false}
                  src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${tl.y}/${tl.x}`}
                  className="size-full object-cover" style={{ gridColumn: tl.col + 1, gridRow: tl.row + 1 }} />
              ))}
            </div>
            <svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden>
              <polygon points="92,58 196,48 214,122 118,146 84,108" fill="rgb(255 255 255 / 0.16)" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
              {[[92, 58], [196, 48], [214, 122], [118, 146], [84, 108]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="4" fill="#fff" stroke="#1f5135" strokeWidth="2" />)}
            </svg>
            <span className="absolute left-3 top-3 rounded-full bg-surface/95 px-3 py-1 text-xs font-medium shadow">{t("site.pvPlace")}</span>
            <span className="absolute bottom-3 left-3 rounded-md bg-surface/90 px-2 py-0.5 text-[11px] text-fg-muted">Esri, Maxar, Earthstar Geographics</span>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{t("mapTool.snapshotTitle")}</span>
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-fg-muted">{t("site.pvExample")}</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-fg-muted">{t("site.pvArea")}</dt><dd className="num font-medium">42 ha</dd></div>
              <div><dt className="text-xs text-fg-muted">{t("site.pvSoil")}</dt><dd className="font-medium">{t("site.pvSoilValue")}</dd></div>
            </dl>
            <div>
              <p className="text-xs text-fg-muted">{t("site.pvHeat")}</p>
              <div className="mt-2 flex h-14 items-end gap-[3px]" aria-hidden>
                {HEAT.map((v, i) => (
                  <span key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: v >= 35 ? "var(--heat)" : "var(--data)", opacity: v >= 35 ? 1 : 0.55 }} />
                ))}
              </div>
              <div className="num mt-1 flex justify-between text-[10px] text-fg-subtle"><span>2001</span><span>2025</span></div>
            </div>
            <div className="rounded-xl border border-line bg-ok-soft p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{t("site.pvRotation")}</span>
                <span className="rounded-full bg-ok px-2.5 py-0.5 text-xs font-medium text-white">{t("site.pvStatus")}</span>
              </div>
              <p className="mt-1 text-xs text-fg-muted">{t("site.pvMargin")}</p>
            </div>
            <p className="num mt-auto text-[11px] text-fg-subtle">{t("site.pvSource")}</p>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-fg-muted">{t("site.pvCaption")}</figcaption>
    </figure>
  );
}
