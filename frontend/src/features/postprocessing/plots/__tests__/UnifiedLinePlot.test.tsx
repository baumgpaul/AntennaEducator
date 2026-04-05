/**
 * Unit tests for UnifiedLinePlot component.
 *
 * Tests the generic multi-trace line plot that replaces separate
 * ImpedancePlot/VoltagePlot/CurrentPlot components.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import UnifiedLinePlot from '../UnifiedLinePlot';
import type { PlotTrace, AxisConfig } from '@/types/plotDefinitions';
import type { DataPoint } from '@/types/plotDataExtractors';

// Mock Recharts to avoid canvas rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children, data }: any) => (
    <div data-testid="line-chart" data-points={data?.length ?? 0}>{children}</div>
  ),
  Line: ({ dataKey, name, stroke }: any) => (
    <div data-testid={`line-${dataKey}`} data-name={name} data-stroke={stroke} />
  ),
  XAxis: ({ label }: any) => <div data-testid="x-axis" data-label={label?.value} />,
  YAxis: ({ yAxisId, label }: any) => (
    <div data-testid={`y-axis-${yAxisId ?? 'left'}`} data-label={label?.value} />
  ),
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

const makeTrace = (
  id: string,
  label: string,
  color: string,
  yAxisId: 'left' | 'right' = 'left',
): PlotTrace => ({
  id,
  quantity: { source: 'port', quantity: 'impedance_real' },
  label,
  color,
  lineStyle: 'solid',
  yAxisId,
});

const xAxis: AxisConfig = { label: 'Frequency', unit: 'MHz', scale: 'linear' };
const yAxisLeft: AxisConfig = { label: 'Impedance', unit: 'Ω', scale: 'linear' };
const yAxisRight: AxisConfig = { label: 'Phase', unit: '°', scale: 'linear' };

describe('UnifiedLinePlot', () => {
  it('renders empty state when no data', () => {
    render(
      <UnifiedLinePlot
        traces={[makeTrace('t1', 'Re(Z)', '#1976d2')]}
        traceData={{}}
        xAxisConfig={xAxis}
        yAxisLeftConfig={yAxisLeft}
      />,
    );
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it('renders chart with single trace', () => {
    const data: DataPoint[] = [
      { x: 100, y: 73 },
      { x: 200, y: 50 },
      { x: 300, y: 30 },
    ];
    render(
      <UnifiedLinePlot
        traces={[makeTrace('t1', 'Re(Z)', '#1976d2')]}
        traceData={{ t1: data }}
        xAxisConfig={xAxis}
        yAxisLeftConfig={yAxisLeft}
      />,
    );
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('line-t1')).toBeInTheDocument();
    expect(screen.getByTestId('line-t1')).toHaveAttribute('data-name', 'Re(Z)');
    expect(screen.getByTestId('line-t1')).toHaveAttribute('data-stroke', '#1976d2');
  });

  it('renders multiple traces', () => {
    const t1 = makeTrace('t1', 'Re(Z)', '#1976d2');
    const t2 = makeTrace('t2', 'Im(Z)', '#d32f2f');
    const data: Record<string, DataPoint[]> = {
      t1: [{ x: 100, y: 73 }, { x: 200, y: 50 }],
      t2: [{ x: 100, y: 42 }, { x: 200, y: 0 }],
    };
    render(
      <UnifiedLinePlot
        traces={[t1, t2]}
        traceData={data}
        xAxisConfig={xAxis}
        yAxisLeftConfig={yAxisLeft}
      />,
    );
    expect(screen.getByTestId('line-t1')).toBeInTheDocument();
    expect(screen.getByTestId('line-t2')).toBeInTheDocument();
  });

  it('renders dual Y-axis when right trace present', () => {
    const t1 = makeTrace('t1', 'Re(Z)', '#1976d2', 'left');
    const t2 = makeTrace('t2', 'Phase', '#d32f2f', 'right');
    const data: Record<string, DataPoint[]> = {
      t1: [{ x: 100, y: 73 }],
      t2: [{ x: 100, y: 29.9 }],
    };
    render(
      <UnifiedLinePlot
        traces={[t1, t2]}
        traceData={data}
        xAxisConfig={xAxis}
        yAxisLeftConfig={yAxisLeft}
        yAxisRightConfig={yAxisRight}
      />,
    );
    expect(screen.getByTestId('y-axis-left')).toBeInTheDocument();
    expect(screen.getByTestId('y-axis-right')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(
      <UnifiedLinePlot
        traces={[makeTrace('t1', 'Re(Z)', '#1976d2')]}
        traceData={{ t1: [{ x: 100, y: 73 }] }}
        xAxisConfig={xAxis}
        yAxisLeftConfig={yAxisLeft}
        title="Input Impedance"
      />,
    );
    expect(screen.getByText('Input Impedance')).toBeInTheDocument();
  });

  it('handles trace with no matching data gracefully', () => {
    render(
      <UnifiedLinePlot
        traces={[makeTrace('t1', 'Re(Z)', '#1976d2')]}
        traceData={{ other: [{ x: 100, y: 73 }] }}
        xAxisConfig={xAxis}
        yAxisLeftConfig={yAxisLeft}
      />,
    );
    // Should show empty state since t1 has no data
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});
