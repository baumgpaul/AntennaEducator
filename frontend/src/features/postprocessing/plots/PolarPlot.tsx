/**
 * PolarPlot — pure SVG polar chart for radiation pattern visualization.
 *
 * Renders concentric grid circles, radial lines, angle labels, and
 * a data path in polar coordinates. Supports dB and linear scales.
 */

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';

// ============================================================================
// Types
// ============================================================================

export interface PolarDataPoint {
  angleDeg: number;
  value: number;
}

export interface PolarDataSeries {
  data: PolarDataPoint[];
  color?: string;
  label?: string;
}

export interface PolarPlotProps {
  data?: PolarDataPoint[];
  datasets?: PolarDataSeries[];
  scale: 'dB' | 'linear';
  title?: string;
  size?: number;
  color?: string;
}

// ============================================================================
// Constants
// ============================================================================

const ANGLE_LABELS_DEG = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const DB_RANGE = 40; // dB below max to show
const DB_GRID_STEP = 10; // dB per concentric ring

// ============================================================================
// Helpers
// ============================================================================

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Map angle (deg) to SVG coordinates. 0° = up, clockwise. */
function polarToXY(
  angleDeg: number,
  radius: number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  // SVG: 0° points up (−y), clockwise
  const rad = degToRad(angleDeg - 90);
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

// ============================================================================
// Component
// ============================================================================

function PolarPlot({
  data,
  datasets,
  scale,
  title,
  size = 350,
  color = '#1976d2',
}: PolarPlotProps) {
  // Normalize: if single data prop given, convert to datasets
  const allSeries: PolarDataSeries[] = useMemo(() => {
    if (datasets && datasets.length > 0) return datasets;
    if (data && data.length > 0) return [{ data, color, label: undefined }];
    return [];
  }, [data, datasets, color]);

  if (allSeries.length === 0 || allSeries.every((s) => s.data.length === 0)) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 200,
          p: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          No data available for this plot.
        </Typography>
      </Box>
    );
  }

  const margin = 40;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - margin;

  // Compute grid and normalize data
  const { gridCircles, gridLabels, seriesPaths } = useMemo(() => {
    // Gather all values across all series for consistent scaling
    const allValues = allSeries.flatMap((s) => s.data.map((d) => d.value));
    let maxVal: number;
    let minVal: number;
    const circles: Array<{ r: number; label: string }> = [];

    if (scale === 'dB') {
      maxVal = Math.max(...allValues);
      minVal = maxVal - DB_RANGE;
      const numRings = Math.ceil(DB_RANGE / DB_GRID_STEP) + 1;
      for (let i = 0; i < numRings; i++) {
        const dbVal = maxVal - i * DB_GRID_STEP;
        const r = ((dbVal - minVal) / (maxVal - minVal)) * maxR;
        if (r >= 0) {
          circles.push({ r, label: `${dbVal.toFixed(0)}` });
        }
      }
    } else {
      maxVal = Math.max(...allValues, 1e-10);
      minVal = 0;
      const numRings = 4;
      for (let i = 0; i <= numRings; i++) {
        const val = (maxVal * i) / numRings;
        const r = (val / maxVal) * maxR;
        circles.push({ r, label: val.toFixed(2) });
      }
    }

    // Build SVG path for each series
    const paths = allSeries.map((series) => {
      const normalizedPoints = series.data.map((d) => {
        let norm: number;
        if (scale === 'dB') {
          const clamped = Math.max(d.value, minVal);
          norm = (clamped - minVal) / (maxVal - minVal);
        } else {
          norm = Math.max(d.value, 0) / maxVal;
        }
        return { angleDeg: d.angleDeg, r: norm * maxR };
      });

      let path = '';
      normalizedPoints.forEach((pt, i) => {
        const { x, y } = polarToXY(pt.angleDeg, pt.r, cx, cy);
        path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
      });
      if (normalizedPoints.length > 2) {
        path += ' Z';
      }
      return path;
    });

    return { gridCircles: circles, gridLabels: circles, seriesPaths: paths };
  }, [allSeries, scale, maxR, cx, cy]);

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', p: 1 }}>
      {title && (
        <Typography variant="subtitle2" align="center" gutterBottom>
          {title}
        </Typography>
      )}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Concentric grid circles */}
        {gridCircles.map((c, i) => (
          <circle
            key={i}
            className="polar-grid-circle"
            cx={cx}
            cy={cy}
            r={c.r}
            fill="none"
            stroke="#e0e0e0"
            strokeWidth={0.5}
          />
        ))}

        {/* Circle labels on right axis */}
        {gridLabels.map((c, i) => (
          <text
            key={`lbl-${i}`}
            x={cx + c.r + 2}
            y={cy - 2}
            fontSize={9}
            fill="#999"
          >
            {c.label}
          </text>
        ))}

        {/* Radial grid lines */}
        {ANGLE_LABELS_DEG.map((deg) => {
          const outer = polarToXY(deg, maxR, cx, cy);
          return (
            <line
              key={`rad-${deg}`}
              className="polar-grid-line"
              x1={cx}
              y1={cy}
              x2={outer.x}
              y2={outer.y}
              stroke="#e0e0e0"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Angle labels */}
        {ANGLE_LABELS_DEG.map((deg) => {
          const pos = polarToXY(deg, maxR + 16, cx, cy);
          return (
            <text
              key={`ang-${deg}`}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fill="#666"
            >
              {deg}°
            </text>
          );
        })}

        {/* Data paths — one per series */}
        {seriesPaths.map((pathD, i) => {
          const seriesColor = allSeries[i]?.color || color;
          const showFill = allSeries.length === 1;
          return (
            <path
              key={`series-${i}`}
              className="polar-data-path"
              d={pathD}
              fill={showFill ? `${seriesColor}20` : 'none'}
              stroke={seriesColor}
              strokeWidth={allSeries.length > 1 ? 1.5 : 2}
            />
          );
        })}
      </svg>

      {/* Legend for multiple series */}
      {allSeries.length > 1 && allSeries.some((s) => s.label) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5, justifyContent: 'center' }}>
          {allSeries.map((s, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 14, height: 3, bgcolor: s.color || color, borderRadius: 1 }} />
              <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
                {s.label}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default PolarPlot;
