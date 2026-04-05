/**
 * UnifiedLinePlot — generic multi-trace Recharts line plot.
 *
 * Renders 1–N traces on a single chart with optional dual Y-axis.
 * Used by the Line view type in PostprocessingTab.
 */

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { PlotTrace, AxisConfig, LineStyle } from '@/types/plotDefinitions';
import type { DataPoint } from '@/types/plotDataExtractors';

// ============================================================================
// Props
// ============================================================================

export interface UnifiedLinePlotProps {
  traces: PlotTrace[];
  /** Pre-extracted data per trace id. */
  traceData: Record<string, DataPoint[]>;
  xAxisConfig: AxisConfig;
  yAxisLeftConfig: AxisConfig;
  yAxisRightConfig?: AxisConfig;
  title?: string;
  height?: number;
}

// ============================================================================
// Helpers
// ============================================================================

const DASH_MAP: Record<LineStyle, string> = {
  solid: '',
  dashed: '8 4',
  dotted: '2 4',
};

function formatAxisLabel(cfg: AxisConfig): string {
  return cfg.unit ? `${cfg.label} [${cfg.unit}]` : cfg.label;
}

// ============================================================================
// Component
// ============================================================================

function UnifiedLinePlot({
  traces,
  traceData,
  xAxisConfig,
  yAxisLeftConfig,
  yAxisRightConfig,
  title,
  height = 350,
}: UnifiedLinePlotProps) {
  // Check for any data
  const hasData = traces.some((t) => (traceData[t.id]?.length ?? 0) > 0);

  // Merge all traces onto a shared x-axis (keyed by x value)
  const chartData = useMemo(() => {
    if (!hasData) return [];

    const xMap = new Map<number, Record<string, number>>();
    for (const trace of traces) {
      const pts = traceData[trace.id];
      if (!pts) continue;
      for (const pt of pts) {
        let row = xMap.get(pt.x);
        if (!row) {
          row = { x: pt.x };
          xMap.set(pt.x, row);
        }
        row[trace.id] = pt.y;
      }
    }
    return Array.from(xMap.values()).sort((a, b) => a.x - b.x);
  }, [traces, traceData, hasData]);

  if (!hasData) {
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

  const hasRightAxis = yAxisRightConfig && traces.some((t) => t.yAxisId === 'right');

  return (
    <Box sx={{ width: '100%', height: '100%', minHeight: height, p: 1 }}>
      {title && (
        <Typography variant="subtitle2" align="center" gutterBottom>
          {title}
        </Typography>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: hasRightAxis ? 60 : 20, bottom: 30, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            dataKey="x"
            type="number"
            domain={['auto', 'auto']}
            label={{ value: formatAxisLabel(xAxisConfig), position: 'insideBottom', offset: -20 }}
            tick={{ fontSize: 11 }}
            scale={xAxisConfig.scale === 'log' ? 'log' : 'auto'}
          />
          <YAxis
            yAxisId="left"
            label={{ value: formatAxisLabel(yAxisLeftConfig), angle: -90, position: 'insideLeft', offset: -45 }}
            tick={{ fontSize: 11 }}
            scale={yAxisLeftConfig.scale === 'log' ? 'log' : 'auto'}
          />
          {hasRightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              label={{ value: formatAxisLabel(yAxisRightConfig!), angle: 90, position: 'insideRight', offset: -45 }}
              tick={{ fontSize: 11 }}
              scale={yAxisRightConfig!.scale === 'log' ? 'log' : 'auto'}
            />
          )}
          <Tooltip
            formatter={(value: number, name: string) => [
              typeof value === 'number' ? value.toFixed(4) : value,
              name,
            ]}
            labelFormatter={(label: number) => `${xAxisConfig.label}: ${label}`}
          />
          <Legend />
          {traces.map((trace) => (
            <Line
              key={trace.id}
              yAxisId={trace.yAxisId}
              type="monotone"
              dataKey={trace.id}
              name={trace.label}
              stroke={trace.color}
              strokeDasharray={DASH_MAP[trace.lineStyle] || undefined}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

export default UnifiedLinePlot;
