"use client";
// First-run walkthrough: 6 full-screen steps. Skippable; "Try the demo farm" jumps straight to the workspace.
import { NumberInput } from "@/components/ui/number-input";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, MapPin, Plus, Trash2 } from "lucide-react";
import { useT, useCurrency, FX, useLocale, LOCALES, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FARM_CROPS, EQUIPMENT, DEFAULT_PROFILE, demoFarm, newField, useFarm, type Field, type Place, type Profile } from "@/lib/store/farm";
import type { CropId, Equipment } from "@/lib/engine/types";
import { FieldPicker } from "./field-map";
import { LandPicker } from "@/components/landpick/land-picker";
import { landPolygon, type Land } from "@/lib/geo/land";
import type { LngLat } from "@/lib/geo/area";
import { fieldInputCls } from "@/components/workspace/add-field-dialog";
import { PlaceSearch } from "./place-search";

const STEPS = 6;
const DEFAULT_CENTER = { lat: 45.9, lon: 25.0, zoom: 6 }; // Romania
const inputCls = fieldInputCls;

interface DraftField { id: string; name: string; areaHa: number; centroid: { lat: number; lon: number }; ring: LngLat[]; land: Land; crop: CropId; history: (CropId | null)[] }
interface Draft { name: string; place: Place | null; fields: DraftField[]; profile: Profile }

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", active ? "border-primary bg-primary-soft text-primary" : "border-line-strong bg-surface text-fg-muted hover:bg-surface-2")}>
      {children}
    </button>
  );
}

function CropSelect({ value, onChange, allowUnknown, label }: { value: CropId | null; onChange: (c: CropId | null) => void; allowUnknown?: boolean; label: string }) {
  const t = useT();
  return (
    <select aria-label={label} className={cn(inputCls, "w-full")} value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as CropId | null)}>
      {allowUnknown && <option value="">{t("onboarding.unknown")}</option>}
      {FARM_CROPS.map((c) => <option key={c} value={c}>{t(`crops.${c}`)}</option>)}
    </select>
  );
}

