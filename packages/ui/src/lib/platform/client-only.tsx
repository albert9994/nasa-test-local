"use client";
// Framework-neutral client-only lazy loader (works in Next.js and in the Vite/Tauri desktop app).
import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";

export function clientOnly<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, fallback: ReactNode = null) {
  const L = lazy(load);
  return function ClientOnly(props: P) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return <>{fallback}</>;
    return <Suspense fallback={fallback}><L {...props} /></Suspense>;
  };
}

/** Read a query parameter on the client without framework routers. */
export function useQueryParam(name: string): string | null {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => { setV(new URLSearchParams(window.location.search).get(name)); }, [name]);
  return v;
}
