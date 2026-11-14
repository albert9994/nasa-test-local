"use client";
// Right-hand panel with the analysis of the selected field. Slides over the map; can be widened for the heavy charts.
import { FileDown, Maximize2, MessageCircle, Minimize2, X } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Field, Profile } from "@/lib/store/farm";
import { Analysis } from "./analysis";
import { RiskBadge } from "./fields-card";
import { useView } from "./view";

const iconBtn = "grid size-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg";

export function FieldPanel({ field, profile, wide, onWide, onClose, onReport, reportSaved, className }: {
  field: Field; profile: Profile; wide: boolean; onWide(w: boolean): void; onClose(): void; onReport(): void; reportSaved: boolean; className?: string;
}) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const setView = useView((s) => s.setView);
  const ha = field.areaHa.toLocaleString(locale === "ro" ? "ro-RO" : "en-US", { maximumFractionDigits: 1 });

  return (
    <aside aria-label={field.name}
      className={cn("pointer-events-auto flex h-full flex-col overflow-hidden border-l border-line bg-bg shadow-[var(--shadow-lg)]", className)}>
      <header className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight">{field.name}</h2>
            <RiskBadge id={field.id} />
          </div>
          <p className="truncate text-xs text-fg-muted"><span className="num">{ha} ha</span> · {field.rotation.map((c) => t(`crops.${c}`)).join(" → ")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setView("assistant")}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
            <MessageCircle className="size-3.5" aria-hidden />{t("workspace.askAssistant")}
          </button>
          <span data-tour="report">
            <button type="button" onClick={onReport}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium transition-colors hover:bg-surface-2">
              <FileDown className="size-3.5" aria-hidden />{reportSaved ? t("workspace.reportSaved") : t("workspace.saveReport")}
            </button>
          </span>
          <button type="button" className={iconBtn} onClick={() => onWide(!wide)} aria-label={wide ? t("workspace.collapsePanel") : t("workspace.expandPanel")} title={wide ? t("workspace.collapsePanel") : t("workspace.expandPanel")}>
            {wide ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
          </button>
          <button type="button" className={iconBtn} onClick={onClose} aria-label={t("workspace.closePanel")} title={t("workspace.closePanel")}>
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </header>
      <div className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
        <Analysis field={field} profile={profile} />
      </div>
    </aside>
  );
}
