"use client";
// Stress-test inputs: rotation builder, climate sliders, bad-year rule, budget/equipment, priorities, levers, market.
// Every control writes through the Zustand store (setRotation / setOpts / setWeights / setConstraints).
import { NumberInput } from "@/components/ui/number-input";
import { fromUsd, toUsd } from "@/components/field/fmt";
import { useF, useNames } from "@/components/field/hooks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CROPS, DEFAULT_SERIES, type CropId, type Equipment } from "@/lib/engine";
import { useCurrency, useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import { MarketSliders, PriceTable, useMarketSync } from "./market";
import { Chip, Field, Section, inputCls } from "./parts";
import { RotationBuilder } from "./rotation-builder";

const EQUIPMENT: Equipment[] = ["row_planter", "grain_drill", "corn_header", "sunflower_header", "irrigation"];
const SHARES = [3, 4, 5, 10];
const CROP_IDS = (Object.keys(CROPS) as CropId[]).filter((c) => c !== "fallow");

function Climate() {
  const t = useT();
  const f = useF();
  const { dT, dP } = useApp((s) => s.opts);
  const pack = useApp((s) => s.pack);
  const setOpts = useApp((s) => s.setOpts);
  const pt = pack?.scenarios?.ssp245?.["2050"] ?? DEFAULT_SERIES.find((p) => p.year === 2050)!;
  const r = (v: number, d: number) => +v.toFixed(d);
  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" className="h-9 flex-1" onClick={() => setOpts({ dT: 0, dP: 0 })}>{t("inputs.today")}</Button>
        <Button variant="outline" className="h-9 flex-1" onClick={() => setOpts({ dT: r(Math.min(5, Math.max(0, pt.dT)), 1), dP: r(Math.min(0, Math.max(-0.5, pt.dP)), 2) })}>{t("inputs.y2050")}</Button>
      </div>
      <Field label={t("inputs.warmer_by")} value={dT} min={0} max={5} step={0.1} format={(v) => f.warm(v)} accent="text-heat" onChange={(v) => setOpts({ dT: v })} />
      <Field label={t("inputs.less_rain")} value={Math.round(-dP * 100)} min={0} max={50} step={1} format={(v) => (v === 0 ? "0 %" : `−${f.num(Math.abs(v))} %`)} accent="text-water" onChange={(v) => setOpts({ dP: -v / 100 })} />
    </>
  );
}

function BadYear() {
  const t = useT();
  const currency = useCurrency((s) => s.currency);
  const { failNet, failShare } = useApp((s) => s.opts);
  const setOpts = useApp((s) => s.setOpts);
  const n = Math.max(2, Math.round(1 / (failShare || 0.2)));
  const options = SHARES.includes(n) ? SHARES : [...SHARES, n].sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-3 text-sm" data-tour="bad-year-rule">
      <label className="flex flex-wrap items-center gap-2">
        <span>{t("inputs.bad_below")}</span>
        <NumberInput className="w-36" value={fromUsd(currency, failNet)} aria-label={t("inputs.bad_threshold_aria")} suffix={`${currency}/ha`}
          onValueChange={(v) => setOpts({ failNet: toUsd(currency, v ?? 0) })} />
      </label>
      <label className="flex flex-wrap items-center gap-2">
        <span>{t("inputs.tolerate")}</span>
        <select aria-label={t("inputs.tolerate_aria")} className={`${inputCls} num`} value={n} onChange={(e) => setOpts({ failShare: 1 / +e.target.value })}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    </div>
  );
}

function Priorities() {
  const t = useT();
  const w = useApp((s) => s.weights);
  const setWeights = useApp((s) => s.setWeights);
  const keys = ["profit", "stability", "soil", "water"] as const;
  return (
    <>
      {keys.map((k) => (
        <Field key={k} label={t(`inputs.p_${k}`)} value={w[k]} min={0} max={5} step={1} format={(v) => `${v} / 5`} onChange={(v) => setWeights({ [k]: v })} />
      ))}
    </>
  );
}

