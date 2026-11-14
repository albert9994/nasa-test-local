import { cn } from "@/lib/utils";

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius)] border border-line bg-surface p-5 shadow-[var(--shadow)]", className)} {...p} />;
}
