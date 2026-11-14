"use client";
// Small presentational pieces shared by the analysis tabs.
import { CircleHelp } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function Panel({ title, sub, aside, children, className, tour }: { title?: ReactNode; sub?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; tour?: string }) {
  return (
    <section className={cn("min-w-0 rounded-[var(--radius)] border border-line bg-surface p-4 shadow-[var(--shadow)] sm:p-5", className)} data-tour={tour}>
      {(title || aside) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="display text-xl sm:text-2xl">{title}</h2>}
            {sub && <p className="mt-1 text-sm text-fg-muted">{sub}</p>}
          </div>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

/** "?" button that opens a short plain-language explanation. Click or focus, not hover-only, so it works on phones. */
export function Hint({ text }: { text: string }) {
  const id = useId();
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button" aria-expanded={open} aria-describedby={open ? id : undefined} aria-label={t("analysis.help")}
        onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="grid size-5 place-items-center rounded-full text-fg-subtle hover:text-primary"
      ><CircleHelp className="size-4" aria-hidden /></button>
      {open && (
        <span id={id} role="tooltip" className="absolute left-1/2 top-6 z-30 w-60 -translate-x-1/2 rounded-lg border border-line bg-surface p-2.5 text-xs font-normal normal-case leading-snug text-fg shadow-[var(--shadow)]">{text}</span>
      )}
    </span>
  );
}

export function Stat({ label, value, hint, tone, sub }: { label: ReactNode; value: ReactNode; hint?: string; tone?: "danger" | "ok" | "warn"; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-fg-muted">{label}{hint && <Hint text={hint} />}</dt>
      <dd className={cn("num text-lg leading-tight", tone === "danger" && "text-danger", tone === "ok" && "text-ok", tone === "warn" && "text-warn")}>{value}</dd>
      {sub && <dd className="text-xs text-fg-muted">{sub}</dd>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-surface-2", className)} />;
}

export function Spinner({ label }: { label: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-fg-muted">
      <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-primary" />{label}
    </p>
  );
}

export const inputCls = "h-10 min-w-0 rounded-lg border border-line bg-surface px-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-primary";