function Levers() {
  const t = useT();
  const f = useF();
  const { irrigCap, sowShift, maturity } = useApp((s) => s.opts);
  const setOpts = useApp((s) => s.setOpts);
  return (
    <>
      <Field label={t("inputs.irrig_cap")} value={irrigCap} min={0} max={250} step={5} format={(v) => `${v} mm`} accent="text-water" onChange={(v) => setOpts({ irrigCap: v })} />
      <Field label={t("inputs.sow_shift")} value={sowShift} min={-20} max={20} step={1} format={(v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} ${t("inputs.days_short")}`} onChange={(v) => setOpts({ sowShift: v })} />
      <Field label={t("inputs.variety")} value={maturity} min={0.85} max={1.15} step={0.01} format={(v) => `×${f.num(v, 2)}`} onChange={(v) => setOpts({ maturity: v })} />
    </>
  );
}

function Profile({ expert }: { expert: boolean }) {
  const t = useT();
  const names = useNames();
  const currency = useCurrency((s) => s.currency);
  const c = useApp((s) => s.constraints);
  const setConstraints = useApp((s) => s.setConstraints);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span>{expert ? t("inputs.spend_expert") : t("inputs.spend_farmer")}</span>
        <NumberInput className="w-40" min={0} allowEmpty placeholder={t("inputs.no_limit")} aria-label={t("inputs.spend_aria")} suffix={`${currency}/ha`}
          value={c.maxCostPerHa != null ? fromUsd(currency, c.maxCostPerHa) : null}
          onValueChange={(v) => setConstraints({ maxCostPerHa: v == null ? undefined : toUsd(currency, v) })} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm">{t("inputs.equipment")}</legend>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((id) => <Chip key={id} active={c.equipment.includes(id)} onClick={() => setConstraints({ equipment: toggle(c.equipment, id) })}>{t(`inputs.equip_${id}`)}</Chip>)}
        </div>
        <p className="text-xs text-fg-muted">{t("inputs.equipment_none")}</p>
      </fieldset>
      {expert && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm">{t("inputs.sellable")}</legend>
          <div className="flex flex-wrap gap-2">
            {CROP_IDS.map((id) => <Chip key={id} active={c.sellable.includes(id)} onClick={() => setConstraints({ sellable: toggle(c.sellable, id) })}>{names.crop(id)}</Chip>)}
          </div>
          <p className="text-xs text-fg-muted">{t("inputs.sellable_none")}</p>
        </fieldset>
      )}
    </>
  );
}

export function InputsPanel() {
  const t = useT();
  const mode = useApp((s) => s.mode);
  const expert = mode === "expert";
  useMarketSync();
  return (
    <Card className="px-4 py-2" aria-label={t("inputs.title")} data-tour="inputs">
      <Section title={t("inputs.rotation")} hint={expert ? undefined : t("inputs.rotation_hint")}><RotationBuilder /></Section>
      <Section title={t("inputs.climate")} hint={expert ? t("inputs.climate_hint_expert") : t("inputs.climate_hint_farmer")} tour="climate-sliders"><Climate /></Section>
      <Section title={expert ? t("inputs.bad_rule_expert") : t("inputs.bad_rule")}><BadYear /></Section>
      <Section title={expert ? t("inputs.budget_expert") : t("inputs.budget")} defaultOpen={!expert}><Profile expert={expert} /></Section>
      <Section title={t("inputs.market")} hint={t("inputs.market_hint")} defaultOpen={false} tour="market-slider"><MarketSliders /></Section>
      {expert && (
        <>
          <Section title={t("inputs.priorities")} hint={t("inputs.priorities_hint")}><Priorities /></Section>
          <Section title={t("inputs.levers")} defaultOpen={false}><Levers /></Section>
          <Section title={t("inputs.prices_costs")} defaultOpen={false}><PriceTable /></Section>
        </>
      )}
    </Card>
  );
}
