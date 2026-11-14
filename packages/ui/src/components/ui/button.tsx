import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";
export function Button({ className, variant = "primary", size = "md", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-xs", size === "md" && "h-10 px-5 text-sm", size === "lg" && "h-12 px-6 text-base",
        variant === "primary" && "bg-primary text-primary-fg hover:bg-primary-hover",
        variant === "secondary" && "bg-primary-soft text-primary hover:bg-primary-soft/70",
        variant === "outline" && "border border-line-strong bg-surface hover:bg-surface-2",
        variant === "ghost" && "hover:bg-surface-2",
        className,
      )}
      {...p}
    />
  );
}
