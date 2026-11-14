"use client";
// Market slider + expert prices/costs table. Writes opts.prices / opts.costs for the crops in the rotation.
import { useEffect, useMemo } from "react";
import { CROPS, cropName, type CropId, type Opts } from "@/lib/engine";
import { useApp } from "@/lib/store/app";
import { useMarket } from "@/lib/store/market";
import { Field, inputCls } from "./parts";

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

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
  const { pricePct, inputPct, setPricePct, setInputPct } = useMarket();
  return (
    <>
      <Field label="Crop prices" value={pricePct} min={-0.3} max={0.3} step={0.01} format={pct} onChange={setPricePct}
        help="What if grain sells for more or less than usual?" />
      <Field label="Input costs (seed, fuel, fertilizer)" value={inputPct} min={0} max={0.4} step={0.01} format={pct} onChange={setInputPct} />
    </>
  );
}

export function PriceTable() {
  const pack = useApp((s) => s.pack);
  const rotation = useApp((s) => s.rotation);
  const m = useMarket();
  const crops = [...new Set(rotation.map((s) => s.crop))];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Base price and cost per crop, before the market shift</caption>
        <thead>
          <tr className="text-left text-xs text-fg-muted"><th className="py-1 pr-2 font-normal">Crop</th><th className="px-1 font-normal">Price $/t</th><th className="px-1 font-normal">Cost $/ha</th></tr>
        </thead>
        <tbody>
          {crops.map((c) => (
            <tr key={c}>
              <th scope="row" className="py-1 pr-2 text-left font-normal">{cropName(c)}</th>
              <td className="px-1 py-1">
                <input
                  type="number" inputMode="decimal" min={0} aria-label={`${cropName(c)} price in dollars per tonne`} disabled={c === "fallow"}
                  className={`${inputCls} num w-full max-w-24 disabled:opacity-40`}
                  value={basePrice(c, pack?.meta, m.basePrices)}
                  onChange={(e) => m.setBasePrice(c, e.target.value === "" ? undefined : Math.max(0, +e.target.value))}
                />
              </td>
              <td className="px-1 py-1">
                <input
                  type="number" inputMode="decimal" min={0} aria-label={`${cropName(c)} cost in dollars per hectare`}
                  className={`${inputCls} num w-full max-w-24`}
                  value={baseCost(c, pack?.meta, m.baseCosts)}
                  onChange={(e) => m.setBaseCost(c, e.target.value === "" ? undefined : Math.max(0, +e.target.value))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(Object.keys(m.basePrices).length > 0 || Object.keys(m.baseCosts).length > 0) && (
        <button type="button" className="mt-1 text-xs text-fg-muted underline" onClick={() => m.reset(m.packId)}>Reset to defaults</button>
      )}
    </div>
  );
}
