/**
 * SmithChart — SVG-based Smith chart for impedance visualization.
 *
 * Renders constant-resistance and constant-reactance circles, then plots
 * impedance data as markers in the Γ-plane.
 *
 * Convention: the chart is a unit circle centered at origin in Γ-space.
 * SVG coordinates: cx=center, cy=center, radius maps Γ to pixels.
 */
import React from 'react';
import { Box, Typography } from '@mui/material';

// ============================================================================
// Types
// ============================================================================

export interface SmithChartPoint {
  zReal: number;
  zImag: number;
  label?: string;
}

export interface SmithChartProps {
  data: SmithChartPoint[];
  z0?: number;
  size?: number;
  title?: string;
  /** Color of the data trace. */
  color?: string;
}

// ============================================================================
// Pure math: impedance → reflection coefficient
// ============================================================================

/**
 * Convert impedance (R + jX) to reflection coefficient Γ = Γr + jΓi.
 * Γ = (Z - Z₀) / (Z + Z₀)
 */
export function impedanceToGamma(
  r: number,
  x: number,
  z0: number,
): { x: number; y: number } {
  const numR = r - z0;
  const numI = x;
  const denR = r + z0;
  const denI = x;
  const denMag2 = denR * denR + denI * denI;
  if (denMag2 < 1e-30) return { x: -1, y: 0 }; // short circuit fallback
  return {
    x: (numR * denR + numI * denI) / denMag2,
    y: (numI * denR - numR * denI) / denMag2,
  };
}

// ============================================================================
// Grid circle computation
// ============================================================================

/** Constant-resistance circle: center = (r/(r+1), 0), radius = 1/(r+1) in normalized Γ-plane */
function resistanceCircle(rNorm: number): { cx: number; cy: number; r: number } {
  return {
    cx: rNorm / (rNorm + 1),
    cy: 0,
    r: 1 / (rNorm + 1),
  };
}

/** Constant-reactance arc: center = (1, 1/x), radius = 1/|x| in normalized Γ-plane */
function reactanceCircle(xNorm: number): { cx: number; cy: number; r: number } {
  return {
    cx: 1,
    cy: 1 / xNorm,
    r: Math.abs(1 / xNorm),
  };
}

// Standard grid values (normalized)
const R_VALUES = [0, 0.2, 0.5, 1, 2, 5];
const X_VALUES = [0.2, 0.5, 1, 2, 5];

// ============================================================================
// Component
// ============================================================================

export const SmithChart: React.FC<SmithChartProps> = ({
  data,
  z0 = 50,
  size = 400,
  title,
  color = '#1976d2',
}) => {
  const margin = 30;
  const chartRadius = (size - 2 * margin) / 2;
  const cx = size / 2;
  const cy = size / 2;

  /** Map Γ-plane coordinates to SVG pixel coordinates. */
  const toSvg = (gx: number, gy: number) => ({
    x: cx + gx * chartRadius,
    y: cy - gy * chartRadius, // SVG y is inverted
  });

  // ========================================================================
  // Grid circles (clipped to unit circle)
  // ========================================================================

  const gridElements: React.ReactNode[] = [];
  const gridColor = '#555';
  const gridOpacity = 0.3;

  // Constant-resistance circles
  for (const rn of R_VALUES) {
    const c = resistanceCircle(rn);
    const svgC = toSvg(c.cx, c.cy);
    gridElements.push(
      <circle
        key={`r-${rn}`}
        cx={svgC.x}
        cy={svgC.y}
        r={c.r * chartRadius}
        fill="none"
        stroke={gridColor}
        strokeWidth={0.5}
        opacity={gridOpacity}
      />,
    );
  }

  // Constant-reactance arcs (positive & negative)
  for (const xn of X_VALUES) {
    for (const sign of [1, -1]) {
      const c = reactanceCircle(sign * xn);
      const svgC = toSvg(c.cx, c.cy);
      gridElements.push(
        <circle
          key={`x-${sign * xn}`}
          cx={svgC.x}
          cy={svgC.y}
          r={c.r * chartRadius}
          fill="none"
          stroke={gridColor}
          strokeWidth={0.5}
          opacity={gridOpacity}
        />,
      );
    }
  }

  // ========================================================================
  // Data points
  // ========================================================================

  const dataElements: React.ReactNode[] = [];
  const linePoints: string[] = [];

  for (let i = 0; i < data.length; i++) {
    const pt = data[i];
    const gamma = impedanceToGamma(pt.zReal, pt.zImag, z0);
    const svg = toSvg(gamma.x, gamma.y);
    linePoints.push(`${svg.x},${svg.y}`);
    dataElements.push(
      <circle
        key={`pt-${i}`}
        data-testid="smith-point"
        cx={svg.x}
        cy={svg.y}
        r={4}
        fill={color}
        stroke="#fff"
        strokeWidth={1}
      >
        {pt.label && <title>{pt.label}: Z = {pt.zReal.toFixed(1)} + j{pt.zImag.toFixed(1)} Ω</title>}
      </circle>,
    );
  }

  // ========================================================================
  // Axis markers
  // ========================================================================

  const realAxisY = cy;
  const leftEdge = toSvg(-1, 0);
  const rightEdge = toSvg(1, 0);

  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      {title && (
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {title}
        </Typography>
      )}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Clip to unit circle */}
        <defs>
          <clipPath id="smith-clip">
            <circle cx={cx} cy={cy} r={chartRadius} />
          </clipPath>
        </defs>

        {/* Background */}
        <circle cx={cx} cy={cy} r={chartRadius} fill="#1a1a2e" stroke="#666" strokeWidth={1.5} />

        {/* Grid (clipped) */}
        <g clipPath="url(#smith-clip)">
          {gridElements}
          {/* Real axis */}
          <line
            x1={leftEdge.x}
            y1={realAxisY}
            x2={rightEdge.x}
            y2={realAxisY}
            stroke={gridColor}
            strokeWidth={0.8}
            opacity={0.5}
          />
        </g>

        {/* Data trace (polyline connecting points) */}
        {linePoints.length > 1 && (
          <polyline
            points={linePoints.join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            opacity={0.6}
            clipPath="url(#smith-clip)"
          />
        )}

        {/* Data markers */}
        {dataElements}

        {/* Center marker (Z = Z₀) */}
        <circle cx={cx} cy={cy} r={2} fill="#aaa" />
      </svg>
      <Typography variant="caption" color="text.secondary">
        Z₀ = {z0} Ω
      </Typography>
    </Box>
  );
};
