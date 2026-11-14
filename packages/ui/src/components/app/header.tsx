"use client";
// O1: wordmark + farm dropdown + farmer/expert toggle + theme toggle + engine badge.
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useApp } from "@/lib/store/app";
import { getEngine, engineVia } from "@/lib/engine";

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
  const index = useApp((s) => s.index);
  const farmId = useApp((s) => s.farmId);
  const selectFarm = useApp((s) => s.selectFarm);
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const handle = useApp((s) => s.handle);
  const { theme, toggle } = useTheme();
  const [badge, setBadge] = useState("");
  useEffect(() => { setBadge(`${getEngine().kind} engine · ${engineVia()}`); }, [handle]);

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
      <a href="/" className="display text-2xl">FieldShift</a>
      <select aria-label="Farm" className="min-w-0 max-w-full flex-1 rounded-md border border-line bg-bg-elev px-2 py-1 text-sm sm:max-w-xs"
        value={farmId ?? ""} onChange={(e) => selectFarm(e.target.value)}>
        {!index.some((f) => f.id === farmId) && <option value={farmId ?? ""}>{farmId ?? "Loading…"}</option>}
        {index.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <div className="ml-auto flex items-center gap-2">
        <div role="group" aria-label="Mode" className="flex overflow-hidden rounded-md border border-line text-sm">
          {(["farmer", "expert"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={`px-2.5 py-1 capitalize ${mode === m ? "bg-gold text-bg" : "bg-bg-elev text-fg-muted"}`}>{m}</button>
          ))}
        </div>
        <button type="button" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          className="rounded-md border border-line bg-bg-elev p-1.5">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {badge && <span className="num hidden rounded-full border border-line px-2 py-0.5 text-xs text-fg-muted sm:inline">{badge}</span>}
      </div>
    </header>
  );
}
