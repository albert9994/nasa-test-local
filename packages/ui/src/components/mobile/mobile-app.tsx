"use client";
// FieldShift mobile app: onboarding funnel on first run, then a tab-bar app (Farm · Alerts · Settings) with a pushed
// field-detail screen. Reuses the farm store, the per-field risk badges and the shared analysis panels.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, ChevronLeft, ChevronRight, Home, Moon, Plus, Settings, Share2, Sun, Trash2 } from "lucide-react";
import { FX, LOCALES, useCurrency, useLocale, useT, type Currency } from "@/lib/i18n";
import { EQUIPMENT, FARM_CROPS, circlePolygon, newField, useFarm, type Field } from "@/lib/store/farm";
import { getHost } from "@/lib/store/farm-storage";
import { haptic, useMobile } from "@/lib/store/mobile";
import { stageOn } from "@/lib/data/phenology";
import type { CropId, Equipment } from "@/lib/engine/types";
import { cn } from "@/lib/utils";
import { FieldMap, FieldPicker } from "@/components/onboarding/field-map";
import { AlertsPanel } from "@/components/alerts/alerts-panel";
import { Analysis } from "@/components/workspace/analysis";
import { useRisk } from "@/components/workspace/risk";
import { useAnalysis } from "@/lib/store/analysis";
import { RiskBadge } from "@/components/workspace/fields-card";
import { buildReportHtml } from "@/components/workspace/report";
import { BigButton, CropTile, SAFE_BOTTOM, SAFE_TOP, Sheet, Stepper } from "./kit";
import { Funnel } from "./funnel";

type Tab = "farm" | "alerts" | "settings";
const RANK = { over: 0, tight: 1, safe: 2 } as const;

/** Android back button / iOS edge swipe: push a history entry while an overlay is open, close it on popstate. */
function useBackClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    history.pushState({ fsOverlay: true }, "");
    const onPop = () => close();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, close]);
}

export function MobileApp() {
  const t = useT();
  const hydrated = useFarm((s) => s.hydrated);
  const onboarded = useFarm((s) => s.onboarded);
  const prefsHydrated = useMobile((s) => s.hydrated);
  // Decided once after hydration, so the funnel keeps showing its last screens after the farm is saved.
  const [mode, setMode] = useState<"funnel" | "intro" | "app" | null>(null);
  useEffect(() => { void useFarm.getState().hydrate(); void useMobile.getState().hydrate(); }, []);
  useEffect(() => { if (hydrated && prefsHydrated && mode === null) setMode(onboarded ? "app" : "funnel"); }, [hydrated, prefsHydrated, onboarded, mode]);
  // "Start over" in Settings wipes the farm: go back to the funnel.
  useEffect(() => { if (mode === "app" && hydrated && !onboarded) setMode("funnel"); }, [mode, hydrated, onboarded]);

  if (mode === null) return <div className="grid h-full place-items-center bg-bg text-sm text-fg-muted">{t("common.loading")}</div>;
  if (mode === "funnel" || mode === "intro") return <Funnel introOnly={mode === "intro"} onDone={() => setMode("app")} />;
  return <Shell onReplayIntro={() => setMode("intro")} />;
}

