import React, { useState } from "react";
import { getChartPalette } from "./theme";
import { ScatterChartProps, ScatterPoint } from "./types";

export const ScatterChart: React.FC<ScatterChartProps> = ({
  title,
  subtitle,
  xAxisLabel,
  yAxisLabel,
  xUnit = "t/ha",
  yUnit = "t/ha",
  points,
  showIdentityLine = true,
  showRegressionLine = true,
  theme = "dark",
  height = 300,
  onSelectPoint,
}) => {
  const palette = getChartPalette(theme);
  const [hovered, setHovered] = useState<ScatterPoint | null>(null);

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const allVals = showIdentityLine ? [...xs, ...ys] : xs;

  const minX = (allVals.length ? Math.min(...allVals) : 0) * 0.9;
  const maxX = (allVals.length ? Math.max(...allVals) : 12) * 1.08 + 0.1;
  const minY = (showIdentityLine ? minX : (ys.length ? Math.min(...ys) : 0) * 0.9);
  const maxY = (showIdentityLine ? maxX : (ys.length ? Math.max(...ys) : 12) * 1.08 + 0.1);

  const width = 640;
  const pad = { top: 28, right: 28, bottom: 44, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xPx = (v: number) => pad.left + ((v - minX) / Math.max(maxX - minX, 1e-6)) * plotW;
  const yPx = (v: number) => pad.top + (1 - (v - minY) / Math.max(maxY - minY, 1e-6)) * plotH;

  // Compute ordinary least squares regression line y = a + b*x
  let regSegment: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (showRegressionLine && points.length >= 2) {
    const n = points.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of points) {
      num += (p.x - meanX) * (p.y - meanY);
      den += (p.x - meanX) * (p.x - meanX);
    }
    if (den > 1e-9) {
      const slope = num / den;
      const intercept = meanY - slope * meanX;
      const rx1 = Math.min(...xs);
      const rx2 = Math.max(...xs);
      regSegment = {
        x1: xPx(rx1),
        y1: yPx(intercept + slope * rx1),
        x2: xPx(rx2),
        y2: yPx(intercept + slope * rx2),
      };
    }
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1];

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
      {(title || subtitle) && (
        <div style={{ marginBottom: 10 }}>
          {title && <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>}
          {subtitle && <div style={{ fontSize: 12, color: palette.textMuted, marginTop: 2 }}>{subtitle}</div>}
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {/* Grid lines */}
        {ticks.map((t, i) => {
          const xv = minX + t * (maxX - minX);
          const yv = minY + t * (maxY - minY);
          return (
            <g key={i}>
              <line x1={pad.left} y1={yPx(yv)} x2={width - pad.right} y2={yPx(yv)} stroke={palette.grid} strokeDasharray="3 3" />
              <line x1={xPx(xv)} y1={pad.top} x2={xPx(xv)} y2={pad.top + plotH} stroke={palette.grid} strokeDasharray="3 3" />
              <text x={pad.left - 8} y={yPx(yv) + 4} textAnchor="end" fontSize={11} fill={palette.textMuted}>
                {yv.toFixed(1)}
              </text>
              <text x={xPx(xv)} y={height - 16} textAnchor="middle" fontSize={11} fill={palette.textMuted}>
                {xv.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Axis titles */}
        <text x={pad.left + plotW / 2} y={height - 2} textAnchor="middle" fontSize={11} fill={palette.textSecondary}>
          {xAxisLabel} ({xUnit})
        </text>
        <text
          x={pad.left - 44}
          y={pad.top + plotH / 2}
          transform={`rotate(-90, ${pad.left - 44}, ${pad.top + plotH / 2})`}
          textAnchor="middle"
          fontSize={11}
          fill={palette.textSecondary}
        >
          {yAxisLabel} ({yUnit})
        </text>

        {/* 1:1 Identity line */}
        {showIdentityLine && (
          <line
            x1={xPx(minX)}
            y1={yPx(minX)}
            x2={xPx(maxX)}
            y2={yPx(maxX)}
            stroke={palette.textMuted}
            strokeWidth={1.5}
            strokeDasharray="5 5"
          />
        )}

        {/* OLS Regression trendline */}
        {regSegment && (
          <line
            x1={regSegment.x1}
            y1={regSegment.y1}
            x2={regSegment.x2}
            y2={regSegment.y2}
            stroke={palette.accentEmerald}
            strokeWidth={2}
          />
        )}

        {/* Points */}
        {points.map((pt) => {
          const cx = xPx(pt.x);
          const cy = yPx(pt.y);
          const color =
            pt.color ??
            (pt.category === "baseline"
              ? palette.accentAmber
              : pt.category === "pick"
              ? palette.accentEmerald
              : pt.category === "outlier"
              ? palette.accentRed
              : palette.accentBlue);
          const isHovered = hovered?.id === pt.id;

          return (
            <g key={pt.id}>
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? 6.5 : 4.5}
                fill={color}
                stroke={palette.bg}
                strokeWidth={1.5}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHovered(pt)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelectPoint?.(pt)}
              >
                <title>{`${pt.label ?? pt.year ?? pt.id}: (${pt.x.toFixed(2)} ${xUnit}, ${pt.y.toFixed(2)} ${yUnit})`}</title>
              </circle>
              {(pt.label || isHovered) && (
                <text
                  x={cx + 7}
                  y={cy - 5}
                  fontSize={10.5}
                  fontWeight={600}
                  fill={palette.textPrimary}
                >
                  {pt.label ?? pt.year}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
