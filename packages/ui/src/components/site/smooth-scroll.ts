"use client";
// Inertial page scrolling for the landing (skipped when the visitor prefers reduced motion).
import { useEffect } from "react";

export function useSmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stop = () => {};
    let cancelled = false;
    void import("lenis").then(({ default: Lenis }) => {
      if (cancelled) return;
      const lenis = new Lenis({ autoRaf: true, lerp: 0.09, anchors: { offset: -64 } });
      stop = () => lenis.destroy();
    });
    return () => { cancelled = true; stop(); };
  }, []);
}
