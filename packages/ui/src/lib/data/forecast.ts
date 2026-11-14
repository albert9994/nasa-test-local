// Weather alerts: Open-Meteo 7-day forecast → agronomic alert rules. Pure rules are exported for tests.
// Works in the browser and in the Tauri webview (plain fetch, no key). Variable names follow
// https://open-meteo.com/en/docs (daily: temperature_2m_max, temperature_2m_min, precipitation_sum,
// et0_fao_evapotranspiration, wind_speed_10m_max; wind in m/s via wind_speed_unit=ms).
import type { CropId } from "@/lib/engine/types";

export const FORECAST_DAILY =
  "temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,wind_speed_10m_max";

export interface Forecast {
  /** ISO dates (local to the point). */
  date: string[];
  tmax: number[]; // °C
  tmin: number[]; // °C
  precip: number[]; // mm/day
  et0: number[]; // mm/day
  wind: number[]; // m/s, daily max at 10 m
}

export type Stage = "sowing" | "emergence" | "vegetative" | "flowering" | "grain_fill" | "harvest" | "fallow";
export type Severity = "danger" | "warn" | "ok";
export type AlertKind = "heatwave" | "drought" | "frost" | "heavy_rain" | "spray_window";

export interface Alert {
  kind: AlertKind;
  severity: Severity;
  /** Indices into the forecast arrays that triggered the rule. */
  days: number[];
  /** Raw numbers for i18n interpolation. */
  value: number;
  /** ISO date of the first affected day, when applicable. */
  from?: string;
}

export interface AlertOptions {
  /** Field slope in % (erosion rule applies above 3). */
  slopePct?: number;
}

export function forecastUrl(lat: number, lon: number, days = 7): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&daily=${FORECAST_DAILY}&forecast_days=${days}&timezone=auto&wind_speed_unit=ms`
  );
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

/** Open-Meteo response → Forecast. Throws on a malformed payload. */
export function parseForecast(json: unknown): Forecast {
  const d = (json as { daily?: Record<string, unknown[]> } | null)?.daily;
  if (!d || !Array.isArray(d.time)) throw new Error("Open-Meteo response has no daily block");
  const col = (k: string) => (Array.isArray(d[k]) ? d[k]!.map(num) : d.time.map(() => NaN));
  return {
    date: d.time.map(String),
    tmax: col("temperature_2m_max"),
    tmin: col("temperature_2m_min"),
    precip: col("precipitation_sum"),
    et0: col("et0_fao_evapotranspiration"),
    wind: col("wind_speed_10m_max"),
  };
}

export async function fetchForecast(lat: number, lon: number, signal?: AbortSignal): Promise<Forecast> {
  const res = await fetch(forecastUrl(lat, lon), { signal });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return parseForecast(await res.json());
}

// ---------- rules ----------
const HEAT_C = 35;
const DEFICIT_MM = 25;
const HEAVY_RAIN_MM = 40;
const SLOPE_PCT = 3;
const SPRAY_WIND = 4;
const SPRAY_RAIN_MM = 0.2;
const FROST_C = 0;
const FROST_SENSITIVE: Stage[] = ["emergence", "vegetative", "flowering", "grain_fill"];
const HEAT_SENSITIVE: Stage[] = ["flowering", "grain_fill"];

const sum = (a: number[]) => a.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
const idx = (n: number, f: (i: number) => boolean) => Array.from({ length: n }, (_, i) => i).filter(f);

const SEV_ORDER: Record<Severity, number> = { danger: 0, warn: 1, ok: 2 };

/** Agronomic alert rules over a forecast. `crop` is kept for crop-specific tuning (maize/soy heat at flowering). */
export function alerts(f: Forecast, crop: CropId, stage: Stage, opts: AlertOptions = {}): Alert[] {
  const n = f.date.length;
  const out: Alert[] = [];
  const at = (days: number[]) => f.date[days[0]];

  // heatwave: ≥3 days above 35 °C; critical when flowering / grain fill
  const hot = idx(n, (i) => f.tmax[i] > HEAT_C);
  if (hot.length >= 3) {
    const peak = Math.max(...hot.map((i) => f.tmax[i]));
    const critical = HEAT_SENSITIVE.includes(stage) && crop !== "fallow";
    out.push({ kind: "heatwave", severity: critical ? "danger" : "warn", days: hot, value: Math.round(peak * 10) / 10, from: at(hot) });
  }

  // drought stress: 7-day rain − ET0 deficit > 25 mm
  const deficit = sum(f.et0) - sum(f.precip);
  if (deficit > DEFICIT_MM && stage !== "fallow" && stage !== "harvest") {
    out.push({ kind: "drought", severity: deficit > 2 * DEFICIT_MM ? "danger" : "warn", days: idx(n, () => true), value: Math.round(deficit), from: f.date[0] });
  }

  // frost after emergence
  if (FROST_SENSITIVE.includes(stage)) {
    const cold = idx(n, (i) => f.tmin[i] <= FROST_C);
    if (cold.length) {
      const low = Math.min(...cold.map((i) => f.tmin[i]));
      out.push({ kind: "frost", severity: "danger", days: cold, value: Math.round(low * 10) / 10, from: at(cold) });
    }
  }

  // heavy rain / erosion on slopes
  if ((opts.slopePct ?? 0) > SLOPE_PCT) {
    const wet = idx(n, (i) => f.precip[i] > HEAVY_RAIN_MM);
    if (wet.length) {
      out.push({ kind: "heavy_rain", severity: "danger", days: wet, value: Math.round(Math.max(...wet.map((i) => f.precip[i]))), from: at(wet) });
    }
  }

  // spray window (optional, daily approximation of "no rain for 6 h")
  const calm = idx(n, (i) => f.wind[i] < SPRAY_WIND && f.precip[i] < SPRAY_RAIN_MM);
  if (calm.length && stage !== "fallow" && stage !== "harvest" && !out.some((a) => a.severity === "danger" && a.kind === "heavy_rain")) {
    out.push({ kind: "spray_window", severity: "ok", days: calm, value: calm.length, from: at(calm) });
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}
