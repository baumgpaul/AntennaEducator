import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PortQuantityTable } from '../PortQuantityTable';
import type { TableColumn } from '@/types/plotDefinitions';
import type { FrequencySweepResult } from '@/types/api';

const COLUMNS: TableColumn[] = [
  { key: 'frequency', label: 'Frequency', unit: 'MHz' },
  { key: 'zReal', label: 'Re(Z)', unit: 'Ω' },
  { key: 'zImag', label: 'Im(Z)', unit: 'Ω' },
  { key: 'zMag', label: '|Z|', unit: 'Ω' },
  { key: 'zPhase', label: '∠Z', unit: '°' },
  { key: 'gammaMag', label: '|Γ|', unit: '' },
  { key: 'returnLoss', label: 'Return Loss', unit: 'dB' },
  { key: 'vswr', label: 'VSWR', unit: '' },
];

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

describe('PortQuantityTable', () => {
  it('renders table header with all column labels', () => {
    const sweep = makeSweep(2);
    render(
      <PortQuantityTable
        columns={COLUMNS}
        frequencySweep={sweep}
        parameterStudy={null}
      />,
    );
    COLUMNS.forEach((col) => {
      const escaped = col.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(screen.getByText(new RegExp(escaped))).toBeTruthy();
    });
  });

  it('renders one row per frequency point', () => {
    const sweep = makeSweep(3);
    render(
      <PortQuantityTable
        columns={COLUMNS}
        frequencySweep={sweep}
        parameterStudy={null}
      />,
    );
    // 3 data rows + 1 header row = 4 rows total
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(4);
  });

  it('displays frequency in MHz', () => {
    const sweep = makeSweep(1);
    render(
      <PortQuantityTable
        columns={COLUMNS}
        frequencySweep={sweep}
        parameterStudy={null}
      />,
    );
    // 100 MHz — engineering notation strips trailing zeros
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('computes impedance values from solver data', () => {
    const sweep = makeSweep(1);
    // Z = 50 - 20j
    // Re(Z) = 50, Im(Z) = -20
    render(
      <PortQuantityTable
        columns={COLUMNS}
        frequencySweep={sweep}
        parameterStudy={null}
      />,
    );
    // Re(Z) — engineering notation
    expect(screen.getByText('50')).toBeTruthy();
    // Im(Z)
    expect(screen.getByText('-20')).toBeTruthy();
  });

  it('renders empty state when no data', () => {
    render(
      <PortQuantityTable
        columns={COLUMNS}
        frequencySweep={null}
        parameterStudy={null}
      />,
    );
    expect(screen.getByText(/no data/i)).toBeTruthy();
  });

  it('renders title when provided', () => {
    const sweep = makeSweep(1);
    render(
      <PortQuantityTable
        columns={COLUMNS}
        frequencySweep={sweep}
        parameterStudy={null}
        title="Port Quantities"
      />,
    );
    expect(screen.getByText('Port Quantities')).toBeTruthy();
  });

  it('uses parameter study data when available', () => {
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
      <PortQuantityTable
        columns={COLUMNS}
        frequencySweep={null}
        parameterStudy={paramStudy as any}
      />,
    );
    // 2 data rows + 1 header
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(3);
    // Re(Z) = 73 from first row — engineering notation
    expect(screen.getByText('73')).toBeTruthy();
  });
});
