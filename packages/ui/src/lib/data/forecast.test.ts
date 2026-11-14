import { describe, expect, it } from "vitest";
import { alerts, forecastUrl, parseForecast, type Forecast } from "./forecast";

const base = (over: Partial<Forecast> = {}): Forecast => ({
  date: Array.from({ length: 7 }, (_, i) => `2026-07-0${i + 1}`),
  tmax: Array(7).fill(26), tmin: Array(7).fill(14), precip: Array(7).fill(3),
  et0: Array(7).fill(3), wind: Array(7).fill(6), ...over,
});
const kinds = (a: ReturnType<typeof alerts>) => a.map((x) => x.kind);

describe("alerts", () => {
  it("quiet week → nothing", () => expect(alerts(base(), "maize", "vegetative")).toEqual([]));
  it("heatwave needs ≥3 days > 35 °C; danger at flowering, warn otherwise", () => {
    const f = base({ tmax: [36, 37, 36, 30, 30, 30, 30] });
    expect(alerts(f, "maize", "flowering")[0]).toMatchObject({ kind: "heatwave", severity: "danger", value: 37 });
    expect(alerts(f, "maize", "vegetative")[0]).toMatchObject({ kind: "heatwave", severity: "warn" });
    expect(kinds(alerts(base({ tmax: [36, 37, 30, 30, 30, 30, 30] }), "maize", "flowering"))).not.toContain("heatwave");
  });
  it("drought when 7-day ET0 − rain > 25 mm", () => {
    expect(kinds(alerts(base({ precip: Array(7).fill(0), et0: Array(7).fill(5) }), "wheat", "vegetative"))).toContain("drought");
    expect(kinds(alerts(base({ precip: Array(7).fill(0), et0: Array(7).fill(3) }), "wheat", "vegetative"))).not.toContain("drought");
  });
  it("frost only after emergence", () => {
    const f = base({ tmin: [14, 14, -2, 14, 14, 14, 14] });
    expect(alerts(f, "maize", "emergence")[0]).toMatchObject({ kind: "frost", severity: "danger", value: -2 });
    expect(kinds(alerts(f, "maize", "sowing"))).not.toContain("frost");
  });
  it("heavy rain needs slope > 3 %", () => {
    const f = base({ precip: [0, 55, 0, 0, 0, 0, 0] });
    expect(kinds(alerts(f, "maize", "vegetative", { slopePct: 5 }))).toContain("heavy_rain");
    expect(kinds(alerts(f, "maize", "vegetative", { slopePct: 2 }))).not.toContain("heavy_rain");
  });
  it("spray window on calm dry days; sorted danger first", () => {
    const f = base({ wind: [2, 2, 6, 6, 6, 6, 6], precip: [0, 0, 3, 3, 3, 3, 3], tmin: [-1, 14, 14, 14, 14, 14, 14] });
    const a = alerts(f, "maize", "vegetative");
    expect(a[a.length - 1]).toMatchObject({ kind: "spray_window", severity: "ok", value: 2 });
    expect(a[0].severity).toBe("danger");
  });
});

describe("open-meteo", () => {
  it("builds the URL with the daily variables", () => {
    const u = forecastUrl(45.1234567, 25.5);
    expect(u).toContain("latitude=45.1235");
    expect(u).toContain("et0_fao_evapotranspiration");
    expect(u).toContain("forecast_days=7");
  });
  it("parses a response, nulls become NaN, bad payload throws", () => {
    const f = parseForecast({ daily: { time: ["2026-07-01"], temperature_2m_max: [31], temperature_2m_min: [null], precipitation_sum: [1.2], et0_fao_evapotranspiration: [4], wind_speed_10m_max: [3] } });
    expect(f.tmax).toEqual([31]);
    expect(f.tmin[0]).toBeNaN();
    expect(() => parseForecast({})).toThrow();
  });
});
