/**
 * ParameterStudyPlot — Recharts line-chart for 1D parameter study results.
 *
 * Shows impedance (Re/Im), VSWR, and return loss vs the swept variable.
 * For 2D sweeps, renders multiple series (one per value of the 2nd variable).
 */
import { useMemo, useState } from 'react';
import { Box, Typography, Tabs, Tab } from '@mui/material';
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
import type { ParameterStudyResult } from '@/types/parameterStudy';
import { extractPortQuantities, type PortQuantityRow } from '@/types/parameterStudyExtract';
import { SmithChart, type SmithChartPoint } from './SmithChart';

// ============================================================================
// Helpers
// ============================================================================

/** Format a number for axis labels (compact engineering). */
function fmtAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toPrecision(3)}G`;
  if (abs >= 1e6) return `${(v / 1e6).toPrecision(3)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toPrecision(3)}k`;
  if (abs > 0 && abs < 1e-3) return v.toExponential(2);
  return v.toPrecision(4);
}

/** Distinct colors for multi-series. */
const COLORS = [
  '#1976d2',
  '#d32f2f',
  '#388e3c',
  '#f57c00',
  '#7b1fa2',
  '#0097a7',
  '#c2185b',
  '#455a64',
];

// ============================================================================
// Tab definitions
// ============================================================================

type QuantityTab = 'impedance' | 'vswr' | 'returnLoss' | 'smith';

const TAB_LABELS: Record<QuantityTab, string> = {
  impedance: 'Impedance',
  vswr: 'VSWR',
  returnLoss: 'Return Loss',
  smith: 'Smith Chart',
};

// ============================================================================
// Props
// ============================================================================

export interface ParameterStudyPlotProps {
  study: ParameterStudyResult;
}

// ============================================================================
// Component
// ============================================================================

export function ParameterStudyPlot({ study }: ParameterStudyPlotProps) {
  const [activeTab, setActiveTab] = useState<QuantityTab>('impedance');

  const rows = useMemo(() => extractPortQuantities(study), [study]);
  const sweepVars = study.config.sweepVariables;
  const primaryVar = sweepVars[0]?.variableName ?? 'x';
  const secondaryVar = sweepVars.length > 1 ? sweepVars[1]?.variableName : null;

  // ========================================================================
  // Empty state
  // ========================================================================

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">No results available</Typography>
      </Box>
    );
  }

  // ========================================================================
  // 1D: simple array → chart data
  // 2D: group by secondary variable → one series per secondary value
  // ========================================================================

  const is2D = secondaryVar !== null;

  // Build chart data keyed by primary variable (only for line chart tabs)
  const chartData = activeTab !== 'smith'
    ? buildChartData(rows, primaryVar, secondaryVar, activeTab)
    : [];

  // Title: describe the sweep
  const varDesc = is2D ? `${primaryVar} × ${secondaryVar}` : primaryVar;
  const title = `Parameter Study — ${varDesc}`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 1 }}>
        <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">
          {rows.length} points &middot; {(study.totalTimeMs / 1000).toFixed(1)}s
        </Typography>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v as QuantityTab)}
        sx={{ px: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0 } }}
      >
        <Tab label="Impedance" value="impedance" />
        <Tab label="VSWR" value="vswr" />
        <Tab label="Return Loss" value="returnLoss" />
        <Tab label="Smith Chart" value="smith" />
      </Tabs>

      {/* Chart */}
      <Box sx={{ flex: 1, minHeight: 250, px: 1, pb: 1 }}>
        {activeTab === 'smith' ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <SmithChart
              data={rows.map((r) => ({
                zReal: r.zReal,
                zImag: r.zImag,
                label: Object.entries(r.sweepValues)
                  .map(([k, v]) => `${k}=${fmtAxis(v)}`)
                  .join(', '),
              }))}
              z0={study.config.referenceImpedance}
              size={Math.min(400, 350)}
              title={`Smith Chart — Z₀ = ${study.config.referenceImpedance} Ω`}
            />
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {renderChart(chartData, primaryVar, activeTab, is2D)}
          </ResponsiveContainer>
        )}
      </Box>
    </Box>
  );
}

// ============================================================================
// Data shaping
// ============================================================================

interface ChartRow {
  primaryValue: number;
  [seriesKey: string]: number;
}

function buildChartData(
  rows: PortQuantityRow[],
  primaryVar: string,
  secondaryVar: string | null,
  tab: QuantityTab,
): ChartRow[] {
  if (!secondaryVar) {
    // 1D: one series per quantity
    return rows.map((r) => ({
      primaryValue: r.sweepValues[primaryVar],
      ...quantityFields(r, tab, ''),
    }));
  }

  // 2D: group by primary, spread secondary
  const map = new Map<number, ChartRow>();
  for (const r of rows) {
    const pv = r.sweepValues[primaryVar];
    const sv = r.sweepValues[secondaryVar];
    const key = fmtAxis(sv);
    if (!map.has(pv)) {
      map.set(pv, { primaryValue: pv });
    }
    const row = map.get(pv)!;
    const fields = quantityFields(r, tab, key);
    Object.assign(row, fields);
  }
  return Array.from(map.values()).sort((a, b) => a.primaryValue - b.primaryValue);
}

function quantityFields(r: PortQuantityRow, tab: QuantityTab, suffix: string): Record<string, number> {
  const s = suffix ? `_${suffix}` : '';
  switch (tab) {
    case 'impedance':
      return { [`Re(Z)${s}`]: r.zReal, [`Im(Z)${s}`]: r.zImag };
    case 'vswr':
      return { [`VSWR${s}`]: r.vswr };
    case 'returnLoss':
      return { [`RL${s}`]: r.returnLoss };
  }
}

// ============================================================================
// Chart rendering
// ============================================================================

function renderChart(
  data: ChartRow[],
  primaryVar: string,
  tab: QuantityTab,
  is2D: boolean,
): React.ReactElement {
  // Determine line data keys from the first data row
  const sample = data[0] ?? {};
  const lineKeys = Object.keys(sample).filter((k) => k !== 'primaryValue');

  return (
    <LineChart data={data} margin={{ top: 8, right: 30, left: 20, bottom: 25 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        dataKey="primaryValue"
        tickFormatter={fmtAxis}
        label={{ value: primaryVar, position: 'insideBottom', offset: -10 }}
      />
      <YAxis
        label={{
          value: yAxisLabel(tab),
          angle: -90,
          position: 'insideLeft',
        }}
      />
      <Tooltip
        formatter={(value: number) => value.toFixed(3)}
        labelFormatter={(v: number) => `${primaryVar} = ${fmtAxis(v)}`}
      />
      <Legend />
      {lineKeys.map((key, i) => (
        <Line
          key={key}
          type="monotone"
          dataKey={key}
          stroke={COLORS[i % COLORS.length]}
          strokeWidth={is2D ? 1.5 : 2}
          dot={data.length < 30}
          name={key}
        />
      ))}
    </LineChart>
  );
}

function yAxisLabel(tab: QuantityTab): string {
  switch (tab) {
    case 'impedance':
      return 'Impedance (Ω)';
    case 'vswr':
      return 'VSWR';
    case 'returnLoss':
      return 'Return Loss (dB)';
  }
}
