/**
 * Tests for parameter study data extraction helpers.
 *
 * These pure functions transform ParameterStudyResult into chart-ready data
 * (impedance, S11, VSWR, return loss) for both 1D and 2D sweeps.
 */
import { describe, it, expect } from 'vitest';
import {
  extractPortQuantities,
} from '../parameterStudyExtract';
import type {
  ParameterStudyResult,
  ParameterPointResult,
  GridPoint,
  ParameterStudyConfig,
} from '../parameterStudy';

// ============================================================================
// Helpers
// ============================================================================

/** Make a mock MultiAntennaSolutionResponse with the given input impedance */
function mockSolverResponse(real: number, imag: number) {
  return {
    frequency: 300e6,
    converged: true,
    antenna_solutions: [
      {
        antenna_id: 'ant-1',
        branch_currents: [],
        voltage_source_currents: [],
        load_currents: [],
        node_voltages: [],
        appended_voltages: [],
        input_impedance: { real, imag },
      },
    ],
    n_total_nodes: 10,
    n_total_edges: 9,
    solve_time: 0.01,
  };
}

function make1DResult(
  varName: string,
  values: number[],
  impedances: { real: number; imag: number }[],
): ParameterStudyResult {
  const config: ParameterStudyConfig = {
    sweepVariables: [
      { variableName: varName, min: values[0], max: values[values.length - 1], numPoints: values.length, spacing: 'linear' },
    ],
  };
  const gridPoints: GridPoint[] = values.map((v, i) => ({
    values: { [varName]: v },
    indices: [i],
  }));
  const results: ParameterPointResult[] = impedances.map((z, i) => ({
    point: gridPoints[i],
    solverResponse: mockSolverResponse(z.real, z.imag),
    converged: true,
  }));
  return { config, gridPoints, results, totalTimeMs: 100 };
}

// ============================================================================
// Tests
// ============================================================================

describe('extractPortQuantities', () => {
  it('extracts impedance real and imaginary parts', () => {
    const study = make1DResult('freq', [100e6, 200e6, 300e6], [
      { real: 73, imag: 42 },
      { real: 50, imag: 0 },
      { real: 30, imag: -20 },
    ]);
    const rows = extractPortQuantities(study);
    expect(rows).toHaveLength(3);
    expect(rows[0].zReal).toBeCloseTo(73);
    expect(rows[0].zImag).toBeCloseTo(42);
    expect(rows[1].zReal).toBeCloseTo(50);
    expect(rows[1].zImag).toBeCloseTo(0);
  });

  it('computes VSWR from impedance and Z0', () => {
    const study = make1DResult('freq', [300e6], [{ real: 50, imag: 0 }], 50);
    const rows = extractPortQuantities(study);
    // Perfect match: Γ = 0, VSWR = 1
    expect(rows[0].vswr).toBeCloseTo(1.0, 4);
  });

  it('computes S11 magnitude in dB (return loss)', () => {
    const study = make1DResult('freq', [300e6], [{ real: 50, imag: 0 }], 50);
    const rows = extractPortQuantities(study);
    // Perfect match: S11 = -Inf dB → clamped
    expect(rows[0].returnLoss).toBeLessThan(-40);
  });

  it('handles mismatched impedance (purely resistive)', () => {
    // Z_in = 100+0j, Z0 = 50 → Γ = (100-50)/(100+50) = 1/3
    const study = make1DResult('freq', [300e6], [{ real: 100, imag: 0 }], 50);
    const rows = extractPortQuantities(study);
    const gamma = 1 / 3;
    expect(rows[0].gammaMag).toBeCloseTo(gamma, 4);
    expect(rows[0].vswr).toBeCloseTo((1 + gamma) / (1 - gamma), 4);
    expect(rows[0].returnLoss).toBeCloseTo(-20 * Math.log10(gamma), 1);
  });

  it('handles complex impedance', () => {
    // Z_in = 73 + 42.5j, Z0 = 50
    const study = make1DResult('freq', [300e6], [{ real: 73, imag: 42.5 }], 50);
    const rows = extractPortQuantities(study);
    // Γ = (73+42.5j - 50) / (73+42.5j + 50) = (23+42.5j) / (123+42.5j)
    const num = { real: 23, imag: 42.5 };
    const den = { real: 123, imag: 42.5 };
    const gammaMag = Math.sqrt(num.real ** 2 + num.imag ** 2) / Math.sqrt(den.real ** 2 + den.imag ** 2);
    expect(rows[0].gammaMag).toBeCloseTo(gammaMag, 4);
  });

  it('populates sweep variable values', () => {
    const study = make1DResult('freq', [100e6, 200e6], [
      { real: 50, imag: 0 },
      { real: 50, imag: 0 },
    ]);
    const rows = extractPortQuantities(study);
    expect(rows[0].sweepValues).toEqual({ freq: 100e6 });
    expect(rows[1].sweepValues).toEqual({ freq: 200e6 });
  });

  it('uses first antenna by default (antennaIndex=0)', () => {
    const study = make1DResult('freq', [300e6], [{ real: 73, imag: 42 }]);
    const rows = extractPortQuantities(study);
    expect(rows[0].zReal).toBeCloseTo(73);
  });

  it('handles null input_impedance gracefully', () => {
    const study = make1DResult('freq', [300e6], [{ real: 0, imag: 0 }]);
    // Override to null impedance
    (study.results[0].solverResponse as any).antenna_solutions[0].input_impedance = null;
    const rows = extractPortQuantities(study);
    expect(rows[0].zReal).toBe(0);
    expect(rows[0].zImag).toBe(0);
    expect(rows[0].vswr).toBe(Infinity);
  });

  it('clamps return loss for perfect match', () => {
    const study = make1DResult('freq', [300e6], [{ real: 50, imag: 0 }]);
    const rows = extractPortQuantities(study);
    // Should be clamped (not -Infinity)
    expect(Number.isFinite(rows[0].returnLoss)).toBe(true);
  });
});
