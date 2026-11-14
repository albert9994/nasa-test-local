"use client";
// Floating card over the farm map: farm name, totals, the list of fields with their risk, and "+ Add field".
import { Plus, Trash2 } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useFarm } from "@/lib/store/farm";
import { useRisk } from "./risk";

const DOT = { safe: "bg-ok", tight: "bg-warn", over: "bg-heat" } as const;
const BADGE = { safe: "bg-ok-soft text-ok", tight: "bg-warn-soft text-warn", over: "bg-heat-soft text-heat" } as const;

export function RiskBadge({ id }: { id: string }) {
  const t = useT();
  const r = useRisk((s) => s.byId[id]);
  const failed = useRisk((s) => s.failed[id]);
  if (!r) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-subtle">
        {!failed && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-fg-subtle" />}
        {failed ? "—" : t("workspace.risk_pending")}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", BADGE[r.level])}>
      <span aria-hidden className={cn("size-1.5 rounded-full", DOT[r.level])} />{t(`common.risk_${r.level}`)}
    </span>
  );
}

export function FieldsCard({ onAdd }: { onAdd(): void }) {
  const t = useT();
  const farm = useFarm();
  const locale = useLocale((s) => s.locale);
  const nf = (n: number) => n.toLocaleString(locale === "ro" ? "ro-RO" : "en-US", { maximumFractionDigits: 1 });
  const totalHa = farm.fields.reduce((s, f) => s + f.areaHa, 0);
  const n = farm.fields.length;

  return (
    <section aria-label={t("workspace.fields")} data-tour="fields"
      className="pointer-events-auto flex max-h-full w-[300px] flex-col overflow-hidden rounded-[var(--radius)] border border-line bg-glass shadow-[var(--shadow-lg)] backdrop-blur-xl">
      <header className="border-b border-line px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 truncate text-[15px] font-semibold tracking-tight">{farm.name}</h1>
          {farm.demo && <span className="rounded-full bg-data-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-data">{t("workspace.demoBadge")}</span>}
        </div>
        <p className="mt-0.5 text-xs text-fg-muted">
          {n === 1 ? t("workspace.fieldsCountOne") : t("workspace.fieldsCount", { n })} · {t("workspace.totalArea", { ha: nf(totalHa) })}
        </p>
      </header>

      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {farm.fields.map((f) => {
          const on = farm.selectedId === f.id;
          return (
            <li key={f.id} className="group relative">
              <button type="button" onClick={() => farm.select(on ? null : f.id)} aria-current={on}
                className={cn("flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left transition-colors",
                  on ? "bg-primary-soft ring-1 ring-primary/30" : "hover:bg-surface-2")}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{f.name}</span>
                  <RiskBadge id={f.id} />
                </span>
                <span className="truncate pr-6 text-xs text-fg-muted">
                  <span className="num">{nf(f.areaHa)} ha</span> · {f.rotation.map((c) => t(`crops.${c}`)).join(" → ")}
                </span>
              </button>
              <button type="button" aria-label={t("workspace.deleteField")} title={t("workspace.deleteField")}
                onClick={() => { if (window.confirm(t("workspace.deleteConfirm"))) farm.removeField(f.id); }}
                className="absolute bottom-2 right-2 rounded-md p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-surface hover:text-danger focus-visible:opacity-100 group-hover:opacity-100">
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
        {n === 0 && (
          <li className="m-1 rounded-[10px] border border-dashed border-line-strong p-4 text-sm">
            <p className="font-medium">{t("workspace.noFields")}</p>
            <p className="mt-1 text-fg-muted">{t("workspace.noFieldsBody")}</p>
          </li>
        )}
      </ul>

      <footer className="border-t border-line p-2">
        <button type="button" onClick={onAdd}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-[10px] bg-primary text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover">
          <Plus className="size-4" aria-hidden />{t("workspace.addField")}
        </button>
      </footer>
    </section>
  );
}
