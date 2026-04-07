/**
 * Unit tests for plotDataExtractors — TDD: write tests first.
 *
 * Tests pure functions that transform Redux solver state into
 * chart-ready {x, y}[] arrays for the UnifiedLinePlot.
 */
import { describe, it, expect } from 'vitest';
import {
  extractPortTraceData,
  extractFieldTraceData,
  extractDistributionTraceData,
  extractFarfieldTraceData,
} from './plotDataExtractors';
import type { PlotTrace } from './plotDefinitions';
import type { FrequencySweepResult, MultiAntennaSolutionResponse } from './api';
import type { ParameterStudyResult, ParameterPointResult, GridPoint } from './parameterStudy';

// ============================================================================
// Helpers for building mock data
// ============================================================================

function makeTrace(quantity: PlotTrace['quantity'], id = 'trace1'): PlotTrace {
  return { id, quantity, label: 'Test', color: '#000', lineStyle: 'solid', yAxisId: 'left' };
}

function makeSolution(
  frequency: number,
  zReal: number,
  zImag: number,
): MultiAntennaSolutionResponse {
  return {
    frequency,
    converged: true,
    antenna_solutions: [
      {
        antenna_id: 'ant-1',
        branch_currents: [{ real: 1, imag: 0 }],
        voltage_source_currents: [{ real: 0.5, imag: -0.1 }],
        load_currents: [],
        node_voltages: [{ real: 10, imag: 5 }, { real: 8, imag: -2 }],
        appended_voltages: [],
        input_impedance: { real: zReal, imag: zImag },
      },
    ],
    n_total_nodes: 10,
    n_total_edges: 9,
    solve_time: 0.01,
  };
}

function makeFrequencySweep(
  freqs: number[],
  impedances: Array<[number, number]>,
): FrequencySweepResult {
  return {
    frequencies: freqs,
    results: freqs.map((f, i) => makeSolution(f, impedances[i][0], impedances[i][1])),
    completedCount: freqs.length,
    totalCount: freqs.length,
    isComplete: true,
    currentDistributions: freqs.map((f) => ({
      frequency: f,
      currents: [[0.5, 0.3, 0.2]],
    })),
  };
}

function makeParameterStudy(
  varName: string,
  values: number[],
  impedances: Array<[number, number]>,
  freq = 300e6,
): ParameterStudyResult {
  const gridPoints: GridPoint[] = values.map((v, i) => ({
    values: { [varName]: v },
    indices: [i],
  }));
  const results: ParameterPointResult[] = values.map((v, i) => ({
    point: gridPoints[i],
    solverResponse: makeSolution(freq, impedances[i][0], impedances[i][1]),
    converged: true,
    meshSnapshots: [],
  }));
  return {
    config: {
      sweepVariables: [{ variableName: varName, min: values[0], max: values[values.length - 1], numPoints: values.length, spacing: 'linear' as const }],
    },
    gridPoints,
    results,
    totalTimeMs: 100,
  };
}

// ============================================================================
// extractPortTraceData tests
// ============================================================================

