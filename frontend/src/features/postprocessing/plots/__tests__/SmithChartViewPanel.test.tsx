import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SmithChartViewPanel } from '../SmithChartViewPanel';
import type { FrequencySweepResult } from '@/types/api';

// Mock SmithChart to avoid SVG rendering in jsdom
vi.mock('../SmithChart', () => ({
  SmithChart: (props: any) => (
    <div data-testid="smith-chart-mock">
      <span data-testid="smith-points">{JSON.stringify(props.data)}</span>
      <span data-testid="smith-z0">{props.z0}</span>
      <span data-testid="smith-title">{props.title}</span>
    </div>
  ),
}));

function makeSweep(n: number): FrequencySweepResult {
  const frequencies: number[] = [];
  const results: any[] = [];
  for (let i = 0; i < n; i++) {
    const f = 100e6 + i * 50e6;
    frequencies.push(f);
    results.push({
      frequency: f,
      antenna_solutions: [
        {
          input_impedance: { real: 50 + i * 10, imag: -20 + i * 5 },
          antenna_id: 'ant0',
        },
      ],
    });
  }
  return { frequencies, results, currentDistributions: [] };
}

describe('SmithChartViewPanel', () => {
  it('passes impedance data points to SmithChart', () => {
    const sweep = makeSweep(2);
    render(
      <SmithChartViewPanel
        dataSource="frequency-sweep"
        frequencySweep={sweep}
        parameterStudy={null}
      />,
    );
    const points = JSON.parse(
      screen.getByTestId('smith-points').textContent!,
    );
    expect(points).toHaveLength(2);
    expect(points[0].zReal).toBe(50);
    expect(points[0].zImag).toBe(-20);
  });

  it('labels frequency sweep points in MHz', () => {
    const sweep = makeSweep(1);
    render(
      <SmithChartViewPanel
        dataSource="frequency-sweep"
        frequencySweep={sweep}
        parameterStudy={null}
      />,
    );
    const points = JSON.parse(
      screen.getByTestId('smith-points').textContent!,
    );
    expect(points[0].label).toContain('100');
  });

  it('passes custom z0 to SmithChart', () => {
    const sweep = makeSweep(1);
    render(
      <SmithChartViewPanel
        dataSource="frequency-sweep"
        frequencySweep={sweep}
        parameterStudy={null}
        z0={75}
      />,
    );
    expect(screen.getByTestId('smith-z0').textContent).toBe('75');
  });

  it('passes title to SmithChart', () => {
    const sweep = makeSweep(1);
    render(
      <SmithChartViewPanel
        dataSource="frequency-sweep"
        frequencySweep={sweep}
        parameterStudy={null}
        title="Input Impedance"
      />,
    );
    expect(screen.getByTestId('smith-title').textContent).toBe(
      'Input Impedance',
    );
  });

  it('renders empty state when no data', () => {
    render(
      <SmithChartViewPanel
        dataSource="frequency-sweep"
        frequencySweep={null}
        parameterStudy={null}
      />,
    );
    expect(screen.getByText(/no data/i)).toBeTruthy();
  });

  it('uses parameter study data when source is parameter-study', () => {
    const paramStudy = {
      config: {
        sweepVariables: [
          {
            variableName: 'length',
            startValue: 0.1,
            endValue: 0.3,
            numPoints: 2,
          },
        ],
      },
      gridPoints: [
        { index: 0, values: { length: 0.1 } },
        { index: 1, values: { length: 0.3 } },
      ],
      results: [
        {
          point: { index: 0, values: { length: 0.1 } },
          solverResponse: {
            antenna_solutions: [
              { input_impedance: { real: 73, imag: 42.5 } },
            ],
          },
          postprocessorResponse: null,
        },
        {
          point: { index: 1, values: { length: 0.3 } },
          solverResponse: {
            antenna_solutions: [
              { input_impedance: { real: 100, imag: -30 } },
            ],
          },
          postprocessorResponse: null,
        },
      ],
      totalTimeMs: 1234,
    };
    render(
      <SmithChartViewPanel
        dataSource="parameter-study"
        frequencySweep={null}
        parameterStudy={paramStudy as any}
      />,
    );
    const points = JSON.parse(
      screen.getByTestId('smith-points').textContent!,
    );
    expect(points).toHaveLength(2);
    expect(points[0].zReal).toBe(73);
    expect(points[0].zImag).toBe(42.5);
  });
});
