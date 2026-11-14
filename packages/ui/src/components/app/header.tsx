"use client";
// App header: wordmark, farm picker, language, currency, farmer/expert mode, theme.
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Segmented } from "@/components/field/segmented";
import { LocaleSwitch } from "@/components/ui/locale-switch";
import { useCurrency, useT, type Currency } from "@/lib/i18n";
import { useApp } from "@/lib/store/app";
import { getEngine, engineVia } from "@/lib/engine";
import { nativeInfo } from "@/lib/engine/tauri";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("fs-theme"); } catch { /* private mode */ }
    const t = saved === "dark" ? "dark" : "light"; // light by default (agri-SaaS look); dark only on request
    document.documentElement.dataset.theme = t;
    setTheme(t);
  }, []);
  const toggle = () => {
    const t = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    setTheme(t);
    try { localStorage.setItem("fs-theme", t); } catch { /* ignore */ }
  };
  return { theme, toggle };
}

export function AppHeader() {
  const t = useT();
  const index = useApp((s) => s.index);
  const farmId = useApp((s) => s.farmId);
  const selectFarm = useApp((s) => s.selectFarm);
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const handle = useApp((s) => s.handle);
  const { currency, setCurrency } = useCurrency();
  const { theme, toggle } = useTheme();
  const [badge, setBadge] = useState("");
  useEffect(() => { { const k = getEngine().kind; setBadge(k === "native" ? `native · ${nativeInfo?.threads ?? 1} threads` : `${k} · ${engineVia()}`); } }, [handle]);

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3">
      <a href="/" className="display text-2xl text-primary">FieldShift</a>
      <select aria-label={t("farm.farm")} className="h-10 min-w-0 max-w-full flex-1 rounded-lg border border-line bg-surface px-2 text-sm sm:max-w-xs"
        value={farmId ?? ""} onChange={(e) => selectFarm(e.target.value)} data-tour="farm-picker">
        {!index.some((f) => f.id === farmId) && <option value={farmId ?? ""}>{farmId ?? t("farm.loading")}</option>}
        {index.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <LocaleSwitch />
        <select aria-label={t("farm.currency")} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="num h-8 rounded-full border border-line bg-surface px-2 text-xs">
          {(["EUR", "RON", "USD"] as Currency[]).map((c) => <option key={c}>{c}</option>)}
        </select>
        <Segmented<"farmer" | "expert"> label={t("farm.mode")} value={mode} onChange={setMode}
          options={[{ value: "farmer", label: t("farm.mode_farmer") }, { value: "expert", label: t("farm.mode_expert") }]} />
        <button type="button" onClick={toggle} aria-label={theme === "dark" ? t("farm.theme_light") : t("farm.theme_dark")}
          className="grid size-8 place-items-center rounded-full border border-line bg-surface text-fg-muted hover:text-fg">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {badge && <span className="num hidden rounded-full border border-line px-2 py-0.5 text-xs text-fg-muted lg:inline">{badge}</span>}
      </div>
    </header>
  );
}
