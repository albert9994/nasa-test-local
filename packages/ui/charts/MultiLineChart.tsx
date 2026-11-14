import React, { useState } from "react";
import { getChartPalette } from "./theme";
import { MultiLineChartProps } from "./types";

export const MultiLineChart: React.FC<MultiLineChartProps> = ({
  title,
  subtitle,
  yAxisLabel = "Net income",
  yUnit = "$/ha",
  series,
  threshold,
  highlightedYear,
  theme = "dark",
  height = 300,
  onSelectYear,
}) => {
  const palette = getChartPalette(theme);
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  const allPoints = series.flatMap((s) => s.data);
  const years = Array.from(new Set(allPoints.map((d) => d.year))).sort((a, b) => a - b);

  const rawValues = allPoints.map((d) => d.value);
  if (threshold) {
    rawValues.push(threshold.value);
  }
  const minVal = rawValues.length ? Math.min(...rawValues) : 0;
  const maxVal = rawValues.length ? Math.max(...rawValues) : 100;
  const span = Math.max(maxVal - minVal, 10);
  const yMin = Math.floor((minVal - span * 0.1) / 10) * 10;
  const yMax = Math.ceil((maxVal + span * 0.1) / 10) * 10;

  const width = 720;
  const pad = { top: 28, right: 28, bottom: 40, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xOfYear = (yr: number): number => {
    if (years.length <= 1) return pad.left + plotW / 2;
    const minY = years[0];
    const maxY = years[years.length - 1];
    return pad.left + ((yr - minY) / Math.max(maxY - minY, 1)) * plotW;
  };

  const yOfVal = (v: number): number => {
    return pad.top + (1 - (v - yMin) / Math.max(yMax - yMin, 1)) * plotH;
  };

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * (yMax - yMin));
  const activeYear = hoveredYear ?? highlightedYear?.year ?? null;

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
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div>
            {title && <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 12, color: palette.textMuted, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }}>
            {series.map((s, idx) => {
              const color = s.color ?? palette.seriesColors[idx % palette.seriesColors.length];
              return (
                <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: palette.textSecondary }}>
                  <span
                    style={{
                      width: 12,
                      height: 3,
                      background: color,
                      display: "inline-block",
                      borderRadius: 2,
                    }}
                  />
                  {s.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
      >
        {/* Horizontal grid lines & Y labels */}
        {yTicks.map((tick, i) => {
          const y = yOfVal(tick);
          return (
            <g key={i}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={palette.grid} strokeDasharray="3 3" />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill={palette.textMuted}
              >
                {Math.round(tick)}
              </text>
            </g>
          );
        })}

        {/* Y axis unit label */}
        <text
          x={pad.left - 46}
          y={pad.top + plotH / 2}
          transform={`rotate(-90, ${pad.left - 46}, ${pad.top + plotH / 2})`}
          textAnchor="middle"
          fontSize={11}
          fill={palette.textMuted}
        >
          {yAxisLabel} ({yUnit})
        </text>

        {/* Highlighted year vertical band */}
        {highlightedYear && (
          <g>
            <rect
              x={xOfYear(highlightedYear.year) - Math.max(plotW / Math.max(years.length, 10), 10) / 2}
              y={pad.top}
              width={Math.max(plotW / Math.max(years.length, 10), 10)}
              height={plotH}
              fill={palette.highlightBand}
              rx={4}
            />
            <line
              x1={xOfYear(highlightedYear.year)}
              y1={pad.top}
              x2={xOfYear(highlightedYear.year)}
              y2={pad.top + plotH}
              stroke={palette.accentAmber}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <text
              x={xOfYear(highlightedYear.year)}
              y={pad.top - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={palette.accentAmber}
            >
              {highlightedYear.label ?? `Worst drought (${highlightedYear.year})`}
            </text>
          </g>
        )}

        {/* Threshold line (e.g. bad-year cutoff) */}
        {threshold && (
          <g>
            <line
              x1={pad.left}
              y1={yOfVal(threshold.value)}
              x2={width - pad.right}
              y2={yOfVal(threshold.value)}
              stroke={threshold.color ?? palette.accentRed}
              strokeWidth={1.75}
              strokeDasharray="6 4"
            />
            <text
              x={width - pad.right - 4}
              y={yOfVal(threshold.value) - 6}
              textAnchor="end"
              fontSize={11}
              fontWeight={600}
              fill={threshold.color ?? palette.accentRed}
            >
              {threshold.label} ({threshold.value} {yUnit})
            </text>
          </g>
        )}

        {/* Series paths and points */}
        {series.map((s, sIdx) => {
          const color = s.color ?? palette.seriesColors[sIdx % palette.seriesColors.length];
          const sorted = [...s.data].sort((a, b) => a.year - b.year);
          const dPath = sorted
            .map((pt, i) => `${i === 0 ? "M" : "L"} ${xOfYear(pt.year).toFixed(1)} ${yOfVal(pt.value).toFixed(1)}`)
            .join(" ");

          return (
            <g key={s.id}>
              <path
                d={dPath}
                fill="none"
                stroke={color}
                strokeWidth={2.4}
                strokeDasharray={s.dashed ? "5 4" : undefined}
              />
              {sorted.map((pt) => {
                const cx = xOfYear(pt.year);
                const cy = yOfVal(pt.value);
                const isHighlighted = pt.year === highlightedYear?.year || pt.year === hoveredYear;
                const isBelowThreshold = threshold !== undefined && pt.value < threshold.value;
                return (
                  <circle
                    key={pt.year}
                    cx={cx}
                    cy={cy}
                    r={isHighlighted ? 5.5 : 3.2}
                    fill={isBelowThreshold ? palette.accentRed : color}
                    stroke={palette.bg}
                    strokeWidth={1.5}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredYear(pt.year)}
                    onMouseLeave={() => setHoveredYear(null)}
                    onClick={() => onSelectYear?.(pt.year)}
                  >
                    <title>{`${s.label} (${pt.year}): ${pt.value.toFixed(1)} ${yUnit}`}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}

        {/* X axis year ticks */}
        {years
          .filter((_, idx) => idx === 0 || idx === years.length - 1 || idx % Math.max(Math.floor(years.length / 6), 1) === 0)
          .map((yr) => (
            <text
              key={yr}
              x={xOfYear(yr)}
              y={height - 12}
              textAnchor="middle"
              fontSize={11}
              fill={palette.textMuted}
            >
              {yr}
            </text>
          ))}
      </svg>

      {activeYear !== null && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            background: palette.surface,
            borderRadius: 8,
            fontSize: 12,
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <strong style={{ color: palette.textPrimary }}>Year {activeYear}:</strong>
          {series.map((s, idx) => {
            const pt = s.data.find((d) => d.year === activeYear);
            if (!pt) return null;
            const color = s.color ?? palette.seriesColors[idx % palette.seriesColors.length];
            return (
              <span key={s.id} style={{ color }}>
                {s.label}: <strong>{pt.value.toFixed(1)} {yUnit}</strong>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
