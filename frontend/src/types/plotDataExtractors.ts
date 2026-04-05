/**
 * Pure data extraction functions for the unified plot system.
 *
 * Each extractor transforms Redux solver state into chart-ready {x, y}[]
 * arrays. These are used by UnifiedLinePlot (and other view components)
 * to render data without coupling to Redux directly.
 */
import type {
  PlotTrace,
  PortPlotQuantity,
  FieldPlotQuantity,
  DistributionPlotQuantity,
  FarfieldPlotQuantity,
} from './plotDefinitions';
import type { FrequencySweepResult, MultiAntennaSolutionResponse } from './api';
import type { ParameterStudyResult } from './parameterStudy';

// ============================================================================
// Data point type
// ============================================================================

export interface DataPoint {
  x: number;
  y: number;
}

// ============================================================================
// Complex number helpers
// ============================================================================

interface ComplexLike {
  real: number;
  imag: number;
}

function parseComplex(v: unknown): ComplexLike {
  if (v == null) return { real: 0, imag: 0 };
  if (typeof v === 'object' && v !== null && 'real' in v && 'imag' in v) {
    return { real: (v as any).real, imag: (v as any).imag };
  }
  if (typeof v === 'number') return { real: v, imag: 0 };
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? { real: n, imag: 0 } : { real: 0, imag: 0 };
  }
  return { real: 0, imag: 0 };
}

function complexMag(z: ComplexLike): number {
  return Math.sqrt(z.real ** 2 + z.imag ** 2);
}

function complexPhaseDeg(z: ComplexLike): number {
  return (Math.atan2(z.imag, z.real) * 180) / Math.PI;
}

function reflectionCoefficient(z: ComplexLike, z0: number): ComplexLike {
  const numR = z.real - z0;
  const numI = z.imag;
  const denR = z.real + z0;
  const denI = z.imag;
  const denMag2 = denR * denR + denI * denI;

  if (denMag2 < 1e-30) {
    return { real: 1, imag: 0 };
  }
  return {
    real: (numR * denR + numI * denI) / denMag2,
    imag: (numI * denR - numR * denI) / denMag2,
  };
}

// ============================================================================
// Port trace extraction helpers
// ============================================================================

function portQuantityFromImpedance(
  z: ComplexLike,
  quantity: PortPlotQuantity['quantity'],
  z0: number,
): number {
  switch (quantity) {
    case 'impedance_real':
      return z.real;
    case 'impedance_imag':
      return z.imag;
    case 'impedance_magnitude':
      return complexMag(z);
    case 'impedance_phase':
      return complexPhaseDeg(z);
    case 'reflection_coefficient_magnitude': {
      const gamma = reflectionCoefficient(z, z0);
      return complexMag(gamma);
    }
    case 'reflection_coefficient_phase': {
      const gamma = reflectionCoefficient(z, z0);
      return complexPhaseDeg(gamma);
    }
    case 'return_loss': {
      const gamma = reflectionCoefficient(z, z0);
      const gMag = complexMag(gamma);
      return gMag < 1e-10 ? 80 : -20 * Math.log10(gMag);
    }
    case 'vswr': {
      const gamma = reflectionCoefficient(z, z0);
      const gMag = complexMag(gamma);
      return gMag >= 1 ? Infinity : (1 + gMag) / (1 - gMag);
    }
    case 'port_voltage_magnitude':
      // Approximate: V = Z * I, but we don't have I standalone.
      // Fallback: return |Z| as proxy.
      return complexMag(z);
    case 'port_voltage_phase':
      return complexPhaseDeg(z);
    case 'port_current_magnitude':
      // Would need source current. Return 0 for now.
      return 0;
    case 'port_current_phase':
      return 0;
    default:
      return 0;
  }
}

// ============================================================================
// extractPortTraceData
// ============================================================================

