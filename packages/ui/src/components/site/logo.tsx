import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-7", className)} aria-hidden>
      <rect width="64" height="64" rx="16" className="fill-primary" />
      <g fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round">
        <path d="M12 48c13-2 21-12 23-30" /><path d="M22 52c11-3 19-12 22-27" /><path d="M33 54c7-3 13-9 17-18" />
        <circle cx="47" cy="15" r="5" strokeWidth="3.4" />
      </g>
    </svg>
  );
}
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[17px] font-semibold tracking-tight text-fg", className)}>
      <LogoMark />FieldShift
    </span>
  );
}
