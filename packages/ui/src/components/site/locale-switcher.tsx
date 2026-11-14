"use client";
import { LOCALES, useLocale, useT, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useSiteEnv } from "./env";

/** RO | EN. Switches the URL locale and keeps the rest of the path, query and hash. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale } = useT();
  const { pathname, navigate } = useSiteEnv();
  const go = (l: Locale) => {
    if (l === locale) return;
    useLocale.getState().setLocale(l); // remembers the choice
    const rest = pathname.replace(/^\/(ro|en)(?=\/|$)/, "");
    navigate(`/${l}${rest}${window.location.search}${window.location.hash}`);
  };
  return (
    <div className={cn("inline-flex rounded-full border border-line bg-surface p-0.5 text-xs font-medium", className)} role="group" aria-label="Language / Limbă">
      {LOCALES.map((l) => (
        <button key={l} type="button" aria-pressed={l === locale} onClick={() => go(l)}
          className={cn("rounded-full px-2.5 py-1 uppercase transition-colors", l === locale ? "bg-primary text-primary-fg" : "text-fg-muted hover:text-fg")}>
          {l}
        </button>
      ))}
    </div>
  );
}