/**
 * Extract port quantity data points from frequency sweep or parameter study.
 *
 * @param trace - The plot trace definition
 * @param frequencySweep - Frequency sweep results (if available)
 * @param parameterStudy - Parameter study results (if available)
 * @param antennaIndex - Which antenna to extract from (default: 0)
 * @param z0 - Reference impedance (default: 50 Ω)
 * @returns Array of {x, y} points
 */
export function extractPortTraceData(
  trace: PlotTrace,
  frequencySweep: FrequencySweepResult | null,
  parameterStudy: ParameterStudyResult | null,
  antennaIndex = 0,
  z0 = 50,
): DataPoint[] {
  const q = trace.quantity as PortPlotQuantity;

  // Prefer parameter study if available
  if (parameterStudy && parameterStudy.results.length > 0) {
    const varName = parameterStudy.config.sweepVariables[0]?.variableName;
    return parameterStudy.results.map((pr) => {
      const sol = (pr.solverResponse as any)?.antenna_solutions?.[antennaIndex];
      const z = parseComplex(sol?.input_impedance);
      const xVal = varName ? (pr.point.values[varName] ?? 0) : 0;
      return { x: xVal, y: portQuantityFromImpedance(z, q.quantity, z0) };
    });
  }

  // Fall back to frequency sweep
  if (frequencySweep && frequencySweep.results.length > 0) {
    return frequencySweep.results.map((result, i) => {
      const sol = result.antenna_solutions?.[antennaIndex];
      const z = parseComplex(sol?.input_impedance);
      const freq = frequencySweep.frequencies[i] ?? result.frequency;
      return { x: freq, y: portQuantityFromImpedance(z, q.quantity, z0) };
    });
  }

  return [];
}

// ============================================================================
// extractFieldTraceData
// ============================================================================

/** Cumulative distance along observation points. */
function cumulativeDistances(points: number[][]): number[] {
  const dists = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const dz = points[i][2] - points[i - 1][2];
    dists.push(dists[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz));
  }
  return dists;
}

/**
 * Extract field data points along an observation line.
 *
 * @param trace - The plot trace definition (source: 'field')
 * @param fieldData - Field data from solver state, keyed by fieldId then freqHz/index
 * @param frequencyKey - Frequency Hz or sweep point index to look up
 * @returns Array of {x, y} points (x = distance along line)
 */
export function extractFieldTraceData(
  trace: PlotTrace,
  fieldData: Record<string, Record<number, any>> | null,
  frequencyKey: number,
): DataPoint[] {
  if (!fieldData) return [];

  const q = trace.quantity as FieldPlotQuantity;
  const fieldEntry = fieldData[q.fieldId];
  if (!fieldEntry) return [];

  const freqData = fieldEntry[frequencyKey];
  if (!freqData) return [];

  const points: number[][] = freqData.points ?? [];
  if (points.length === 0) return [];

  const dists = cumulativeDistances(points);

  const values = getFieldQuantityValues(freqData, q.quantity, points.length);

  return dists.map((d, i) => ({ x: d, y: values[i] ?? 0 }));
}

function getFieldQuantityValues(
  freqData: any,
  quantity: FieldPlotQuantity['quantity'],
  numPoints: number,
): number[] {
  switch (quantity) {
    case 'E_magnitude':
      return freqData.E_mag ?? new Array(numPoints).fill(0);
    case 'H_magnitude':
      return freqData.H_mag ?? new Array(numPoints).fill(0);
    case 'S_magnitude':
      return freqData.S_mag ?? new Array(numPoints).fill(0);
    // Individual E components
    case 'Ex':
      return extractVectorComponent(freqData.E_vectors, 'x', numPoints);
    case 'Ey':
      return extractVectorComponent(freqData.E_vectors, 'y', numPoints);
    case 'Ez':
      return extractVectorComponent(freqData.E_vectors, 'z', numPoints);
    // Individual H components
    case 'Hx':
      return extractVectorComponent(freqData.H_vectors, 'x', numPoints);
    case 'Hy':
      return extractVectorComponent(freqData.H_vectors, 'y', numPoints);
    case 'Hz':
      return extractVectorComponent(freqData.H_vectors, 'z', numPoints);
    // Spherical components (Er, Etheta, Ephi, etc.) — placeholder
    case 'Er':
    case 'Etheta':
    case 'Ephi':
    case 'Hr':
    case 'Htheta':
    case 'Hphi':
      return new Array(numPoints).fill(0);
    default:
      return new Array(numPoints).fill(0);
  }
}