function Shell({ onReplayIntro }: { onReplayIntro: () => void }) {
  const t = useT();
  const farm = useFarm();
  const refresh = useRisk((s) => s.refresh);
  const [tab, setTab] = useState<Tab>("farm");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const open = farm.fields.find((f) => f.id === openId) ?? null;
  const closeDetail = useCallback(() => setOpenId(null), []);
  const closeAdd = useCallback(() => setAdding(false), []);
  useBackClose(!!open, closeDetail);
  useBackClose(adding, closeAdd);

  useEffect(() => { refresh(farm.fields, farm.profile.badYearsIn); }, [farm.fields, farm.profile.badYearsIn, refresh]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "farm", label: t("mobile.tabFarm"), icon: <Home size={23} /> },
    { id: "alerts", label: t("mobile.tabAlerts"), icon: <Bell size={23} /> },
    { id: "settings", label: t("mobile.tabSettings"), icon: <Settings size={23} /> },
  ];

  return (
    <div className="relative flex h-full flex-col bg-bg text-fg">
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === "farm" && <FarmTab onOpen={(id) => { haptic(); farm.select(id); setOpenId(id); }} onAdd={() => setAdding(true)} />}
        {tab === "alerts" && <AlertsTab />}
        {tab === "settings" && <SettingsTab onReplayIntro={onReplayIntro} />}
      </main>

      <nav className={cn("flex shrink-0 border-t border-line bg-surface/95 backdrop-blur", SAFE_BOTTOM, "pb-[max(env(safe-area-inset-bottom),6px)]")} aria-label="FieldShift">
        {tabs.map((x) => (
          <button key={x.id} type="button" aria-current={tab === x.id ? "page" : undefined} onClick={() => { haptic(); setTab(x.id); }}
            className={cn("flex flex-1 flex-col items-center gap-0.5 pb-1 pt-2 text-[11px] font-medium transition-colors", tab === x.id ? "text-primary" : "text-fg-subtle")}>
            {x.icon}{x.label}
          </button>
        ))}
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div key="detail" className="absolute inset-0 z-40 flex flex-col bg-bg"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 32, stiffness: 300 }}>
            <FieldDetail field={open} onBack={() => history.back()} />
          </motion.div>
        )}
      </AnimatePresence>
      <AddFieldSheet open={adding} onClose={() => history.back()} />
    </div>
  );
}

// ---------- Farm tab ----------

