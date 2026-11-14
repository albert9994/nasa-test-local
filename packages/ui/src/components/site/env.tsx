"use client";
// Bridges the host framework (Next.js on the web) into the framework-neutral site components:
// the host supplies a Link component, the current pathname and a navigate function.
import { createContext, useContext, useEffect, type AnchorHTMLAttributes, type ComponentType, type ReactNode } from "react";
import { LocaleContext, useLocale, useT, type Locale } from "@/lib/i18n";

export type SiteLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
export interface SiteEnv {
  Link: ComponentType<SiteLinkProps>;
  pathname: string;
  navigate(href: string): void;
}
const Anchor = (p: SiteLinkProps) => <a {...p} />;
const Ctx = createContext<SiteEnv>({
  Link: Anchor,
  pathname: "/",
  navigate: (href) => { window.location.assign(href); },
});
export const useSiteEnv = () => useContext(Ctx);
export const SiteEnvProvider = Ctx.Provider;

/** Provides the URL locale to every `useT()` (so server-rendered HTML matches the page language) and syncs the store. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    if (useLocale.getState().locale !== locale) useLocale.setState({ locale });
  }, [locale]);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** `/ro` + `/map` → `/ro/map`. */
export function useLocalePath() {
  const { locale } = useT();
  return (path = "") => `/${locale}${path === "/" ? "" : path}`;
}
