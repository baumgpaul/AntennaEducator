/**
 * Parameter study types and grid generator.
 *
 * Generalizes the frequency sweep so ANY user-defined variable(s) can
 * be swept.  "freq" is just another variable — sweeping it changes the
 * solver frequency; sweeping a geometry variable triggers a remesh.
 *
 * Max 2 sweep variables → cartesian product grid.
 */

// ============================================================================
// Configuration
// ============================================================================

export type SweepSpacing = 'linear' | 'logarithmic';

/** One variable to sweep. */
export interface SweepVariable {
  /** Variable name (must match a name in the variables slice). */
  variableName: string;
  /** Minimum value. */
  min: number;
  /** Maximum value. */
  max: number;
  /** Number of points (≥ 2). */
  numPoints: number;
  /** Linear or logarithmic spacing. */
  spacing: SweepSpacing;
}

/** Full configuration for a parameter study. */
export interface ParameterStudyConfig {
  /** 1 or 2 sweep variables. */
  sweepVariables: SweepVariable[];
}

// ============================================================================
// Grid Point & Results
// ============================================================================

/** A single point in the cartesian sweep grid. */
export interface GridPoint {
  /** Variable name → value at this point. */
  values: Record<string, number>;
  /** Index into each sweep variable's array (for 2D indexing). */
  indices: number[];
}

/** Collected result at one grid point. */
export interface ParameterPointResult {
  /** The grid point. */
  point: GridPoint;
  /** Solver response for all antennas. */
  solverResponse: unknown; // MultiAntennaSolutionResponse at runtime
  /** Whether the solver converged. */
  converged: boolean;
}

/** Aggregate result of a full parameter study. */
export interface ParameterStudyResult {
  config: ParameterStudyConfig;
  /** All grid points in execution order. */
  gridPoints: GridPoint[];
  /** Per-point results (same order as gridPoints). */
  results: ParameterPointResult[];
  /** Wall-clock time (ms). */
  totalTimeMs: number;
}

// ============================================================================
// Grid Generator
// ============================================================================

/**
 * Generate an array of N linearly or logarithmically spaced values.
 */
export function generateSweepValues(sv: SweepVariable): number[] {
  const { min, max, numPoints, spacing } = sv;
  if (numPoints < 1) return [];
  if (numPoints === 1) return [min];

  const values: number[] = [];
  if (spacing === 'logarithmic') {
    if (min <= 0 || max <= 0) {
      throw new Error('Logarithmic spacing requires positive min and max');
    }
    const logMin = Math.log10(min);
    const logMax = Math.log10(max);
    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      values.push(Math.pow(10, logMin + t * (logMax - logMin)));
    }
  } else {
    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      values.push(min + t * (max - min));
    }
  }
  return values;
}

/**
 * Build the cartesian product grid from 1 or 2 sweep variables.
 *
 * For 1 variable:  N grid points.
 * For 2 variables:  N₁ × N₂ grid points (outer = var 0, inner = var 1).
 *
 * Returns grid points in row-major order (var 0 slowest, var 1 fastest).
 */
export function buildSweepGrid(config: ParameterStudyConfig): GridPoint[] {
  const { sweepVariables } = config;
  if (sweepVariables.length === 0) return [];

  const axes = sweepVariables.map(generateSweepValues);

  if (axes.length === 1) {
    const name = sweepVariables[0].variableName;
    return axes[0].map((v, i) => ({
      values: { [name]: v },
      indices: [i],
    }));
  }

  // 2D cartesian product
  const grid: GridPoint[] = [];
  const [name0, name1] = [sweepVariables[0].variableName, sweepVariables[1].variableName];
  for (let i = 0; i < axes[0].length; i++) {
    for (let j = 0; j < axes[1].length; j++) {
      grid.push({
        values: { [name0]: axes[0][i], [name1]: axes[1][j] },
        indices: [i, j],
      });
    }
  }
  return grid;
}

/**
 * Check whether any geometry-affecting variable changed between
 * two grid points.  Only `freq` is non-geometric (it only changes
 * the solver frequency, not the mesh).
 */
export function needsRemesh(
  prev: GridPoint | null,
  next: GridPoint,
): boolean {
  if (!prev) return true; // first point always meshes
  for (const [name, value] of Object.entries(next.values)) {
    if (name === 'freq') continue; // freq is solver-only
    if (prev.values[name] !== value) return true;
  }
  return false;
}
