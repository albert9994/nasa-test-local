// The one place that knows where the Hotar server (crates/hotar-server) lives.
// Web: NEXT_PUBLIC_API_URL (inlined by Next at build time). Desktop: VITE_API_URL, which apps/desktop/vite.config.ts
// maps onto the same `process.env.NEXT_PUBLIC_API_URL`, so this file is identical in both. At runtime the desktop app
// can point it at the server it embeds (`setApiUrl`, called once at boot before the UI renders).
// Empty = no server: explain falls back to the template text and the score is computed locally.
const clean = (u: string | null | undefined) => (u ?? "").trim().replace(/\/+$/, "");

let current = clean(process.env.NEXT_PUBLIC_API_URL);

/** The configured server URL ("" when none). Read it at call/render time: the desktop app may set it at boot. */
export function getApiUrl(): string {
  return current;
}

/** Points the app at a server (desktop: the embedded local AI server). A build-time URL wins over this. */
export function setApiUrl(url: string | null | undefined): void {
  if (!clean(process.env.NEXT_PUBLIC_API_URL)) current = clean(url);
}

/** True when a server URL is configured. */
export const hasApi = (): boolean => current !== "";

/** Absolute URL of a server path ("/api/explain"), or null when no server is configured. */
export function apiUrl(path: string): string | null {
  return current ? `${current}${path.startsWith("/") ? path : `/${path}`}` : null;
}
