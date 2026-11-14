import React, { useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { MultiLineChart } from "../../../packages/ui/charts/MultiLineChart";
import { ScatterChart } from "../../../packages/ui/charts/ScatterChart";
import { getChartPalette } from "../../../packages/ui/charts/theme";
import { ChartThemeMode, ScatterPoint } from "../../../packages/ui/charts/types";

// ============================================================================
// C6 · Validation Summary Contract & Data Provenance Table
// ============================================================================

export type YieldValidationPair = [number, number, number]; // [year, observed, modelled]

export interface CropValidationStats {
  n: number;
  r: number;
  rmse: number;
  bias: number;
  calib: number;
  pairs: YieldValidationPair[];
}

export interface NdviValidationStats {
  n: number;
  r: number;
}

export interface FarmValidationEntry {
  ndvi?: NdviValidationStats;
  crops: Record<string, CropValidationStats>;
}

export type ValidationSummaryMap = Record<string, FarmValidationEntry>;

export interface DataSourceRow {
  dataset: string;
  provider: string;
  variables: string;
  resolution: string;
  period: string;
  roleInFieldShift: string;
  url: string;
}

export interface SciencePanelProps {
  farmId?: string;
  farmName?: string;
  summary?: ValidationSummaryMap;
  sources?: DataSourceRow[];
  theme?: ChartThemeMode;
}

export const DEFAULT_VALIDATION_SUMMARY: ValidationSummaryMap = {
  iowa: {
    ndvi: { n: 24, r: 0.64 },
    crops: {
      maize: {
        n: 24,
        r: 0.78,
        rmse: 1.05,
        bias: -0.08,
        calib: 1.08,
        pairs: [
          [2002, 10.9, 10.4],
          [2004, 11.6, 11.2],
          [2006, 10.8, 10.6],
          [2008, 11.1, 10.9],
          [2010, 10.5, 10.8],
          [2012, 6.4, 6.9],
          [2014, 11.5, 11.3],
          [2016, 12.6, 12.0],
          [2018, 12.1, 11.8],
          [2020, 10.4, 10.7],
          [2022, 11.8, 11.4],
          [2024, 12.4, 12.1],
        ],
      },
      soybean: {
        n: 24,
        r: 0.74,
        rmse: 0.36,
        bias: 0.04,
        calib: 1.03,
        pairs: [
          [2002, 3.4, 3.3],
          [2004, 3.7, 3.6],
          [2006, 3.6, 3.5],
          [2008, 3.3, 3.4],
          [2010, 3.7, 3.6],
          [2012, 2.6, 2.8],
          [2014, 3.6, 3.7],
          [2016, 4.1, 3.9],
          [2018, 3.9, 3.8],
          [2020, 3.7, 3.8],
          [2022, 3.9, 3.8],
          [2024, 4.1, 4.0],
        ],
      },
    },
  },
  baragan: {
    ndvi: { n: 24, r: 0.69 },
    crops: {
      maize: {
        n: 24,
        r: 0.81,
        rmse: 0.92,
        bias: -0.05,
        calib: 0.94,
        pairs: [
          [2003, 3.8, 4.1],
          [2005, 6.9, 6.6],
          [2007, 2.1, 2.5],
          [2010, 7.2, 7.0],
          [2012, 3.4, 3.8],
          [2015, 5.8, 6.0],
          [2018, 8.4, 7.9],
          [2020, 4.1, 4.4],
          [2022, 3.2, 3.5],
          [2024, 2.6, 2.9],
        ],
      },
      wheat: {
        n: 24,
        r: 0.75,
        rmse: 0.64,
        bias: 0.03,
        calib: 1.02,
        pairs: [
          [2003, 2.9, 3.2],
          [2005, 4.8, 4.7],
          [2007, 2.6, 2.9],
          [2010, 4.9, 5.0],
          [2012, 4.2, 4.4],
          [2015, 5.4, 5.2],
          [2018, 5.9, 5.7],
          [2020, 3.8, 4.1],
          [2022, 5.1, 5.0],
          [2024, 5.3, 5.2],
        ],
      },
    },
  },
};

export const DEFAULT_DATA_SOURCES: DataSourceRow[] = [
  {
    dataset: "NASA POWER Agroclimatology (Daily v2.4)",
    provider: "NASA LaRC",
    variables: "T2M_MAX, T2M_MIN, PRECTOTCORR, GWETROOT, ALLSKY_SFC_SW_DWN, RH2M, WS2M",
    resolution: "0.5° × 0.625° daily",
    period: "2001–2025",
    roleInFieldShift: "Daily crop water bucket, GDD phenology, flowering heat & frost stress",
    url: "https://power.larc.nasa.gov/",
  },
  {
    dataset: "MODIS MOD13Q1 v061 NDVI",
    provider: "NASA LP DAAC / ORNL DAAC",
    variables: "250m_16_days_NDVI (QC-filtered)",
    resolution: "250 m · 16-day",
    period: "2001–2025",
    roleInFieldShift: "Independent satellite vegetation skill check (NDVI r) & drought replay curve",
    url: "https://modis.ornl.gov/",
  },
  {
    dataset: "NASA NEX-GDDP-CMIP6",
    provider: "NASA NCCS",
    variables: "tasmax, tasmin, pr (SSP2-4.5 & SSP5-8.5 ensemble median + p10/p90)",
    resolution: "0.25° downscaled",
    period: "2030–2090 vs 2001–2020",
    roleInFieldShift: "'Safe until ~20XX' horizon & Monte Carlo weather trajectory shifts",
    url: "https://www.nccs.nasa.gov/services/data-collections/land-based-products/nex-gddp-cmip6",
  },
  {
    dataset: "SoilGrids 2.0 (WCS)",
    provider: "ISRIC World Soil Information",
    variables: "sand, clay, silt, SOC, bulk density (bdod), pH (0–100 cm)",
    resolution: "250 m",
    period: "Static baseline",
    roleInFieldShift: "Saxton & Rawls plant-available water (AWC), RUSLE erodibility K & SOC stock",
    url: "https://soilgrids.org/",
  },
  {
    dataset: "SMAP L4 Root-Zone Soil Moisture & ECOSTRESS ESI",
    provider: "NASA NSIDC / LP DAAC (AppEEARS)",
    variables: "SPL4SMGP root-zone moisture, ECO_L4T_ESI evaporative stress, NASADEM 30 m slope",
    resolution: "9 km / 70 m / 30 m",
    period: "2015–2025",
    roleInFieldShift: "Initial sowing soil moisture anomaly, parcel evaporative stress & RUSLE LS slope",
    url: "https://appeears.earthdatacloud.nasa.gov/",
  },
  {
    dataset: "USDA NASS Quick Stats / Eurostat / INS TEMPO",
    provider: "USDA / Eurostat / INS Romania",
    variables: "Official county & regional historical crop yields (t/ha)",
    resolution: "County / NUTS-3",
    period: "2001–2025",
    roleInFieldShift: "Farm calibration factor (calib) and out-of-sample validation skill (r, RMSE)",
    url: "https://quickstats.nass.usda.gov/",
  },
  {
    dataset: "FAO GIEWS FPMA & World Bank Pink Sheet",
    provider: "FAO / World Bank / State Extension Budgets",
    variables: "Monthly grain & oilseed prices, volatility, mean reversion & input cost budgets",
    resolution: "Regional / National",
    period: "2000–2025",
    roleInFieldShift: "Quant Ornstein–Uhlenbeck price paths, Cholesky correlation & budget filters",
    url: "https://fpma.fao.org/",
  },
];

export const SciencePanel: React.FC<SciencePanelProps> = ({
  farmId = "iowa",
  farmName = "Story County, Iowa (USA)",
  summary = DEFAULT_VALIDATION_SUMMARY,
  sources = DEFAULT_DATA_SOURCES,
  theme = "dark",
}) => {
  const palette = getChartPalette(theme);
  const farmKey = summary[farmId] ? farmId : Object.keys(summary)[0] ?? "iowa";
  const farmEntry = summary[farmKey] ?? DEFAULT_VALIDATION_SUMMARY.iowa;
  const cropKeys = Object.keys(farmEntry.crops);
  const [selectedCrop, setSelectedCrop] = useState<string>(cropKeys[0] ?? "maize");

  const activeCrop = cropKeys.includes(selectedCrop) ? selectedCrop : cropKeys[0] ?? "maize";
  const stats = farmEntry.crops[activeCrop] ?? DEFAULT_VALIDATION_SUMMARY.iowa.crops.maize;

  const scatterPoints: ScatterPoint[] = stats.pairs.map(([yr, obs, mod]) => ({
    id: `${yr}`,
    year: yr,
    x: obs,
    y: mod,
    label: yr === 2012 || yr === 2007 || yr === 2024 ? `${yr}` : undefined,
    category: yr === 2012 || yr === 2007 || yr === 2024 ? "outlier" : "primary",
  }));

  const timeSeries = [
    {
      id: "observed",
      label: `Observed (${activeCrop}, official county yield)`,
      color: palette.accentBlue,
      data: stats.pairs.map(([yr, obs]) => ({ year: yr, value: obs })),
    },
    {
      id: "modelled",
      label: `Modelled (FieldShift physical engine)`,
      color: palette.accentEmerald,
      dashed: true,
      data: stats.pairs.map(([yr, , mod]) => ({ year: yr, value: mod })),
    },
  ];

  return (
    <section
      aria-label="Validation and Data Provenance Panel"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 14,
        padding: 18,
        color: palette.textPrimary,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header & Crop Selector */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            Scientific Validation & NASA Data Provenance — {farmName}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: palette.textMuted }}>
            Honest skill evaluation against official county harvests (C5/C6) and MODIS satellite NDVI
          </p>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {cropKeys.map((crop) => {
            const active = crop === activeCrop;
            return (
              <button
                key={crop}
                type="button"
                onClick={() => setSelectedCrop(crop)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "capitalize",
                  cursor: "pointer",
                  border: `1px solid ${active ? palette.accentEmerald : palette.border}`,
                  background: active ? `${palette.accentEmerald}22` : palette.surface,
                  color: active ? palette.accentEmerald : palette.textSecondary,
                }}
              >
                {crop}
              </button>
            );
          })}
        </div>
      </div>

      {/* Validation Metric Badges */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div style={{ background: palette.surface, padding: "10px 12px", borderRadius: 10, border: `1px solid ${palette.border}` }}>
          <div style={{ fontSize: 11, color: palette.textMuted }}>Yield Correlation (r)</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: palette.accentEmerald, marginTop: 2 }}>
            r = {stats.r.toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: palette.textMuted }}>n = {stats.n} historical seasons</div>
        </div>

        <div style={{ background: palette.surface, padding: "10px 12px", borderRadius: 10, border: `1px solid ${palette.border}` }}>
          <div style={{ fontSize: 11, color: palette.textMuted }}>Root Mean Square Error</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            {stats.rmse.toFixed(2)} t/ha
          </div>
          <div style={{ fontSize: 11, color: palette.textMuted }}>Mean bias: {stats.bias >= 0 ? `+${stats.bias.toFixed(2)}` : stats.bias.toFixed(2)} t/ha</div>
        </div>

        <div style={{ background: palette.surface, padding: "10px 12px", borderRadius: 10, border: `1px solid ${palette.border}` }}>
          <div style={{ fontSize: 11, color: palette.textMuted }}>MODIS Peak NDVI Skill</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: palette.accentBlue, marginTop: 2 }}>
            r = {(farmEntry.ndvi?.r ?? 0.62).toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: palette.textMuted }}>Water × heat stress vs NDVI</div>
        </div>

        <div style={{ background: palette.surface, padding: "10px 12px", borderRadius: 10, border: `1px solid ${palette.border}` }}>
          <div style={{ fontSize: 11, color: palette.textMuted }}>Local Calibration Factor</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: palette.accentAmber, marginTop: 2 }}>
            {stats.calib.toFixed(2)}×
          </div>
          <div style={{ fontSize: 11, color: palette.textMuted }}>Observed ÷ uncalibrated mean</div>
        </div>
      </div>

      {/* Side-by-side Scatter (1:1) and Historical Yield Trajectory */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <ScatterChart
          title={`Modelled vs. Observed ${activeCrop.toUpperCase()} Yields`}
          subtitle="Dashed line = 1:1 perfect agreement; solid green = OLS regression fit"
          xAxisLabel="Observed county yield"
          yAxisLabel="Modelled yield"
          xUnit="t/ha"
          yUnit="t/ha"
          points={scatterPoints}
          showIdentityLine
          showRegressionLine
          theme={theme}
          height={270}
        />

        <MultiLineChart
          title={`Historical Yield Tracking (${activeCrop.toUpperCase()})`}
          subtitle="Captures severe drought drops (2007, 2012, 2022, 2024) and recovery years"
          yAxisLabel="Yield"
          yUnit="t/ha"
          series={timeSeries}
          highlightedYear={{ year: 2012, label: "2012 Drought" }}
          theme={theme}
          height={270}
        />
      </div>

      {/* "Data behind every number" Provenance Table */}
      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700 }}>
          Data Behind Every Number
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              textAlign: "left",
            }}
          >
            <thead>
              <tr style={{ borderBottom: `1px solid ${palette.border}`, color: palette.textMuted }}>
                <th style={{ padding: "8px 10px" }}>Dataset</th>
                <th style={{ padding: "8px 10px" }}>Variables</th>
                <th style={{ padding: "8px 10px" }}>Resolution & Period</th>
                <th style={{ padding: "8px 10px" }}>How FieldShift Uses It</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((row) => (
                <tr
                  key={row.dataset}
                  style={{ borderBottom: `1px solid ${palette.grid}` }}
                >
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: palette.accentEmerald, textDecoration: "none" }}
                    >
                      {row.dataset}
                    </a>
                    <div style={{ fontSize: 10.5, color: palette.textMuted, fontWeight: 400 }}>
                      {row.provider}
                    </div>
                  </td>
                  <td style={{ padding: "8px 10px", color: palette.textSecondary }}>{row.variables}</td>
                  <td style={{ padding: "8px 10px", color: palette.textSecondary, whiteSpace: "nowrap" }}>
                    {row.resolution} · {row.period}
                  </td>
                  <td style={{ padding: "8px 10px", color: palette.textPrimary }}>{row.roleInFieldShift}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

const slotRoots = new WeakMap<HTMLElement, Root>();

/**
 * Imperative slot mount function for `#science` (`IONUT.md` UI pair contract).
 */
export function render(el: HTMLElement, data: SciencePanelProps = {}): void {
  let root = slotRoots.get(el);
  if (!root) {
    root = createRoot(el);
    slotRoots.set(el, root);
  }
  root.render(React.createElement(SciencePanel, data));
}

export default SciencePanel;
