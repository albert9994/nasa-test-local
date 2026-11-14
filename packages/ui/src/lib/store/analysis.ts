"use client";
// UI state of the field analysis panels (new slice; the app store stays untouched).
import { create } from "zustand";

export const TABS = ["overview", "risk", "stress", "futures", "rotations", "replay", "report", "satellite"] as const;
export type TabId = (typeof TABS)[number];
export type Ssp = "ssp245" | "ssp585";

interface AnalysisState {
  tab: TabId;
  /** cash reserve per hectare in USD (engine money) used by the probability of ruin */
  cashReserve: number;
  ssp: Ssp;
  reportOpen: boolean;
  setTab(t: TabId): void;
  setCashReserve(v: number): void;
  setSsp(s: Ssp): void;
  setReportOpen(o: boolean): void;
}

export const useAnalysis = create<AnalysisState>((set) => ({
  tab: "overview",
  cashReserve: 300,
  ssp: "ssp245",
  reportOpen: false,
  setTab: (tab) => set({ tab }),
  setCashReserve: (cashReserve) => set({ cashReserve: Math.max(0, cashReserve) }),
  setSsp: (ssp) => set({ ssp }),
  setReportOpen: (reportOpen) => set({ reportOpen }),
}));
