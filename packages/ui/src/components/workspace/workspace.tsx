"use client";
// Desktop workspace: sidebar + farm map on top + field analysis below, with the first-run guided tour.
import { useEffect, useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n";
import { useFarm } from "@/lib/store/farm";
import { getHost } from "@/lib/store/farm-storage";
import { Tour, type TourStep } from "@/components/tour/tour";
import { Button } from "@/components/ui/button";
import { FieldMap } from "@/components/onboarding/field-map";
import { Sidebar } from "./sidebar";
import { Analysis } from "./analysis";
import { AddFieldDialog } from "./add-field-dialog";
import { useRisk } from "./risk";
import { buildReportHtml } from "./report";
import { useAnalysis } from "@/lib/store/analysis";

const TOUR: TourStep[] = [
  { target: "fields", titleKey: "workspace.t_fields_t", bodyKey: "workspace.t_fields_b", placement: "right" },
  { target: "margin-hero", titleKey: "workspace.t_margin_t", bodyKey: "workspace.t_margin_b", onEnter: () => useAnalysis.getState().setTab("overview") },
  { target: "tab-stress", titleKey: "workspace.t_stress_t", bodyKey: "workspace.t_stress_b", onEnter: () => useAnalysis.getState().setTab("stress") },
  { target: "tab-futures", titleKey: "workspace.t_futures_t", bodyKey: "workspace.t_futures_b", onEnter: () => useAnalysis.getState().setTab("futures") },
  { target: "tab-rotations", titleKey: "workspace.t_rotations_t", bodyKey: "workspace.t_rotations_b", onEnter: () => useAnalysis.getState().setTab("rotations") },
  { target: "report", titleKey: "workspace.t_report_t", bodyKey: "workspace.t_report_b", placement: "left" },
  { target: "settings", titleKey: "workspace.t_settings_t", bodyKey: "workspace.t_settings_b", placement: "right" },
];

export function Workspace() {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const farm = useFarm();
  const risks = useRisk((s) => s.byId);
  const refresh = useRisk((s) => s.refresh);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const field = farm.fields.find((f) => f.id === farm.selectedId) ?? null;

  useEffect(() => { refresh(farm.fields, farm.profile.badYearsIn); }, [farm.fields, farm.profile.badYearsIn, refresh]);

  const mapFields = useMemo(() => farm.fields.map((f) => ({ id: f.id, name: f.name, centroid: f.centroid, geometry: f.geometry })), [farm.fields]);
  const riskById = useMemo(() => Object.fromEntries(Object.entries(risks).map(([k, v]) => [k, v?.level])), [risks]);
  const center = farm.place ?? farm.fields[0]?.centroid ?? { lat: 45.9, lon: 25 };

  async function saveReport() {
    const html = buildReportHtml(farm, risks, t, locale);
    const where = await getHost().saveFile(`fieldshift-${(farm.name || "farm").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`, html, "text/html");
    if (where) { setSaved(where); setTimeout(() => setSaved(null), 4000); }
  }

  return (
    <div className="flex h-full bg-bg text-fg">
      <Sidebar onAdd={() => setAdding(true)} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between gap-4 px-6 pb-2 pt-4">
          <h2 className="text-xl font-semibold tracking-tight">{field ? field.name : t("workspace.mapTitle")}</h2>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-ok" role="status">{t("workspace.reportSaved")}</span>}
            <span data-tour="report"><Button variant="outline" size="sm" onClick={saveReport} disabled={!farm.fields.length}><FileDown size={14} />{t("workspace.saveReport")}</Button></span>
          </div>
        </div>
        <div className="h-[300px] px-6">
          <FieldMap center={center} zoom={11} fields={mapFields} selectedId={farm.selectedId} riskById={riskById} fitFields={farm.fields.length > 0}
            onSelect={farm.select} />
        </div>
        <div className="px-6 py-4">
          {field ? <Analysis field={field} profile={farm.profile} /> : (
            <div className="rounded-[var(--radius)] border border-dashed border-line-strong p-8 text-center">
              <p className="font-medium">{t("workspace.selectField")}</p>
              <p className="mt-1 text-sm text-fg-muted">{t("workspace.selectFieldBody")}</p>
            </div>
          )}
        </div>
      </main>
      {adding && <AddFieldDialog onClose={() => setAdding(false)} />}
      <Tour id="workspace" steps={TOUR} />
    </div>
  );
}
