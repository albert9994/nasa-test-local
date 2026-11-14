"use client";
import { useId, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small "i" with a hover/focus/tap popover. Used to show the source + period of every number. */
export function InfoTip({ text, className, align = "left" }: { text: string; className?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={cn("relative inline-flex align-middle", className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-describedby={open ? id : undefined} aria-label="Info" onClick={() => setOpen((o) => !o)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        className="grid size-5 place-items-center rounded-full text-fg-subtle hover:text-primary focus-visible:text-primary">
        <Info className="size-3.5" />
      </button>
      {open && (
        <span id={id} role="tooltip" className={cn("absolute top-full z-30 mt-1 w-64 rounded-xl border border-line bg-surface p-3 text-left text-xs font-normal leading-relaxed text-fg shadow-[var(--shadow)]", align === "right" ? "right-0" : "left-0")}>
          {text}
        </span>
      )}
    </span>
  );
}
