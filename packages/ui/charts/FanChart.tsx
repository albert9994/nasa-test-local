import React, { useState } from "react";
import { getChartPalette } from "./theme";
import { FanChartProps } from "./types";

export const FanChart: React.FC<FanChartProps> = ({
  title = "Monte Carlo Income Fan (2026–2050)",
  subtitle = "1,000 simulated futures (weather × prices × input costs): median p50 and p10–p90 band",
  years,
  p10,
  p50,
  p90,
  pBadYear = [],
  failNet = 0,
  marginYearP50 = null,
  yUnit = "$/ha",
  theme = "dark",
  height = 310,
}) => {
  const palette = getChartPalette(theme);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const n = Math.min(years.length, p10.length, p50.length, p90.length);
  const allVals = [...p10.slice(0, n), ...p90.slice(0, n), failNet];
  const minVal = allVals.length ? Math.min(...allVals) : -200;
  const maxVal = allVals.length ? Math.max(...allVals) : 800;
  const span = Math.max(maxVal - minVal, 50);
  const yMin = Math.floor((minVal - span * 0.1) / 20) * 20;
  const yMax = Math.ceil((maxVal + span * 0.1) / 20) * 20;

  const width = 720;
  const pad = { top: 28, right: 32, bottom: 42, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xAt = (i: number) => pad.left + (i / Math.max(n - 1, 1)) * plotW;
  const yAt = (v: number) => pad.top + (1 - (v - yMin) / Math.max(yMax - yMin, 1)) * plotH;

  // Build SVG polygon for p10..p90 shaded fan
  const upperPts: string[] = [];
  const lowerPts: string[] = [];
  const medianPts: string[] = [];

  for (let i = 0; i < n; i++) {
    const x = xAt(i).toFixed(1);
    upperPts.push(`${x},${yAt(p90[i]).toFixed(1)}`);
    lowerPts.unshift(`${x},${yAt(p10[i]).toFixed(1)}`);
    medianPts.push(`${i === 0 ? "M" : "L"} ${x} ${yAt(p50[i]).toFixed(1)}`);
  }

  const areaPolygon = [...upperPts, ...lowerPts].join(" ");
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * (yMax - yMin));
  const marginIdx = marginYearP50 ? years.indexOf(marginYearP50) : -1;

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
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: palette.textSecondary }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 8, background: "rgba(16, 185, 129, 0.25)", border: `1px solid ${palette.accentEmerald}`, borderRadius: 2 }} />
            p10–p90 band (80% of futures)
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 3, background: palette.accentEmerald, borderRadius: 2 }} />
            Median (p50)
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {/* Grid lines */}
        {yTicks.map((tick, idx) => (
          <g key={idx}>
            <line x1={pad.left} y1={yAt(tick)} x2={width - pad.right} y2={yAt(tick)} stroke={palette.grid} strokeDasharray="3 3" />
            <text x={pad.left - 8} y={yAt(tick) + 4} textAnchor="end" fontSize={11} fill={palette.textMuted}>
              {Math.round(tick)}
            </text>
          </g>
        ))}

        {/* Bad-year threshold line (`failNet`) */}
        <line
          x1={pad.left}
          y1={yAt(failNet)}
          x2={width - pad.right}
          y2={yAt(failNet)}
          stroke={palette.accentRed}
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        <text
          x={width - pad.right - 4}
          y={yAt(failNet) - 5}
          textAnchor="end"
          fontSize={10.5}
          fontWeight={600}
          fill={palette.accentRed}
        >
          Bad-year limit ({failNet} {yUnit})
        </text>

        {/* p10..p90 Fan polygon */}
        {n >= 2 && (
          <polygon
            points={areaPolygon}
            fill="rgba(16, 185, 129, 0.20)"
            stroke="rgba(16, 185, 129, 0.45)"
            strokeWidth={1}
          />
        )}

        {/* Median p50 path */}
        {n >= 2 && (
          <path
            d={medianPts.join(" ")}
            fill="none"
            stroke={palette.accentEmerald}
            strokeWidth={2.6}
          />
        )}

        {/* Margin year marker line */}
        {marginIdx >= 0 && (
          <g>
            <line
              x1={xAt(marginIdx)}
              y1={pad.top}
              x2={xAt(marginIdx)}
              y2={pad.top + plotH}
              stroke={palette.accentAmber}
              strokeWidth={2}
              strokeDasharray="4 3"
            />
            <text
              x={xAt(marginIdx)}
              y={pad.top - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill={palette.accentAmber}
            >
              Safe until ~{marginYearP50}
            </text>
          </g>
        )}

        {/* Interactive hover targets */}
        {years.slice(0, n).map((yr, i) => (
          <circle
            key={yr}
            cx={xAt(i)}
            cy={yAt(p50[i])}
            r={hoverIdx === i ? 5 : 3}
            fill={palette.accentEmerald}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <title>
              {`${yr}: p10=${p10[i]} ${yUnit}, p50=${p50[i]} ${yUnit}, p90=${p90[i]} ${yUnit}${
                pBadYear[i] !== undefined ? ` | P(bad year)=${Math.round(pBadYear[i] * 100)}%` : ""
              }`}
            </title>
          </circle>
        ))}

        {/* X axis labels */}
        {years.slice(0, n).map((yr, i) => {
          if (i !== 0 && i !== n - 1 && yr % 5 !== 0) return null;
          return (
            <text
              key={yr}
              x={xAt(i)}
              y={height - 14}
              textAnchor="middle"
              fontSize={11}
              fill={palette.textMuted}
            >
              {yr}
            </text>
          );
        })}
      </svg>

      {hoverIdx !== null && (
        <div
          style={{
            marginTop: 6,
            padding: "6px 10px",
            background: palette.surface,
            borderRadius: 8,
            fontSize: 12,
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <strong>Year {years[hoverIdx]}:</strong>
          <span>p10: <strong>{p10[hoverIdx]} {yUnit}</strong></span>
          <span style={{ color: palette.accentEmerald }}>Median (p50): <strong>{p50[hoverIdx]} {yUnit}</strong></span>
          <span>p90: <strong>{p90[hoverIdx]} {yUnit}</strong></span>
          {pBadYear[hoverIdx] !== undefined && (
            <span style={{ color: palette.accentAmber }}>
              P(bad year): <strong>{Math.round(pBadYear[hoverIdx] * 100)}%</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
