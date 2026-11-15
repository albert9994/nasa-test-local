"use client";
// Mobile-only preferences collected by the onboarding funnel (what worries the farmer, rough farm size, alerts opt-in).
// Kept apart from the farm profile (farm.ts) so the desktop app and the website are untouched. Persisted through the host.
import { create } from "zustand";
import { getHost } from "./farm-storage";

export const GOALS = ["drought", "heat", "prices", "plan"] as const;
export type Goal = (typeof GOALS)[number];
export const SIZES = ["xs", "s", "m", "l", "xl"] as const;
export type SizeBand = (typeof SIZES)[number];
/** Default hectares for a new field, from the farm size the farmer picked. */
export const DEFAULT_FIELD_HA: Record<SizeBand, number> = { xs: 3, s: 15, m: 40, l: 100, xl: 200 };

export interface MobilePrefs {
  goals: Goal[];
  size: SizeBand | null;
  alerts: boolean;
}

interface MobileStore extends MobilePrefs {
  hydrated: boolean;
  hydrate(): Promise<void>;
  set(p: Partial<MobilePrefs>): void;
  reset(): void;
}

const KEY = "mobile.v1";
const EMPTY: MobilePrefs = { goals: [], size: null, alerts: false };

export const useMobile = create<MobileStore>((set, get) => ({
  ...EMPTY,
  hydrated: false,
  async hydrate() {
    if (get().hydrated) return;
    try {
      const raw = await getHost().kvGet(KEY);
      if (raw) set({ ...EMPTY, ...(JSON.parse(raw) as Partial<MobilePrefs>) });
    } catch { /* corrupt: defaults */ }
    set({ hydrated: true });
  },
  set(p) {
    set(p);
    const { goals, size, alerts } = get();
    void getHost().kvSet(KEY, JSON.stringify({ goals, size, alerts })).catch(() => { /* keep in memory */ });
  },
  reset() { get().set(EMPTY); },
}));

/** Light tap feedback where the platform supports it (Android WebView); silently nothing elsewhere. */
export function haptic(ms = 8) {
  try { (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(ms); } catch { /* not supported */ }
}
