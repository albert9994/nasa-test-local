"use client";
// Desktop workspace, map first: a slim nav rail, the farm map full-bleed, a floating fields card on the left and the
// selected field's analysis in a panel on the right. The rail also opens the AI assistant.
import { useEffect, useMemo, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { useFarm } from "@/lib/store/farm";
import { getHost } from "@/lib/store/farm-storage";
import { Tour, type TourStep } from "@/components/tour/tour";
import { FieldMap } from "@/components/onboarding/field-map";
import { Assistant } from "@/components/assistant/assistant";
import { useAnalysis } from "@/lib/store/analysis";
import { Rail } from "./rail";
import { FieldsCard } from "./fields-card";
import { FieldPanel } from "./field-panel";
import { AddFieldDialog } from "./add-field-dialog";
import { useRisk } from "./risk";
import { buildReportHtml } from "./report";
import { useView } from "./view";

const TOUR: TourStep[] = [
  { target: "fields", titleKey: "workspace.t_fields_t", bodyKey: "workspace.t_fields_b", placement: "right" },
  { target: "margin-hero", titleKey: "workspace.t_margin_t", bodyKey: "workspace.t_margin_b", placement: "left", onEnter: () => useAnalysis.getState().setTab("overview") },
  { target: "tab-stress", titleKey: "workspace.t_stress_t", bodyKey: "workspace.t_stress_b", onEnter: () => useAnalysis.getState().setTab("stress") },
  { target: "tab-futures", titleKey: "workspace.t_futures_t", bodyKey: "workspace.t_futures_b", onEnter: () => useAnalysis.getState().setTab("futures") },
  { target: "tab-rotations", titleKey: "workspace.t_rotations_t", bodyKey: "workspace.t_rotations_b", onEnter: () => useAnalysis.getState().setTab("rotations") },
  { target: "report", titleKey: "workspace.t_report_t", bodyKey: "workspace.t_report_b", placement: "left" },
  { target: "nav-assistant", titleKey: "assistant.tour_t", bodyKey: "assistant.tour_b", placement: "right" },
  { target: "settings", titleKey: "workspace.t_settings_t", bodyKey: "workspace.t_settings_b", placement: "right" },
];

const CARD_W = 300 + 16; // fields card + its margin
/** Panel width: half the content area, between 560 and 860 px; "wide" leaves only the fields card visible. */
function usePanelWidth(wide: boolean) {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const content = w - 72;
  return wide ? Math.max(560, content - CARD_W - 16) : Math.min(860, Math.max(560, Math.round(content * 0.52)));
}

export function Workspace() {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const farm = useFarm();
  const view = useView((s) => s.view);
  const risks = useRisk((s) => s.byId);
  const refresh = useRisk((s) => s.refresh);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const [wide, setWide] = useState(false);
  const field = farm.fields.find((f) => f.id === farm.selectedId) ?? null;
  const panelW = usePanelWidth(wide);

  useEffect(() => { refresh(farm.fields, farm.profile.badYearsIn); }, [farm.fields, farm.profile.badYearsIn, refresh]);

  const mapFields = useMemo(() => farm.fields.map((f) => ({ id: f.id, name: f.name, centroid: f.centroid, geometry: f.geometry })), [farm.fields]);
  const riskById = useMemo(() => Object.fromEntries(Object.entries(risks).map(([k, v]) => [k, v?.level])), [risks]);
  const center = farm.place ?? farm.fields[0]?.centroid ?? { lat: 45.9, lon: 25 };
  const padding = useMemo(() => ({ top: 0, bottom: 0, left: CARD_W, right: 0 }), []);

  async function saveReport() {
    const html = buildReportHtml(farm, risks, t, locale);
    const where = await getHost().saveFile(`hotar-${(farm.name || "farm").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`, html, "text/html");
    if (where) { setSaved(true); setTimeout(() => setSaved(false), 4000); }
  }

  return (
    <div className="flex h-full bg-bg text-fg">
      <Rail />
      <main className="relative min-w-0 flex-1 overflow-hidden">
        {view === "assistant" ? <Assistant /> : (
          <>
            <div className="absolute inset-y-0 left-0 transition-[right] duration-300 ease-out" style={{ right: field ? panelW : 0 }}>
              <FieldMap center={center} zoom={11} fields={mapFields} selectedId={farm.selectedId} riskById={riskById} fitFields={farm.fields.length > 0}
                satellite padding={padding} refitKey={field ? panelW : 0} satellitePosition="absolute left-[332px] top-4 z-10 max-h-[calc(100%-2rem)]" onSelect={farm.select}
                className="relative h-full w-full" />
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex flex-col p-4">
              <FieldsCard onAdd={() => setAdding(true)} />
            </div>
            {!field && farm.fields.length > 0 && (
              <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-line bg-glass px-4 py-2 text-sm text-fg-muted shadow-[var(--shadow-lg)] backdrop-blur-xl" style={{ marginLeft: CARD_W / 2 - (field ? panelW / 2 : 0) }}>
                {t("workspace.mapHint")}
              </p>
            )}
            <div className="pointer-events-none absolute inset-y-0 right-0 transition-[width,transform] duration-300 ease-out"
              style={{ width: panelW, transform: field ? "translateX(0)" : "translateX(100%)" }}>
              {field && (
                <FieldPanel field={field} profile={farm.profile} wide={wide} onWide={setWide} onClose={() => farm.select(null)}
                  onReport={saveReport} reportSaved={saved} />
              )}
            </div>
          </>
        )}
      </main>
      {adding && <AddFieldDialog onClose={() => setAdding(false)} />}
      {view === "farm" && <Tour id="workspace" steps={TOUR} />}
    </div>
  );
}
