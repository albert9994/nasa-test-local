"use client";
// A number field you can actually type into. A controlled <input type="number"> that re-clamps on every keystroke makes
// it impossible to clear the field and type a new value (it snaps back to the minimum). This one keeps the text locally,
// commits whenever the text is a valid number inside [min, max], accepts "," as the decimal separator (RO keyboards),
// and only clamps or restores on blur.
import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Base = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max" | "prefix">;
export interface NumberInputProps extends Base {
  value: number | null;
  onValueChange(v: number | null): void;
  min?: number;
  max?: number;
  /** Decimal places shown when the value is formatted (not while typing). */
  decimals?: number;
  /** Empty text commits `null` (e.g. "no limit"); otherwise empty restores the last value on blur. */
  allowEmpty?: boolean;
  /** Unit shown inside the field on the right ("ha", "EUR/ha"). */
  suffix?: ReactNode;
  inputClassName?: string;
}

export function parseNumber(text: string): number | null {
  const s = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!s || s === "-" || s === "." || s === "-.") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const fmt = (v: number | null, decimals?: number) =>
  v == null ? "" : decimals != null ? String(Number(v.toFixed(decimals))) : String(v);

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onValueChange, min = -Infinity, max = Infinity, decimals, allowEmpty, suffix, className, inputClassName, onBlur, onFocus, ...rest },
  ref,
) {
  const [text, setText] = useState(() => fmt(value, decimals));
  const focused = useRef(false);

  // Follow outside changes (another control, currency switch) unless the farmer is typing.
  useEffect(() => {
    if (focused.current) return;
    setText(fmt(value, decimals));
  }, [value, decimals]);

  function change(next: string) {
    if (!/^-?[\d\s]*[.,]?\d*$/.test(next)) return; // ignore letters
    setText(next);
    const n = parseNumber(next);
    if (n == null) { if (allowEmpty && next.trim() === "") onValueChange(null); return; }
    if (n >= min && n <= max) onValueChange(n);
  }
  function blur() {
    focused.current = false;
    const n = parseNumber(text);
    if (n == null) {
      if (allowEmpty) { onValueChange(null); setText(""); } else setText(fmt(value, decimals));
      return;
    }
    const c = Math.min(max, Math.max(min, n));
    if (c !== value) onValueChange(c);
    setText(fmt(c, decimals));
  }

  return (
    <span className={cn("relative inline-flex min-w-0 items-center", className)}>
      <input
        ref={ref} {...rest} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
        value={text}
        onChange={(e) => change(e.target.value)}
        onFocus={(e) => { focused.current = true; onFocus?.(e); }}
        onBlur={(e) => { blur(); onBlur?.(e); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          rest.onKeyDown?.(e);
        }}
        className={cn(
          "num h-10 w-full min-w-0 placeholder:font-sans rounded-[var(--radius-sm)] border border-line-strong bg-surface px-3 text-sm text-fg outline-none transition-colors",
          "hover:border-fg-subtle focus:border-primary focus:ring-3 focus:ring-primary/15",
          suffix ? "pr-14" : "",
          inputClassName,
        )}
      />
      {suffix && <span aria-hidden className="pointer-events-none absolute right-3 truncate text-xs text-fg-subtle">{suffix}</span>}
    </span>
  );
});
