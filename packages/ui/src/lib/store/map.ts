"use client";
// Map ↔ live-analysis hand-off. O1's map writes `picked` on a click on empty land; O5's LiveClick reads it.
import { create } from "zustand";

interface MapState {
  picked: { lat: number; lon: number } | null;
  setPicked(p: { lat: number; lon: number } | null): void;
}
export const useMap = create<MapState>((set) => ({
  picked: null,
  setPicked: (picked) => set({ picked }),
}));
