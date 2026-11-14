"use client";
// Renders the engine's structured reason codes (`ReasonCode`, `RuleHit.code/vars`) through i18n (messages/reasons.ts).
// Unknown code, unknown namespace key or no code at all -> the caller's English fallback text (what the engine sent).
import { useMemo } from "react";
import type { FactSheet, PickResult, ScoreResult } from "@/lib/engine/types";
import { formatMoney, formatNumber, translate, useCurrency, useT, type Currency, type Locale } from "./index";
import { MESSAGES } from "./messages";

/** Vars that hold USD per hectare / USD amounts: shown in the chosen currency. */
const MONEY = new Set(["cost", "budget", "fert", "stressNet", "deltaNet"]);
/** Vars that hold a crop id. */
const CROPS = new Set(["crop", "legume", "next"]);
/** Typical fertiliser saving credited to a legume (rule 04): USD 55-68 per ha. */
const FERT_USD: [number, number] = [55, 68];

function has(locale: Locale, key: string): boolean {
  return key.slice("reasons.".length) in (MESSAGES.reasons?.[locale] ?? {});
}

function cropName(locale: Locale, id: string): string {
  const k = `crops.${id}`;
  const s = translate(locale, k);
  return (s === k ? id : s).toLowerCase();
}

function equipName(locale: Locale, id: string): string {
  const k = `analysis.equip_${id}`;
  const s = translate(locale, k);
  return s === k ? id : s;
}

/** Variables of a reason in display form (locale-aware numbers, localised names, money in `currency`). */
export function reasonVars(locale: Locale, currency: Currency, rc: { code?: string; [k: string]: unknown }): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(rc)) {
    if (k === "code" || v == null) continue;
    if (typeof v === "number") {
      if (k === "deltaNet") out[k] = `${v < 0 ? "−" : "+"}${formatMoney(locale, Math.abs(v), currency)}`;
      else if (MONEY.has(k)) out[k] = formatMoney(locale, v, currency);
      else out[k] = formatNumber(locale, v, Number.isInteger(v) ? 0 : 2);
    } else if (typeof v === "string") {
      out[k] = CROPS.has(k) ? cropName(locale, v) : k === "equipment" ? equipName(locale, v) : v;
    } else out[k] = String(v);
  }
  if (rc.code === "legume_before_cereal") {
    out.fert = `${formatMoney(locale, FERT_USD[0], currency)}–${formatMoney(locale, FERT_USD[1], currency)}`;
  }
  return out;
}

/** Localised text of one reason; `fallback` (the engine's English string) when the code has no translation. */
export function reasonText(
  locale: Locale, currency: Currency,
  rc: { code?: string; [k: string]: unknown } | null | undefined,
  prefix: "worst" | "pick" | "rule", fallback: string,
): string {
  if (!rc?.code) return fallback;
  const key = `reasons.${prefix}_${rc.code}`;
  if (!has(locale, key)) return fallback;
  return translate(locale, key, reasonVars(locale, currency, rc));
}

/** Hook form: localised worst-year reasons, pick reasons and score-rule reasons for the active locale and currency. */
export function useReasons() {
  const { locale } = useT();
  const currency = useCurrency((s) => s.currency);
  return useMemo(() => ({
    /** Worst-year reasons of a fact sheet, one text per reason (English fallback per entry). */
    worstWhy: (f: Pick<FactSheet, "worstYearWhy" | "worstYearWhyCodes">): string[] =>
      f.worstYearWhy.map((en, i) => reasonText(locale, currency, f.worstYearWhyCodes?.[i], "worst", en)),
    /** Engine reason of a pick, or null when the engine sent no (translatable) code. */
    pickWhy: (p: Pick<PickResult, "why" | "whyCode">): string | null => {
      const s = reasonText(locale, currency, p.whyCode, "pick", "");
      return s || null;
    },
    rule: (r: ScoreResult["rules"][number]): string => reasonText(locale, currency, r.code ? { code: r.code, ...r.vars } : null, "rule", r.reason),
  }), [locale, currency]);
}
