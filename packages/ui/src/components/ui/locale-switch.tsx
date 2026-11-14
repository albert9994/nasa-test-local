"use client";
import { LOCALES, useLocale, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** RO | EN toggle. `onChange` lets the web app switch the URL locale; the desktop app just sets the store. */
export function LocaleSwitch({ onChange, className }: { onChange?: (l: Locale) => void; className?: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <div className={cn("inline-flex rounded-full border border-line bg-surface p-0.5 text-xs font-medium", className)} role="group" aria-label="Language / Limbă">
      {LOCALES.map((l) => (
        <button
          key={l}
          aria-pressed={l === locale}
          onClick={() => { setLocale(l); onChange?.(l); }}
          className={cn("rounded-full px-2.5 py-1 uppercase transition-colors", l === locale ? "bg-primary text-primary-fg" : "text-fg-muted hover:text-fg")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
