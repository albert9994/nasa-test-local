import { cn } from "@/lib/utils";

/** Hotar's mark: field furrows running up to a boundary stone (the "hotar"), i.e. the margin before the limit. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-7", className)} aria-hidden>
      <rect width="64" height="64" rx="16" className="fill-primary" />
      <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round">
        <path d="M11 49.5 34.5 45" /><path d="M11 37.5 34.5 35" /><path d="M11 25.5 34.5 25" />
      </g>
      <path d="M41 50V22.5a6.5 6.5 0 0 1 13 0V50z" fill="#c9a227" />
    </svg>
  );
}
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[17px] font-semibold tracking-tight text-fg", className)}>
      <LogoMark />Hotar
    </span>
  );
}
