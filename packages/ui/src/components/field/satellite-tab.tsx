"use client";
// Satellite tab: HLS series + AI crop mix for the open farm (SatellitePanel) and an honest note on how good the crop map is.
import { CropMapBadge, SatellitePanel, isPrithvi, useCropMap, useCropMeta, useHlsSeries, type Ring } from "@/components/satellite";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import { useFarm } from "@/lib/store/farm";

export function SatelliteTab() {
  const t = useT();
  const farm = useApp((s) => s.pack?.meta.id ?? null);
  const ring = useFarm((s) => {
    const f = s.fields.find((x) => x.id === s.selectedId);
    return f?.geometry && f.packId === farm ? (f.geometry.coordinates[0] as Ring) : null;
  });
  const hls = useHlsSeries(farm ?? "", "/data/layers");
  const cm = useCropMap(farm ?? "", "/data/layers");
  const meta = useCropMeta(farm ?? "", "/data/layers");
  if (!farm) return null;
  if (hls.status === "loading" || cm.status === "loading") return <div data-slot="satellite" className="h-24 animate-pulse rounded-[var(--radius)] bg-surface-2" />;
  if (hls.status === "missing" && cm.status === "missing") {
    return <p data-slot="satellite" className="rounded-[var(--radius)] border border-dashed border-line-strong p-6 text-sm text-fg-muted">{t("satellite.noSatellite")}</p>;
  }
  const m = meta.status === "ok" ? meta.data : null;
  const showHonest = !!m && isPrithvi(m) && m.accuracy != null && m.macroF1 != null;
  const d = m && m.macroF1 != null && m.baselineMacroF1 != null ? m.baselineMacroF1 - m.macroF1 : null;
  const cmp = d == null ? null : Math.abs(d) <= 0.03 ? "similar" : d > 0 ? "higher" : "lower";
  const n2 = (v: number) => v.toFixed(2);
  return (
    <div data-slot="satellite" className="flex min-w-0 flex-col gap-4">
      <SatellitePanel farm={farm} field={ring} />
      {showHonest && m && (
        <section className="rounded-[var(--radius)] border border-line bg-surface p-4 text-sm shadow-[var(--shadow)]" data-testid="cropmap-honesty">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold">{t("satellite.honestTitle")}</h3>
            <CropMapBadge meta={m} />
          </div>
          <ul className="mt-2 space-y-1 text-fg-muted">
            <li>{t("satellite.honestMetrics", { acc: n2(m.accuracy!), f1: n2(m.macroF1!) })}</li>
            {cmp && <li>{t("satellite.honestBaseline", { bf1: n2(m.baselineMacroF1!), cmp: t(`satellite.cmp_${cmp}`) })}</li>}
            <li>{t("satellite.honestScope")}</li>
          </ul>
        </section>
      )}
    </div>
  );
}
