// Shared calendar for the replay: day 0 = Oct 1 of the previous year, last day = Dec 31 of the replayed year.
// Winter wheat (sown in October) and maize (sown in April) therefore sit on the same axis.
export const DAY_MS = 86_400_000;

export const STAGES = ["Vegetative", "Flowering", "Grain fill", "Ripening"] as const;

export const CROP_NAMES: Record<string, string> = {
  maize: "Maize", soybean: "Soybean", wheat: "Winter wheat", barley: "Barley", sorghum: "Sorghum",
  sunflower: "Sunflower", pea: "Pea", millet: "Millet", fallow: "Fallow",
};

export const origin = (year: number) => Date.UTC(year - 1, 9, 1);
export const axisDays = (year: number) => Math.round((Date.UTC(year, 11, 31) - origin(year)) / DAY_MS) + 1;

/** Axis day on which a crop sown on day-of-year index `sow` starts. Winter crops are sown the previous autumn. */
export function startDay(year: number, sow: number): number {
  const prevYear = sow > 220;
  const jan1 = Date.UTC(prevYear ? year - 1 : year, 0, 1);
  return Math.round((jan1 + sow * DAY_MS - origin(year)) / DAY_MS);
}

export function dateAt(year: number, day: number): Date { return new Date(origin(year) + day * DAY_MS); }

export function fmtDate(year: number, day: number): string {
  return dateAt(year, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Day-of-year (1-based) of an axis day within the replayed year, or null while still in the previous year. */
export function doyOf(year: number, day: number): number | null {
  const d = Math.floor((origin(year) + day * DAY_MS - Date.UTC(year, 0, 1)) / DAY_MS) + 1;
  return d >= 1 ? d : null;
}

/** Month starts on the axis, for tick marks. */
export function monthTicks(year: number): { day: number; label: string }[] {
  const out: { day: number; label: string }[] = [];
  const n = axisDays(year);
  for (let m = 0; m < 15; m++) {
    const t = Date.UTC(year - 1, 9 + m, 1);
    const day = Math.round((t - origin(year)) / DAY_MS);
    if (day >= n) break;
    out.push({ day, label: new Date(t).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) });
  }
  return out;
}
