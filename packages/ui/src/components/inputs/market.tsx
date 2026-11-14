"use client";
// Market slider + expert prices/costs table. Writes opts.prices / opts.costs for the crops in the rotation.
import { NumberInput } from "@/components/ui/number-input";
import { useEffect, useMemo } from "react";
import { useF, useNames } from "@/components/field/hooks";
import { fromUsd, toUsd } from "@/components/field/fmt";
import { CROPS, type CropId, type Opts } from "@/lib/engine";
import { useCurrency, useT } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import { useMarket } from "@/lib/store/market";
import { Field } from "./parts";


export function basePrice(c: CropId, meta: { prices?: Opts["prices"] } | undefined, over: Opts["prices"]) {
  return over[c] ?? meta?.prices?.[c] ?? CROPS[c].price;
}
export function baseCost(c: CropId, meta: { costs?: Opts["costs"] } | undefined, over: Opts["costs"]) {
  return over[c] ?? meta?.costs?.[c] ?? CROPS[c].cost;
}

/** Keeps opts.prices / opts.costs in sync with the market slice. Mount once. */
export function useMarketSync() {
  const pack = useApp((s) => s.pack);
  const rotation = useApp((s) => s.rotation);
  const setOpts = useApp((s) => s.setOpts);
  const m = useMarket();
  const crops = useMemo(() => [...new Set(rotation.map((s) => s.crop))], [rotation]);
  const key = crops.join(",");
  useEffect(() => {
    if (!pack) return;
    if (m.packId !== pack.meta.id) { m.reset(pack.meta.id); return; }
    const touched = m.pricePct !== 0 || m.inputPct !== 0 || Object.keys(m.basePrices).length > 0 || Object.keys(m.baseCosts).length > 0;
    const prices: Opts["prices"] = {}, costs: Opts["costs"] = {};
    if (touched) {
      for (const c of crops) {
        if (c === "fallow") { if (m.baseCosts[c] != null || m.inputPct) costs[c] = +(baseCost(c, pack.meta, m.baseCosts) * (1 + m.inputPct)).toFixed(2); continue; }
        prices[c] = +(basePrice(c, pack.meta, m.basePrices) * (1 + m.pricePct)).toFixed(2);
        costs[c] = +(baseCost(c, pack.meta, m.baseCosts) * (1 + m.inputPct)).toFixed(2);
      }
    }
    const cur = useApp.getState().opts;
    if (JSON.stringify(cur.prices) !== JSON.stringify(prices) || JSON.stringify(cur.costs) !== JSON.stringify(costs)) setOpts({ prices, costs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack, key, m.packId, m.pricePct, m.inputPct, m.basePrices, m.baseCosts]);
}

export function MarketSliders() {
  const t = useT();
  const f = useF();
  const { pricePct, inputPct, setPricePct, setInputPct } = useMarket();
  return (
    <>
      <Field label={t("inputs.crop_prices")} value={pricePct} min={-0.3} max={0.3} step={0.01} format={f.signedPct} onChange={setPricePct} help={t("inputs.crop_prices_help")} />
      <Field label={t("inputs.input_costs")} value={inputPct} min={0} max={0.4} step={0.01} format={f.signedPct} onChange={setInputPct} />
    </>
  );
}

export function PriceTable() {
  const t = useT();
  const names = useNames();
  const currency = useCurrency((s) => s.currency);
  const pack = useApp((s) => s.pack);
  const rotation = useApp((s) => s.rotation);
  const m = useMarket();
  const crops = [...new Set(rotation.map((s) => s.crop))];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{t("inputs.prices_caption")}</caption>
        <thead>
          <tr className="text-left text-xs text-fg-muted"><th className="py-1 pr-2 font-normal">{t("inputs.th_crop")}</th><th className="px-1 font-normal">{t("inputs.th_price")} ({currency})</th><th className="px-1 font-normal">{t("inputs.th_cost")} ({currency})</th></tr>
        </thead>
        <tbody>
          {crops.map((c) => (
            <tr key={c}>
              <th scope="row" className="py-1 pr-2 text-left font-normal">{names.crop(c)}</th>
              <td className="px-1 py-1">
                <NumberInput
                  min={0} aria-label={t("inputs.price_aria", { crop: names.crop(c) })} disabled={c === "fallow"}
                  className="w-full max-w-28" inputClassName="h-9 disabled:opacity-40"
                  value={fromUsd(currency, basePrice(c, pack?.meta, m.basePrices))}
                  onValueChange={(v) => m.setBasePrice(c, v == null ? undefined : toUsd(currency, v))}
                />
              </td>
              <td className="px-1 py-1">
                <NumberInput
                  min={0} aria-label={t("inputs.cost_aria", { crop: names.crop(c) })}
                  className="w-full max-w-28" inputClassName="h-9"
                  value={fromUsd(currency, baseCost(c, pack?.meta, m.baseCosts))}
                  onValueChange={(v) => m.setBaseCost(c, v == null ? undefined : toUsd(currency, v))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(Object.keys(m.basePrices).length > 0 || Object.keys(m.baseCosts).length > 0) && (
        <button type="button" className="mt-1 text-xs text-fg-muted underline" onClick={() => m.reset(m.packId)}>{t("inputs.reset_defaults")}</button>
      )}
    </div>
  );
}
