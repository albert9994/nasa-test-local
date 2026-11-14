"use client";
// The field analysis workspace: eight tabs over the active farm in the `useApp` store.
// Shared by the web app (/app) and the desktop app. Each tab and key widget carries a `data-tour` id for the walkthrough.
import { Activity, BarChart3, FileText, Flame, Layers, Satellite, SlidersHorizontal, Sprout } from "lucide-react";
import { useId, type ReactNode } from "react";
import { DroughtReplay } from "@/components/replay/drought-replay";
import { ExplainPanel } from "@/components/explain/explain-panel";
import { ReportDialog } from "@/components/explain/report";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import { TABS, useAnalysis, type TabId } from "@/lib/store/analysis";
import { cn } from "@/lib/utils";
import { FrontierPanel } from "./frontier";
import { FuturesTab } from "./futures-tab";
import { OverviewTab } from "./overview-tab";
import { RotationsTab } from "./rotations-tab";
import { SatelliteTab } from "./satellite-tab";
import { StressTab } from "./stress-tab";
import { Tabs, type TabDef } from "./tabs";

const ICON: Record<TabId, ReactNode> = {
  overview: <Sprout className="size-4" aria-hidden />, risk: <Flame className="size-4" aria-hidden />, stress: <SlidersHorizontal className="size-4" aria-hidden />,
  futures: <Activity className="size-4" aria-hidden />, rotations: <Layers className="size-4" aria-hidden />, replay: <BarChart3 className="size-4" aria-hidden />,
  report: <FileText className="size-4" aria-hidden />, satellite: <Satellite className="size-4" aria-hidden />,
};

export function FieldAnalysis({ className, tabs: only }: { className?: string; /** subset of tabs to show (default all) */ tabs?: TabId[] }) {
  const t = useT();
  const prefix = useId();
  const tab = useAnalysis((s) => s.tab);
  const setTab = useAnalysis((s) => s.setTab);
  const pack = useApp((s) => s.pack);
  const loading = useApp((s) => s.loading);
  const ids = (only ?? [...TABS]).filter((x) => TABS.includes(x));
  const defs: TabDef<TabId>[] = ids.map((id) => ({ id, label: t(`analysis.tab_${id}`), icon: ICON[id] }));
  const active = ids.includes(tab) ? tab : ids[0];

  return (
    <div className={cn("flex min-w-0 flex-col gap-4", className)} data-tour="field-analysis">
      <Tabs tabs={defs} value={active} onChange={setTab} label={t("analysis.tabs_label")} idPrefix={prefix} />
      <div role="tabpanel" id={`${prefix}-panel-${active}`} aria-labelledby={`${prefix}-tab-${active}`} tabIndex={0} className="@container min-w-0 focus-visible:outline-offset-4" aria-busy={loading}>
        {!pack && !loading ? (
          <p className="rounded-[var(--radius)] border border-dashed border-line-strong p-6 text-sm text-fg-muted">{t("analysis.empty")}</p>
        ) : active === "overview" ? <OverviewTab />
          : active === "risk" ? <FrontierPanel />
          : active === "stress" ? <StressTab />
          : active === "futures" ? <FuturesTab />
          : active === "rotations" ? <RotationsTab />
          : active === "replay" ? <DroughtReplay />
          : active === "report" ? <ExplainPanel />
          : <SatelliteTab />}
      </div>
      <ReportDialog />
    </div>
  );
}
