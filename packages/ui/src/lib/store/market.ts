"use client";
// O2: market slice. Keeps the market slider values and the per-crop base price/cost overrides.
// The InputsPanel turns these into `opts.prices` / `opts.costs` (see components/inputs/market.tsx).
import { create } from "zustand";
import type { CropId } from "@/lib/engine";

interface MarketState {
  /** pack the values belong to; reset when the farm changes */
  packId: string | null;
  /** crop price change, fraction (-0.3 … 0.3) */
  pricePct: number;
  /** input cost change, fraction (0 … 0.4) */
  inputPct: number;
  /** expert table edits: base values before the market shift */
  basePrices: Partial<Record<CropId, number>>;
  baseCosts: Partial<Record<CropId, number>>;
  setPricePct(v: number): void;
  setInputPct(v: number): void;
  setBasePrice(c: CropId, v: number | undefined): void;
  setBaseCost(c: CropId, v: number | undefined): void;
  reset(packId: string | null): void;
}

const drop = <T,>(o: Partial<Record<CropId, T>>, c: CropId) => {
  const n = { ...o }; delete n[c]; return n;
};

export const useMarket = create<MarketState>((set) => ({
  packId: null, pricePct: 0, inputPct: 0, basePrices: {}, baseCosts: {},
  setPricePct: (pricePct) => set({ pricePct }),
  setInputPct: (inputPct) => set({ inputPct }),
  setBasePrice: (c, v) => set((s) => ({ basePrices: v == null ? drop(s.basePrices, c) : { ...s.basePrices, [c]: v } })),
  setBaseCost: (c, v) => set((s) => ({ baseCosts: v == null ? drop(s.baseCosts, c) : { ...s.baseCosts, [c]: v } })),
  reset: (packId) => set({ packId, pricePct: 0, inputPct: 0, basePrices: {}, baseCosts: {} }),
}));
