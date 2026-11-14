import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline";
export function Button({ className, variant = "primary", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "primary" && "bg-gold text-[#0b0c09] hover:brightness-110",
        variant === "outline" && "border border-line hover:bg-bg-elev",
        variant === "ghost" && "hover:bg-bg-elev",
        className,
      )}
      {...p}
    />
  );
}
