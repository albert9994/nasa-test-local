"use client";
// Small hooks shared by the analysis panels.
import { useCallback } from "react";
import { cropName, type CropId, type Rotation } from "@/lib/engine";
import { useCurrency, useFormat, useLocale, useT } from "@/lib/i18n";
import { fmtRainCut, fmtSignedMoney, fmtSignedPct, fmtWarm } from "./fmt";

/** Localised crop and rotation names (engine names are English). */
export function useNames() {
  const t = useT();
  const crop = useCallback((c: CropId) => { const k = `crops.${c}`; const s = t(k); return s === k ? cropName(c) : s; }, [t]);
  const rotation = useCallback(
    (r: Rotation, sep = " → ") => (r.length ? r.map((s) => crop(s.crop).toLowerCase() + (s.cover ? ` + ${t("inputs.cover_short")}` : "")).join(sep) : t("analysis.no_rotation")),
    [crop, t],
  );
  return { crop, rotation };
}

/** Formatting helpers bound to the current locale and currency. */
export function useF() {
  const f = useFormat();
  const locale = useLocale((s) => s.locale);
  const currency = useCurrency((s) => s.currency);
  return {
    ...f,
    warm: (dT: number, d = 1) => fmtWarm(locale, dT, d),
    rainCut: (dP: number) => fmtRainCut(locale, dP),
    signedMoney: (usd: number, d = 0) => fmtSignedMoney(locale, currency, usd, d),
    signedPct: (frac: number) => fmtSignedPct(locale, frac),
  };
}
