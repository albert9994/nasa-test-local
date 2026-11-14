"use client";
// O1: map entry. MapLibre is client-only and heavy, so it is lazy-loaded with a skeleton.
import dynamic from "next/dynamic";

const Inner = dynamic(() => import("./farm-map-inner"), { ssr: false, loading: () => <MapSkeleton /> });

export function MapSkeleton() {
  return (
    <div className="h-[260px] w-full animate-pulse rounded-[var(--radius)] border border-line bg-bg-elev lg:h-[340px]" aria-label="Loading map" />
  );
}

export function FarmMap() {
  return <Inner />;
}
