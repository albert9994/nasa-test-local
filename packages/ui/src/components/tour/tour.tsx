"use client";
// Guided walkthrough with a spotlight. Steps point at elements by `data-tour="<id>"`.
// Shown once per tour id (remembered in localStorage); `useTour.getState().start(id)` replays it.
// Text comes from i18n keys so the guide is fully RO/EN.
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { create } from "zustand";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface TourStep {
  /** data-tour id of the element to highlight; omit for a centred card. */
  target?: string;
  titleKey: string;
  bodyKey: string;
  placement?: "top" | "bottom" | "left" | "right";
  /** Optional hook run when the step opens (e.g. switch a tab). */
  onEnter?: () => void;
}

const seenKey = (id: string) => `fieldshift.tour.${id}`;
const seen = (id: string) => { try { return window.localStorage.getItem(seenKey(id)) === "1"; } catch { return false; } };
const markSeen = (id: string) => { try { window.localStorage.setItem(seenKey(id), "1"); } catch { /* ignore */ } };

export const useTour = create<{ active: string | null; index: number; start(id: string): void; stop(): void; go(i: number): void }>((set) => ({
  active: null, index: 0,
  start: (id) => set({ active: id, index: 0 }),
  stop: () => set({ active: null, index: 0 }),
  go: (index) => set({ index }),
}));

function useRect(target?: string, deps: unknown[] = []) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!target) { setRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const t = setInterval(update, 400);
    return () => { ro.disconnect(); window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ...deps]);
  return rect;
}

export function Tour({ id, steps, autoStart = true }: { id: string; steps: TourStep[]; autoStart?: boolean }) {
  const t = useT();
  const { active, index, start, stop, go } = useTour();
  const open = active === id;
  const step = steps[Math.min(index, steps.length - 1)];

  useEffect(() => { if (autoStart && !seen(id)) start(id); }, [autoStart, id, start]);
  useEffect(() => { if (open) step?.onEnter?.(); }, [open, step]);
  const rect = useRect(open ? step?.target : undefined, [index]);

  const finish = useCallback(() => { markSeen(id); stop(); }, [id, stop]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") index < steps.length - 1 ? go(index + 1) : finish();
      if (e.key === "ArrowLeft" && index > 0) go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, steps.length, go, finish]);

  if (!open || !step) return null;
  const pad = 8;
  const card = cardPosition(rect, step.placement);
  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-[var(--radius)] transition-all duration-300"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgb(20 32 26 / 0.55)", outline: "2px solid var(--primary)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgb(20_32_26/0.55)]" />
      )}
      <div className={cn("absolute w-[min(360px,calc(100vw-32px))] rounded-[var(--radius)] border border-line bg-surface p-5 shadow-[var(--shadow)]")} style={card}>
        <p className="text-xs font-medium text-fg-muted">{t("tour.step", { n: index + 1, total: steps.length })}</p>
        <h2 id="tour-title" className="mt-1 text-lg font-semibold tracking-tight">{t(step.titleKey)}</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t(step.bodyKey)}</p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-primary transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button className="text-sm text-fg-muted hover:text-fg" onClick={finish}>{t("common.skip")}</button>
          <div className="flex gap-2">
            {index > 0 && (
              <button className="h-9 rounded-full border border-line px-4 text-sm hover:bg-surface-2" onClick={() => go(index - 1)}>{t("common.back")}</button>
            )}
            <button
              className="h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
              onClick={() => (index < steps.length - 1 ? go(index + 1) : finish())}
            >
              {index < steps.length - 1 ? t("common.next") : t("common.done")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function cardPosition(rect: DOMRect | null, placement: TourStep["placement"] = "bottom"): React.CSSProperties {
  if (!rect || typeof window === "undefined") return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  const W = Math.min(360, window.innerWidth - 32), gap = 16, vw = window.innerWidth, vh = window.innerHeight;
  const clampX = (x: number) => Math.max(16, Math.min(vw - W - 16, x));
  if (vw < 640 || placement === "bottom" || placement === "top") {
    const below = rect.bottom + gap + 220 < vh;
    return below || placement === "bottom" && rect.bottom + gap + 220 < vh
      ? { left: clampX(rect.left), top: Math.min(vh - 240, rect.bottom + gap) }
      : { left: clampX(rect.left), top: Math.max(16, rect.top - gap - 230) };
  }
  if (placement === "right") return { left: Math.min(vw - W - 16, rect.right + gap), top: Math.max(16, Math.min(vh - 260, rect.top)) };
  return { left: Math.max(16, rect.left - W - gap), top: Math.max(16, Math.min(vh - 260, rect.top)) };
}
