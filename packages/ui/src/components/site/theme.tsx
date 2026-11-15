"use client";
// Website theme: the visitor's saved choice (`hotar-theme`, shared with the app) or the system setting.
// The layout sets `data-theme` before first paint; this hook mirrors it and lets the nav toggle it.
import { useCallback, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type SiteTheme = "light" | "dark";

function read(): SiteTheme {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

/** Current theme of the page; re-renders when `data-theme` changes (from any component). */
export function useSiteTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as SiteTheme);
  const toggle = useCallback(() => {
    const next: SiteTheme = read() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("hotar-theme", next); } catch { /* private mode */ }
  }, []);
  return { theme, toggle };
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useT();
  const { theme, toggle } = useSiteTheme();
  const dark = theme === "dark";
  return (
    <button type="button" onClick={toggle} aria-label={dark ? t("site.themeLight") : t("site.themeDark")} title={dark ? t("site.themeLight") : t("site.themeDark")}
      className={cn("grid size-9 place-items-center rounded-full border border-line bg-surface/70 text-fg-muted transition-colors hover:text-fg", className)}>
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
