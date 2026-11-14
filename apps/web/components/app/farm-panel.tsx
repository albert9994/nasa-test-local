"use client";
// O1 (subagent): farm info (name, coordinates, soil texture, climate normals, data sources).
import { useApp } from "@/lib/store/app";
export function FarmPanel() {
  const pack = useApp((s) => s.pack);
  if (!pack) return null;
  return <div className="text-sm text-fg-muted">{pack.meta.name} · {pack.meta.lat.toFixed(2)}, {pack.meta.lon.toFixed(2)}</div>;
}
