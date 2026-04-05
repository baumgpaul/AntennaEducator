/**
 * SmithChart — SVG-based Smith chart for impedance visualization.
 *
 * Renders constant-resistance and constant-reactance circles, then plots
 * impedance data as markers in the Γ-plane.
 *
 * Features:
 *  - Hover tooltip showing Z, Γ, VSWR, and point label/frequency
 *  - Mouse-wheel zoom & drag-to-pan
 *  - Optional VSWR constant circles
 *  - Grid value labels along the boundary
 *
 * Convention: the chart is a unit circle centered at origin in Γ-space.
 * SVG coordinates: cx=center, cy=center, radius maps Γ to pixels.
 */
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
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
  /** VSWR values to draw as constant-VSWR circles (e.g. [1.5, 2, 3]) */
  vswrCircles?: number[];
  /** Show grid value labels (default true) */
  showGridLabels?: boolean;
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
  vswrCircles = [],
  showGridLabels = true,
}) => {
  const margin = 30;
  const chartRadius = (size - 2 * margin) / 2;
  const cxBase = size / 2;
  const cyBase = size / 2;

  // Zoom / pan state
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Hover state
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const cx = cxBase + panOffset.x;
  const cy = cyBase + panOffset.y;
  const effectiveRadius = chartRadius * zoom;

  /** Map Γ-plane coordinates to SVG pixel coordinates. */
  const toSvg = useCallback(
    (gx: number, gy: number) => ({
      x: cx + gx * effectiveRadius,
      y: cy - gy * effectiveRadius,
    }),
    [cx, cy, effectiveRadius],
  );

  // ========================================================================
  // Mouse handlers for zoom & pan
  // ========================================================================

  // Native wheel handler registered with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setZoom((z) => Math.max(0.5, Math.min(10, z * factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // left-click only
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, ox: panOffset.x, oy: panOffset.y };
    },
    [panOffset],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPanOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
    },
    [dragging],
  );

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

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
        r={c.r * effectiveRadius}
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
          r={c.r * effectiveRadius}
          fill="none"
          stroke={gridColor}
          strokeWidth={0.5}
          opacity={gridOpacity}
        />,
      );
    }
  }

  // ========================================================================
  // VSWR circles
  // ========================================================================

  const vswrElements: React.ReactNode[] = [];
  for (const vswr of vswrCircles) {
    if (vswr <= 1) continue;
    // VSWR → |Γ| = (VSWR - 1) / (VSWR + 1)
    const gammaRadius = (vswr - 1) / (vswr + 1);
    vswrElements.push(
      <circle
        key={`vswr-${vswr}`}
        cx={cx}
        cy={cy}
        r={gammaRadius * effectiveRadius}
        fill="none"
        stroke="#ffb74d"
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.7}
      />,
    );
    // Label
    if (showGridLabels) {
      const labelPos = toSvg(0, gammaRadius);
      vswrElements.push(
        <text
          key={`vswr-lbl-${vswr}`}
          x={labelPos.x + 4}
          y={labelPos.y - 2}
          fontSize={9}
          fill="#ffb74d"
          opacity={0.8}
        >
          VSWR={vswr}
        </text>,
      );
    }
  }

  // ========================================================================
  // Grid labels (boundary labels for R and X values)
  // ========================================================================

  const gridLabels: React.ReactNode[] = [];
  if (showGridLabels) {
    // R-value labels along real axis
    for (const rn of R_VALUES) {
      if (rn === 0) continue;
      const g = impedanceToGamma(rn * z0, 0, z0);
      const svgPos = toSvg(g.x, g.y);
      gridLabels.push(
        <text
          key={`rlbl-${rn}`}
          x={svgPos.x}
          y={svgPos.y + 12}
          textAnchor="middle"
          fontSize={8}
          fill="#888"
        >
          {rn}
        </text>,
      );
    }
    // X-value labels along unit circle boundary (positive side)
    for (const xn of X_VALUES) {
      const g = impedanceToGamma(0, xn * z0, z0);
      const mag = Math.sqrt(g.x * g.x + g.y * g.y);
      if (mag > 0.01) {
        const bx = g.x / mag;
        const by = g.y / mag;
        const svgPos = toSvg(bx, by);
        gridLabels.push(
          <text
            key={`xlbl-${xn}`}
            x={svgPos.x + 3}
            y={svgPos.y - 3}
            fontSize={8}
            fill="#888"
          >
            j{xn}
          </text>,
        );
      }
    }
  }

  // ========================================================================
  // Data points (with hover)
  // ========================================================================

  const dataElements: React.ReactNode[] = [];
  const linePoints: string[] = [];

  const gammaPoints = useMemo(
    () =>
      data.map((pt) => {
        const gamma = impedanceToGamma(pt.zReal, pt.zImag, z0);
        const mag = Math.sqrt(gamma.x * gamma.x + gamma.y * gamma.y);
        const vswr = mag < 0.9999 ? (1 + mag) / (1 - mag) : Infinity;
        return { gamma, mag, vswr };
      }),
    [data, z0],
  );

  for (let i = 0; i < data.length; i++) {
    const pt = data[i];
    const { gamma, mag, vswr } = gammaPoints[i];
    const svg = toSvg(gamma.x, gamma.y);
    linePoints.push(`${svg.x},${svg.y}`);
    const isHovered = hoveredIndex === i;
    dataElements.push(
      <circle
        key={`pt-${i}`}
        data-testid="smith-point"
        cx={svg.x}
        cy={svg.y}
        r={isHovered ? 7 : 4}
        fill={isHovered ? '#ff9800' : color}
        stroke="#fff"
        strokeWidth={isHovered ? 2 : 1}
        style={{ cursor: 'pointer', transition: 'r 0.1s, fill 0.1s' }}
        onMouseEnter={() => setHoveredIndex(i)}
        onMouseLeave={() => setHoveredIndex(null)}
      />,
    );
  }

  // ========================================================================
  // Tooltip
  // ========================================================================

  const tooltip = useMemo(() => {
    if (hoveredIndex === null || hoveredIndex >= data.length) return null;
    const pt = data[hoveredIndex];
    const { gamma, mag, vswr } = gammaPoints[hoveredIndex];
    const svg = toSvg(gamma.x, gamma.y);
    const xSign = pt.zImag >= 0 ? '+' : '−';
    const xAbs = Math.abs(pt.zImag);
    return (
      <g>
        {/* Tooltip background */}
        <rect
          x={svg.x + 10}
          y={svg.y - 60}
          width={155}
          height={pt.label ? 65 : 52}
          rx={4}
          fill="rgba(30,30,50,0.92)"
          stroke="#666"
          strokeWidth={0.5}
        />
        <text x={svg.x + 16} y={svg.y - 44} fontSize={10} fill="#fff" fontFamily="monospace">
          Z = {pt.zReal.toFixed(2)} {xSign} j{xAbs.toFixed(2)} Ω
        </text>
        <text x={svg.x + 16} y={svg.y - 31} fontSize={10} fill="#bbb" fontFamily="monospace">
          Γ = {gamma.x.toFixed(3)} {gamma.y >= 0 ? '+' : '−'} j{Math.abs(gamma.y).toFixed(3)}
        </text>
        <text x={svg.x + 16} y={svg.y - 18} fontSize={10} fill="#bbb" fontFamily="monospace">
          |Γ| = {mag.toFixed(4)}  VSWR = {vswr < 100 ? vswr.toFixed(2) : '∞'}
        </text>
        {pt.label && (
          <text x={svg.x + 16} y={svg.y - 5} fontSize={10} fill="#90caf9" fontFamily="monospace">
            {pt.label}
          </text>
        )}
      </g>
    );
  }, [hoveredIndex, data, gammaPoints, toSvg]);

  // ========================================================================
  // Axis markers
  // ========================================================================

  const leftEdge = toSvg(-1, 0);
  const rightEdge = toSvg(1, 0);
  const realAxisY = cy;

  // Unique clip-path id to avoid collisions when multiple charts render
  const clipId = useMemo(() => `smith-clip-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      {title && (
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {title}
        </Typography>
      )}
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
      >
        {/* Clip to unit circle */}
        <defs>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cy} r={effectiveRadius} />
          </clipPath>
        </defs>

        {/* Background */}
        <circle cx={cx} cy={cy} r={effectiveRadius} fill="#1a1a2e" stroke="#666" strokeWidth={1.5} />

        {/* Grid (clipped) */}
        <g clipPath={`url(#${clipId})`}>
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
          {/* VSWR circles */}
          {vswrElements}
        </g>

        {/* Grid labels */}
        {gridLabels}

        {/* Data trace (polyline connecting points) */}
        {linePoints.length > 1 && (
          <polyline
            points={linePoints.join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            opacity={0.6}
            clipPath={`url(#${clipId})`}
          />
        )}

        {/* Data markers */}
        {dataElements}

        {/* Center marker (Z = Z₀) */}
        <circle cx={cx} cy={cy} r={2} fill="#aaa" />

        {/* Hover tooltip (rendered last = on top) */}
        {tooltip}
      </svg>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.25 }}>
        <Typography variant="caption" color="text.secondary">
          Z₀ = {z0} Ω
        </Typography>
        {zoom !== 1 && (
          <Typography variant="caption" color="text.secondary">
            · {zoom.toFixed(1)}×
          </Typography>
        )}
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
          scroll to zoom · drag to pan · double-click to reset
        </Typography>
      </Box>
    </Box>
  );
};
