"use client";
// "2012 from space": NASA MODIS NDVI, mid-August 2010 vs 2012, over the Corn Belt and the Plains.
// A slanted clip-path reveal follows the pointer (inspired by 2°C Earth's present/future toggle).
import { useCallback, useRef, useState } from "react";

export function NdviCompare() {
  const box = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0.5);
  const [tilt, setTilt] = useState(0);
  const move = useCallback((clientX: number, clientY: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setX(Math.min(0.98, Math.max(0.02, (clientX - r.left) / r.width)));
    setTilt(((clientY - r.top) / r.height - 0.5) * 8);
  }, []);
  const a = `${(x * 100 - tilt).toFixed(2)}%`, b = `${(x * 100 + tilt).toFixed(2)}%`;
  return (
    <figure className="w-full">
      <div
        ref={box}
        className="relative aspect-[2/1] w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-[var(--radius)] border border-line"
        onPointerMove={(e) => move(e.clientX, e.clientY)}
        onPointerDown={(e) => move(e.clientX, e.clientY)}
        role="slider" aria-label="Compare August 2010 and August 2012" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(x * 100)}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "ArrowLeft") setX((v) => Math.max(0.02, v - 0.05)); if (e.key === "ArrowRight") setX((v) => Math.min(0.98, v + 0.05)); }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/ndvi-midwest-2012.jpg" alt="MODIS NDVI, August 2012: browned crops across the Plains and Corn Belt" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{ clipPath: `polygon(0 0, ${b} 0, ${a} 100%, 0 100%)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/ndvi-midwest-2010.jpg" alt="MODIS NDVI, August 2010: a normal green season" className="absolute inset-0 h-full w-full object-cover" />
        </div>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          <line x1={x * 100 + tilt} y1={0} x2={x * 100 - tilt} y2={100} stroke="#fff1d6" strokeWidth={0.35} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="num absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs text-[#f1ead8] backdrop-blur">Aug 2010 · normal</span>
        <span className="num absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs text-[#ffb070] backdrop-blur">Aug 2012 · flash drought</span>
      </div>
      <figcaption className="mt-3 text-xs text-fg-muted">
        NASA MODIS Terra 16-day NDVI (vegetation greenness), 36.5–45.5° N, 86–104° W, via NASA GIBS. Drag across the map.
      </figcaption>
    </figure>
  );
}
