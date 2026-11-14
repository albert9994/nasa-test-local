import { ChartThemeMode } from "./types";

export interface ChartPalette {
  bg: string;
  surface: string;
  border: string;
  grid: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentEmerald: string;
  accentAmber: string;
  accentRed: string;
  accentBlue: string;
  accentViolet: string;
  contourStroke: string;
  highlightBand: string;
  seriesColors: string[];
}

export const LIGHT_CHART_PALETTE: ChartPalette = {
  bg: "var(--fs-chart-bg, #ffffff)",
  surface: "var(--fs-chart-surface, #f8fafc)",
  border: "var(--fs-chart-border, #e2e8f0)",
  grid: "var(--fs-chart-grid, #e2e8f0)",
  textPrimary: "var(--fs-chart-text, #0f172a)",
  textSecondary: "var(--fs-chart-text-sec, #334155)",
  textMuted: "var(--fs-chart-text-muted, #64748b)",
  accentEmerald: "#059669",
  accentAmber: "#d97706",
  accentRed: "#dc2626",
  accentBlue: "#2563eb",
  accentViolet: "#7c3aed",
  contourStroke: "#ffffff",
  highlightBand: "rgba(217, 119, 6, 0.14)",
  seriesColors: ["#059669", "#2563eb", "#d97706", "#7c3aed", "#dc2626"],
};

export const DARK_CHART_PALETTE: ChartPalette = {
  bg: "var(--fs-chart-bg-dark, #0f172a)",
  surface: "var(--fs-chart-surface-dark, #1e293b)",
  border: "var(--fs-chart-border-dark, #334155)",
  grid: "var(--fs-chart-grid-dark, #1e293b)",
  textPrimary: "var(--fs-chart-text-dark, #f8fafc)",
  textSecondary: "var(--fs-chart-text-sec-dark, #cbd5e1)",
  textMuted: "var(--fs-chart-text-muted-dark, #94a3b8)",
  accentEmerald: "#10b981",
  accentAmber: "#f59e0b",
  accentRed: "#ef4444",
  accentBlue: "#3b82f6",
  accentViolet: "#a78bfa",
  contourStroke: "#ffffff",
  highlightBand: "rgba(245, 158, 11, 0.18)",
  seriesColors: ["#10b981", "#38bdf8", "#f59e0b", "#a78bfa", "#f87171"],
};

export function getChartPalette(mode: ChartThemeMode = "dark"): ChartPalette {
  return mode === "light" ? LIGHT_CHART_PALETTE : DARK_CHART_PALETTE;
}

/**
 * Maps failure probability `pFail` ∈ [0, 1] relative to `limit` (default 0.20)
 * onto an accessible green → amber → crimson agricultural risk color scale.
 */
export function pFailToRiskColor(pFail: number, limit = 0.2, mode: ChartThemeMode = "dark"): string {
  const p = Math.max(0, Math.min(1, pFail));
  if (p <= limit * 0.5) {
    return mode === "light" ? "#10b981" : "#059669";
  }
  if (p <= limit) {
    return mode === "light" ? "#34d399" : "#10b981";
  }
  if (p <= limit * 1.5) {
    return mode === "light" ? "#fbbf24" : "#d97706";
  }
  if (p <= limit * 2.25) {
    return mode === "light" ? "#f97316" : "#ea580c";
  }
  return mode === "light" ? "#ef4444" : "#dc2626";
}
