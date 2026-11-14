"use client";
import type { ReactNode } from "react";
import { AlertTriangle, Check, Layers, Loader2, MapPin, Minus, X } from "lucide-react";
import { useFormat, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Land } from "@/lib/geo/land";
import { fmtCoord } from "@/lib/data/live";
import { InfoTip } from "./info-tip";
import { YearBars } from "./bars";
import { ImpactCard } from "./impact-card";
import { useFieldSnapshot, type StepState } from "./use-field-snapshot";

export interface FieldSnapshotProps {
  land: Land | null;
  /** Show/hide the NASA NDVI overlay on the map (optional; renders a toggle when provided). */
  ndvi?: boolean;
  onNdviChange?(on: boolean): void;
  onClear?(): void;
  /** Rendered after the analysis (e.g. the desktop CTA and "save field"). */
  footer?: ReactNode;
  className?: string;
}

function Stat({ label, tip, children, className }: { label: string; tip?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="flex items-center gap-0.5 text-xs text-fg-muted">{label}{tip && <InfoTip text={tip} />}</dt>
      <dd className="mt-0.5 text-[15px] font-medium leading-snug">{children}</dd>
    </div>
  );
}

function StepRow({ state, label }: { state: StepState; label: string }) {
  const t = useT();
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="grid size-5 place-items-center">
        {state === "active" ? <Loader2 className="size-4 animate-spin text-primary" /> : state === "ok" ? <Check className="size-4 text-ok" /> : state === "warn" ? <AlertTriangle className="size-4 text-warn" /> : <Minus className="size-4 text-fg-subtle" />}
      </span>
      <span className={cn(state === "wait" ? "text-fg-subtle" : "text-fg")}>{label}{state === "warn" && <span className="text-fg-muted"> ({t("mapTool.stepWarn")})</span>}</span>
    </li>
  );
}

export function EmptySnapshot() {
  const t = useT();
  return (
    <div className="p-5">
      <div className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary"><MapPin className="size-5" /></div>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">{t("mapTool.emptyTitle")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t("mapTool.emptyBody")}</p>
      <ul data-tour="impact" className="mt-5 space-y-2.5 text-sm">
        {["emptyItem1", "emptyItem2", "emptyItem3"].map((k) => (
          <li key={k} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-leaf" /><span>{t(`mapTool.${k}`)}</span></li>
        ))}
      </ul>
    </div>
  );
}