function FarmTab({ onOpen, onAdd }: { onOpen: (id: string) => void; onAdd: () => void }) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const farm = useFarm();
  const risks = useRisk((s) => s.byId);
  const [sharing, setSharing] = useState(false);
  const totalHa = farm.fields.reduce((s, f) => s + f.areaHa, 0);
  const mapFields = useMemo(() => farm.fields.map((f) => ({ id: f.id, name: f.name, centroid: f.centroid, geometry: f.geometry })), [farm.fields]);
  const riskById = useMemo(() => Object.fromEntries(Object.entries(risks).map(([k, v]) => [k, v?.level])), [risks]);
  const attention = farm.fields.filter((f) => risks[f.id] && risks[f.id]!.level !== "safe")
    .sort((a, b) => RANK[risks[a.id]!.level] - RANK[risks[b.id]!.level] || risks[a.id]!.marginDT - risks[b.id]!.marginDT);
  const center = farm.place ?? farm.fields[0]?.centroid ?? { lat: 45.9, lon: 25 };

  async function share() {
    setSharing(true);
    try { await getHost().saveFile(`fieldshift-${(farm.name || "farm").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`, buildReportHtml(farm, risks, t, locale), "text/html"); }
    finally { setSharing(false); }
  }

  return (
    <div className={cn("pb-28", SAFE_TOP)}>
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-2">
        <div className="min-w-0">
          <h1 className="display truncate text-[28px]">{farm.name}</h1>
          <p className="num mt-1 text-[13px] text-fg-muted">
            {farm.fields.length} {t("workspace.fields").toLowerCase()} · {totalHa.toLocaleString(locale === "ro" ? "ro-RO" : "en-US")} ha
            {farm.demo && <span className="ml-2 rounded-full bg-data-soft px-2 py-0.5 text-[11px] font-medium text-data">{t("workspace.demoBadge")}</span>}
          </p>
        </div>
        <button type="button" aria-label={t("mobile.shareReport")} onClick={share} disabled={!farm.fields.length || sharing}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-surface shadow-[var(--shadow)] active:bg-surface-2 disabled:opacity-40"><Share2 size={20} /></button>
      </header>

      <div className="mx-5 h-[220px] overflow-hidden rounded-2xl shadow-[var(--shadow)]">
        <FieldMap center={center} zoom={11} fields={mapFields} selectedId={null} riskById={riskById} fitFields={farm.fields.length > 0} onSelect={onOpen} className="relative h-full w-full" />
      </div>

      {attention.length > 0 && (
        <section className="mt-6 px-5">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-fg-muted">{t("mobile.needsAttention")}</h2>
          <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {attention.map((f) => {
              const r = risks[f.id]!;
              return (
                <button key={f.id} type="button" onClick={() => onOpen(f.id)}
                  className={cn("w-[72%] shrink-0 snap-start rounded-2xl p-4 text-left active:scale-[0.98]", r.level === "over" ? "bg-heat-soft" : "bg-warn-soft")}>
                  <span className={cn("text-[12px] font-semibold uppercase tracking-wide", r.level === "over" ? "text-heat" : "text-warn")}>{t(`common.risk_${r.level}`)}</span>
                  <span className="mt-1 block truncate text-[17px] font-semibold">{f.name}</span>
                  <span className="num mt-0.5 block truncate text-[13px] text-fg-muted">
                    {r.level === "over" ? f.rotation.map((c) => t(`crops.${c}`)).join(" → ") : t("mobile.marginShort", { dT: r.marginDT.toFixed(1) })}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-6 px-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-fg-muted">{t("mobile.allFields")}</h2>
        {farm.fields.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong p-6 text-center">
            <p className="font-semibold">{t("mobile.noFields")}</p>
            <p className="mt-1 text-[14px] text-fg-muted">{t("mobile.noFieldsBody")}</p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {farm.fields.map((f, i) => (
              <li key={f.id} className={cn(i > 0 && "border-t border-line")}>
                <button type="button" onClick={() => onOpen(f.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-2">
                  <img src={`/icons/${f.crop}.svg`} alt="" className="size-9 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">{f.name}</span>
                    <span className="num block truncate text-[13px] text-fg-muted">{f.areaHa} ha · {f.rotation.map((c) => t(`crops.${c}`)).join(" → ")}</span>
                  </span>
                  <RiskBadge id={f.id} />
                  <ChevronRight size={18} className="shrink-0 text-fg-subtle" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" onClick={() => { haptic(); onAdd(); }}
        className="fixed bottom-[calc(max(env(safe-area-inset-bottom),6px)+72px)] right-5 z-30 flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-[16px] font-semibold text-primary-fg shadow-[0_8px_24px_rgb(31_81_53/0.35)] active:scale-95">
        <Plus size={22} />{t("mobile.addField")}
      </button>
    </div>
  );
}

// ---------- Field detail ----------

function FieldDetail({ field, onBack }: { field: Field; onBack: () => void }) {
  const t = useT();
  const profile = useFarm((s) => s.profile);
  const removeField = useFarm((s) => s.removeField);
  const tab = useAnalysis((s) => s.tab);
  const scroller = useRef<HTMLDivElement>(null);
  // A new analysis tab starts at its top (the tab row and "See rotations" links switch tabs mid-page).
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [tab]);
  return (
    <>
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-line bg-surface/95 px-2 pb-2 backdrop-blur", SAFE_TOP)}>
        <button type="button" aria-label={t("common.back")} onClick={onBack} className="grid size-11 place-items-center rounded-full active:bg-surface-2"><ChevronLeft size={28} /></button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold">{field.name}</h1>
          <p className="num truncate text-[12px] text-fg-muted">{field.areaHa} ha · {field.rotation.map((c) => t(`crops.${c}`)).join(" → ")}</p>
        </div>
        <RiskBadge id={field.id} />
        <button type="button" aria-label={t("mobile.deleteField")} className="grid size-11 place-items-center rounded-full text-fg-muted active:bg-heat-soft active:text-heat"
          onClick={() => { if (window.confirm(t("mobile.deleteConfirm"))) { onBack(); removeField(field.id); } }}><Trash2 size={19} /></button>
      </header>
      <div ref={scroller} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3", SAFE_BOTTOM)}>
        <Analysis field={field} profile={profile} />
      </div>
    </>
  );
}

// ---------- Alerts tab ----------

function AlertsTab() {
  const t = useT();
  const fields = useFarm((s) => s.fields);
  const today = new Date();
  return (
    <div className={cn("px-5 pb-8", SAFE_TOP)}>
      <h1 className="display pb-4 pt-2 text-[28px]">{t("mobile.tabAlerts")}</h1>
      {fields.length === 0 && <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-fg-muted">{t("mobile.noFieldsBody")}</p>}
      <div className="flex flex-col gap-4">
        {fields.map((f) => (
          <section key={f.id} className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="mb-2 flex items-center gap-2 text-[16px] font-semibold"><img src={`/icons/${f.crop}.svg`} alt="" className="size-6" />{f.name}</h2>
            <AlertsPanel lat={f.centroid.lat} lon={f.centroid.lon} crop={f.crop} stage={stageOn(f.crop, today)} />
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------- Settings tab ----------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-2 text-[15px]"><span className="min-w-0">{label}</span>{children}</div>;
}
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-fg-muted">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{children}</div>
    </section>
  );
}
function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; l: React.ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex overflow-hidden rounded-full border border-line-strong text-[13px]" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => { haptic(); onChange(o.v); }}
          className={cn("flex items-center gap-1 px-3 py-1.5 font-medium", value === o.v ? "bg-primary text-primary-fg" : "text-fg-muted")}>{o.l}</button>
      ))}
    </div>
  );
}
function Chips<T extends string>({ all, on, label, toggle }: { all: T[]; on: T[]; label: (v: T) => string; toggle: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2 px-4 py-3">
      {all.map((v) => (
        <button key={v} type="button" aria-pressed={on.includes(v)} onClick={() => { haptic(); toggle(v); }}
          className={cn("rounded-full border px-3 py-2 text-[14px]", on.includes(v) ? "border-primary bg-primary-soft text-primary" : "border-line-strong text-fg-muted")}>{label(v)}</button>
      ))}
    </div>
  );
}

function SettingsTab({ onReplayIntro }: { onReplayIntro: () => void }) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const { currency, setCurrency } = useCurrency();
  const farm = useFarm();
  const prefs = useMobile();
  const p = farm.profile;
  const fx = FX[currency];
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className={cn("px-5 pb-10", SAFE_TOP)}>
      <h1 className="display pb-1 pt-2 text-[28px]">{t("mobile.tabSettings")}</h1>

      <Group title={t("mobile.farmSection")}>
        <div className="px-4 py-3">
          <p className="text-[15px]">{t("mobile.toleranceRow")}</p>
          <p className="num mt-1 text-[22px] font-semibold text-primary">{t("mobile.tolLine", { n: p.badYearsIn })}</p>
          <input type="range" min={2} max={10} value={p.badYearsIn} aria-label={t("mobile.toleranceRow")} onChange={(e) => farm.setProfile({ badYearsIn: +e.target.value })} className="mt-2 h-9 w-full accent-[var(--primary)]" />
        </div>
        <Row label={t("mobile.alertsRow")}>
          <Seg label={t("mobile.alertsRow")} value={prefs.alerts ? "on" : "off"} onChange={(v) => prefs.set({ alerts: v === "on" })} options={[{ v: "on", l: t("mobile.on") }, { v: "off", l: t("mobile.off") }]} />
        </Row>
      </Group>

      <Group title={t("mobile.meansSection")}>
        <div className="px-4 py-3">
          <p className="text-[15px]">{t("mobile.budget")}</p>
          <div className="mt-2 flex items-center justify-between">
            {p.budgetPerHa == null
              ? <button type="button" className="text-[15px] font-medium text-primary" onClick={() => farm.setProfile({ budgetPerHa: 600 })}>{t("mobile.noLimit")} · +</button>
              : <Stepper label={t("mobile.budget")} unit={`${currency}/ha`} min={0} step={Math.round(50 / fx) || 1}
                  value={Math.round(p.budgetPerHa * fx)} onChange={(v) => farm.setProfile({ budgetPerHa: v / fx })} />}
            {p.budgetPerHa != null && <button type="button" className="text-[13px] text-fg-muted" onClick={() => farm.setProfile({ budgetPerHa: null })}>{t("mobile.noLimit")}</button>}
          </div>
        </div>
        <div>
          <p className="px-4 pt-3 text-[15px]">{t("onboarding.equipment")}</p>
          <Chips all={EQUIPMENT} on={p.equipment} label={(e: Equipment) => t(`onboarding.eq_${e}`)} toggle={(e) => farm.setProfile({ equipment: toggle(p.equipment, e) })} />
        </div>
        <div>
          <p className="px-4 pt-3 text-[15px]">{t("onboarding.sellable")}</p>
          <Chips all={FARM_CROPS.filter((c) => c !== "fallow")} on={p.sellable} label={(c: CropId) => t(`crops.${c}`)} toggle={(c) => farm.setProfile({ sellable: toggle(p.sellable, c) })} />
        </div>
      </Group>

      <Group title={t("mobile.appSection")}>
        <Row label={t("workspace.language")}><Seg label={t("workspace.language")} value={locale} onChange={setLocale} options={LOCALES.map((l) => ({ v: l, l: l.toUpperCase() }))} /></Row>
        <Row label={t("workspace.currency")}><Seg label={t("workspace.currency")} value={currency} onChange={setCurrency} options={(["EUR", "RON", "USD"] as Currency[]).map((c) => ({ v: c, l: c }))} /></Row>
        <Row label={t("workspace.theme")}>
          <Seg label={t("workspace.theme")} value={farm.theme} onChange={farm.setTheme} options={[{ v: "light", l: <Sun size={14} /> }, { v: "dark", l: <Moon size={14} /> }]} />
        </Row>
        <button type="button" className="w-full px-4 py-3.5 text-left text-[15px] font-medium text-primary active:bg-surface-2" onClick={onReplayIntro}>{t("mobile.replayIntro")}</button>
        <button type="button" className="w-full px-4 py-3.5 text-left text-[15px] font-medium text-heat active:bg-heat-soft"
          onClick={() => { if (window.confirm(t("mobile.resetConfirm"))) { prefs.reset(); farm.reset(); } }}>{t("mobile.resetFarm")}</button>
      </Group>
      <p className="mt-6 text-center text-[12px] text-fg-subtle">FieldShift · {t("mobile.version", { v: "2.0.1" })}</p>
    </div>
  );
}

// ---------- Add field sheet ----------

function AddFieldSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { place, fields, addField, demo } = useFarm();
  const size = useMobile((s) => s.size);
  const [pt, setPt] = useState<{ lat: number; lon: number } | null>(null);
  const [name, setName] = useState("");
  const [ha, setHa] = useState(20);
  const [crop, setCrop] = useState<CropId>("maize");
  useEffect(() => {
    if (!open) return;
    setPt(null); setCrop("maize");
    setName(t("onboarding.fieldNameDefault", { n: fields.length + 1 }));
    setHa(size === "xs" ? 3 : size === "m" ? 40 : size === "l" ? 100 : size === "xl" ? 200 : 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const first = fields[0]?.centroid ?? place ?? { lat: 45.9, lon: 25 };

  function create() {
    if (!pt) return;
    addField(newField({ name: name.trim() || t("onboarding.fieldNameDefault", { n: fields.length + 1 }), centroid: pt, areaHa: ha, crop, history: [null, null, null], geometry: circlePolygon(pt, ha), packId: demo && fields[0]?.packId ? fields[0].packId : undefined }));
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("mobile.addTitle")} tall>
      <div className="flex flex-col gap-4 pb-4">
        <div className="relative h-[34dvh] overflow-hidden rounded-2xl">
          <FieldPicker center={first} zoom={13} fields={pt ? [...fields, { id: "new", name, centroid: pt, geometry: circlePolygon(pt, ha) }] : fields}
            selectedId={pt ? "new" : null} onMapClick={(c) => { haptic(12); setPt(c); }} className="relative h-full w-full" />
          <p className="pointer-events-none absolute inset-x-3 top-3 mr-10 rounded-full bg-surface/95 px-3 py-1.5 text-center text-[13px] shadow">{pt ? t("mobile.addPlaced") : t("mobile.addTap")}</p>
        </div>
        <input aria-label={t("onboarding.fieldName")} value={name} onChange={(e) => setName(e.target.value)}
          className="h-12 rounded-xl border border-line-strong bg-surface px-4 font-semibold outline-none focus:border-primary" />
        <Stepper label={t("onboarding.hectares")} unit="ha" value={ha} onChange={setHa} />
        <div>
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-fg-muted">{t("mobile.thisYear")}</p>
          <div className="grid grid-cols-4 gap-2" role="radiogroup">
            {FARM_CROPS.filter((c) => c !== "fallow").map((c) => <CropTile key={c} crop={c} label={t(`crops.${c}`)} selected={crop === c} onClick={() => setCrop(c)} />)}
          </div>
        </div>
        <BigButton disabled={!pt || !name.trim()} onClick={create}>{t("mobile.create")}</BigButton>
      </div>
    </Sheet>
  );
}
