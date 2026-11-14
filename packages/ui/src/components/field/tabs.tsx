"use client";
// Accessible tablist (roving tabindex, arrow keys, Home/End). Independent of the URL hash.
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabDef<T extends string> { id: T; label: string; icon?: ReactNode }

export function Tabs<T extends string>({ tabs, value, onChange, label, idPrefix }: { tabs: TabDef<T>[]; value: T; onChange(v: T): void; label: string; idPrefix: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (e: KeyboardEvent, i: number) => {
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[n].id);
    refs.current[tabs[n].id]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="-mx-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((tab, i) => {
        const on = tab.id === value;
        return (
          <button
            key={tab.id} ref={(el) => { refs.current[tab.id] = el; }}
            role="tab" id={`${idPrefix}-tab-${tab.id}`} aria-selected={on} aria-controls={`${idPrefix}-panel-${tab.id}`} tabIndex={on ? 0 : -1}
            data-tour={`tab-${tab.id}`}
            onClick={() => onChange(tab.id)} onKeyDown={(e) => move(e, i)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
              on ? "bg-primary text-primary-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >{tab.icon}{tab.label}</button>
        );
      })}
    </div>
  );
}