describe('extractPortTraceData', () => {
  const sweep = makeFrequencySweep(
    [100e6, 200e6, 300e6],
    [[73, 42], [50, 0], [30, -20]],
  );

  it('extracts impedance_real from frequency sweep', () => {
    const trace = makeTrace({ source: 'port', quantity: 'impedance_real' });
    const data = extractPortTraceData(trace, sweep, null);
    expect(data).toHaveLength(3);
    expect(data[0]).toEqual({ x: 100e6, y: 73 });
    expect(data[1]).toEqual({ x: 200e6, y: 50 });
    expect(data[2]).toEqual({ x: 300e6, y: 30 });
  });

  it('extracts impedance_imag from frequency sweep', () => {
    const trace = makeTrace({ source: 'port', quantity: 'impedance_imag' });
    const data = extractPortTraceData(trace, sweep, null);
    expect(data[0]).toEqual({ x: 100e6, y: 42 });
    expect(data[2]).toEqual({ x: 300e6, y: -20 });
  });

  it('extracts impedance_magnitude from frequency sweep', () => {
    const trace = makeTrace({ source: 'port', quantity: 'impedance_magnitude' });
    const data = extractPortTraceData(trace, sweep, null);
    // |Z| = sqrt(73^2 + 42^2) ≈ 84.22
    expect(data[0].y).toBeCloseTo(Math.sqrt(73 ** 2 + 42 ** 2), 5);
    // |50 + 0j| = 50
    expect(data[1].y).toBeCloseTo(50, 5);
  });

  it('extracts impedance_phase from frequency sweep', () => {
    const trace = makeTrace({ source: 'port', quantity: 'impedance_phase' });
    const data = extractPortTraceData(trace, sweep, null);
    // phase(73 + 42j) in degrees
    expect(data[0].y).toBeCloseTo((Math.atan2(42, 73) * 180) / Math.PI, 5);
    // phase(50 + 0j) = 0
    expect(data[1].y).toBeCloseTo(0, 5);
  });

  it('extracts vswr from frequency sweep', () => {
    const trace = makeTrace({ source: 'port', quantity: 'vswr' });
    const data = extractPortTraceData(trace, sweep, null);
    // At 200 MHz: Z = 50+0j → Γ = 0 → VSWR = 1
    expect(data[1].y).toBeCloseTo(1, 5);
    // At 100 MHz: Z = 73+42j, Z0=50 → Γ ≠ 0 → VSWR > 1
    expect(data[0].y).toBeGreaterThan(1);
  });

  it('extracts return_loss from frequency sweep', () => {
    const trace = makeTrace({ source: 'port', quantity: 'return_loss' });
    const data = extractPortTraceData(trace, sweep, null);
    // At 200 MHz: perfect match → return loss very large (clamped)
    expect(data[1].y).toBeGreaterThanOrEqual(40);
    // At 100 MHz: imperfect match → positive dB
    expect(data[0].y).toBeGreaterThan(0);
    expect(data[0].y).toBeLessThan(40);
  });

  it('extracts reflection_coefficient_magnitude from frequency sweep', () => {
    const trace = makeTrace({ source: 'port', quantity: 'reflection_coefficient_magnitude' });
    const data = extractPortTraceData(trace, sweep, null);
    // At 200 MHz: Z=50+0j, Z0=50 → |Γ| = 0
    expect(data[1].y).toBeCloseTo(0, 5);
    // At 100 MHz: |Γ| > 0
    expect(data[0].y).toBeGreaterThan(0);
    expect(data[0].y).toBeLessThan(1);
  });

  it('returns empty array when no frequency sweep', () => {
    const trace = makeTrace({ source: 'port', quantity: 'impedance_real' });
    const data = extractPortTraceData(trace, null, null);
    expect(data).toEqual([]);
  });

  it('extracts from parameter study with swept variable as x-axis', () => {
    const study = makeParameterStudy(
      'length',
      [0.1, 0.2, 0.3],
      [[73, 42], [50, 0], [30, -20]],
    );
    const trace = makeTrace({ source: 'port', quantity: 'impedance_real' });
    const data = extractPortTraceData(trace, null, study);
    expect(data).toHaveLength(3);
    expect(data[0]).toEqual({ x: 0.1, y: 73 });
    expect(data[1]).toEqual({ x: 0.2, y: 50 });
    expect(data[2]).toEqual({ x: 0.3, y: 30 });
  });

  it('prefers parameter study over frequency sweep when both provided', () => {
    const study = makeParameterStudy('length', [0.1, 0.2], [[99, 0], [88, 0]]);
    const trace = makeTrace({ source: 'port', quantity: 'impedance_real' });
    const data = extractPortTraceData(trace, sweep, study);
    // Should use study (x = swept variable values), not sweep
    expect(data).toHaveLength(2);
    expect(data[0].x).toBe(0.1);
    expect(data[0].y).toBe(99);
  });
});

// ============================================================================
// extractFieldTraceData tests
// ============================================================================

