"use client";
// Minimal toast system (no dependency). `toast("msg", "warn")` from anywhere; render <Toasts /> once.
import { useEffect } from "react";
import { create } from "zustand";
import { clsx } from "clsx";

export type ToastKind = "info" | "ok" | "warn" | "error";
interface T { id: number; msg: string; kind: ToastKind }
interface S { items: T[]; push(msg: string, kind?: ToastKind, ttl?: number): number; dismiss(id: number): void }
let next = 1;

export const useToasts = create<S>((set, get) => ({
  items: [],
  push(msg, kind = "info", ttl = 4000) {
    const id = next++;
    set({ items: [...get().items.slice(-3), { id, msg, kind }] });
    if (ttl > 0) setTimeout(() => get().dismiss(id), ttl);
    return id;
  },
  dismiss: (id) => set({ items: get().items.filter((t) => t.id !== id) }),
}));

export const toast = (msg: string, kind?: ToastKind, ttl?: number) => useToasts.getState().push(msg, kind, ttl);
export const dismissToast = (id: number) => useToasts.getState().dismiss(id);

const dot: Record<ToastKind, string> = { info: "bg-water", ok: "bg-leaf", warn: "bg-gold", error: "bg-heat" };

export function Toasts() {
  const items = useToasts((s) => s.items);
  useEffect(() => () => useToasts.setState({ items: [] }), []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-full border border-line bg-bg-elev px-4 py-2 text-sm text-fg shadow-lg">
          <span className={clsx("size-2 shrink-0 rounded-full", dot[t.kind])} />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
