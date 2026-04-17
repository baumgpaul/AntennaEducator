/**
 * UnifiedLinePlot — generic multi-trace Recharts line plot.
 *
 * Renders 1–N traces on a single chart with optional dual Y-axis.
 * Supports drag-to-zoom (X axis) and grid toggle.
 * Used by the Line view type in PostprocessingTab.
 */

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import GridOnIcon from '@mui/icons-material/GridOn';
import GridOffIcon from '@mui/icons-material/GridOff';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
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

  // ── Zoom state ─────────────────────────────────────────────────────────────
  const [xDomain, setXDomain] = useState<[number | 'auto', number | 'auto']>(['auto', 'auto']);
  const [isZoomed, setIsZoomed] = useState(false);
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const isDragging = useRef(false);

  // ── Grid state ─────────────────────────────────────────────────────────────
  const [showGrid, setShowGrid] = useState(true);

  // ── Refs for wheel zoom ────────────────────────────────────────────────────
  const lastMouseX = useRef<number | null>(null);
  const chartBoxRef = useRef<HTMLDivElement>(null);

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

  // ── Zoom event handlers ────────────────────────────────────────────────────
  const handleMouseDown = (e: any) => {
    if (e?.activeLabel !== undefined && e?.activeLabel !== null) {
      isDragging.current = true;
      setRefAreaLeft(Number(e.activeLabel));
      setRefAreaRight(null);
    }
  };

  const handleMouseMove = (e: any) => {
    if (e?.activeLabel !== undefined && e?.activeLabel !== null) {
      lastMouseX.current = Number(e.activeLabel);
    }
    if (isDragging.current && e?.activeLabel !== undefined && e?.activeLabel !== null) {
      setRefAreaRight(Number(e.activeLabel));
    }
  };

  const handleMouseUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (refAreaLeft !== null && refAreaRight !== null) {
      const left = refAreaLeft;
      const right = refAreaRight;
      if (Math.abs(left - right) > 0) {
        setXDomain([Math.min(left, right), Math.max(left, right)]);
        setIsZoomed(true);
      }
    }
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const handleZoomReset = () => {
    setXDomain(['auto', 'auto']);
    setIsZoomed(false);
    setRefAreaLeft(null);
    setRefAreaRight(null);
    isDragging.current = false;
  };

  // ── Mouse-wheel zoom (non-passive so preventDefault works) ──────────────
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (chartData.length < 2) return;

      const dataXMin = chartData[0].x;
      const dataXMax = chartData[chartData.length - 1].x;
      const fullRange = dataXMax - dataXMin;
      if (fullRange <= 0) return;

      const curMin = xDomain[0] === 'auto' ? dataXMin : (xDomain[0] as number);
      const curMax = xDomain[1] === 'auto' ? dataXMax : (xDomain[1] as number);
      const range = curMax - curMin;

      const factor = e.deltaY > 0 ? 1.15 : 0.85;
      const newRange = range * factor;

      if (newRange >= fullRange) {
        setXDomain(['auto', 'auto']);
        setIsZoomed(false);
        return;
      }

      const center =
        lastMouseX.current != null
          ? Math.max(curMin, Math.min(curMax, lastMouseX.current))
          : (curMin + curMax) / 2;
      const ratio = range > 0 ? (center - curMin) / range : 0.5;
      let newMin = center - newRange * ratio;
      let newMax = center + newRange * (1 - ratio);

      if (newMin < dataXMin) { newMax += dataXMin - newMin; newMin = dataXMin; }
      if (newMax > dataXMax) { newMin -= newMax - dataXMax; newMax = dataXMax; }
      newMin = Math.max(newMin, dataXMin);
      newMax = Math.min(newMax, dataXMax);

      setXDomain([newMin, newMax]);
      setIsZoomed(true);
    },
    [chartData, xDomain],
  );

  useEffect(() => {
    const el = chartBoxRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

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
      {/* Title + toolbar row */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Box sx={{ flex: 1 }}>
          {title && (
            <Typography variant="subtitle2" align="center">
              {title}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
          <Tooltip title={showGrid ? 'Hide grid' : 'Show grid'}>
            <IconButton size="small" onClick={() => setShowGrid((v) => !v)}>
              {showGrid ? <GridOnIcon fontSize="small" /> : <GridOffIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset zoom (double-click chart)">
            <span>
              <IconButton size="small" onClick={handleZoomReset} disabled={!isZoomed}>
                <ZoomOutMapIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      <Box
        ref={chartBoxRef}
        sx={{ cursor: refAreaLeft !== null ? 'crosshair' : 'default', userSelect: 'none' }}
        onMouseLeave={handleMouseUp}
      >
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: hasRightAxis ? 70 : 20, bottom: 30, left: 60 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleZoomReset}
          >
            {showGrid && (
              <CartesianGrid
                stroke="#999"
                strokeWidth={1}
                horizontal={true}
                vertical={true}
              />
            )}
            <XAxis
              dataKey="x"
              type="number"
              domain={xDomain}
              allowDataOverflow
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
              tickCount={8}
              scale={yAxisLeftConfig.scale === 'log' ? 'log' : 'auto'}
            />
            {hasRightAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                label={{ value: formatAxisLabel(yAxisRightConfig!), angle: 90, position: 'insideRight', offset: -45 }}
                tick={{ fontSize: 11 }}
                tickCount={8}
                scale={yAxisRightConfig!.scale === 'log' ? 'log' : 'auto'}
              />
            )}
            <RechartsTooltip
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
            <Legend
              verticalAlign="top"
              height={36}
              iconType="plainline"
              wrapperStyle={{ paddingBottom: 4, fontSize: 11 }}
            />
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
                  isAnimationActive={false}
                />
              );
            })}
            {/* Selection rectangle while dragging to zoom */}
            {refAreaLeft !== null && refAreaRight !== null && (
              <ReferenceArea
                yAxisId="left"
                x1={refAreaLeft}
                x2={refAreaRight}
                strokeOpacity={0.3}
                fill="#90caf9"
                fillOpacity={0.3}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Box>

      {isZoomed && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
          Zoomed — double-click chart or click <ZoomOutMapIcon sx={{ fontSize: 12, verticalAlign: 'middle' }} /> to reset
        </Typography>
      )}
    </Box>
  );
}

export default UnifiedLinePlot;
