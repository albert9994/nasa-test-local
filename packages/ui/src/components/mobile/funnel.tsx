"use client";
// Mobile onboarding funnel, in the style of big consumer apps:
//   intro carousel → personalise (worries, farm size) → trust → place → fields → crops (one field per screen)
//   → risk tolerance → alerts opt-in → "building your plan" (the engine really runs) → reveal (the aha moment) → app.
// One question per screen, the main button in thumb reach, progress on top, always a way back, short skips where optional.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Bell, CheckCircle2, CircleDollarSign, CloudSun, Droplets, Flame, Layers, Loader2, LocateFixed, MapPin, Satellite, Sprout, ThermometerSun, Trash2 } from "lucide-react";
import { LOCALES, useLocale, useT } from "@/lib/i18n";
import { FARM_CROPS, circlePolygon, demoFarm, newField, useFarm, type Place } from "@/lib/store/farm";
import { DEFAULT_FIELD_HA, GOALS, SIZES, haptic, useMobile, type Goal, type SizeBand } from "@/lib/store/mobile";
import type { CropId } from "@/lib/engine/types";
import { cn } from "@/lib/utils";
import { FieldPicker } from "@/components/onboarding/field-map";
import { PlaceSearch } from "@/components/onboarding/place-search";
import { useRisk } from "@/components/workspace/risk";
import { BigButton, ChoiceCard, CropTile, FunnelHeader, SAFE_BOTTOM, SAFE_TOP, Stepper } from "./kit";

type Step = "intro" | "goals" | "size" | "trust" | "place" | "fields" | "crops" | "tolerance" | "alerts" | "build" | "reveal";
const QUESTIONS: Step[] = ["goals", "size", "trust", "place", "fields", "crops", "tolerance", "alerts"];
const ROMANIA = { lat: 45.9, lon: 25.0 };

interface DraftField { id: string; name: string; areaHa: number; centroid: { lat: number; lon: number }; crop: CropId; history: (CropId | null)[] }

const GOAL_ICON: Record<Goal, ReactNode> = {
  drought: <Droplets size={22} />, heat: <Flame size={22} />, prices: <CircleDollarSign size={22} />, plan: <Layers size={22} />,
};

