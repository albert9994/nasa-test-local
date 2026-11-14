// Pure number formatting for the analysis panels (testable without React).
import { FX, formatMoney, formatNumber, type Currency, type Locale } from "@/lib/i18n";

const MINUS = "−";

/** "+1,4 °C" / "+1.4 °C": a warming amount, always signed. */
export function fmtWarm(locale: Locale, dT: number, digits = 1): string {
  return `${dT < 0 ? MINUS : "+"}${formatNumber(locale, Math.abs(dT), digits)} °C`;
}
/** Rain cut as a positive share: dP = -0.2 gives "20 %". */
export function fmtRainCut(locale: Locale, dP: number): string {
  return `${formatNumber(locale, Math.abs(dP) * 100, 0)} %`;
}
/** "+€120" / "−€45" (engine USD in, display currency out). */
export function fmtSignedMoney(locale: Locale, currency: Currency, usd: number, digits = 0): string {
  const r = Math.round(usd * FX[currency]);
  if (r === 0) return formatMoney(locale, 0, currency, digits);
  return `${r < 0 ? MINUS : "+"}${formatMoney(locale, Math.abs(usd), currency, digits)}`;
}
/** Plain-text share, "12 %". */
export function fmtShare(locale: Locale, frac: number, digits = 0): string {
  return `${formatNumber(locale, frac * 100, digits)} %`;
}
/** "3/25" */
export function fmtRatio(n: number, total: number): string {
  return `${n}/${total}`;
}
/** Price change shown on the stress test, "+10 %" / "−5 %" / "0 %". */
export function fmtSignedPct(locale: Locale, frac: number): string {
  const v = Math.round(frac * 100);
  return `${v > 0 ? "+" : v < 0 ? MINUS : ""}${formatNumber(locale, Math.abs(v), 0)} %`;
}
/** Convert what a farmer typed in the display currency back to engine USD. */
export function toUsd(currency: Currency, shown: number): number {
  return shown / FX[currency];
}
export function fromUsd(currency: Currency, usd: number): number {
  return Math.round(usd * FX[currency]);
}
