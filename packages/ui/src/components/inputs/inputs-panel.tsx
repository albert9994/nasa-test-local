"use client";
// O2: rotation builder, priorities, bad-year rule, levers, climate sliders, farmer profile, market slider.
// Every control writes through the Zustand store (setRotation / setOpts / setWeights / setConstraints).
import { CROPS, DEFAULT_SERIES, cropName, type CropId, type Equipment } from "@/lib/engine";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/lib/store/app";
import { MarketSliders, PriceTable, useMarketSync } from "./market";
import { Chip, Field, Section, inputCls } from "./parts";
import { RotationBuilder } from "./rotation-builder";

const EQUIPMENT: [Equipment, string][] = [
  ["row_planter", "Row planter"], ["grain_drill", "Grain drill"], ["corn_header", "Corn header"],
  ["sunflower_header", "Sunflower header"], ["irrigation", "Irrigation"],
];
const SHARES = [3, 4, 5, 10];
const CROP_IDS = (Object.keys(CROPS) as CropId[]).filter((c) => c !== "fallow");
const signed = (v: number, unit: string) => `${v > 0 ? "+" : ""}${v}${unit}`;

function Climate() {
  const { dT, dP } = useApp((s) => s.opts);
  const pack = useApp((s) => s.pack);
  const setOpts = useApp((s) => s.setOpts);
  const pt = pack?.scenarios?.ssp245?.["2050"] ?? DEFAULT_SERIES.find((p) => p.year === 2050)!;
  const r = (v: number, d: number) => +v.toFixed(d);
  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" className="h-9 flex-1" onClick={() => setOpts({ dT: 0, dP: 0 })}>Today</Button>
        <Button variant="outline" className="h-9 flex-1" onClick={() => setOpts({ dT: r(Math.min(5, Math.max(0, pt.dT)), 1), dP: r(Math.min(0, Math.max(-0.5, pt.dP)), 2) })}>2050</Button>
      </div>
      <Field label="Warmer by" value={dT} min={0} max={5} step={0.1} format={(v) => `+${v.toFixed(1)} °C`} accent="text-heat" onChange={(v) => setOpts({ dT: v })} />
      <Field label="Less rain" value={Math.round(dP * 100)} min={-50} max={0} step={1} format={(v) => (v === 0 ? "0 %" : `${v} %`)} accent="text-water" onChange={(v) => setOpts({ dP: v / 100 })} />
    </>
  );
}

function BadYear() {
  const { failNet, failShare } = useApp((s) => s.opts);
  const setOpts = useApp((s) => s.setOpts);
  const n = Math.max(2, Math.round(1 / (failShare || 0.2)));
  const options = SHARES.includes(n) ? SHARES : [...SHARES, n].sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex flex-wrap items-center gap-2">
        <span>A bad year is net income below</span>
        <span className="flex items-center gap-1">
          $<input
            type="number" inputMode="decimal" className={`${inputCls} num w-24`} value={failNet} aria-label="Bad year threshold, net income in dollars per hectare"
            onChange={(e) => setOpts({ failNet: e.target.value === "" ? 0 : +e.target.value })}
          />/ha
        </span>
      </label>
      <label className="flex flex-wrap items-center gap-2">
        <span>I can live with 1 bad year in</span>
        <select aria-label="Tolerated bad years: one in how many" className={`${inputCls} num`} value={n} onChange={(e) => setOpts({ failShare: 1 / +e.target.value })}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    </div>
  );
}

function Priorities() {
  const w = useApp((s) => s.weights);
  const setWeights = useApp((s) => s.setWeights);
  const rows: [keyof typeof w, string][] = [["profit", "Profit"], ["stability", "Stability"], ["soil", "Soil health"], ["water", "Water saving"]];
  return (
    <>
      {rows.map(([k, label]) => (
        <Field key={k} label={label} value={w[k]} min={0} max={5} step={1} format={(v) => `${v} / 5`} onChange={(v) => setWeights({ [k]: v })} />
      ))}
    </>
  );
}

function Levers() {
  const { irrigCap, sowShift, maturity } = useApp((s) => s.opts);
  const setOpts = useApp((s) => s.setOpts);
  return (
    <>
      <Field label="Irrigation cap" value={irrigCap} min={0} max={250} step={5} format={(v) => `${v} mm`} accent="text-water" onChange={(v) => setOpts({ irrigCap: v })} />
      <Field label="Sowing shift" value={sowShift} min={-20} max={20} step={1} format={(v) => signed(v, " d")} onChange={(v) => setOpts({ sowShift: v })} />
      <Field label="Variety length" value={maturity} min={0.85} max={1.15} step={0.01} format={(v) => `×${v.toFixed(2)}`} onChange={(v) => setOpts({ maturity: v })} />
    </>
  );
}

function Profile({ expert }: { expert: boolean }) {
  const c = useApp((s) => s.constraints);
  const setConstraints = useApp((s) => s.setConstraints);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span>{expert ? "Budget, max cost" : "I can spend at most"}</span>
        <span className="flex items-center gap-1">
          $<input
            type="number" inputMode="decimal" min={0} placeholder="no limit" className={`${inputCls} num w-28`} aria-label="Budget, maximum cost in dollars per hectare"
            value={c.maxCostPerHa ?? ""} onChange={(e) => setConstraints({ maxCostPerHa: e.target.value === "" ? undefined : Math.max(0, +e.target.value) })}
          />/ha
        </span>
      </label>
      {expert && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm">Equipment I have</legend>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT.map(([id, label]) => (
                <Chip key={id} active={c.equipment.includes(id)} onClick={() => setConstraints({ equipment: toggle(c.equipment, id) })}>{label}</Chip>
              ))}
            </div>
            <p className="text-xs text-fg-muted">None ticked means no limit.</p>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm">Crops I can sell</legend>
            <div className="flex flex-wrap gap-2">
              {CROP_IDS.map((id) => (
                <Chip key={id} active={c.sellable.includes(id)} onClick={() => setConstraints({ sellable: toggle(c.sellable, id) })}>{cropName(id)}</Chip>
              ))}
            </div>
            <p className="text-xs text-fg-muted">None ticked means any crop.</p>
          </fieldset>
        </>
      )}
    </>
  );
}

export function InputsPanel() {
  const mode = useApp((s) => s.mode);
  const expert = mode === "expert";
  useMarketSync();
  return (
    <Card className="px-4 py-2" aria-label="Inputs">
      <Section title="Rotation" hint={expert ? undefined : "What you grow, year by year"}><RotationBuilder /></Section>
      <Section title="Climate" hint={expert ? "ΔT and rain change applied to daily weather" : "How much hotter and drier?"}><Climate /></Section>
      <Section title={expert ? "Bad-year rule" : "What counts as a bad year"}><BadYear /></Section>
      <Section title={expert ? "Farmer profile" : "Budget"} defaultOpen={!expert}><Profile expert={expert} /></Section>
      {expert && (
        <>
          <Section title="Priorities" hint="0 = don't care, 5 = top"><Priorities /></Section>
          <Section title="Levers" defaultOpen={false}><Levers /></Section>
          <Section title="Market" hint="Shock applied to the crops in your rotation" defaultOpen={false}><MarketSliders /></Section>
          <Section title="Prices and costs" defaultOpen={false}><PriceTable /></Section>
        </>
      )}
    </Card>
  );
}