/** Slide/fade between screens; direction follows forward/back. */
function Pane({ k, dir, children }: { k: string; dir: number; children: ReactNode }) {
  return (
    <motion.div key={k} className="absolute inset-0 flex flex-col bg-bg"
      initial={{ x: dir * 48, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: dir * -48, opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="px-6 pb-4 pt-2">
      <h1 className="display text-[28px] leading-[1.1]">{children}</h1>
      {sub && <p className="mt-2 text-[15px] leading-snug text-fg-muted">{sub}</p>}
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <div className={cn("shrink-0 bg-gradient-to-t from-bg via-bg to-bg/0 px-5 pt-3", SAFE_BOTTOM)}>{children}</div>;
}

export function Funnel({ onDone, introOnly }: { onDone: () => void; /** replay just the intro slides from Settings */ introOnly?: boolean }) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const prefs = useMobile();
  const complete = useFarm((s) => s.complete);
  const [step, setStep] = useState<Step>("intro");
  const [dir, setDir] = useState(1);
  const [place, setPlace] = useState<Place | null>(null);
  const [fields, setFields] = useState<DraftField[]>([]);
  const [cropIdx, setCropIdx] = useState(0);
  const [badYearsIn, setBadYearsIn] = useState(5);
  const [farmFields, setFarmFields] = useState<{ id: string; name: string }[]>([]);

  const go = (s: Step, d = 1) => { setDir(d); setStep(s); };
  const qIndex = QUESTIONS.indexOf(step);
  const next = () => go(QUESTIONS[qIndex + 1] ?? "build");
  const back = () => {
    if (step === "crops" && cropIdx > 0) { setDir(-1); setCropIdx(cropIdx - 1); return; }
    go(qIndex <= 0 ? "intro" : QUESTIONS[qIndex - 1], -1);
  };
  const defaultHa = DEFAULT_FIELD_HA[prefs.size ?? "s"];

  function startDemo() {
    const d = demoFarm(locale);
    complete(d);
    setBadYearsIn(d.profile.badYearsIn);
    setFarmFields(d.fields.map((f) => ({ id: f.id, name: f.name })));
    useRisk.getState().refresh(d.fields, d.profile.badYearsIn);
    go("build");
  }

  function finishSetup() {
    const built = fields.map((f) => newField({ name: f.name, centroid: f.centroid, areaHa: f.areaHa, crop: f.crop, history: f.history, geometry: circlePolygon(f.centroid, f.areaHa) }));
    complete({ name: place?.name.split(",")[0] || "FieldShift", place, fields: built, profile: { budgetPerHa: null, equipment: [], sellable: [], badYearsIn } });
    setFarmFields(built.map((f) => ({ id: f.id, name: f.name })));
    useRisk.getState().refresh(built, badYearsIn);
    go("build");
  }

  const header = qIndex >= 0 && (
    <FunnelHeader step={qIndex + 1} total={QUESTIONS.length} onBack={back}
      onSkip={step === "goals" || step === "size" || step === "trust" ? next : undefined} />
  );

  return (
    <div className="relative h-full overflow-hidden bg-bg text-fg">
      <AnimatePresence initial={false} custom={dir}>
        {step === "intro" && (
          <Pane k="intro" dir={dir}>
            <Intro onStart={() => (introOnly ? onDone() : go("goals"))} onDemo={introOnly ? undefined : startDemo} />
          </Pane>
        )}

        {step === "goals" && (
          <Pane k="goals" dir={dir}>
            {header}
            <Title sub={t("mobile.goalsBody")}>{t("mobile.goalsTitle")}</Title>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pb-4" role="group">
              {GOALS.map((g) => (
                <ChoiceCard key={g} multi selected={prefs.goals.includes(g)} icon={GOAL_ICON[g]} title={t(`mobile.goal_${g}`)} hint={t(`mobile.goal_${g}_d`)}
                  onClick={() => prefs.set({ goals: prefs.goals.includes(g) ? prefs.goals.filter((x) => x !== g) : [...prefs.goals, g] })} />
              ))}
            </div>
            <Footer><BigButton disabled={!prefs.goals.length} onClick={next}>{t("mobile.continue")}</BigButton></Footer>
          </Pane>
        )}

        {step === "size" && (
          <Pane k="size" dir={dir}>
            {header}
            <Title sub={t("mobile.sizeBody")}>{t("mobile.sizeTitle")}</Title>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pb-4" role="radiogroup">
              {SIZES.map((s: SizeBand) => (
                <ChoiceCard key={s} selected={prefs.size === s} title={t(`mobile.size_${s}`)}
                  onClick={() => { prefs.set({ size: s }); setTimeout(next, 220); /* single choice: move on by itself */ }} />
              ))}
            </div>
          </Pane>
        )}

        {step === "trust" && (
          <Pane k="trust" dir={dir}>
            {header}
            <Title sub={t("mobile.trustBody")}>{t("mobile.trustTitle")}</Title>
            <ul className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pb-4">
              {([["power", <CloudSun key="i" size={22} />], ["cmip", <ThermometerSun key="i" size={22} />], ["soil", <Sprout key="i" size={22} />], ["sat", <Satellite key="i" size={22} />]] as const).map(([k, icon], i) => (
                <motion.li key={k} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i + 0.1 }}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-data-soft text-data">{icon}</span>
                  <span><span className="block text-[16px] font-semibold">{t(`mobile.trust_${k}`)}</span><span className="block text-[13px] text-fg-muted">{t(`mobile.trust_${k}_d`)}</span></span>
                </motion.li>
              ))}
              <li className="mt-1 flex items-center gap-2 px-1 text-[13px] text-fg-muted"><CheckCircle2 size={16} className="text-ok" />{t("mobile.trustNote")}</li>
            </ul>
            <Footer><BigButton onClick={next}>{t("mobile.continue")}</BigButton></Footer>
          </Pane>
        )}

        {step === "place" && (
          <Pane k="place" dir={dir}>
            {header}
            <PlaceStep place={place} onPlace={setPlace} />
            <Footer><BigButton disabled={!place} onClick={next}>{t("mobile.continue")}</BigButton></Footer>
          </Pane>
        )}

        {step === "fields" && (
          <Pane k="fields" dir={dir}>
            {header}
            <FieldsStep center={place ?? ROMANIA} fields={fields} setFields={setFields} defaultHa={defaultHa} />
            <Footer><BigButton disabled={!fields.length} onClick={() => { setCropIdx(0); next(); }}>{t("mobile.continue")}</BigButton></Footer>
          </Pane>
        )}

        {step === "crops" && fields[cropIdx] && (
          <Pane k={`crops-${cropIdx}`} dir={dir}>
            {header}
            <CropsStep field={fields[cropIdx]} n={cropIdx + 1} total={fields.length}
              onChange={(p) => setFields(fields.map((f, i) => (i === cropIdx ? { ...f, ...p } : f)))} />
            <Footer>
              <BigButton onClick={() => { if (cropIdx < fields.length - 1) { setDir(1); setCropIdx(cropIdx + 1); } else next(); }}>{t("mobile.continue")}</BigButton>
            </Footer>
          </Pane>
        )}

        {step === "tolerance" && (
          <Pane k="tolerance" dir={dir}>
            {header}
            <Title sub={t("mobile.tolBody")}>{t("mobile.tolTitle")}</Title>
            <ToleranceStep value={badYearsIn} onChange={setBadYearsIn} />
            <Footer><BigButton onClick={next}>{t("mobile.continue")}</BigButton></Footer>
          </Pane>
        )}

        {step === "alerts" && (
          <Pane k="alerts" dir={dir}>
            {header}
            <AlertsStep fieldName={fields[0]?.name ?? "FieldShift"} onDone={(on) => { prefs.set({ alerts: on }); finishSetup(); }} />
          </Pane>
        )}

        {step === "build" && (
          <Pane k="build" dir={dir}>
            <Building fieldIds={farmFields.map((f) => f.id)} onDone={() => go("reveal")} />
          </Pane>
        )}

        {step === "reveal" && (
          <Pane k="reveal" dir={dir}>
            <Reveal fields={farmFields} badYearsIn={badYearsIn} onOpen={onDone} />
          </Pane>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- intro carousel ----------

function Intro({ onStart, onDemo }: { onStart: () => void; onDemo?: () => void }) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const [i, setI] = useState(0);
  const slides = [
    { title: t("mobile.intro1Title"), body: t("mobile.intro1Body"), art: <ArtField /> },
    { title: t("mobile.intro2Title"), body: t("mobile.intro2Body"), art: <ArtMargin /> },
    { title: t("mobile.intro3Title"), body: t("mobile.intro3Body"), art: <ArtRotation /> },
  ];
  const last = i === slides.length - 1;
  // Auto-advance like store onboarding carousels; any touch stops it.
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || last) return;
    const id = setTimeout(() => setI((x) => Math.min(x + 1, slides.length - 1)), 4200);
    return () => clearTimeout(id);
  }, [i, auto, last, slides.length]);

  return (
    <div className={cn("flex h-full flex-col", SAFE_TOP)} onPointerDown={() => setAuto(false)}>
      <div className="flex items-center justify-between px-5 py-1">
        <span className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-primary">
          <img src="/brand/mark.svg" alt="" className="size-6" />FieldShift
        </span>
        <div className="flex overflow-hidden rounded-full border border-line-strong text-[13px]" role="group" aria-label={t("common.language")}>
          {LOCALES.map((l) => (
            <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)}
              className={cn("px-3 py-1.5 font-medium", locale === l ? "bg-primary text-primary-fg" : "text-fg-muted")}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <motion.div className="relative min-h-0 flex-1 touch-pan-y" drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.25}
        onDragEnd={(_, info) => {
          if (info.offset.x < -50 && i < slides.length - 1) { haptic(); setI(i + 1); }
          else if (info.offset.x > 50 && i > 0) { haptic(); setI(i - 1); }
        }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={i} className="absolute inset-0 flex flex-col"
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.28 }}>
            <div className="grid min-h-0 flex-1 place-items-center px-8">{slides[i].art}</div>
            <div className="px-7 pb-2">
              <h1 className="display text-[30px] leading-[1.08]">{slides[i].title}</h1>
              <p className="mt-3 text-[16px] leading-snug text-fg-muted">{slides[i].body}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <div className="flex justify-center gap-2 py-4" role="tablist">
        {slides.map((_, k) => (
          <button key={k} type="button" role="tab" aria-selected={k === i} aria-label={`${k + 1}`} onClick={() => { setAuto(false); setI(k); }}
            className={cn("h-2 rounded-full transition-all", k === i ? "w-6 bg-primary" : "w-2 bg-line-strong")} />
        ))}
      </div>
      <Footer>
        <BigButton onClick={() => (last ? onStart() : (setAuto(false), setI(i + 1)))}>
          {last ? t("mobile.getStarted") : t("common.next")} <ArrowRight size={20} />
        </BigButton>
        {onDemo && <BigButton variant="ghost" className="mt-1" onClick={onDemo}>{t("mobile.haveDemo")}</BigButton>}
      </Footer>
    </div>
  );
}

