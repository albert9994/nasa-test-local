"use client";
// Which page of the desktop shell is open (farm map or assistant). Kept in a tiny store so any panel can jump to the assistant.
import { create } from "zustand";

export type View = "farm" | "assistant";
export const useView = create<{ view: View; setView(v: View): void }>((set) => ({
  view: "farm",
  setView: (view) => set({ view }),
}));
