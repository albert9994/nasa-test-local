// The one place that knows where the Hotar server (crates/hotar-server) lives.
// Web: NEXT_PUBLIC_API_URL (inlined by Next at build time). Desktop: VITE_API_URL, which apps/desktop/vite.config.ts
// maps onto the same `process.env.NEXT_PUBLIC_API_URL`, so this file is identical in both. Empty = no server:
// explain falls back to the template text and the score is computed locally.
export const API_URL: string = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");

/** True when a server URL is configured. */
export const hasApi = (): boolean => API_URL !== "";

/** Absolute URL of a server path ("/api/explain"), or null when no server is configured. */
export function apiUrl(path: string): string | null {
  return API_URL ? `${API_URL}${path.startsWith("/") ? path : `/${path}`}` : null;
}