function extractVectorComponent(
  vectors: Array<{ x: ComplexLike; y: ComplexLike; z: ComplexLike }> | undefined,
  component: 'x' | 'y' | 'z',
  numPoints: number,
): number[] {
  if (!vectors || vectors.length === 0) return new Array(numPoints).fill(0);
  return vectors.map((v) => {
    const c = v[component];
    return c ? complexMag(c) : 0;
  });
}

// ============================================================================
// extractDistributionTraceData
// ============================================================================

/**
 * Extract current or voltage distribution data at a specific frequency.
 *
 * @param trace - The plot trace definition (source: 'distribution')
 * @param frequencySweep - Frequency sweep results
 * @param frequencyHz - Which frequency to extract
 * @param antennaIndex - Which antenna (default: 0)
 * @returns Array of {x, y} points (x = edge/node index)
 */
export function extractDistributionTraceData(
  trace: PlotTrace,
  frequencySweep: FrequencySweepResult | null,
  frequencyHz: number,
  antennaIndex = 0,
): DataPoint[] {
  if (!frequencySweep) return [];

  const q = trace.quantity as DistributionPlotQuantity;

  // Find the result at the requested frequency
  const freqIdx = frequencySweep.results.findIndex(
    (r) => Math.abs(r.frequency - frequencyHz) < 1,
  );
  if (freqIdx < 0) return [];

  const solution = frequencySweep.results[freqIdx];
  const antenna = solution.antenna_solutions?.[antennaIndex];
  if (!antenna) return [];

  switch (q.quantity) {
    case 'current_magnitude':
      return antenna.branch_currents.map((c, i) => ({
        x: i,
        y: complexMag(parseComplex(c)),
      }));
    case 'current_phase':
      return antenna.branch_currents.map((c, i) => ({
        x: i,
        y: complexPhaseDeg(parseComplex(c)),
      }));
    case 'voltage_magnitude':
      return antenna.node_voltages.map((v, i) => ({
        x: i,
        y: complexMag(parseComplex(v)),
      }));
    case 'voltage_phase':
      return antenna.node_voltages.map((v, i) => ({
        x: i,
        y: complexPhaseDeg(parseComplex(v)),
      }));
    default:
      return [];
  }
}

// ============================================================================
// extractFarfieldTraceData
// ============================================================================

/**
 * Extract far-field radiation data at a specific frequency.
 *
 * @param trace - The plot trace definition (source: 'farfield')
 * @param radiationPatterns - Radiation pattern data keyed by freq/index
 * @param frequencyKey - Frequency Hz or sweep point index
 * @returns Array of {x, y} points (x = theta in degrees)
 */
export function extractFarfieldTraceData(
  trace: PlotTrace,
  radiationPatterns: Record<number, any> | null,
  frequencyKey: number,
): DataPoint[] {
  if (!radiationPatterns) return [];

  const pattern = radiationPatterns[frequencyKey];
  if (!pattern) return [];

  const q = trace.quantity as FarfieldPlotQuantity;
  const thetaAngles: number[] = pattern.theta_angles ?? [];

  let values: number[];
  switch (q.quantity) {
    case 'directivity':
      values = pattern.pattern_db ?? [];
      break;
    case 'gain':
      values = pattern.pattern_db ?? [];
      break;
    case 'E_theta':
      values = pattern.E_theta_mag ?? [];
      break;
    case 'E_phi':
      values = pattern.E_phi_mag ?? [];
      break;
    default:
      values = [];
  }

  return thetaAngles.map((theta, i) => ({ x: theta, y: values[i] ?? 0 }));
}
