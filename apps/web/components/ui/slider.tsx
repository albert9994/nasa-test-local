"use client";
import * as S from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export function Slider({ className, ...p }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root className={cn("relative flex h-5 w-full touch-none select-none items-center", className)} {...p}>
      <S.Track className="relative h-1 grow overflow-hidden rounded-full bg-line">
        <S.Range className="absolute h-full bg-gold" />
      </S.Track>
      {(p.value ?? p.defaultValue ?? [0]).map((_, i) => (
        <S.Thumb key={i} className="block size-4 rounded-full border-2 border-gold bg-bg shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-gold" />
      ))}
    </S.Root>
  );
}
