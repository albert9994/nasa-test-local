import React, { useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { FanChart } from "../../../packages/ui/charts/FanChart";
import { getChartPalette } from "../../../packages/ui/charts/theme";
import { ChartThemeMode } from "../../../packages/ui/charts/types";

export interface RotationStepDTO {
  crop: string;
  cover?: boolean;
}

export interface QuantRotationDTO {
  rotation: RotationStepDTO[];
  label?: string;
  years: number[];
  income: {
    p10: number[];
    p50: number[];
    p90: number[];
  };
  pBadYear: number[];
  var95: number;
  cvar95: number;
  pRuin: number;
  maxDrawdownP50: number;
  marginYear: {
    p10: number | null;
    p50: number | null;
    p90: number | null;
  };
  meanAnnual: number;
  sdAnnual: number;
  riskAdjusted: number;
}

export interface MarginYearPanelProps {
  farmName?: string;
  ssp?: "ssp245" | "ssp585";
  paths?: number;
  cashReserve?: number;
  failNet?: number;
  deterministicMarginYear?: number | "now" | null;
  rotations?: QuantRotationDTO[];
  currencyUnit?: string;
  theme?: ChartThemeMode;
}

const DEFAULT_YEARS = Array.from({ length: 25 }, (_, i) => 2026 + i);

export const FALLBACK_QUANT_ROTATIONS: QuantRotationDTO[] = [
  {
    rotation: [
      { crop: "maize", cover: false },
      { crop: "soybean", cover: false },
    ],
    label: "Current rotation (maize → soybean)",
    years: DEFAULT_YEARS,
    income: {
      p10: DEFAULT_YEARS.map((_, i) => Math.round(65 - i * 6.5)),
      p50: DEFAULT_YEARS.map((_, i) => Math.round(275 - i * 4.2)),
      p90: DEFAULT_YEARS.map((_, i) => Math.round(490 - i * 2.5)),
    },
    pBadYear: DEFAULT_YEARS.map((_, i) => Number(Math.min(0.65, 0.12 + i * 0.011).toFixed(2))),
    var95: -215,
    cvar95: -340,
    pRuin: 0.18,
    maxDrawdownP50: 410,
    marginYear: { p10: 2030, p50: 2036, p90: 2043 },
    meanAnnual: 218,
    sdAnnual: 175,
    riskAdjusted: 1.25,
  },
  {
    rotation: [
      { crop: "wheat", cover: false },
      { crop: "sorghum", cover: false },
      { crop: "pea", cover: true },
    ],
    label: "Drought shield (winter wheat → sorghum → pea + rye)",
    years: DEFAULT_YEARS,
    income: {
      p10: DEFAULT_YEARS.map((_, i) => Math.round(145 - i * 2.1)),
      p50: DEFAULT_YEARS.map((_, i) => Math.round(320 - i * 1.4)),
      p90: DEFAULT_YEARS.map((_, i) => Math.round(510 - i * 0.9)),
    },
    pBadYear: DEFAULT_YEARS.map((_, i) => Number(Math.min(0.25, 0.03 + i * 0.004).toFixed(2))),
    var95: 45,
    cvar95: -65,
    pRuin: 0.02,
    maxDrawdownP50: 145,
    marginYear: { p10: 2046, p50: null, p90: null },
    meanAnnual: 302,
    sdAnnual: 118,
    riskAdjusted: 2.56,
  },
];

function formatRotationTitle(rot: QuantRotationDTO): string {
  if (rot.label) return rot.label;
  return rot.rotation
    .map((s) => `${s.crop}${s.cover ? " + rye" : ""}`)
    .join(" → ");
}

function formatSafeUntil(
  marginYear: QuantRotationDTO["marginYear"],
  deterministic?: number | "now" | null
): { headline: string; bandText: string; status: "safe" | "warning" | "critical" } {
  if (deterministic === "now") {
    return {
      headline: "Already over failure threshold today",
      bandText: "Exceeds bad-year tolerance in baseline climate",
      status: "critical",
    };
  }
  const p50 = marginYear.p50 ?? (typeof deterministic === "number" ? deterministic : null);
  if (p50 === null) {
    return {
      headline: "Safe beyond 2050",
      bandText: marginYear.p10
        ? `80% scenario band: ${marginYear.p10} – >2050`
        : "Remains within tolerance across 80%+ of simulated futures through 2050",
      status: "safe",
    };
  }
  const low = marginYear.p10 ?? p50 - 4;
  const high = marginYear.p90 ? `${marginYear.p90}` : ">2050";
  return {
    headline: `Safe until ~${p50}`,
    bandText: `80% scenario band: ${low} – ${high}`,
    status: p50 <= 2036 ? "critical" : "warning",
  };
}

export const MarginYearPanel: React.FC<MarginYearPanelProps> = ({
  farmName = "Story County, Iowa (USA)",
  ssp = "ssp245",
  paths = 1000,
  cashReserve = 500,
  failNet = 0,
  deterministicMarginYear,
  rotations = FALLBACK_QUANT_ROTATIONS,
  currencyUnit = "$/ha",
  theme = "dark",
}) => {
  const palette = getChartPalette(theme);
  const items = rotations.length > 0 ? rotations : FALLBACK_QUANT_ROTATIONS;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const active = items[Math.min(selectedIdx, items.length - 1)];

  const safeInfo = formatSafeUntil(active.marginYear, deterministicMarginYear);
  const idx2035 = active.years.indexOf(2035);
  const pBad2035 = idx2035 >= 0 ? active.pBadYear[idx2035] : active.pBadYear[Math.floor(active.pBadYear.length / 2)] ?? 0;

  const badgeColor =
    safeInfo.status === "safe"
      ? palette.accentEmerald
      : safeInfo.status === "warning"
      ? palette.accentAmber
      : palette.accentRed;

  return (
    <section
      aria-label="Monte Carlo Future & Safe Until Horizon"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 14,
        padding: 18,
        color: palette.textPrimary,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Top header & rotation selector tabs */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
                background: `${badgeColor}22`,
                color: badgeColor,
                border: `1px solid ${badgeColor}`,
              }}
            >
              {safeInfo.headline}
            </span>
            <span style={{ fontSize: 12, color: palette.textMuted }}>
              {safeInfo.bandText} · {ssp.toUpperCase()} ({paths.toLocaleString()} Monte Carlo paths)
            </span>
          </div>
          <div style={{ fontSize: 13, color: palette.textSecondary, marginTop: 6 }}>
            <strong>{farmName}</strong> — stochastic weather (CMIP6 block-bootstrap) × correlated OU crop prices × fertilizer jump risk
          </div>
        </div>

        {items.length > 1 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {items.map((rot, idx) => {
              const isSelected = idx === selectedIdx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: `1px solid ${isSelected ? palette.accentEmerald : palette.border}`,
                    background: isSelected ? `${palette.accentEmerald}22` : palette.surface,
                    color: isSelected ? palette.accentEmerald : palette.textSecondary,
                  }}
                >
                  {formatRotationTitle(rot)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Finance-style Risk Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div style={{ background: palette.surface, padding: "10px 12px", borderRadius: 10, border: `1px solid ${palette.border}` }}>
          <div style={{ fontSize: 11, color: palette.textMuted }}>Expected Mean Net</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: palette.accentEmerald }}>
            {active.meanAnnual >= 0 ? `+${Math.round(active.meanAnnual)}` : Math.round(active.meanAnnual)} {currencyUnit}
          </div>
          <div style={{ fontSize: 11, color: palette.textMuted }}>SD ±{Math.round(active.sdAnnual)} {currencyUnit}/yr</div>
        </div>

        <div style={{ background: palette.surface, padding: "10px 12px", borderRadius: 10, border: `1px solid ${palette.border}` }}>
          <div style={{ fontSize: 11, color: palette.textMuted }}>Tail Risk (CVaR 95%)</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: active.cvar95 < 0 ? palette.accentRed : palette.textPrimary }}>
            {Math.round(active.cvar95)} {currencyUnit}
          </div>
          <div style={{ fontSize: 11, color: palette.textMuted }}>VaR 95%: {Math.round(active.var95)} {currencyUnit}</div>
        </div>

        <div style={{ background: palette.surface, padding: "10px 12px", borderRadius: 10, border: `1px solid ${palette.border}` }}>
          <div style={{ fontSize: 11, color: palette.textMuted }}>Probability of Ruin</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: active.pRuin > 0.1 ? palette.accentRed : palette.accentEmerald }}>
            {Math.round(active.pRuin * 100)}%
          </div>
          <div style={{ fontSize: 11, color: palette.textMuted }}>Cash reserve: {cashReserve} {currencyUnit}</div>
        </div>

        <div style={{ background: palette.surface, padding: "10px 12px", borderRadius: 10, border: `1px solid ${palette.border}` }}>
          <div style={{ fontSize: 11, color: palette.textMuted }}>P(Bad Year in 2035)</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: pBad2035 > 0.2 ? palette.accentAmber : palette.textPrimary }}>
            {Math.round(pBad2035 * 100)}%
          </div>
          <div style={{ fontSize: 11, color: palette.textMuted }}>Max drawdown p50: {Math.round(active.maxDrawdownP50)} {currencyUnit}</div>
        </div>

        <div style={{ background: palette.surface, padding: "10px 12px", borderRadius: 10, border: `1px solid ${palette.border}` }}>
          <div style={{ fontSize: 11, color: palette.textMuted }}>Risk-Adjusted Score</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: palette.accentBlue }}>
            {active.riskAdjusted.toFixed(2)}×
          </div>
          <div style={{ fontSize: 11, color: palette.textMuted }}>Mean ÷ SD (Sharpe-like)</div>
        </div>
      </div>

      {/* 2026–2050 Income Fan Chart */}
      <FanChart
        title={`2026–2050 Income Fan: ${formatRotationTitle(active)}`}
        subtitle="80% confidence band (p10–p90) and median trajectory across simulated climate & market futures"
        years={active.years}
        p10={active.income.p10}
        p50={active.income.p50}
        p90={active.income.p90}
        pBadYear={active.pBadYear}
        failNet={failNet}
        marginYearP50={active.marginYear.p50}
        yUnit={currencyUnit}
        theme={theme}
      />

      {/* C11 mandatory honesty disclaimer */}
      <div style={{ marginTop: 10, fontSize: 11.5, color: palette.textMuted, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span>
          <strong>Planning aid, not a forecast:</strong> values represent scenario probabilities under CMIP6 ({ssp.toUpperCase()}) and historical price/yield volatility, not a guarantee.
        </span>
        <span>Seeded reproducible Monte Carlo (`rand_chacha`)</span>
      </div>
    </section>
  );
};

const slotRoots = new WeakMap<HTMLElement, Root>();

/**
 * Imperative slot mount function for `#marginYear` (`IONUT.md` UI pair contract).
 */
export function render(el: HTMLElement, data: MarginYearPanelProps = {}): void {
  let root = slotRoots.get(el);
  if (!root) {
    root = createRoot(el);
    slotRoots.set(el, root);
  }
  root.render(React.createElement(MarginYearPanel, data));
}

export default MarginYearPanel;
