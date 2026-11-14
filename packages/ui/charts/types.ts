export type ChartThemeMode = "light" | "dark";

// ============================================================================
// 1. Multi-Line Chart (with threshold line & highlighted year)
// ============================================================================

export interface LineSeriesPoint {
  year: number;
  value: number;
  note?: string;
}

export interface LineSeries {
  id: string;
  label: string;
  color?: string;
  dashed?: boolean;
  data: LineSeriesPoint[];
}

export interface MultiLineChartProps {
  title?: string;
  subtitle?: string;
  yAxisLabel?: string;
  yUnit?: string;
  series: LineSeries[];
  threshold?: {
    value: number;
    label: string;
    color?: string;
  };
  highlightedYear?: {
    year: number;
    label?: string;
  };
  theme?: ChartThemeMode;
  height?: number;
  onSelectYear?: (year: number) => void;
}

// ============================================================================
// 2. Heatmap Chart (11×11 frontier with contour, markers & current-point ring)
// ============================================================================

export interface HeatmapMarker {
  id: string;
  label: string;
  dT: number;
  dP: number; // fraction e.g. -0.15 or percent e.g. -15
  color?: string;
}

export interface HeatmapChartProps {
  title?: string;
  subtitle?: string;
  dTs: number[]; // e.g. [0, 0.5, ..., 5.0] °C
  dPs: number[]; // e.g. [0, -0.05, ..., -0.50] rain change fraction
  grid: number[][]; // grid[dT_idx][dP_idx] = pFail in [0, 1]
  contourLimit?: number; // e.g. 0.20 (1 in 5 bad years)
  markers?: HeatmapMarker[]; // e.g. Today, 2050 SSP2-4.5, 2050 SSP5-8.5
  currentPoint?: {
    dT: number;
    dP: number;
    label?: string;
  };
  theme?: ChartThemeMode;
  height?: number;
  onSelectCell?: (dT: number, dP: number, pFail: number) => void;
}

// ============================================================================
// 3. Scatter Chart (validation observed vs. modelled / risk–return)
// ============================================================================

export interface ScatterPoint {
  id: string;
  x: number;
  y: number;
  label?: string;
  year?: number;
  category?: "primary" | "baseline" | "pick" | "outlier";
  color?: string;
}

export interface ScatterChartProps {
  title?: string;
  subtitle?: string;
  xAxisLabel: string;
  yAxisLabel: string;
  xUnit?: string;
  yUnit?: string;
  points: ScatterPoint[];
  showIdentityLine?: boolean; // 1:1 line for observed vs modelled yields
  showRegressionLine?: boolean;
  theme?: ChartThemeMode;
  height?: number;
  onSelectPoint?: (point: ScatterPoint) => void;
}

// ============================================================================
// 4. Monte Carlo Fan Chart (2026–2050 p10 / p50 / p90 + P(bad year))
// ============================================================================

export interface FanChartProps {
  title?: string;
  subtitle?: string;
  years: number[];
  p10: number[];
  p50: number[];
  p90: number[];
  pBadYear?: number[];
  failNet?: number;
  marginYearP50?: number | null;
  yUnit?: string;
  theme?: ChartThemeMode;
  height?: number;
}
