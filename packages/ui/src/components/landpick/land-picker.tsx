"use client";
// Public entry: lazy-loads MapLibre only on the client (framework-neutral, works in Next.js and Vite/Tauri).
import { clientOnly } from "@/lib/platform/client-only";
import type { LandPickerProps } from "./land-picker-inner";

export type { LandPickerProps, MapView, PickMode } from "./land-picker-inner";

function Skeleton() {
  return <div className="h-full w-full animate-pulse bg-primary-soft" aria-hidden />;
}
const Inner = clientOnly<LandPickerProps>(() => import("./land-picker-inner"), <Skeleton />);

/** Map + search + the three land-selection tools. Controlled: pass `land` and handle `onLandChange`. */
export function LandPicker(props: LandPickerProps) {
  return <Inner {...props} />;
}
