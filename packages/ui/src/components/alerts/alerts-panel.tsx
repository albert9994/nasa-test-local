"use client";
// Weather alerts for the next 7 days (Open-Meteo). Shared by web and desktop.
import { CloudRain, Droplets, Flame, SprayCan, Snowflake, CheckCircle2, type LucideIcon } from "lucide-react";
import type { Alert, AlertKind, Severity, Stage } from "@/lib/data/forecast";
import type { CropId } from "@/lib/engine/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAlerts } from "./use-alerts";

const ICON: Record<AlertKind, LucideIcon> = {
  heatwave: Flame, drought: Droplets, frost: Snowflake, heavy_rain: CloudRain, spray_window: SprayCan,
};
const TONE: Record<Severity, string> = {
  danger: "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]",
  warn: "border-[var(--warn)] bg-[var(--warn-soft)] text-[var(--warn)]",
  ok: "border-[var(--ok)] bg-[var(--ok-soft)] text-[var(--ok)]",
};

export function AlertsList({ items, flowering = false }: { items: Alert[]; flowering?: boolean }) {
  const t = useT();
  if (!items.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--ok)]"><CheckCircle2 size={16} aria-hidden />{t("alerts.none")}</p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((a) => {
        const Icon = ICON[a.kind];
        return (
          <li key={a.kind} data-severity={a.severity} className={cn("flex gap-3 rounded-lg border p-3", TONE[a.severity])}>
            <Icon size={20} className="mt-0.5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t(`alerts.${a.kind}.title`)}</p>
              <p className="text-sm text-[var(--fg,inherit)]">
                {t(`alerts.${a.kind}.body`, { n: a.days.length, value: a.value, from: a.from ?? "" })}
                {a.kind === "heatwave" && flowering ? ` ${t("alerts.heatwave.flowering")}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AlertsPanel({ lat, lon, crop, stage, slopePct }: { lat: number; lon: number; crop: CropId; stage: Stage; slopePct?: number }) {
  const t = useT();
  const state = useAlerts(lat, lon, crop, stage, slopePct);

  return (
    <section aria-label={t("alerts.title")} className="flex flex-col gap-3" data-testid="alerts-panel">
      <h3 className="text-sm font-semibold">{t("alerts.title")}</h3>
      {state.status === "loading" && <p className="text-sm opacity-70">{t("alerts.loading")}</p>}
      {state.status === "error" && <p className="text-sm text-fg-muted">{t("alerts.error")}</p>}
      {state.status === "ok" && <AlertsList items={state.items} flowering={stage === "flowering" || stage === "grain_fill"} />}
      <p className="text-xs opacity-60">{t("alerts.source")}</p>
    </section>
  );
}
