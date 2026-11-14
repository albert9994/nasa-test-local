"use client";
// Left sidebar: farm name, fields with area + risk badge, "+ Add field", settings (language, currency, theme).
import { Moon, Plus, RotateCcw, Sun, Trash2 } from "lucide-react";
import { useCurrency, useLocale, useT, LOCALES, type Currency } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useFarm } from "@/lib/store/farm";
import { nativeInfo } from "@/lib/engine/tauri";
import { useTour } from "@/components/tour/tour";
import { useRisk } from "./risk";

const BADGE = {
  safe: "bg-ok-soft text-ok", tight: "bg-warn-soft text-warn", over: "bg-heat-soft text-heat",
} as const;

export function RiskBadge({ id }: { id: string }) {
  const t = useT();
  const r = useRisk((s) => s.byId[id]);
  const failed = useRisk((s) => s.failed[id]);
  if (!r) return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-subtle">{failed ? "—" : t("workspace.risk_pending")}</span>;
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", BADGE[r.level])}>{t(`common.risk_${r.level}`)}</span>;
}

export function Sidebar({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  const farm = useFarm();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const { currency, setCurrency } = useCurrency();
  const start = useTour((s) => s.start);
  const totalHa = farm.fields.reduce((s, f) => s + f.areaHa, 0);
  const seg = "flex overflow-hidden rounded-full border border-line-strong text-xs";
  const segBtn = (on: boolean) => cn("flex-1 px-2.5 py-1.5", on ? "bg-primary text-primary-fg" : "bg-surface text-fg-muted hover:bg-surface-2");

  return (
    <aside className="flex h-full w-[288px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="border-b border-line px-4 pb-3 pt-4">
        <p className="display text-lg text-primary">FieldShift</p>
        <h1 className="mt-2 truncate text-base font-semibold tracking-tight">{farm.name}</h1>
        <p className="num text-xs text-fg-muted">
          {farm.fields.length} {t("workspace.fields").toLowerCase()} · {totalHa.toLocaleString(locale === "ro" ? "ro-RO" : "en-US")} ha
          {farm.demo && <span className="ml-2 rounded-full bg-data-soft px-2 py-0.5 text-[10px] font-medium text-data">{t("workspace.demoBadge")}</span>}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 py-3" data-tour="fields">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t("workspace.fields")}</h2>
          <button onClick={onAdd} className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary-soft/70"><Plus size={14} />{t("workspace.addField")}</button>
        </div>
        <ul className="-mx-1 flex-1 overflow-auto px-1">
          {farm.fields.map((f) => (
            <li key={f.id} className="group relative">
              <button onClick={() => farm.select(f.id)} aria-current={farm.selectedId === f.id}
                className={cn("mb-1 flex w-full flex-col gap-1 rounded-[var(--radius-sm)] border px-3 py-2 text-left transition-colors",
                  farm.selectedId === f.id ? "border-primary bg-primary-soft" : "border-transparent hover:bg-surface-2")}>
                <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{f.name}</span><RiskBadge id={f.id} /></span>
                <span className="num text-xs text-fg-muted">{t("workspace.ha", { ha: f.areaHa })} · {f.rotation.map((c) => t(`crops.${c}`)).join(" → ")}</span>
              </button>
              <button aria-label={t("workspace.deleteField")} title={t("workspace.deleteField")}
                onClick={() => { if (window.confirm(t("workspace.deleteConfirm"))) farm.removeField(f.id); }}
                className="absolute bottom-2 right-2 hidden rounded-full p-1 text-fg-subtle hover:bg-surface hover:text-heat group-hover:block"><Trash2 size={13} /></button>
            </li>
          ))}
          {farm.fields.length === 0 && (
            <li className="rounded-[var(--radius-sm)] border border-dashed border-line-strong p-3 text-sm text-fg-muted">
              <p className="font-medium text-fg">{t("workspace.noFields")}</p>
              <p className="mt-1">{t("workspace.noFieldsBody")}</p>
            </li>
          )}
        </ul>
      </div>

      <div className="flex flex-col gap-3 border-t border-line px-4 py-3" data-tour="settings">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t("workspace.settings")}</h2>
        <div className="flex items-center justify-between gap-3 text-xs"><span className="text-fg-muted">{t("workspace.language")}</span>
          <div className={seg} role="group" aria-label={t("workspace.language")}>
            {LOCALES.map((l) => <button key={l} aria-pressed={locale === l} className={segBtn(locale === l)} onClick={() => setLocale(l)}>{l.toUpperCase()}</button>)}
          </div></div>
        <div className="flex items-center justify-between gap-3 text-xs"><span className="text-fg-muted">{t("workspace.currency")}</span>
          <div className={seg} role="group" aria-label={t("workspace.currency")}>
            {(["EUR", "RON", "USD"] as Currency[]).map((c) => <button key={c} aria-pressed={currency === c} className={segBtn(currency === c)} onClick={() => setCurrency(c)}>{c}</button>)}
          </div></div>
        <div className="flex items-center justify-between gap-3 text-xs"><span className="text-fg-muted">{t("workspace.theme")}</span>
          <div className={seg} role="group" aria-label={t("workspace.theme")}>
            <button aria-pressed={farm.theme === "light"} className={cn(segBtn(farm.theme === "light"), "flex items-center justify-center gap-1")} onClick={() => farm.setTheme("light")}><Sun size={12} />{t("workspace.light")}</button>
            <button aria-pressed={farm.theme === "dark"} className={cn(segBtn(farm.theme === "dark"), "flex items-center justify-center gap-1")} onClick={() => farm.setTheme("dark")}><Moon size={12} />{t("workspace.dark")}</button>
          </div></div>
        <div className="flex items-center justify-between text-xs text-fg-muted"><span>{t("workspace.engine")}</span><span className="num">{nativeInfo ? t("workspace.engineNative") : t("workspace.engineTs")}</span></div>
        <div className="flex flex-col items-start gap-1 text-xs">
          <button className="text-primary hover:underline" onClick={() => start("workspace")}>{t("workspace.showGuide")}</button>
          <button className="flex items-center gap-1 text-fg-muted hover:text-heat" onClick={() => { if (window.confirm(t("workspace.resetConfirm"))) farm.reset(); }}><RotateCcw size={12} />{t("workspace.resetFarm")}</button>
        </div>
      </div>
    </aside>
  );
}
