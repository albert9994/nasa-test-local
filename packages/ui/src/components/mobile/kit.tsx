"use client";
// Small building blocks for the phone UI: safe-area screens, big thumb buttons, choice cards, steppers, bottom sheet.
import { useEffect, type ReactNode } from "react";
import { Check, ChevronLeft, Minus, Plus, X } from "lucide-react";
import { motion } from "motion/react";
import { useT } from "@/lib/i18n";
import { haptic } from "@/lib/store/mobile";
import { cn } from "@/lib/utils";

export const SAFE_TOP = "pt-[max(env(safe-area-inset-top),12px)]";
export const SAFE_BOTTOM = "pb-[max(env(safe-area-inset-bottom),16px)]";

/** Full-height primary button that sits at the bottom of a funnel screen, in reach of the thumb. */
export function BigButton({ children, onClick, disabled, variant = "primary", className, type = "button" }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "ghost" | "soft"; className?: string; type?: "button" | "submit";
}) {
  return (
    <button type={type} disabled={disabled} onClick={() => { haptic(); onClick?.(); }}
      className={cn(
        "flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[17px] font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100",
        variant === "primary" && "bg-primary text-primary-fg shadow-[0_6px_20px_rgb(31_81_53/0.25)]",
        variant === "soft" && "bg-primary-soft text-primary",
        variant === "ghost" && "h-12 text-[15px] font-medium text-fg-muted",
        className,
      )}>
      {children}
    </button>
  );
}

/** Large tappable option with a title, a hint and a check. */
export function ChoiceCard({ selected, onClick, title, hint, icon, multi }: {
  selected: boolean; onClick: () => void; title: string; hint?: string; icon?: ReactNode; multi?: boolean;
}) {
  return (
    <button type="button" role={multi ? "checkbox" : "radio"} aria-checked={selected} onClick={() => { haptic(); onClick(); }}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border-2 bg-surface px-4 py-3.5 text-left transition active:scale-[0.99]",
        selected ? "border-primary bg-primary-soft" : "border-line",
      )}>
      {icon && <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", selected ? "bg-surface text-primary" : "bg-surface-2 text-fg-muted")}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-tight">{title}</span>
        {hint && <span className="mt-0.5 block text-[13px] leading-snug text-fg-muted">{hint}</span>}
      </span>
      <span className={cn("grid size-6 shrink-0 place-items-center border-2 transition", multi ? "rounded-md" : "rounded-full",
        selected ? "border-primary bg-primary text-primary-fg" : "border-line-strong")}>
        {selected && <Check size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}

/** −/+ stepper for hectares (no tiny number keyboard needed). */
export function Stepper({ value, onChange, min = 0.5, step, label, unit }: { value: number; onChange: (v: number) => void; min?: number; step?: number; label: string; unit: string }) {
  const t = useT();
  const s = step ?? (value >= 100 ? 10 : value >= 20 ? 5 : 1);
  const round = (v: number) => Math.max(min, Math.round(v * 10) / 10);
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" aria-label={t("mobile.less")} onClick={() => { haptic(); onChange(round(value - s)); }}
        className="grid size-10 place-items-center rounded-full bg-surface-2 active:bg-line"><Minus size={18} /></button>
      <span className="num min-w-[4.5rem] text-center text-[15px] font-semibold">{value} {unit}</span>
      <button type="button" aria-label={t("mobile.more")} onClick={() => { haptic(); onChange(round(value + s)); }}
        className="grid size-10 place-items-center rounded-full bg-surface-2 active:bg-line"><Plus size={18} /></button>
    </div>
  );
}

/** Funnel header: back chevron, segmented progress, optional skip. */
export function FunnelHeader({ step, total, onBack, onSkip, skipLabel }: { step: number; total: number; onBack?: () => void; onSkip?: () => void; skipLabel?: string }) {
  const t = useT();
  return (
    <header className={cn("flex items-center gap-3 px-4 pb-2", SAFE_TOP)}>
      <button type="button" aria-label={t("common.back")} onClick={onBack} disabled={!onBack}
        className="grid size-10 shrink-0 place-items-center rounded-full text-fg active:bg-surface-2 disabled:invisible"><ChevronLeft size={26} /></button>
      <div className="flex flex-1 gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={t("mobile.stepOf", { n: step, total })}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <motion.span className="block h-full rounded-full bg-primary" initial={false} animate={{ width: i < step ? "100%" : "0%" }} transition={{ duration: 0.35, ease: "easeOut" }} />
          </span>
        ))}
      </div>
      <button type="button" onClick={onSkip} className={cn("min-w-10 shrink-0 text-[15px] font-medium text-fg-muted", !onSkip && "invisible")}>{skipLabel ?? t("common.skip")}</button>
    </header>
  );
}

/** Bottom sheet over the current screen (slides up; tap the dim area or ✕ to close). */
export function Sheet({ open, onClose, title, children, tall }: { open: boolean; onClose: () => void; title: string; children: ReactNode; tall?: boolean }) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <motion.button type="button" aria-label={t("common.close")} className="absolute inset-0 bg-[rgb(20_32_26/0.45)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} transition={{ type: "spring", damping: 30, stiffness: 320 }}
        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, i) => { if (i.offset.y > 120 || i.velocity.y > 600) onClose(); }}
        className={cn("relative flex flex-col rounded-t-[24px] bg-surface shadow-[0_-8px_30px_rgb(0_0_0/0.12)]", tall ? "h-[92dvh]" : "max-h-[92dvh]", SAFE_BOTTOM)}>
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="grid size-9 place-items-center rounded-full bg-surface-2"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">{children}</div>
      </motion.div>
    </div>
  );
}

/** Crop tile with the crop icon (shared website icons in /icons). */
export function CropTile({ crop, label, selected, onClick, small }: { crop: string | null; label: string; selected: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={() => { haptic(); onClick(); }}
      className={cn("flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-surface text-center transition active:scale-95",
        small ? "w-[76px] px-1 py-2" : "px-1 py-3", selected ? "border-primary bg-primary-soft" : "border-line")}>
      {crop
        ? <img src={`/icons/${crop}.svg`} alt="" className={small ? "size-7" : "size-9"} draggable={false} />
        : <span className={cn("grid place-items-center rounded-full bg-surface-2 font-semibold text-fg-muted", small ? "size-7 text-sm" : "size-9")}>?</span>}
      <span className={cn("line-clamp-2 leading-tight", small ? "text-[11px]" : "text-[13px] font-medium")}>{label}</span>
    </button>
  );
}
