// OSM Nominatim: place search + reverse geocode. Usage policy: ≤ 1 request/s, no autocomplete-style spamming.
import type { Locale } from "@/lib/i18n";

const BASE = "https://nominatim.openstreetmap.org";
let chain: Promise<unknown> = Promise.resolve();
let last = 0;
/** Serialise calls with ≥ 1.1 s between request starts. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

export interface PlaceHit { name: string; lat: number; lon: number; bbox?: [number, number, number, number] }
const COUNTRIES = "ro,md,bg,hu,rs,ua,pl,de,fr,it,es,gr,at,us,ca";

export function searchUrl(q: string, locale: Locale): string {
  return `${BASE}/search?format=jsonv2&limit=6&addressdetails=0&countrycodes=${COUNTRIES}&accept-language=${locale}&q=${encodeURIComponent(q)}`;
}

export function parseSearch(json: unknown): PlaceHit[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((r: Record<string, string | string[]>) => {
    const lat = Number(r.lat), lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const bb = Array.isArray(r.boundingbox) ? r.boundingbox.map(Number) : null; // [south, north, west, east]
    return [{ name: String(r.display_name ?? ""), lat, lon, bbox: bb && bb.length === 4 && bb.every(Number.isFinite) ? ([bb[2], bb[0], bb[3], bb[1]] as [number, number, number, number]) : undefined }];
  });
}

export function searchPlaces(q: string, locale: Locale, signal?: AbortSignal): Promise<PlaceHit[]> {
  return throttled(async () => {
    const res = await fetch(searchUrl(q, locale), { signal, headers: { "Accept-Language": locale } });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    return parseSearch(await res.json());
  });
}

/** Short human label ("Slobozia, Ialomița, România") for a point. */
export function parsePlaceLabel(j: { address?: Record<string, string>; display_name?: string } | null): string | null {
  const a = j?.address;
  if (!a) return j?.display_name ?? null;
  const local = a.village ?? a.town ?? a.city ?? a.municipality ?? a.hamlet ?? a.suburb;
  const region = a.county ?? a.state ?? a.region;
  const parts = [local, region, a.country].filter((x): x is string => !!x);
  return parts.length ? [...new Set(parts)].join(", ") : (j?.display_name ?? null);
}

const reverseCache = new Map<string, Promise<string | null>>();
export function reversePlace(lat: number, lon: number, locale: Locale): Promise<string | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${locale}`;
  const hit = reverseCache.get(key);
  if (hit) return hit;
  const p = throttled(async () => {
    const res = await fetch(`${BASE}/reverse?format=jsonv2&zoom=12&addressdetails=1&accept-language=${locale}&lat=${lat}&lon=${lon}`, { headers: { "Accept-Language": locale } });
    if (!res.ok) return null;
    return parsePlaceLabel(await res.json());
  }).catch(() => null);
  reverseCache.set(key, p);
  return p;
}
