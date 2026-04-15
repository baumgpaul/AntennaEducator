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
  xAxisConfig?: AxisConfig;
  yAxisLeftConfig?: AxisConfig;
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

function formatAxisLabel(cfg: AxisConfig | undefined): string {
  if (!cfg) return '';
  return cfg.unit ? `${cfg.label} [${cfg.unit}]` : cfg.label;
}

const DEFAULT_X_AXIS: AxisConfig = { label: 'X', unit: '', scale: 'linear' };
const DEFAULT_Y_AXIS: AxisConfig = { label: 'Y', unit: '', scale: 'linear' };

// ============================================================================
// Component
// ============================================================================

function UnifiedLinePlot({
  traces,
  traceData,
  xAxisConfig: xAxisConfigProp,
  yAxisLeftConfig: yAxisLeftConfigProp,
  yAxisRightConfig,
  title,
  height = 350,
}: UnifiedLinePlotProps) {
  const xAxisConfig = xAxisConfigProp ?? DEFAULT_X_AXIS;
  const yAxisLeftConfig = yAxisLeftConfigProp ?? DEFAULT_Y_AXIS;
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
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 200,
          p: 2,
          gap: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          No data available for this plot.
        </Typography>
        <Typography variant="caption" color="text.disabled">
          Run a simulation (Solve Single or Parameter Sweep) to populate this chart.
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
            tickFormatter={(v: number) => {
              // Auto-scale Hz → MHz/GHz for frequency axes
              const lbl = xAxisConfig.label.toLowerCase();
              const unit = xAxisConfig.unit?.toLowerCase();
              if (unit === 'hz' || lbl.includes('freq')) {
                if (Math.abs(v) >= 1e9) return `${(v / 1e9).toPrecision(3)}G`;
                if (Math.abs(v) >= 1e6) return `${(v / 1e6).toPrecision(3)}M`;
                if (Math.abs(v) >= 1e3) return `${(v / 1e3).toPrecision(3)}k`;
              }
              return String(Number(v.toPrecision(4)));
            }}
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
            cursor={{ stroke: '#666', strokeWidth: 1, strokeDasharray: '4 2' }}
            formatter={(value: number, name: string) => [
              typeof value === 'number' ? value.toFixed(4) : value,
              name,
            ]}
            labelFormatter={(label: number) => {
              const lbl = xAxisConfig.label.toLowerCase();
              const unit = xAxisConfig.unit?.toLowerCase();
              let displayVal: string;
              if (unit === 'hz' || lbl.includes('freq')) {
                const v = Number(label);
                if (Math.abs(v) >= 1e9) displayVal = `${(v / 1e9).toPrecision(4)} GHz`;
                else if (Math.abs(v) >= 1e6) displayVal = `${(v / 1e6).toPrecision(4)} MHz`;
                else if (Math.abs(v) >= 1e3) displayVal = `${(v / 1e3).toPrecision(4)} kHz`;
                else displayVal = `${v} Hz`;
              } else {
                displayVal = String(Number(Number(label).toPrecision(5)));
              }
              return `${xAxisConfig.label}: ${displayVal}`;
            }}
          />
          <Legend />
          {traces.map((trace) => {
            const nPts = traceData[trace.id]?.length ?? 0;
            // Show dots for sparse data so single points are visible
            const dotProps = nPts <= 1 ? { r: 5 } : nPts <= 5 ? { r: 2 } : false;
            return (
              <Line
                key={trace.id}
                yAxisId={trace.yAxisId}
                type="monotone"
                dataKey={trace.id}
                name={trace.label}
                stroke={trace.color}
                strokeDasharray={DASH_MAP[trace.lineStyle] || undefined}
                dot={dotProps}
                strokeWidth={2}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

export default UnifiedLinePlot;