function ArtField() {
  const bars = [3, 5, 4, 8, 6, 11, 9, 14, 12, 17];
  return (
    <div className="relative w-full max-w-[300px]">
      <div className="absolute -right-3 -top-4 rotate-6 rounded-2xl border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-heat shadow-[var(--shadow)]">
        <Flame size={14} className="mr-1 inline" />32 °C+
      </div>
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[15px] font-semibold"><img src="/icons/maize.svg" alt="" className="size-6" />Lanul Mare</span>
          <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn">95 ha</span>
        </div>
        <div className="mt-5 flex h-24 items-end gap-1.5">
          {bars.map((h, k) => (
            <motion.span key={k} className={cn("flex-1 rounded-t-md", k >= 7 ? "bg-heat" : "bg-data")}
              initial={{ height: 0 }} animate={{ height: `${(h / 17) * 100}%` }} transition={{ delay: 0.05 * k, duration: 0.4 }} />
          ))}
        </div>
        <div className="num mt-2 flex justify-between text-[11px] text-fg-subtle"><span>2000</span><span>2025</span></div>
      </div>
    </div>
  );
}

function ArtMargin() {
  const r = 70, c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-[220px] place-items-center">
      <svg viewBox="0 0 180 180" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="90" cy="90" r={r} fill="none" stroke="var(--line)" strokeWidth="14" />
        <motion.circle cx="90" cy="90" r={r} fill="none" stroke="var(--primary)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * 0.38 }} transition={{ duration: 1.1, ease: "easeOut" }} />
      </svg>
      <div className="text-center">
        <p className="num text-[44px] font-semibold tracking-tight text-primary">+1.8°</p>
        <p className="text-[13px] font-medium text-fg-muted">°C</p>
      </div>
    </div>
  );
}

