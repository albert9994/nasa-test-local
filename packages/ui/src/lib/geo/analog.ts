// Climate analog: "in 2050 the summers here may feel like today's <town>". Deliberately simple and approximate:
// only mean summer temperature (Jun–Aug north of the equator, Dec–Feb south of it, 1991–2020 normals rounded to ~0.5 °C).
import { haversineKm } from "./area";

export interface RefTown { name: string; country: string; lat: number; lon: number; summerT: number }

export const REF_TOWNS: RefTown[] = [
  // Romania & neighbours
  { name: "Suceava", country: "RO", lat: 47.65, lon: 26.26, summerT: 18.0 },
  { name: "Brașov", country: "RO", lat: 45.65, lon: 25.6, summerT: 17.5 },
  { name: "Cluj-Napoca", country: "RO", lat: 46.77, lon: 23.6, summerT: 18.5 },
  { name: "Timișoara", country: "RO", lat: 45.75, lon: 21.23, summerT: 21.0 },
  { name: "Iași", country: "RO", lat: 47.16, lon: 27.59, summerT: 20.5 },
  { name: "București", country: "RO", lat: 44.43, lon: 26.1, summerT: 22.5 },
  { name: "Craiova", country: "RO", lat: 44.32, lon: 23.8, summerT: 22.0 },
  { name: "Constanța", country: "RO", lat: 44.18, lon: 28.65, summerT: 22.5 },
  { name: "Chișinău", country: "MD", lat: 47.01, lon: 28.86, summerT: 20.5 },
  { name: "Sofia", country: "BG", lat: 42.7, lon: 23.32, summerT: 20.5 },
  { name: "Plovdiv", country: "BG", lat: 42.14, lon: 24.75, summerT: 22.5 },
  { name: "Belgrade", country: "RS", lat: 44.8, lon: 20.46, summerT: 22.0 },
  { name: "Budapest", country: "HU", lat: 47.5, lon: 19.04, summerT: 21.5 },
  { name: "Kyiv", country: "UA", lat: 50.45, lon: 30.52, summerT: 19.5 },
  { name: "Odesa", country: "UA", lat: 46.48, lon: 30.72, summerT: 22.0 },
  { name: "Volgograd", country: "RU", lat: 48.7, lon: 44.5, summerT: 23.0 },
  // Rest of Europe
  { name: "Warsaw", country: "PL", lat: 52.23, lon: 21.01, summerT: 18.5 },
  { name: "Berlin", country: "DE", lat: 52.52, lon: 13.4, summerT: 18.5 },
  { name: "Munich", country: "DE", lat: 48.14, lon: 11.58, summerT: 18.0 },
  { name: "Vienna", country: "AT", lat: 48.21, lon: 16.37, summerT: 20.0 },
  { name: "Paris", country: "FR", lat: 48.86, lon: 2.35, summerT: 19.5 },
  { name: "Bordeaux", country: "FR", lat: 44.84, lon: -0.58, summerT: 20.5 },
  { name: "Lyon", country: "FR", lat: 45.76, lon: 4.84, summerT: 21.0 },
  { name: "Milan", country: "IT", lat: 45.46, lon: 9.19, summerT: 24.0 },
  { name: "Bologna", country: "IT", lat: 44.49, lon: 11.34, summerT: 24.5 },
  { name: "Rome", country: "IT", lat: 41.9, lon: 12.5, summerT: 24.5 },
  { name: "Thessaloniki", country: "GR", lat: 40.64, lon: 22.94, summerT: 25.0 },
  { name: "Madrid", country: "ES", lat: 40.42, lon: -3.7, summerT: 25.0 },
  { name: "Zaragoza", country: "ES", lat: 41.65, lon: -0.89, summerT: 24.5 },
  { name: "Seville", country: "ES", lat: 37.39, lon: -5.98, summerT: 27.5 },
  { name: "Athens", country: "GR", lat: 37.98, lon: 23.73, summerT: 27.0 },
  { name: "Ankara", country: "TR", lat: 39.93, lon: 32.86, summerT: 21.5 },
  // North America
  { name: "Fargo, ND", country: "US", lat: 46.88, lon: -96.79, summerT: 20.5 },
  { name: "Minneapolis, MN", country: "US", lat: 44.98, lon: -93.27, summerT: 21.5 },
  { name: "Des Moines, IA", country: "US", lat: 41.59, lon: -93.62, summerT: 23.0 },
  { name: "Chicago, IL", country: "US", lat: 41.88, lon: -87.63, summerT: 22.5 },
  { name: "Lincoln, NE", country: "US", lat: 40.81, lon: -96.7, summerT: 24.0 },
  { name: "Kansas City, MO", country: "US", lat: 39.1, lon: -94.58, summerT: 25.0 },
  { name: "Wichita, KS", country: "US", lat: 37.69, lon: -97.34, summerT: 26.0 },
  { name: "Oklahoma City, OK", country: "US", lat: 35.47, lon: -97.52, summerT: 27.0 },
  { name: "Memphis, TN", country: "US", lat: 35.15, lon: -90.05, summerT: 27.5 },
  { name: "Dallas, TX", country: "US", lat: 32.78, lon: -96.8, summerT: 29.0 },
  // Southern hemisphere (summer = Dec–Feb)
  { name: "Pergamino", country: "AR", lat: -33.89, lon: -60.57, summerT: 23.5 },
  { name: "Córdoba", country: "AR", lat: -31.42, lon: -64.18, summerT: 23.5 },
  { name: "Buenos Aires", country: "AR", lat: -34.6, lon: -58.38, summerT: 24.5 },
  { name: "Porto Alegre", country: "BR", lat: -30.03, lon: -51.23, summerT: 25.5 },
  { name: "Johannesburg", country: "ZA", lat: -26.2, lon: 28.05, summerT: 19.5 },
  { name: "Bloemfontein", country: "ZA", lat: -29.12, lon: 26.21, summerT: 22.5 },
  { name: "Melbourne", country: "AU", lat: -37.81, lon: 144.96, summerT: 19.5 },
  { name: "Perth", country: "AU", lat: -31.95, lon: 115.86, summerT: 23.5 },
];

