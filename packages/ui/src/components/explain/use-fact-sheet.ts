"use client";
// Builds the C10 fact sheet from the app store through the engine interface.
import { useEffect, useState } from "react";
import { getEngine, type FactSheet } from "@/lib/engine";
import { useApp } from "@/lib/store/app";

export function useFactSheet() {
  const handle = useApp((s) => s.handle);
  const rotation = useApp((s) => s.rotation);
  const opts = useApp((s) => s.opts);
  const picks = useApp((s) => s.picks);
  const base = useApp((s) => s.base);
  const [fact, setFact] = useState<FactSheet | null>(null);
  useEffect(() => {
    if (!handle || !rotation.length || !base) { setFact(null); return; }
    let alive = true;
    getEngine().factSheet(handle, rotation, opts, picks).then((f) => { if (alive) setFact(f); }).catch(() => { if (alive) setFact(null); });
    return () => { alive = false; };
  }, [handle, rotation, opts, picks, base]);
  return fact;
}
