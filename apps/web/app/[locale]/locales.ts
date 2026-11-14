import { MESSAGES } from "@/lib/i18n/messages";

export const LOCALES = ["ro", "en"] as const;
export type SiteLocale = (typeof LOCALES)[number];
export const isLocale = (v: string): v is SiteLocale => (LOCALES as readonly string[]).includes(v);
/** Server-side lookup (the i18n runtime is a client module). */
export const msg = (locale: SiteLocale, ns: string, key: string) => MESSAGES[ns]?.[locale]?.[key] ?? key;