const RO_NAMES: Record<string, string> = {
  Warsaw: "Varșovia", Munich: "München", Vienna: "Viena", Athens: "Atena", Seville: "Sevilla", Belgrade: "Belgrad", Kyiv: "Kiev",
  Rome: "Roma", Milan: "Milano", Thessaloniki: "Salonic", Budapest: "Budapesta", Bologna: "Bologna", Lyon: "Lyon",
};
export const townName = (t: RefTown, locale: "ro" | "en") => (locale === "ro" ? RO_NAMES[t.name] ?? t.name : t.name);

/** NASA POWER's (Tmax + Tmin) / 2 in summer reads ~1.8 °C above station means (checked against 3 stations: Slobozia, Ames, Garden City). */
export const POWER_SUMMER_BIAS_C = 1.8;

export interface Analog { town: RefTown; /** Summer mean today, bias-corrected to station-like values. */ nowT: number; targetT: number; deltaT: number; distanceKm: number }

/** Town whose summer mean temperature is closest to `currentSummerT` (POWER, bias-corrected) `+ dT`; ties (±0.4 °C) go to the nearer one. */
export function findAnalog(lat: number, lon: number, currentSummerT: number, dT: number, towns: RefTown[] = REF_TOWNS): Analog | null {
  const south = lat < 0;
  const pool = towns.filter((t) => (t.lat < 0) === south);
  if (!pool.length || !Number.isFinite(currentSummerT)) return null;
  const nowT = currentSummerT - POWER_SUMMER_BIAS_C;
  const targetT = nowT + dT;
  const scored = pool.map((town) => ({ town, err: Math.abs(town.summerT - targetT), distanceKm: haversineKm({ lat, lon }, town) }));
  const bestErr = Math.min(...scored.map((s) => s.err));
  if (bestErr > 2.5) return null; // too far outside the reference list to say anything honest
  const close = scored.filter((s) => s.err <= bestErr + 0.4).sort((a, b) => a.distanceKm - b.distanceKm)[0];
  return { town: close.town, nowT, targetT, deltaT: dT, distanceKm: close.distanceKm };
}
