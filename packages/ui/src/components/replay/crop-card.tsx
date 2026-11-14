"use client";
import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { SeasonResult } from "@/lib/engine";
import { useF, useNames } from "@/components/field/hooks";
import { useT } from "@/lib/i18n";
import { startDay } from "./calendar";
import { SoilTank, type TankState } from "./soil-tank";
import { TmaxChart } from "./tmax-chart";

interface Props {
  season: SeasonResult;
  year: number;
  days: number;
  day: number;
  tmaxDomain: [number, number];
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-fg-muted">{label}</div>
      <div className={cn("num text-sm", warn && "text-heat")}>{value}</div>
    </div>
  );
}

export const CropCard = memo(function CropCard({ season, year, days, day, tmaxDomain }: Props) {
  const t = useT();
  const f = useF();
  const tr = season.trace;
  const name = useNames().crop(season.crop);

  const pre = useMemo(() => {
    if (!tr) return null;
    let s = 0, h = 0;
    const stress: number[] = [], heat: number[] = [];
    tr.ks.forEach((k, i) => {
      if (k < 0.6) s++;
      if (tr.tmax[i] > tr.heat && tr.stage[i] === 1) h++; // same rule as the engine (heat at flowering)
      stress.push(s); heat.push(h);
    });
    return { stress, heat, t0: startDay(year, season.sow) };
  }, [tr, year, season.sow]);

  if (!tr || !pre || tr.fill.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">{name}</h4>
          <span className="num text-xs text-fg-muted">{f.moneyPerHa(season.net)}</span>
        </div>
        <p className="mt-2 text-xs text-fg-muted">
          {season.crop === "fallow" ? t("replay.fallow_note") : t("replay.no_trace")}
        </p>
      </div>
    );
  }

  const len = tr.fill.length;
  const i = day - pre.t0;
  const status = i < 0 ? "pending" : i >= len - 1 ? "done" : "growing";
  const cur = Math.max(0, Math.min(len - 1, i));
  const ks = tr.ks[cur];
  const hot = status === "growing" && tr.tmax[cur] > tr.heat;
  const stressed = status === "growing" && ks < 0.6;
  const tank: TankState = status === "pending" ? "pending" : hot ? "heat" : stressed ? "stress" : "ok";
  const stageName = status === "pending" ? t("replay.not_sown") : status === "done" ? t("replay.harvested") : t(`replay.stage_${tr.stage[cur]}`);
  const stressDays = status === "pending" ? 0 : pre.stress[cur];
  const heatDays = status === "pending" ? 0 : pre.heat[cur];

  return (
    <div className={cn("rounded-xl border bg-surface p-3 transition-colors", stressed || hot ? "border-heat/40" : "border-line")}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">{name}</h4>
        <span className={cn("text-xs", status === "growing" ? "text-ok" : "text-fg-muted")}>{stageName}</span>
      </div>
      <div className="mt-2 flex gap-3">
        <SoilTank fill={status === "pending" ? 0 : tr.fill[cur]} state={tank} hot={hot} dim={status === "done"} />
        <div className="grid min-w-0 flex-1 grid-cols-2 content-start gap-x-3 gap-y-1.5">
          <Stat label={t("replay.stress_days")} value={String(stressDays)} warn={stressDays > 0} />
          <Stat label={t("replay.heat_days")} value={String(heatDays)} warn={heatDays > 0} />
          <Stat label={t("replay.tmax")} value={status === "pending" ? "-" : `${f.num(tr.tmax[cur])} °C`} warn={hot} />
          <Stat label={t("replay.heat_limit")} value={`${tr.heat} °C`} />
        </div>
      </div>
      <div className="mt-2">
        <TmaxChart year={year} days={days} t0={pre.t0} tmax={tr.tmax} heat={tr.heat} domain={tmaxDomain} day={day} />
      </div>
      <div
        className={cn("mt-2 flex items-baseline justify-between rounded-lg bg-surface-2 px-2.5 py-1.5 transition-opacity duration-500",
          status === "done" ? "opacity-100" : "opacity-0")}
        aria-hidden={status !== "done"}
      >
        <span className="num text-sm">{f.num(season.yield, 1)} {t("replay.yield_unit")}</span>
        <span className={cn("num text-sm", season.net < 0 ? "text-danger" : "text-ok")}>{f.moneyPerHa(season.net)}</span>
      </div>
    </div>
  );
});