function ArtRotation() {
  const crops: CropId[] = ["maize", "wheat", "sunflower"];
  return (
    <div className="flex w-full max-w-[300px] flex-col gap-3">
      {[0, 1].map((row) => (
        <motion.div key={row} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 * row }}
          className={cn("flex items-center gap-2 rounded-2xl border bg-surface p-3 shadow-[var(--shadow)]", row === 0 ? "border-primary" : "border-line opacity-70")}>
          {(row === 0 ? crops : ["maize", "maize", "wheat"] as CropId[]).map((c, k) => (
            <span key={k} className="flex items-center gap-2">
              {k > 0 && <ArrowRight size={14} className="text-fg-subtle" />}
              <img src={`/icons/${c}.svg`} alt="" className="size-9" />
            </span>
          ))}
          <span className={cn("ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold", row === 0 ? "bg-ok-soft text-ok" : "bg-heat-soft text-heat")}>
            {row === 0 ? "+2.4 °C" : "+0.6 °C"}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

// ---------- place ----------

async function reverseName(lat: number, lon: number, lang: string): Promise<string | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&accept-language=${lang}&lat=${lat}&lon=${lon}`, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = (await r.json()) as { name?: string; display_name?: string };
    return j.display_name ?? j.name ?? null;
  } catch { return null; }
}

function PlaceStep({ place, onPlace }: { place: Place | null; onPlace: (p: Place) => void }) {
  const t = useT();
  const [geo, setGeo] = useState<"idle" | "busy" | "denied">("idle");
  const coords = (lat: number, lon: number) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

  function locate() {
    if (!("geolocation" in navigator)) { setGeo("denied"); return; }
    setGeo("busy");
    navigator.geolocation.getCurrentPosition(async (p) => {
      const { latitude: lat, longitude: lon } = p.coords;
      onPlace({ name: coords(lat, lon), lat, lon });
      setGeo("idle");
      const name = await reverseName(lat, lon, t.locale);
      if (name) onPlace({ name, lat, lon });
    }, () => setGeo("denied"), { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Title sub={t("mobile.placeBody")}>{t("mobile.placeTitle")}</Title>
      <div className="flex flex-col gap-3 px-5">
        <BigButton variant="soft" onClick={locate} disabled={geo === "busy"}>
          {geo === "busy" ? <Loader2 size={20} className="animate-spin" /> : <LocateFixed size={20} />}
          {geo === "busy" ? t("mobile.locating") : t("mobile.useLocation")}
        </BigButton>
        {geo === "denied" && <p className="text-[13px] text-warn">{t("mobile.locationDenied")}</p>}
        <p className="text-center text-[13px] text-fg-subtle">{t("mobile.orSearch")}</p>
        <PlaceSearch onPick={onPlace} />
      </div>
      <div className="relative mx-5 mt-3 min-h-[160px] flex-1 overflow-hidden rounded-2xl">
        <FieldPicker center={place ?? ROMANIA} zoom={place ? 11 : 5.5} fields={[]} marker={place}
          onMapClick={(c) => { haptic(); onPlace({ name: coords(c.lat, c.lon), ...c }); }} className="relative h-full w-full" />
        <p className="pointer-events-none absolute inset-x-3 top-3 mr-10 truncate rounded-full bg-surface/95 px-3 py-1.5 text-center text-[13px] shadow">
          {place ? <><MapPin size={13} className="mr-1 inline text-primary" />{place.name.split(",").slice(0, 2).join(",")}</> : t("mobile.tapMap")}
        </p>
      </div>
    </div>
  );
}

// ---------- fields ----------

function FieldsStep({ center, fields, setFields, defaultHa }: { center: { lat: number; lon: number }; fields: DraftField[]; setFields: (f: DraftField[]) => void; defaultHa: number }) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const mapFields = useMemo(() => fields.map((f) => ({ id: f.id, name: f.name, centroid: f.centroid, geometry: circlePolygon(f.centroid, f.areaHa) })), [fields]);
  const total = fields.reduce((s, f) => s + f.areaHa, 0);
  const patch = (id: string, p: Partial<DraftField>) => setFields(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));

  function add(c: { lat: number; lon: number }) {
    haptic(12);
    const f: DraftField = { id: `d${Date.now()}`, name: t("onboarding.fieldNameDefault", { n: fields.length + 1 }), areaHa: defaultHa, centroid: c, crop: "maize", history: [null, null, null] };
    setFields([...fields, f]);
    setSelected(f.id);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Title sub={t("mobile.fieldsBody")}>{t("mobile.fieldsTitle")}</Title>
      <div className="relative mx-5 h-[38dvh] shrink-0 overflow-hidden rounded-2xl">
        <FieldPicker center={center} zoom={13.5} fields={mapFields} selectedId={selected} marker={fields.length ? null : center} onMapClick={add} onSelect={setSelected} className="relative h-full w-full" />
      </div>
      <p className="num px-6 pt-3 text-[13px] text-fg-muted">
        {fields.length ? t("mobile.fieldsTotal", { n: fields.length, ha: total.toLocaleString(t.locale === "ro" ? "ro-RO" : "en-US") }) : t("mobile.fieldsEmpty")}
      </p>
      <ul ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 py-2">
        <AnimatePresence initial={false}>
          {fields.map((f) => (
            <motion.li key={f.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40 }}
              onClick={() => setSelected(f.id)}
              className={cn("flex flex-col gap-2 rounded-2xl border-2 bg-surface p-3", selected === f.id ? "border-primary" : "border-line")}>
              <div className="flex items-center gap-2">
                <input aria-label={t("onboarding.fieldName")} value={f.name} onChange={(e) => patch(f.id, { name: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1 font-semibold outline-none focus:bg-surface-2" />
                <button type="button" aria-label={t("mobile.remove")} onClick={(e) => { e.stopPropagation(); haptic(); setFields(fields.filter((x) => x.id !== f.id)); }}
                  className="grid size-9 place-items-center rounded-full text-fg-muted active:bg-heat-soft active:text-heat"><Trash2 size={17} /></button>
              </div>
              <Stepper label={t("onboarding.hectares")} unit="ha" value={f.areaHa} onChange={(v) => patch(f.id, { areaHa: v })} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

// ---------- crops ----------

function CropsStep({ field, n, total, onChange }: { field: DraftField; n: number; total: number; onChange: (p: Partial<DraftField>) => void }) {
  const t = useT();
  const crops = FARM_CROPS.filter((c) => c !== "fallow");
  const setHist = (i: number, c: CropId | null) => onChange({ history: field.history.map((h, j) => (j === i ? c : h)) });
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {total > 1 && <p className="px-6 text-[13px] font-medium text-primary">{t("mobile.fieldOf", { n, total })}</p>}
      <Title sub={t("mobile.cropsBody")}>{t("mobile.cropsTitle", { name: field.name })}</Title>
      <div className="px-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-fg-muted">{t("mobile.thisYear")}</h2>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t("mobile.thisYear")}>
          {crops.map((c) => <CropTile key={c} crop={c} label={t(`crops.${c}`)} selected={field.crop === c} onClick={() => onChange({ crop: c })} />)}
        </div>
        {([[2, "lastYear"], [1, "twoYearsAgo"]] as const).map(([i, key]) => (
          <div key={key} className="mt-5">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-fg-muted">{t(`mobile.${key}`)}</h2>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label={t(`mobile.${key}`)}>
              <CropTile small crop={null} label={t("mobile.notSure")} selected={field.history[i] == null} onClick={() => setHist(i, null)} />
              {FARM_CROPS.map((c) => <CropTile small key={c} crop={c} label={t(`crops.${c}`)} selected={field.history[i] === c} onClick={() => setHist(i, c)} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- tolerance ----------

function ToleranceStep({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useT();
  const hint = value <= 3 ? "tol_cautious" : value <= 6 ? "tol_balanced" : "tol_relaxed";
  return (
    <div className="flex flex-1 flex-col justify-center px-6">
      <p className="text-center text-[34px] font-semibold tracking-tight">{t("mobile.tolLine", { n: value })}</p>
      <div className="mx-auto mt-6 grid max-w-[300px] grid-cols-5 gap-2" aria-hidden>
        {Array.from({ length: value }, (_, i) => (
          <motion.span key={`${value}-${i}`} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.02 * i }}
            className={cn("grid aspect-square place-items-center rounded-xl", i === 0 ? "bg-heat-soft text-heat" : "bg-ok-soft text-ok")}>
            {i === 0 ? <Flame size={20} /> : <Sprout size={20} />}
          </motion.span>
        ))}
      </div>
      <input type="range" min={2} max={10} step={1} value={value} aria-label={t("mobile.tolLine", { n: value })}
        onChange={(e) => { haptic(4); onChange(+e.target.value); }}
        className="mt-8 h-10 w-full accent-[var(--primary)]" />
      <div className="num flex justify-between text-[13px] text-fg-muted"><span>1 / 2</span><span>1 / 10</span></div>
      <p className="mt-5 rounded-2xl bg-primary-soft p-4 text-center text-[15px] font-medium text-primary">{t(`mobile.${hint}`)}</p>
    </div>
  );
}

// ---------- alerts opt-in ----------

function AlertsStep({ fieldName, onDone }: { fieldName: string; onDone: (on: boolean) => void }) {
  const t = useT();
  const [blocked, setBlocked] = useState(false);
  async function enable() {
    // In-app alerts always work; system notifications only where the webview supports them.
    const N = typeof window !== "undefined" ? (window as Window & { Notification?: typeof Notification }).Notification : undefined;
    if (N && N.permission !== "granted") {
      try {
        const r = await N.requestPermission();
        if (r === "denied") { setBlocked(true); setTimeout(() => onDone(true), 1600); return; }
      } catch { /* not supported: in-app only */ }
    }
    onDone(true);
  }
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", damping: 18, delay: 0.15 }}
          className="w-full max-w-[330px] rounded-2xl border border-line bg-surface/95 p-3.5 shadow-[0_12px_32px_rgb(20_32_26/0.14)] backdrop-blur">
          <div className="flex items-center gap-2 text-[12px] text-fg-muted">
            <img src="/brand/mark.svg" alt="" className="size-5 rounded" /><span className="font-semibold uppercase tracking-wide">FieldShift</span>
            <span className="ml-auto">{t("mobile.alertsSampleField", { name: "" }).replace(/^ · /, "")}</span>
          </div>
          <p className="mt-1.5 text-[15px] font-semibold">❄️ {t("mobile.alertsSample")}</p>
          <p className="text-[13px] text-fg-muted">{fieldName}</p>
        </motion.div>
        <span className="mt-10 grid size-16 place-items-center rounded-full bg-primary-soft text-primary"><Bell size={30} /></span>
        <h1 className="display mt-5 text-center text-[28px] leading-[1.1]">{t("mobile.alertsTitle")}</h1>
        <p className="mt-3 text-center text-[15px] leading-snug text-fg-muted">{t("mobile.alertsBody")}</p>
        {blocked && <p className="mt-3 text-center text-[13px] text-warn">{t("mobile.alertsBlocked")}</p>}
      </div>
      <Footer>
        <BigButton onClick={enable}><Bell size={20} />{t("mobile.alertsOn")}</BigButton>
        <BigButton variant="ghost" className="mt-1" onClick={() => onDone(false)}>{t("mobile.later")}</BigButton>
      </Footer>
    </>
  );
}

// ---------- building your plan ----------

const BUILD_STEPS = ["build_weather", "build_soil", "build_climate", "build_margin"] as const;

function Building({ fieldIds, onDone }: { fieldIds: string[]; onDone: () => void }) {
  const t = useT();
  const [ticked, setTicked] = useState(0);
  const [slow, setSlow] = useState(false);
  const resolved = useRisk((s) => fieldIds.filter((id) => s.byId[id] || s.failed[id]).length);
  const allDone = resolved >= fieldIds.length;

  // Tick the checklist at a readable pace; hold the last line until the engine has answered (or give up after 25 s).
  useEffect(() => {
    if (ticked >= BUILD_STEPS.length - 1 && !allDone) return;
    if (ticked >= BUILD_STEPS.length) return;
    const id = setTimeout(() => setTicked((n) => n + 1), 900);
    return () => clearTimeout(id);
  }, [ticked, allDone]);
  useEffect(() => { if (ticked >= BUILD_STEPS.length) { haptic(20); const id = setTimeout(onDone, 500); return () => clearTimeout(id); } }, [ticked, onDone]);
  useEffect(() => {
    const s = setTimeout(() => setSlow(true), 7000);
    const g = setTimeout(() => setTicked(BUILD_STEPS.length), 25000);
    return () => { clearTimeout(s); clearTimeout(g); };
  }, []);

  const pct = Math.round((Math.min(ticked, BUILD_STEPS.length) / BUILD_STEPS.length) * 100);
  return (
    <div className={cn("flex h-full flex-col items-center justify-center px-8", SAFE_TOP, SAFE_BOTTOM)} role="status" aria-live="polite">
      <div className="relative grid size-32 place-items-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--line)" strokeWidth="7" />
          <motion.circle cx="50" cy="50" r="44" fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 44} animate={{ strokeDashoffset: 2 * Math.PI * 44 * (1 - pct / 100) }} transition={{ duration: 0.6 }} />
        </svg>
        <span className="num text-[28px] font-semibold">{pct}%</span>
      </div>
      <h1 className="display mt-8 text-center text-[26px]">{t("mobile.buildTitle")}</h1>
      <ul className="mt-6 flex w-full max-w-[320px] flex-col gap-3">
        {BUILD_STEPS.map((k, i) => (
          <li key={k} className={cn("flex items-center gap-3 text-[15px] transition-opacity", i > ticked && "opacity-35")}>
            {i < ticked ? <CheckCircle2 size={22} className="shrink-0 text-ok" /> : i === ticked ? <Loader2 size={22} className="shrink-0 animate-spin text-primary" /> : <span className="size-[22px] shrink-0 rounded-full border-2 border-line-strong" />}
            {t(`mobile.${k}`)}
          </li>
        ))}
      </ul>
      {slow && !allDone && <p className="mt-6 max-w-[320px] text-center text-[13px] text-fg-muted">{t("mobile.buildSlow")}</p>}
    </div>
  );
}

// ---------- reveal ----------

const LEVEL_TONE = { safe: "bg-ok-soft text-ok", tight: "bg-warn-soft text-warn", over: "bg-heat-soft text-heat" } as const;

function Reveal({ fields, badYearsIn, onOpen }: { fields: { id: string; name: string }[]; badYearsIn: number; onOpen: () => void }) {
  const t = useT();
  const byId = useRisk((s) => s.byId);
  const failed = useRisk((s) => s.failed);
  const levels = fields.map((f) => byId[f.id]?.level).filter(Boolean) as ("safe" | "tight" | "over")[];
  const count = (l: string) => levels.filter((x) => x === l).length;
  const worst = levels.includes("over") ? "over" : levels.includes("tight") ? "tight" : levels.length ? "safe" : "none";
  const hero = fields.map((f) => ({ f, r: byId[f.id] })).filter((x) => x.r).sort((a, b) => a.r!.marginDT - b.r!.marginDT)[0];

  return (
    <div className={cn("flex h-full flex-col", SAFE_TOP)}>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-6">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[13px] font-semibold uppercase tracking-wide text-primary">{t("mobile.revealTitle")}</motion.p>
        {hero && (
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, type: "spring", damping: 16 }} className="mt-3">
            {hero.r!.level === "over" ? (
              <p className="display text-[44px] leading-none text-heat">{t("common.risk_over")}</p>
            ) : (
              <p className="num text-[64px] font-semibold leading-none tracking-tight text-primary">{t("mobile.revealMargin", { dT: hero.r!.marginDT.toFixed(1) })}</p>
            )}
            <p className="mt-2 text-[16px] leading-snug text-fg-muted">
              {hero.r!.level === "over" ? t("mobile.tolLine", { n: badYearsIn }) : t("mobile.revealMarginLabel", { n: badYearsIn })} · <b className="text-fg">{hero.f.name}</b>
            </p>
          </motion.div>
        )}
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mt-5 text-[18px] font-semibold leading-snug">
          {t(`mobile.revealLead_${worst}`)}
        </motion.p>
        <div className="mt-4 flex flex-wrap gap-2">
          {count("safe") > 0 && <span className={cn("rounded-full px-3 py-1 text-[13px] font-semibold", LEVEL_TONE.safe)}>{t("mobile.revealSafe", { n: count("safe") })}</span>}
          {count("tight") > 0 && <span className={cn("rounded-full px-3 py-1 text-[13px] font-semibold", LEVEL_TONE.tight)}>{t("mobile.revealTight", { n: count("tight") })}</span>}
          {count("over") > 0 && <span className={cn("rounded-full px-3 py-1 text-[13px] font-semibold", LEVEL_TONE.over)}>{t("mobile.revealOver", { n: count("over") })}</span>}
        </div>
        <ul className="mt-5 flex flex-col gap-2">
          {fields.map((f, i) => {
            const r = byId[f.id];
            return (
              <motion.li key={f.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 + 0.08 * i }}
                className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{f.name}</span>
                  <span className="num block text-[13px] text-fg-muted">{r ? (r.level === "over" ? t("mobile.tolLine", { n: badYearsIn }) : t("mobile.marginShort", { dT: r.marginDT.toFixed(1) })) : failed[f.id] ? t("mobile.revealFailed") : t("mobile.revealPending")}</span>
                </span>
                {r ? <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold", LEVEL_TONE[r.level])}>{t(`common.risk_${r.level}`)}</span>
                  : !failed[f.id] && <Loader2 size={18} className="shrink-0 animate-spin text-fg-subtle" />}
              </motion.li>
            );
          })}
        </ul>
      </div>
      <Footer><BigButton onClick={onOpen}>{t("mobile.openFarm")} <ArrowRight size={20} /></BigButton></Footer>
    </div>
  );
}