/** Everything we know about the selected land: area, place, elevation, soil, 25-year climate record and the impact card. */
export function FieldSnapshot({ land, ndvi, onNdviChange, onClear, footer, className }: FieldSnapshotProps) {
  const t = useT();
  const f = useFormat();
  const snap = useFieldSnapshot(land);

  if (!land) return <div className={className}><EmptySnapshot />{footer}</div>;
  const d = snap.data;
  const s = d?.stats;
  const heat5 = s ? s.heatDays.slice(-5).reduce((a, b) => a + b, 0) / 5 : 0;
  const heatAll = s ? s.heatDays.reduce((a, b) => a + b, 0) / s.heatDays.length : 0;
  const placeLabel = snap.place ?? `${fmtCoord(land.centroid.lat)}° , ${fmtCoord(land.centroid.lon)}°`;

  return (
    <div className={cn("space-y-4 p-4 sm:p-5", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{t("mapTool.snapshotTitle")}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-fg-muted"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{placeLabel}</span></p>
        </div>
        {onClear && <button type="button" onClick={onClear} aria-label={t("mapTool.clearSelection")} title={t("mapTool.clearSelection")} className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-fg-muted hover:bg-surface-2"><X className="size-4" /></button>}
      </header>

      <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-surface p-4">
        <Stat label={t("mapTool.area")} tip={t("mapTool.srcArea")}><span className="num text-xl font-semibold">{f.num(land.areaHa, land.areaHa < 10 ? 1 : 0)}</span> <span className="text-fg-muted">ha</span></Stat>
        <Stat label={t("mapTool.location")} tip={t("mapTool.srcPlace")}><span className="num">{fmtCoord(land.centroid.lat)}, {fmtCoord(land.centroid.lon)}</span></Stat>
        {s && <Stat label={t("mapTool.elevation")} tip={t("mapTool.srcElev")}><span className="num">{s.elev != null ? `${f.num(s.elev)} m` : "–"}</span></Stat>}
        {d && (
          <Stat label={t("mapTool.soil")} tip={t("mapTool.srcSoil")}>
            {d.soil ? (
              <>
                {t(`textures.${d.soil.texture}`)}
                <span className="mt-0.5 block text-xs font-normal text-fg-muted">{t("mapTool.soilDetail", { sand: f.num(d.soil.sand), clay: f.num(d.soil.clay), silt: f.num(d.soil.silt) })}</span>
              </>
            ) : <span className="text-sm font-normal text-fg-muted">{t("mapTool.soilUnavailable")}</span>}
          </Stat>
        )}
        {d?.soil && d.soil.soc != null && <Stat label={t("mapTool.soilCarbon")} tip={t("mapTool.srcSoil")}><span className="num">{f.num(d.soil.soc, 1)}</span> <span className="text-xs font-normal text-fg-muted">g/kg</span></Stat>}
        {d?.soil && d.soil.ph != null && <Stat label={t("mapTool.soilPh")} tip={t("mapTool.srcSoil")}><span className="num">{f.num(d.soil.ph, 1)}</span></Stat>}
      </dl>

      {snap.status === "loading" && (
        <ul className="space-y-2.5 rounded-2xl border border-line bg-surface p-4" aria-live="polite">
          <StepRow state={snap.steps.place} label={t("mapTool.stepPlace")} />
          <StepRow state={snap.steps.weather} label={t("mapTool.stepWeather")} />
          <StepRow state={snap.steps.soil} label={t("mapTool.stepSoil")} />
          <StepRow state={snap.steps.calc} label={t("mapTool.stepCalc")} />
        </ul>
      )}
      {snap.status === "error" && (
        <div role="alert" className="rounded-2xl bg-danger-soft p-4 text-sm text-danger">
          <p>{t("mapTool.loadError", { msg: snap.error ?? "" })}</p>
          <button type="button" onClick={snap.retry} className="mt-3 rounded-full bg-danger px-4 py-1.5 text-xs font-medium text-white">{t("common.retry")}</button>
        </div>
      )}

      {d && s && (
        <>
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="flex items-center gap-0.5 text-sm font-semibold">{t("mapTool.normals")}<InfoTip text={t("mapTool.srcNormals")} /></h3>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <Stat label={t("mapTool.meanTemp")}><span className="num text-lg font-semibold">{f.num(s.meanTemp, 1)}</span> <span className="text-fg-muted">°C</span></Stat>
              <Stat label={t("mapTool.annualRain")}><span className="num text-lg font-semibold">{f.num(s.annualRain)}</span> <span className="text-fg-muted">mm</span></Stat>
            </dl>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="flex items-center gap-0.5 text-sm font-semibold">{t("mapTool.heatTitle")}<InfoTip text={t("mapTool.srcHeat")} /></h3>
            <YearBars className="mt-3" years={s.years} values={s.heatDays} color="var(--heat)" accent="var(--heat)" accentIndex={s.years.indexOf(s.hottest.year)} format={(v) => `${v} ${t("units.days")}`} label={t("mapTool.heatTitle")} />
            <p className="mt-3 text-xs text-fg-muted">{t("mapTool.heatNow", { n: f.num(heat5, 1), all: f.num(heatAll, 1) })}</p>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="flex items-center gap-0.5 text-sm font-semibold">{t("mapTool.rainTitle")}<InfoTip text={t("mapTool.srcSeason")} /></h3>
            <YearBars className="mt-3" years={s.years} values={s.seasonRain} color="var(--data)" accent="var(--warn)" accentIndex={s.years.indexOf(s.driest.year)} format={(v) => `${f.num(v)} mm`} label={t("mapTool.rainTitle")} />
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <Stat label={t("mapTool.driestYear")} tip={t("mapTool.srcSeason")}><span className="num text-sm">{t("mapTool.driestValue", { year: s.driest.year, mm: f.num(s.driest.mm) })}</span></Stat>
              <Stat label={t("mapTool.hottestYear")} tip={t("mapTool.srcHeat")}><span className="num text-sm">{t("mapTool.hottestValue", { year: s.hottest.year, t: f.num(s.hottest.temp, 1), d: s.hottest.heatDays })}</span></Stat>
            </dl>
          </section>

          {onNdviChange && (
            <section className="rounded-2xl border border-line bg-surface p-4">
              <h3 className="flex items-center gap-0.5 text-sm font-semibold">{t("mapTool.ndviTitle")}<InfoTip text={t("mapTool.srcNdvi")} /></h3>
              <p className="mt-1 text-sm text-fg-muted">{t("mapTool.ndviBody")}</p>
              <button type="button" onClick={() => onNdviChange(!ndvi)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-line-strong px-4 text-[13px] font-medium hover:bg-surface-2"><Layers className="size-4" />{ndvi ? t("mapTool.ndviHide") : t("mapTool.ndviShow")}</button>
            </section>
          )}

          <ImpactCard pack={d.pack} stats={s} />
        </>
      )}
      {footer}
    </div>
  );
}
