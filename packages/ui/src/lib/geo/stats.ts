// Climate statistics of a point, computed from the C1 pack that buildLivePack() returns (NASA POWER daily 2001–2025).
import type { FarmPack, WeatherYear } from "@/lib/engine/types";

export const HEAT_T = 35; // °C

export interface ClimateStats {
  years: number[];
  /** Days with Tmax > 35 °C, per year. */
  heatDays: number[];
  /** Growing-season rain (mm): Apr–Sep north of the equator, Oct–Mar south of it. */
  seasonRain: number[];
  /** Growing-season mean temperature (°C), per year. */
  seasonTemp: number[];
  meanTemp: number;
  annualRain: number;
  /** Mean temperature of the three warmest months of the year (Jun–Aug / Dec–Feb). */
  summerTemp: number;
  elev: number | null;
  driest: { year: number; mm: number };
  hottest: { year: number; temp: number; heatDays: number };
  seasonMonths: string; // "4-9" | "10-3"
}

const sum = (a: ArrayLike<number>, from = 0, to = a.length) => { let s = 0; for (let i = from; i < to; i++) s += a[i]; return s; };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** Day-of-year index ranges (inclusive start, exclusive end) of calendar months `m0`..`m1` (0-based) of year y; may wrap. */
function monthDayRanges(y: number, m0: number, m1: number): [number, number][] {
  const doy = (m: number) => (Date.UTC(y, m, 1) - Date.UTC(y, 0, 1)) / 864e5;
  const end = doy(12);
  return m0 <= m1 ? [[doy(m0), doy(m1 + 1)]] : [[0, doy(m1 + 1)], [doy(m0), end]];
}
function rangeStat(w: WeatherYear, y: number, m0: number, m1: number) {
  let rain = 0, t = 0, n = 0;
  for (const [a, b] of monthDayRanges(y, m0, m1)) {
    rain += sum(w.prcp, a, b);
    for (let i = a; i < b; i++) { t += (w.tmax[i] + w.tmin[i]) / 2; n++; }
  }
  return { rain, temp: n ? t / n : NaN };
}

export function climateStats(pack: FarmPack): ClimateStats {
  const north = pack.meta.lat >= 0;
  const years = Object.keys(pack.weather).map(Number).sort((a, b) => a - b);
  const [gm0, gm1] = north ? [3, 8] : [9, 2];
  const [sm0, sm1] = north ? [5, 7] : [11, 1];
  const heatDays: number[] = [], seasonRain: number[] = [], seasonTemp: number[] = [], annual: number[] = [], temps: number[] = [], summers: number[] = [];
  for (const y of years) {
    const w = pack.weather[String(y)];
    heatDays.push(w.tmax.filter((t) => t > HEAT_T).length);
    const g = rangeStat(w, y, gm0, gm1);
    seasonRain.push(g.rain); seasonTemp.push(g.temp);
    annual.push(sum(w.prcp));
    temps.push(mean(w.tmax.map((t, i) => (t + w.tmin[i]) / 2)));
    summers.push(rangeStat(w, y, sm0, sm1).temp);
  }
  const di = seasonRain.indexOf(Math.min(...seasonRain));
  const hi = seasonTemp.indexOf(Math.max(...seasonTemp));
  const elev = pack.meta.elev;
  return {
    years, heatDays, seasonRain, seasonTemp,
    meanTemp: mean(temps), annualRain: mean(annual), summerTemp: mean(summers),
    elev: typeof elev === "number" && Number.isFinite(elev) ? elev : null,
    driest: { year: years[di], mm: seasonRain[di] },
    hottest: { year: years[hi], temp: seasonTemp[hi], heatDays: heatDays[hi] },
    seasonMonths: north ? "4-9" : "10-3",
  };
}
