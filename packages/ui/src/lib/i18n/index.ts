"use client";
// Tiny i18n for FieldShift (works in Next.js and the Tauri/Vite desktop app; no framework router needed).
// Messages live in ./messages/<namespace>.ts as { en: {...}, ro: {...} } and are registered in ./messages/index.ts.
// Keys are "namespace.key". Vars: t("margin.sentence", { dT: "1.4" }) replaces {dT}.
// Add a NEW namespace file for a new feature (fewer merge conflicts than editing a shared file).
import { createContext, useContext } from "react";
import { create } from "zustand";
import { MESSAGES } from "./messages";

export type Locale = "ro" | "en";
export const LOCALES: Locale[] = ["ro", "en"];
export type Vars = Record<string, string | number>;

const KEY = "fieldshift.locale";

function initialLocale(): Locale {
  if (typeof window === "undefined") return "ro";
  try {
    const s = window.localStorage.getItem(KEY);
    if (s === "ro" || s === "en") return s;
  } catch { /* storage blocked */ }
  return navigator.language?.toLowerCase().startsWith("ro") ? "ro" : "en";
}

export const useLocale = create<{ locale: Locale; setLocale(l: Locale): void }>((set) => ({
  locale: "ro",
  setLocale(locale) {
    set({ locale });
    try { window.localStorage.setItem(KEY, locale); } catch { /* ignore */ }
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  },
}));

/** Call once on the client when no locale comes from the URL (desktop app). */
export function hydrateLocale() {
  useLocale.getState().setLocale(initialLocale());
}

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const dot = key.indexOf(".");
  const ns = MESSAGES[key.slice(0, dot)];
  const k = key.slice(dot + 1);
  let s = ns?.[locale]?.[k] ?? ns?.en?.[k];
  if (s == null) {
    if (process.env.NODE_ENV !== "production") console.warn(`[i18n] missing ${locale}:${key}`);
    return key;
  }
  if (vars) for (const [n, v] of Object.entries(vars)) s = s.replaceAll(`{${n}}`, String(v));
  return s;
}

/** Optional: server-rendered apps (Next.js) provide the URL locale here so SSR output matches the page locale. */
export const LocaleContext = createContext<Locale | null>(null);
function useActiveLocale(): Locale {
  const stored = useLocale((s) => s.locale);
  return useContext(LocaleContext) ?? stored;
}

export function useT() {
  const locale = useActiveLocale();
  return Object.assign((key: string, vars?: Vars) => translate(locale, key, vars), { locale });
}

// ---------- formatting ----------
export type Currency = "EUR" | "RON" | "USD";
/** Engine money is USD/ha. Display rates are approximate and labelled as such in the UI. */
export const FX: Record<Currency, number> = { USD: 1, EUR: 0.92, RON: 4.58 };
export const useCurrency = create<{ currency: Currency; setCurrency(c: Currency): void }>((set) => ({
  currency: "EUR",
  setCurrency: (currency) => set({ currency }),
}));

export function formatNumber(locale: Locale, v: number, digits = 0) {
  return new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}
export function formatMoney(locale: Locale, usd: number, currency: Currency = "EUR", digits = 0) {
  return new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "en-US", { style: "currency", currency, maximumFractionDigits: digits }).format(usd * FX[currency]);
}
export function useFormat() {
  const locale = useActiveLocale();
  const currency = useCurrency((s) => s.currency);
  return {
    locale, currency,
    num: (v: number, d = 0) => formatNumber(locale, v, d),
    money: (usd: number, d = 0) => formatMoney(locale, usd, currency, d),
    moneyPerHa: (usd: number) => `${formatMoney(locale, usd, currency)}/ha`,
    pct: (frac: number, d = 0) => `${formatNumber(locale, frac * 100, d)} %`,
    temp: (dT: number, d = 1) => `${dT >= 0 ? "+" : "−"}${formatNumber(locale, Math.abs(dT), d)} °C`,
  };
}
