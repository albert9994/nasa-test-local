"use client";
// Slim navigation rail of the desktop app: Farm, Assistant, then Guide and Settings at the bottom.
// Settings open in a popover (language, currency, theme, start over).
import { useEffect, useRef, useState } from "react";
import { CircleHelp, Map as MapIcon, MessageCircle, Moon, RotateCcw, Settings2, Sprout, Sun, type LucideIcon } from "lucide-react";
import { useCurrency, useLocale, useT, LOCALES, type Currency } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useFarm } from "@/lib/store/farm";
import { useTour } from "@/components/tour/tour";
import { useView, type View } from "./view";

function NavButton({ icon: Icon, label, active, onClick, tour, expanded }: { icon: LucideIcon; label: string; active?: boolean; onClick(): void; tour?: string; expanded?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} aria-current={active ? "page" : undefined} aria-expanded={expanded} data-tour={tour} title={label}
      className={cn(
        "group flex w-14 flex-col items-center gap-1 rounded-xl py-2 text-[10.5px] font-medium transition-colors",
        active ? "text-fg" : "text-fg-subtle hover:text-fg",
      )}
    >
      <span className={cn("grid size-9 place-items-center rounded-[10px] transition-colors", active ? "bg-primary-soft text-primary" : "group-hover:bg-surface-2")}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: React.ReactNode }[]; onChange(v: T): void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-full bg-surface-3 p-0.5">
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}
          className={cn("flex flex-1 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
            value === o.v ? "bg-surface text-fg shadow-[var(--shadow)]" : "text-fg-muted hover:text-fg")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SettingsPopover({ onClose }: { onClose(): void }) {
  const t = useT();
  const farm = useFarm();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const { currency, setCurrency } = useCurrency();
  const row = "flex items-center justify-between gap-4 text-sm";
  return (
    <div role="dialog" aria-label={t("workspace.settings")}
      className="absolute bottom-3 left-[76px] z-40 w-[300px] rounded-[var(--radius)] border border-line bg-surface p-4 shadow-[var(--shadow-lg)]">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">{t("workspace.settings")}</p>
      <div className="flex flex-col gap-3">
        <div className={row}><span className="text-fg-muted">{t("workspace.language")}</span>
          <Segmented label={t("workspace.language")} value={locale} onChange={setLocale} options={LOCALES.map((l) => ({ v: l, label: l === "ro" ? "Română" : "English" }))} /></div>
        <div className={row}><span className="text-fg-muted">{t("workspace.currency")}</span>
          <Segmented<Currency> label={t("workspace.currency")} value={currency} onChange={setCurrency} options={(["EUR", "RON", "USD"] as Currency[]).map((c) => ({ v: c, label: c }))} /></div>
        <div className={row}><span className="text-fg-muted">{t("workspace.theme")}</span>
          <Segmented label={t("workspace.theme")} value={farm.theme} onChange={farm.setTheme}
            options={[{ v: "light", label: <><Sun className="size-3.5" aria-hidden />{t("workspace.light")}</> }, { v: "dark", label: <><Moon className="size-3.5" aria-hidden />{t("workspace.dark")}</> }]} /></div>
      </div>
      <div className="mt-4 border-t border-line pt-3">
        <button type="button" className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-danger"
          onClick={() => { if (window.confirm(t("workspace.resetConfirm"))) { onClose(); farm.reset(); } }}>
          <RotateCcw className="size-3.5" aria-hidden />{t("workspace.resetFarm")}
        </button>
      </div>
    </div>
  );
}

export function Rail() {
  const t = useT();
  const view = useView((s) => s.view);
  const setView = useView((s) => s.setView);
  const start = useTour((s) => s.start);
  const [settings, setSettings] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settings) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setSettings(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSettings(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [settings]);

  const go = (v: View) => () => setView(v);
  return (
    <nav ref={ref} aria-label="Hotar" className="relative z-30 flex h-full w-[72px] shrink-0 flex-col items-center border-r border-line bg-surface py-3">
      <div className="mb-4 grid size-10 place-items-center rounded-xl bg-primary text-primary-fg shadow-[var(--shadow)]" title="Hotar">
        <Sprout className="size-5" aria-hidden />
      </div>
      <div className="flex flex-col items-center gap-1">
        <NavButton icon={MapIcon} label={t("workspace.nav_farm")} active={view === "farm"} onClick={go("farm")} />
        <NavButton icon={MessageCircle} label={t("workspace.nav_assistant")} active={view === "assistant"} onClick={go("assistant")} tour="nav-assistant" />
      </div>
      <div className="mt-auto flex flex-col items-center gap-1">
        <NavButton icon={CircleHelp} label={t("workspace.nav_guide")} onClick={() => { setView("farm"); start("workspace"); }} />
        <NavButton icon={Settings2} label={t("workspace.nav_settings")} active={settings} expanded={settings} onClick={() => setSettings((s) => !s)} tour="settings" />
      </div>
      {settings && <SettingsPopover onClose={() => setSettings(false)} />}
    </nav>
  );
}