describe('extractFieldTraceData', () => {
  const fieldData: Record<string, Record<number, any>> = {
    'field-1': {
      300000000: {
        points: [[0, 0, 0], [0, 0, 0.1], [0, 0, 0.2]],
        E_mag: [1.5, 2.0, 0.8],
        H_mag: [0.004, 0.005, 0.002],
        E_vectors: [
          { x: { real: 0, imag: 0 }, y: { real: 0, imag: 0 }, z: { real: 1.5, imag: 0 } },
          { x: { real: 0, imag: 0 }, y: { real: 0, imag: 0 }, z: { real: 2.0, imag: 0 } },
          { x: { real: 0, imag: 0 }, y: { real: 0, imag: 0 }, z: { real: 0.8, imag: 0 } },
        ],
        H_vectors: [
          { x: { real: 0.004, imag: 0 }, y: { real: 0, imag: 0 }, z: { real: 0, imag: 0 } },
          { x: { real: 0.005, imag: 0 }, y: { real: 0, imag: 0 }, z: { real: 0, imag: 0 } },
          { x: { real: 0.002, imag: 0 }, y: { real: 0, imag: 0 }, z: { real: 0, imag: 0 } },
        ],
      },
    },
  };

  it('extracts E_magnitude from field data', () => {
    const trace = makeTrace({ source: 'field', fieldId: 'field-1', quantity: 'E_magnitude' });
    const data = extractFieldTraceData(trace, fieldData, 300e6);
    expect(data).toHaveLength(3);
    // x = distance from first point (cumulative)
    expect(data[0].x).toBeCloseTo(0, 5);
    expect(data[0].y).toBe(1.5);
    expect(data[1].x).toBeCloseTo(0.1, 5);
    expect(data[1].y).toBe(2.0);
    expect(data[2].x).toBeCloseTo(0.2, 5);
    expect(data[2].y).toBe(0.8);
  });

  it('extracts H_magnitude from field data', () => {
    const trace = makeTrace({ source: 'field', fieldId: 'field-1', quantity: 'H_magnitude' });
    const data = extractFieldTraceData(trace, fieldData, 300e6);
    expect(data[0].y).toBe(0.004);
    expect(data[1].y).toBe(0.005);
  });

  it('extracts individual E-field component (Ez)', () => {
    const trace = makeTrace({ source: 'field', fieldId: 'field-1', quantity: 'Ez' });
    const data = extractFieldTraceData(trace, fieldData, 300e6);
    expect(data).toHaveLength(3);
    // Ez = magnitude of z component
    expect(data[0].y).toBeCloseTo(1.5, 5);
    expect(data[1].y).toBeCloseTo(2.0, 5);
  });

  it('returns empty array for missing field', () => {
    const trace = makeTrace({ source: 'field', fieldId: 'nonexistent', quantity: 'E_magnitude' });
    const data = extractFieldTraceData(trace, fieldData, 300e6);
    expect(data).toEqual([]);
  });

  it('returns empty array when fieldData is null', () => {
    const trace = makeTrace({ source: 'field', fieldId: 'field-1', quantity: 'E_magnitude' });
    const data = extractFieldTraceData(trace, null, 300e6);
    expect(data).toEqual([]);
  });

  it('returns empty array for missing frequency key', () => {
    const trace = makeTrace({ source: 'field', fieldId: 'field-1', quantity: 'E_magnitude' });
    const data = extractFieldTraceData(trace, fieldData, 999e6);
    expect(data).toEqual([]);
  });
});

// ============================================================================
// extractDistributionTraceData tests
// ============================================================================

