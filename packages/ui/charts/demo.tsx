import React, { useState } from "react";
import { FanChart } from "./FanChart";
import { HeatmapChart } from "./HeatmapChart";
import { MultiLineChart } from "./MultiLineChart";
import { ScatterChart } from "./ScatterChart";
import { ChartThemeMode } from "./types";

const DEMO_YEARS = Array.from({ length: 24 }, (_, i) => 2002 + i);

const DEMO_MULTILINE_SERIES = [
  {
    id: "baseline",
    label: "Current: maize → soybean",
    data: DEMO_YEARS.map((yr) => ({
      year: yr,
      value: yr === 2012 ? -140 : yr === 2022 ? 45 : 310 + Math.sin(yr * 1.3) * 140,
    })),
  },
  {
    id: "resilient",
    label: "Drought shield: wheat → sorghum → pea + rye",
    data: DEMO_YEARS.map((yr) => ({
      year: yr,
      value: yr === 2012 ? 165 : yr === 2022 ? 210 : 355 + Math.cos(yr * 1.1) * 85,
    })),
  },
];

const DEMO_DTS = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
const DEMO_DPS = [0, -0.05, -0.1, -0.15, -0.2, -0.25, -0.3, -0.35, -0.4, -0.45, -0.5];
const DEMO_GRID = DEMO_DTS.map((dt) =>
  DEMO_DPS.map((dp) => Math.min(1, Math.max(0, 0.06 + dt * 0.065 + Math.abs(dp) * 0.75)))
);

const DEMO_SCATTER_POINTS = [
  { id: "2005", x: 10.8, y: 10.4, year: 2005 },
  { id: "2008", x: 11.1, y: 10.9, year: 2008 },
  { id: "2012", x: 6.4, y: 6.8, year: 2012, label: "2012 drought", category: "outlier" as const },
  { id: "2015", x: 11.9, y: 11.5, year: 2015 },
  { id: "2018", x: 12.1, y: 11.8, year: 2018 },
  { id: "2020", x: 10.5, y: 10.7, year: 2020 },
  { id: "2022", x: 9.2, y: 9.0, year: 2022 },
  { id: "2024", x: 11.4, y: 11.2, year: 2024 },
];

const DEMO_FAN_YEARS = Array.from({ length: 25 }, (_, i) => 2026 + i);

export const ChartsToolkitDemo: React.FC<{ initialTheme?: ChartThemeMode }> = ({
  initialTheme = "dark",
}) => {
  const [theme, setTheme] = useState<ChartThemeMode>(initialTheme);

  return (
    <div
      style={{
        padding: 24,
        background: theme === "dark" ? "#020617" : "#f1f5f9",
        color: theme === "dark" ? "#f8fafc" : "#0f172a",
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>FieldShift Chart Toolkit (I2 + I6)</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.75 }}>
            Multi-line with threshold & highlighted year · 11×11 Frontier Heatmap with contour & markers · Validation Scatter · Monte Carlo Fan Chart
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #475569",
            background: theme === "dark" ? "#1e293b" : "#ffffff",
            color: theme === "dark" ? "#f8fafc" : "#0f172a",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Switch to {theme === "dark" ? "Light" : "Dark"} Theme
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: 20 }}>
        <MultiLineChart
          title="Year-by-Year Farm Net Income (2002–2025)"
          subtitle="Comparison against bad-year threshold with 2012 drought highlighted"
          series={DEMO_MULTILINE_SERIES}
          threshold={{ value: 0, label: "Bad-year threshold" }}
          highlightedYear={{ year: 2012, label: "2012 US Drought" }}
          theme={theme}
        />

        <HeatmapChart
          title="Adaptation Frontier Heatmap (11×11)"
          subtitle="White contour = 20% bad-year tolerance; markers = Today & 2050 CMIP6"
          dTs={DEMO_DTS}
          dPs={DEMO_DPS}
          grid={DEMO_GRID}
          contourLimit={0.2}
          currentPoint={{ dT: 0, dP: 0, label: "Today" }}
          markers={[
            { id: "today", label: "Today", dT: 0, dP: 0, color: "#10b981" },
            { id: "ssp245", label: "2050 SSP2-4.5", dT: 2.1, dP: -0.1, color: "#f59e0b" },
            { id: "ssp585", label: "2050 SSP5-8.5", dT: 2.9, dP: -0.18, color: "#ef4444" },
          ]}
          theme={theme}
        />

        <ScatterChart
          title="Validation: Observed vs. Modelled Yields (Story County, IA)"
          subtitle="USDA NASS county yields vs. FieldShift physical engine (r = 0.89, RMSE = 0.58 t/ha)"
          xAxisLabel="Observed yield (USDA NASS)"
          yAxisLabel="Modelled yield (FieldShift)"
          points={DEMO_SCATTER_POINTS}
          showIdentityLine
          showRegressionLine
          theme={theme}
        />

        <FanChart
          title="Monte Carlo Future Income Fan (2026–2050)"
          subtitle="1,000 paths (CMIP6 weather × OU crop prices × input jump risk)"
          years={DEMO_FAN_YEARS}
          p10={DEMO_FAN_YEARS.map((_, i) => Math.round(90 - i * 4.2))}
          p50={DEMO_FAN_YEARS.map((_, i) => Math.round(295 - i * 3.1))}
          p90={DEMO_FAN_YEARS.map((_, i) => Math.round(520 - i * 2.0))}
          pBadYear={DEMO_FAN_YEARS.map((_, i) => Number((0.08 + i * 0.008).toFixed(2)))}
          failNet={0}
          marginYearP50={2041}
          theme={theme}
        />
      </div>
    </div>
  );
};
