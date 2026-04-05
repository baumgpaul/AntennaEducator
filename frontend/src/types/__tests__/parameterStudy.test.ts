/**
 * Tests for parameter study grid generation and helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  generateSweepValues,
  buildSweepGrid,
  needsRemesh,
  type SweepVariable,
  type ParameterStudyConfig,
  type GridPoint,
} from '@/types/parameterStudy';

// ============================================================================
// generateSweepValues
// ============================================================================

describe('generateSweepValues', () => {
  const linear: SweepVariable = {
    variableName: 'freq',
    min: 100e6,
    max: 500e6,
    numPoints: 5,
    spacing: 'linear',
  };

  it('generates correct number of points', () => {
    expect(generateSweepValues(linear)).toHaveLength(5);
  });

  it('includes min and max as first and last values', () => {
    const vals = generateSweepValues(linear);
    expect(vals[0]).toBeCloseTo(100e6);
    expect(vals[4]).toBeCloseTo(500e6);
  });

  it('spaces linearly', () => {
    const vals = generateSweepValues(linear);
    // Step = (500-100)/4 = 100 MHz
    expect(vals[1]).toBeCloseTo(200e6);
    expect(vals[2]).toBeCloseTo(300e6);
    expect(vals[3]).toBeCloseTo(400e6);
  });

  it('supports logarithmic spacing', () => {
    const log: SweepVariable = {
      variableName: 'freq',
      min: 1e6,
      max: 1e9,
      numPoints: 4,
      spacing: 'logarithmic',
    };
    const vals = generateSweepValues(log);
    expect(vals).toHaveLength(4);
    expect(vals[0]).toBeCloseTo(1e6);
    expect(vals[1]).toBeCloseTo(1e7);
    expect(vals[2]).toBeCloseTo(1e8);
    expect(vals[3]).toBeCloseTo(1e9);
  });

  it('throws for logarithmic with non-positive values', () => {
    const bad: SweepVariable = {
      variableName: 'x',
      min: -1,
      max: 10,
      numPoints: 5,
      spacing: 'logarithmic',
    };
    expect(() => generateSweepValues(bad)).toThrow('positive');
  });

  it('returns single-element array for numPoints = 1', () => {
    const one = { ...linear, numPoints: 1 };
    const vals = generateSweepValues(one);
    expect(vals).toEqual([100e6]);
  });

  it('returns empty array for numPoints = 0', () => {
    const zero = { ...linear, numPoints: 0 };
    expect(generateSweepValues(zero)).toEqual([]);
  });
});

// ============================================================================
// buildSweepGrid
// ============================================================================

describe('buildSweepGrid', () => {
  it('returns empty for no sweep variables', () => {
    const config: ParameterStudyConfig = {
      sweepVariables: [],
    };
    expect(buildSweepGrid(config)).toEqual([]);
  });

  it('builds 1D grid correctly', () => {
    const config: ParameterStudyConfig = {
      sweepVariables: [
        { variableName: 'freq', min: 100e6, max: 300e6, numPoints: 3, spacing: 'linear' },
      ],
    };
    const grid = buildSweepGrid(config);
    expect(grid).toHaveLength(3);
    expect(grid[0].values.freq).toBeCloseTo(100e6);
    expect(grid[1].values.freq).toBeCloseTo(200e6);
    expect(grid[2].values.freq).toBeCloseTo(300e6);
    expect(grid[0].indices).toEqual([0]);
    expect(grid[2].indices).toEqual([2]);
  });

  it('builds 2D cartesian grid (row-major)', () => {
    const config: ParameterStudyConfig = {
      sweepVariables: [
        { variableName: 'freq', min: 100e6, max: 200e6, numPoints: 2, spacing: 'linear' },
        { variableName: 'length', min: 0.1, max: 0.3, numPoints: 3, spacing: 'linear' },
      ],
    };
    const grid = buildSweepGrid(config);
    // 2 × 3 = 6 points
    expect(grid).toHaveLength(6);

    // First 3 points: freq=100M, length varies
    expect(grid[0].values.freq).toBeCloseTo(100e6);
    expect(grid[0].values.length).toBeCloseTo(0.1);
    expect(grid[0].indices).toEqual([0, 0]);

    expect(grid[1].values.freq).toBeCloseTo(100e6);
    expect(grid[1].values.length).toBeCloseTo(0.2);
    expect(grid[1].indices).toEqual([0, 1]);

    expect(grid[2].values.freq).toBeCloseTo(100e6);
    expect(grid[2].values.length).toBeCloseTo(0.3);
    expect(grid[2].indices).toEqual([0, 2]);

    // Next 3: freq=200M, length varies
    expect(grid[3].values.freq).toBeCloseTo(200e6);
    expect(grid[3].values.length).toBeCloseTo(0.1);
    expect(grid[3].indices).toEqual([1, 0]);
  });

  it('total points = product of individual numPoints', () => {
    const config: ParameterStudyConfig = {
      sweepVariables: [
        { variableName: 'a', min: 1, max: 5, numPoints: 5, spacing: 'linear' },
        { variableName: 'b', min: 10, max: 30, numPoints: 3, spacing: 'linear' },
      ],
    };
    expect(buildSweepGrid(config)).toHaveLength(15);
  });
});

// ============================================================================
// needsRemesh
// ============================================================================

describe('needsRemesh', () => {
  it('returns true for first point (null prev)', () => {
    const point: GridPoint = { values: { freq: 300e6 }, indices: [0] };
    expect(needsRemesh(null, point)).toBe(true);
  });

  it('returns false when only freq changes', () => {
    const prev: GridPoint = { values: { freq: 100e6 }, indices: [0] };
    const next: GridPoint = { values: { freq: 200e6 }, indices: [1] };
    expect(needsRemesh(prev, next)).toBe(false);
  });

  it('returns true when a geometry variable changes', () => {
    const prev: GridPoint = { values: { freq: 100e6, length: 0.5 }, indices: [0, 0] };
    const next: GridPoint = { values: { freq: 100e6, length: 0.6 }, indices: [0, 1] };
    expect(needsRemesh(prev, next)).toBe(true);
  });

  it('returns false when no variable changes', () => {
    const prev: GridPoint = { values: { freq: 100e6, length: 0.5 }, indices: [0, 0] };
    const next: GridPoint = { values: { freq: 100e6, length: 0.5 }, indices: [0, 0] };
    expect(needsRemesh(prev, next)).toBe(false);
  });

  it('returns true when geometry changes even if freq also changes', () => {
    const prev: GridPoint = { values: { freq: 100e6, radius: 0.001 }, indices: [0, 0] };
    const next: GridPoint = { values: { freq: 200e6, radius: 0.002 }, indices: [1, 1] };
    expect(needsRemesh(prev, next)).toBe(true);
  });
});