describe('extractDistributionTraceData', () => {
  const sweep = makeFrequencySweep(
    [100e6, 200e6],
    [[73, 42], [50, 0]],
  );
  // Add more detailed current/voltage data to the solution
  const solutionWithCurrData: FrequencySweepResult = {
    ...sweep,
    results: [
      {
        ...sweep.results[0],
        antenna_solutions: [{
          ...sweep.results[0].antenna_solutions[0],
          branch_currents: [
            { real: 1.0, imag: 0.5 },
            { real: 0.8, imag: -0.3 },
            { real: 0.5, imag: 0.1 },
          ],
          node_voltages: [
            { real: 10, imag: 5 },
            { real: 8, imag: -2 },
            { real: 3, imag: 1 },
          ],
        }],
      },
      sweep.results[1],
    ],
  };

  it('extracts current_magnitude distribution at selected frequency', () => {
    const trace = makeTrace({ source: 'distribution', quantity: 'current_magnitude' });
    const data = extractDistributionTraceData(trace, solutionWithCurrData, 100e6);
    expect(data).toHaveLength(3);
    expect(data[0].x).toBe(0); // edge index
    expect(data[0].y).toBeCloseTo(Math.sqrt(1.0 ** 2 + 0.5 ** 2), 5);
    expect(data[1].x).toBe(1);
    expect(data[1].y).toBeCloseTo(Math.sqrt(0.8 ** 2 + 0.3 ** 2), 5);
  });

  it('extracts current_phase distribution at selected frequency', () => {
    const trace = makeTrace({ source: 'distribution', quantity: 'current_phase' });
    const data = extractDistributionTraceData(trace, solutionWithCurrData, 100e6);
    expect(data[0].y).toBeCloseTo((Math.atan2(0.5, 1.0) * 180) / Math.PI, 5);
  });

  it('extracts voltage_magnitude distribution at selected frequency', () => {
    const trace = makeTrace({ source: 'distribution', quantity: 'voltage_magnitude' });
    const data = extractDistributionTraceData(trace, solutionWithCurrData, 100e6);
    expect(data).toHaveLength(3);
    expect(data[0].y).toBeCloseTo(Math.sqrt(10 ** 2 + 5 ** 2), 5);
  });

  it('returns empty array when frequency not found', () => {
    const trace = makeTrace({ source: 'distribution', quantity: 'current_magnitude' });
    const data = extractDistributionTraceData(trace, solutionWithCurrData, 999e6);
    expect(data).toEqual([]);
  });

  it('returns empty array when sweep is null', () => {
    const trace = makeTrace({ source: 'distribution', quantity: 'current_magnitude' });
    const data = extractDistributionTraceData(trace, null, 100e6);
    expect(data).toEqual([]);
  });
});

// ============================================================================
// extractFarfieldTraceData tests
// ============================================================================

describe('extractFarfieldTraceData', () => {
  const radiationPatterns: Record<number, any> = {
    300000000: {
      frequency: 300e6,
      theta_angles: [0, 30, 60, 90, 120, 150, 180],
      phi_angles: [0, 0, 0, 0, 0, 0, 0],
      E_theta_mag: [0, 0.5, 0.8, 1.0, 0.8, 0.5, 0],
      E_phi_mag: [0, 0.1, 0.2, 0.3, 0.2, 0.1, 0],
      E_total_mag: [0, 0.51, 0.82, 1.04, 0.82, 0.51, 0],
      pattern_db: [-80, -5.85, -1.72, 0, -1.72, -5.85, -80],
      directivity: 1.64,
      gain: 1.5,
      efficiency: 0.915,
    },
  };

  it('extracts directivity pattern (E_total_mag) vs theta', () => {
    const trace = makeTrace({ source: 'farfield', quantity: 'directivity' });
    const data = extractFarfieldTraceData(trace, radiationPatterns, 300e6);
    expect(data).toHaveLength(7);
    expect(data[0]).toEqual({ x: 0, y: -80 });
    expect(data[3]).toEqual({ x: 90, y: 0 });
  });

  it('extracts E_theta vs theta', () => {
    const trace = makeTrace({ source: 'farfield', quantity: 'E_theta' });
    const data = extractFarfieldTraceData(trace, radiationPatterns, 300e6);
    expect(data[3]).toEqual({ x: 90, y: 1.0 });
  });

  it('extracts E_phi vs theta', () => {
    const trace = makeTrace({ source: 'farfield', quantity: 'E_phi' });
    const data = extractFarfieldTraceData(trace, radiationPatterns, 300e6);
    expect(data[3]).toEqual({ x: 90, y: 0.3 });
  });

  it('returns empty array for missing frequency', () => {
    const trace = makeTrace({ source: 'farfield', quantity: 'directivity' });
    const data = extractFarfieldTraceData(trace, radiationPatterns, 999e6);
    expect(data).toEqual([]);
  });

  it('returns empty array when radiationPatterns is null', () => {
    const trace = makeTrace({ source: 'farfield', quantity: 'directivity' });
    const data = extractFarfieldTraceData(trace, null, 300e6);
    expect(data).toEqual([]);
  });
});