export function Onboarding() {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const complete = useFarm((s) => s.complete);
  const currency = useCurrency((s) => s.currency);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ name: "", place: null, fields: [], profile: DEFAULT_PROFILE });
  const [selected, setSelected] = useState<string | null>(null);
  const [land, setLand] = useState<Land | null>(null);
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const setField = (id: string, p: Partial<DraftField>) => setDraft((d) => ({ ...d, fields: d.fields.map((f) => (f.id === id ? { ...f, ...p } : f)) }));

  const center = draft.place ?? DEFAULT_CENTER;
  const zoom = draft.place ? (step >= 2 ? 14 : 11) : 6;
  const canNext = step === 1 ? !!draft.place : step === 2 ? draft.fields.length > 0 : true;
  const totalHa = draft.fields.reduce((s, f) => s + f.areaHa, 0);

  function demo() {
    complete(demoFarm(locale));
  }
  function skip() {
    complete({ name: draft.name, place: draft.place, fields: [], profile: draft.profile });
  }
  function finish() {
    const fields: Field[] = draft.fields.map((f) => newField({ name: f.name, centroid: f.centroid, areaHa: f.areaHa, crop: f.crop, history: f.history, geometry: landPolygon(f.land) }));
    complete({ name: draft.name.trim() || draft.place?.name.split(",")[0] || "FieldShift", place: draft.place, fields, profile: draft.profile });
  }
  function addLand() {
    if (!land) return;
    const f: DraftField = {
      id: `d${Date.now()}`, name: t("onboarding.fieldNameDefault", { n: draft.fields.length + 1 }), areaHa: Math.round(land.areaHa * 10) / 10,
      centroid: land.centroid, ring: land.ring, land, crop: "maize", history: [null, null, null],
    };
    patch({ fields: [...draft.fields, f] });
    setSelected(f.id);
    setLand(null);
  }

  const existing = useMemo(() => draft.fields.map((f) => ({ id: f.id, name: f.name, ring: f.ring })), [draft.fields]);
  const pickPlace = (p: Place) => patch({ place: p, name: draft.name || p.name.split(",")[0] });

  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <header className="flex items-center gap-4 border-b border-line bg-surface px-6 py-3">
        <span className="display text-xl">FieldShift</span>
        <div className="mx-auto flex w-full max-w-md items-center gap-3" aria-label={t("onboarding.stepOf", { n: step + 1, total: STEPS })}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${((step + 1) / STEPS) * 100}%` }} />
          </div>
          <span className="num text-xs text-fg-muted">{step + 1}/{STEPS}</span>
        </div>
        <button className="text-sm text-fg-muted hover:text-fg" onClick={skip}>{t("onboarding.skipSetup")}</button>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        {step === 0 && (
          <div className="mx-auto flex h-full max-w-xl flex-col justify-center px-6 py-10 text-center">
            <h1 className="display text-4xl">{t("onboarding.welcomeTitle")}</h1>
            <p className="mt-4 text-base leading-relaxed text-fg-muted">{t("onboarding.welcomeBody")}</p>
            <p className="mt-8 text-sm font-medium">{t("onboarding.welcomeLang")}</p>
            <div className="mt-3 flex justify-center gap-2" role="group" aria-label={t("common.language")}>
              {LOCALES.map((l: Locale) => <Chip key={l} active={locale === l} onClick={() => setLocale(l)}>{l === "ro" ? "Română" : "English"}</Chip>)}
            </div>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Button size="lg" onClick={() => setStep(1)}>{t("onboarding.start")} <ArrowRight size={18} /></Button>
              <button className="text-sm text-primary underline-offset-4 hover:underline" onClick={demo}>{t("onboarding.demoFarm")}</button>
            </div>
          </div>
        )}

        {step >= 1 && step <= 2 && (
          <div className="grid h-full gap-6 p-6 lg:grid-cols-[minmax(340px,420px)_1fr]">
            <section className="flex min-h-0 flex-col gap-4 overflow-auto">
              {step === 1 ? (
                <>
                  <div>
                    <h1 className="display text-3xl">{t("onboarding.placeTitle")}</h1>
                    <p className="mt-2 text-sm text-fg-muted">{t("onboarding.placeBody")}</p>
                  </div>
                  <label className="flex flex-col gap-1 text-sm font-medium">{t("onboarding.farmName")}
                    <input className={cn(inputCls, "font-normal")} value={draft.name} placeholder={t("onboarding.farmNamePh")} onChange={(e) => patch({ name: e.target.value })} />
                  </label>
                  <PlaceSearch onPick={pickPlace} />
                  <p className="flex items-start gap-2 text-sm text-fg-muted">
                    <MapPin size={16} className="mt-0.5 shrink-0 text-primary" />
                    {draft.place ? <span><b className="text-fg">{t("onboarding.placeChosen")}:</b> {draft.place.name} <span className="num">({draft.place.lat.toFixed(3)}, {draft.place.lon.toFixed(3)})</span></span> : t("onboarding.clickMapHint")}
                  </p>
                </>
              ) : (
                <>
                  <div>
                    <h1 className="display text-3xl">{t("onboarding.fieldsTitle")}</h1>
                    <p className="mt-2 text-sm text-fg-muted">{t("onboarding.fieldsBody")}</p>
                  </div>
                  <div className={cn("flex items-center gap-3 rounded-[var(--radius)] border p-3", land ? "border-primary/40 bg-primary-soft" : "border-dashed border-line-strong")}>
                    <p className="min-w-0 flex-1 text-sm">{land ? <span className="font-medium">{t("onboarding.selectionArea", { ha: land.areaHa.toLocaleString(locale === "ro" ? "ro-RO" : "en-US", { maximumFractionDigits: 1 }) })}</span> : <span className="text-fg-muted">{t("onboarding.selectFirst")}</span>}</p>
                    <Button size="sm" disabled={!land} onClick={addLand}><Plus size={14} />{t("onboarding.addThisField")}</Button>
                  </div>
                  {draft.fields.length === 0 && <p className="text-sm text-fg-muted">{t("onboarding.noFields")}</p>}
                  <ul className="flex flex-col gap-3">
                    {draft.fields.map((f) => (
                      <li key={f.id} onClick={() => setSelected(f.id)}
                        className={cn("flex items-end gap-2 rounded-[var(--radius)] border bg-surface p-3", selected === f.id ? "border-primary shadow-[var(--shadow)]" : "border-line")}>
                        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-fg-muted">{t("onboarding.fieldName")}
                          <input className={cn(inputCls, "text-fg")} value={f.name} onChange={(e) => setField(f.id, { name: e.target.value })} />
                        </label>
                        <div className="flex w-20 flex-col gap-1 text-xs font-medium text-fg-muted">{t("onboarding.hectares")}
                          <span className="num flex h-10 items-center text-sm text-fg">{f.areaHa.toLocaleString(locale === "ro" ? "ro-RO" : "en-US")}</span>
                        </div>
                        <button type="button" aria-label={t("onboarding.removeField")} title={t("onboarding.removeField")} className="mb-1 rounded-full p-2 text-fg-muted hover:bg-surface-2 hover:text-heat"
                          onClick={(e) => { e.stopPropagation(); patch({ fields: draft.fields.filter((x) => x.id !== f.id) }); }}><Trash2 size={16} /></button>
                      </li>
                    ))}
                  </ul>
                  {draft.fields.length > 0 && <p className="text-sm text-fg-muted">{t("onboarding.totalArea", { ha: totalHa.toLocaleString(locale === "ro" ? "ro-RO" : "en-US") })}</p>}
                </>
              )}
            </section>
            <section className="min-h-[320px] overflow-hidden rounded-[var(--radius)] border border-line">
              {step === 1 ? (
                <div className="relative h-full">
                  <FieldPicker
                    center={center} zoom={zoom} fields={[]} marker={draft.place} className="relative h-full w-full"
                    onMapClick={(c) => pickPlace({ name: `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`, ...c })}
                  />
                  <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-glass px-3 py-1.5 text-xs text-fg-muted shadow-[var(--shadow)] backdrop-blur">{t("onboarding.clickMapHint")}</p>
                </div>
              ) : (
                <LandPicker land={land} onLandChange={setLand} existing={existing} hideSearch
                  initialView={{ lat: center.lat, lon: center.lon, zoom: draft.place ? 13.4 : 6 }} />
              )}
            </section>
          </div>
        )}

        {step === 3 && (
          <div className="mx-auto max-w-3xl px-6 py-8">
            <h1 className="display text-3xl">{t("onboarding.cropsTitle")}</h1>
            <p className="mt-2 text-sm text-fg-muted">{t("onboarding.cropsBody")}</p>
            <div className="mt-6 flex flex-col gap-4">
              {draft.fields.map((f) => (
                <div key={f.id} className="rounded-[var(--radius)] border border-line bg-surface p-4">
                  <div className="flex items-baseline justify-between"><h2 className="font-semibold">{f.name}</h2><span className="num text-xs text-fg-muted">{f.areaHa} ha</span></div>
                  <div className="mt-3 grid grid-cols-4 gap-3">
                    {[0, 1, 2].map((i) => (
                      <label key={i} className="flex flex-col gap-1 text-xs font-medium text-fg-muted">{i === 2 ? t("onboarding.lastYear") : t("onboarding.yearsAgo", { n: 3 - i })}
                        <CropSelect allowUnknown label={`${f.name} ${i}`} value={f.history[i]} onChange={(c) => setField(f.id, { history: f.history.map((h, j) => (j === i ? c : h)) })} />
                      </label>
                    ))}
                    <label className="flex flex-col gap-1 text-xs font-semibold text-primary">{t("onboarding.thisYear")}
                      <CropSelect label={`${f.name} now`} value={f.crop} onChange={(c) => setField(f.id, { crop: c ?? "maize" })} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && <ProfileStep profile={draft.profile} onChange={(p) => patch({ profile: { ...draft.profile, ...p } })} currency={currency} />}

        {step === 5 && (
          <div className="mx-auto flex h-full max-w-xl flex-col justify-center px-6 py-10">
            <h1 className="display text-3xl">{t("onboarding.toleranceTitle")}</h1>
            <p className="mt-2 text-sm text-fg-muted">{t("onboarding.toleranceBody")}</p>
            <p className="mt-8 text-2xl font-semibold tracking-tight">{t("onboarding.toleranceLine", { n: draft.profile.badYearsIn })}</p>
            <input type="range" min={2} max={10} step={1} value={draft.profile.badYearsIn} aria-label={t("onboarding.toleranceLine", { n: draft.profile.badYearsIn })}
              className="mt-4 w-full accent-[var(--primary)]" onChange={(e) => patch({ profile: { ...draft.profile, badYearsIn: +e.target.value } })} />
            <div className="num mt-1 flex justify-between text-xs text-fg-muted"><span>1 / 2</span><span>1 / 10</span></div>
            <p className="mt-4 rounded-[var(--radius-sm)] bg-primary-soft p-3 text-sm text-primary">
              {draft.profile.badYearsIn <= 3 ? t("onboarding.toleranceHint1") : draft.profile.badYearsIn <= 6 ? t("onboarding.toleranceHint2") : t("onboarding.toleranceHint3")}
            </p>
          </div>
        )}
      </main>

      {step > 0 && (
        <footer className="flex items-center justify-between border-t border-line bg-surface px-6 py-3">
          <Button variant="ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={16} /> {t("common.back")}</Button>
          {step < STEPS - 1 ? (
            <Button disabled={!canNext} onClick={() => { setStep(step + 1); if (step === 1 && !draft.name && draft.place) patch({ name: draft.place.name.split(",")[0] }); }}>{t("common.next")} <ArrowRight size={16} /></Button>
          ) : (
            <Button size="lg" onClick={finish}>{t("onboarding.analyse")} <ArrowRight size={18} /></Button>
          )}
        </footer>
      )}
    </div>
  );
}

function ProfileStep({ profile, onChange, currency }: { profile: Profile; onChange: (p: Partial<Profile>) => void; currency: "EUR" | "RON" | "USD" }) {
  const t = useT();
  const fx = FX[currency];
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="display text-3xl">{t("onboarding.profileTitle")}</h1>
      <p className="mt-2 text-sm text-fg-muted">{t("onboarding.profileBody")}</p>
      <label className="mt-6 flex flex-wrap items-center gap-3 text-sm font-medium">{t("onboarding.budget")}
        <span className="flex items-center gap-2 font-normal">
          <NumberInput className="w-44" min={0} allowEmpty placeholder={t("onboarding.noLimit")} suffix={`${currency}/ha`} aria-label={t("onboarding.budget")}
            value={profile.budgetPerHa == null ? null : Math.round(profile.budgetPerHa * fx)}
            onValueChange={(v) => onChange({ budgetPerHa: v == null ? null : v / fx })} />
        </span>
      </label>
      <fieldset className="mt-6"><legend className="mb-2 text-sm font-medium">{t("onboarding.equipment")}</legend>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((e: Equipment) => <Chip key={e} active={profile.equipment.includes(e)} onClick={() => onChange({ equipment: toggle(profile.equipment, e) })}>{t(`onboarding.eq_${e}`)}</Chip>)}
        </div>
        <p className="mt-2 text-xs text-fg-muted">{t("onboarding.equipmentNone")}</p>
      </fieldset>
      <fieldset className="mt-6"><legend className="mb-2 text-sm font-medium">{t("onboarding.sellable")}</legend>
        <div className="flex flex-wrap gap-2">
          {FARM_CROPS.filter((c) => c !== "fallow").map((c) => <Chip key={c} active={profile.sellable.includes(c)} onClick={() => onChange({ sellable: toggle(profile.sellable, c) })}>{t(`crops.${c}`)}</Chip>)}
        </div>
        <p className="mt-2 text-xs text-fg-muted">{t("onboarding.sellableNone")}</p>
      </fieldset>
    </div>
  );
}


