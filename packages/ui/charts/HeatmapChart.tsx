import React, { useState } from "react";
import { getChartPalette, pFailToRiskColor } from "./theme";
import { HeatmapChartProps } from "./types";

export const HeatmapChart: React.FC<HeatmapChartProps> = ({
  title = "Climate Failure Frontier (11×11)",
  subtitle = "Share of bad years across ΔT (°C) × ΔP (rain change) with white limit contour",
  dTs,
  dPs,
  grid,
  contourLimit = 0.2,
  markers = [],
  currentPoint = { dT: 0, dP: 0, label: "Today" },
  theme = "dark",
  height = 340,
  onSelectCell,
}) => {
  const palette = getChartPalette(theme);
  const [hoveredCell, setHoveredCell] = useState<{ dT: number; dP: number; pFail: number } | null>(null);

  const nRows = Math.max(dTs.length, 1);
  const nCols = Math.max(dPs.length, 1);

  const width = 680;
  const pad = { top: 28, right: 32, bottom: 48, left: 68 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const cellW = plotW / nCols;
  const cellH = plotH / nRows;

  const minDT = dTs[0] ?? 0;
  const maxDT = dTs[dTs.length - 1] ?? 5;
  const minDP = dPs[0] ?? 0;
  const maxDP = dPs[dPs.length - 1] ?? -0.5;

  // Map continuous (dT, dP) coordinates to SVG pixel center
  const toPixel = (dT: number, dP: number): { x: number; y: number } => {
    const normDP = Math.abs(dP) > 1.0 ? dP / 100.0 : dP;
    const colFrac = (normDP - minDP) / (maxDP - minDP || -0.5);
    const rowFrac = (dT - minDT) / (maxDT - minDT || 5.0);
    const x = pad.left + Math.max(0, Math.min(1, colFrac)) * (plotW - cellW) + cellW / 2;
    // Row 0 (dT = 0) at bottom, highest dT at top
    const y = pad.top + (1 - Math.max(0, Math.min(1, rowFrac))) * (plotH - cellH) + cellH / 2;
    return { x, y };
  };

  // Compute interpolated white contour polyline where pFail == contourLimit
  const contourPoints: string[] = [];
  for (let j = 0; j < nCols; j++) {
    let crossingRow = -1;
    for (let i = 0; i < nRows - 1; i++) {
      const p0 = grid[i]?.[j] ?? 0;
      const p1 = grid[i + 1]?.[j] ?? 0;
      if ((p0 <= contourLimit && p1 >= contourLimit) || (p0 >= contourLimit && p1 <= contourLimit)) {
        const frac = Math.abs(p1 - p0) > 1e-6 ? (contourLimit - p0) / (p1 - p0) : 0.5;
        crossingRow = i + Math.max(0, Math.min(1, frac));
        break;
      }
    }
    if (crossingRow >= 0) {
      const cx = pad.left + j * cellW + cellW / 2;
      const cy = pad.top + (nRows - 1 - crossingRow) * cellH + cellH / 2;
      contourPoints.push(`${cx.toFixed(1)},${cy.toFixed(1)}`);
    }
  }

  const ringPos = currentPoint ? toPixel(currentPoint.dT, currentPoint.dP) : null;

  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: 16,
        color: palette.textPrimary,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, color: palette.textMuted, marginTop: 2 }}>{subtitle}</div>
        </div>
        <div style={{ fontSize: 11, color: palette.textSecondary, display: "flex", alignItems: "center", gap: 10 }}>
          <span>Safe (&le;{Math.round(contourLimit * 100)}%)</span>
          <span
            style={{
              width: 64,
              height: 8,
              borderRadius: 4,
              background: "linear-gradient(90deg, #059669 0%, #10b981 35%, #d97706 68%, #dc2626 100%)",
              display: "inline-block",
            }}
          />
          <span>High failure</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {/* Heatmap cells: row i=0 at bottom, i=nRows-1 at top */}
        {dTs.map((dt, i) =>
          dPs.map((dp, j) => {
            const pFail = grid[i]?.[j] ?? 0;
            const x = pad.left + j * cellW;
            const y = pad.top + (nRows - 1 - i) * cellH;
            const fill = pFailToRiskColor(pFail, contourLimit, theme);
            return (
              <g key={`${i}-${j}`}>
                <rect
                  x={x + 0.75}
                  y={y + 0.75}
                  width={Math.max(cellW - 1.5, 1)}
                  height={Math.max(cellH - 1.5, 1)}
                  rx={3}
                  fill={fill}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredCell({ dT: dt, dP: dp, pFail })}
                  onMouseLeave={() => setHoveredCell(null)}
                  onClick={() => onSelectCell?.(dt, dp, pFail)}
                >
                  <title>{`ΔT +${dt.toFixed(1)} °C, ΔP ${Math.round(dp * 100)}%: ${Math.round(pFail * 100)}% bad years`}</title>
                </rect>
                <text
                  x={x + cellW / 2}
                  y={y + cellH / 2 + 3.5}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={600}
                  fill="#ffffff"
                  style={{ pointerEvents: "none", opacity: 0.9 }}
                >
                  {Math.round(pFail * 100)}%
                </text>
              </g>
            );
          })
        )}

        {/* White contour line at farmer's failure threshold */}
        {contourPoints.length >= 2 && (
          <g>
            <polyline
              points={contourPoints.join(" ")}
              fill="none"
              stroke="#0f172a"
              strokeWidth={4.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.55}
            />
            <polyline
              points={contourPoints.join(" ")}
              fill="none"
              stroke={palette.contourStroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}

        {/* Current-climate ring */}
        {ringPos && (
          <g style={{ pointerEvents: "none" }}>
            <circle
              cx={ringPos.x}
              cy={ringPos.y}
              r={9.5}
              fill="none"
              stroke="#ffffff"
              strokeWidth={2.5}
            />
            <circle
              cx={ringPos.x}
              cy={ringPos.y}
              r={4}
              fill="#ffffff"
            />
          </g>
        )}

        {/* Scenario markers (Today / 2050 SSP2-4.5 / SSP5-8.5) */}
        {markers.map((m) => {
          const pos = toPixel(m.dT, m.dP);
          return (
            <g key={m.id} style={{ pointerEvents: "none" }}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={5.5}
                fill={m.color ?? "#0f172a"}
                stroke="#ffffff"
                strokeWidth={2}
              />
              <rect
                x={pos.x + 8}
                y={pos.y - 10}
                width={m.label.length * 6.2 + 10}
                height={18}
                rx={4}
                fill="rgba(15, 23, 42, 0.85)"
              />
              <text
                x={pos.x + 13}
                y={pos.y + 3}
                fontSize={10.5}
                fontWeight={600}
                fill="#ffffff"
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {/* Y axis labels (ΔT °C) */}
        {dTs
          .filter((_, idx) => idx % 2 === 0)
          .map((dt) => {
            const i = dTs.indexOf(dt);
            const y = pad.top + (nRows - 1 - i) * cellH + cellH / 2;
            return (
              <text
                key={dt}
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill={palette.textMuted}
              >
                +{dt.toFixed(1)}°C
              </text>
            );
          })}

        {/* X axis labels (ΔP rain change %) */}
        {dPs
          .filter((_, idx) => idx % 2 === 0)
          .map((dp) => {
            const j = dPs.indexOf(dp);
            const x = pad.left + j * cellW + cellW / 2;
            const pct = Math.abs(dp) <= 1 ? Math.round(dp * 100) : Math.round(dp);
            return (
              <text
                key={dp}
                x={x}
                y={height - 16}
                textAnchor="middle"
                fontSize={11}
                fill={palette.textMuted}
              >
                {pct}%
              </text>
            );
          })}
      </svg>

      {hoveredCell && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: palette.textSecondary,
          }}
        >
          Selected cell: <strong>+{hoveredCell.dT.toFixed(1)} °C</strong>,{" "}
          <strong>{Math.round((Math.abs(hoveredCell.dP) <= 1 ? hoveredCell.dP * 100 : hoveredCell.dP))}% rain</strong>{" "}
          → <strong>{Math.round(hoveredCell.pFail * 100)}% bad years</strong>
        </div>
      )}
    </div>
  );
};
