/**
 * Parameter study data extraction — transforms ParameterStudyResult into
 * chart-ready rows with port quantities (impedance, S11, VSWR, return loss).
 */
import type { ParameterStudyResult } from './parameterStudy';

// ============================================================================
// Types
// ============================================================================

/** One row of extracted data for charting. */
export interface PortQuantityRow {
  /** Index in the sweep grid. */
  index: number;
  /** All sweep variable values at this grid point. */
  sweepValues: Record<string, number>;
  /** Real part of input impedance [Ω]. */
  zReal: number;
  /** Imaginary part of input impedance [Ω]. */
  zImag: number;
  /** |Z_in| [Ω]. */
  zMag: number;
  /** Reflection coefficient magnitude |Γ|. */
  gammaMag: number;
  /** VSWR (1 = perfect match). */
  vswr: number;
  /** Return loss -20·log10(|Γ|) [dB]. Positive value = good match. */
  returnLoss: number;
}

// ============================================================================
// Complex number helpers
// ============================================================================

interface ComplexLike {
  real: number;
  imag: number;
}

/** Parse a complex value from the solver response into { real, imag }. */
function parseComplex(v: unknown): ComplexLike {
  if (v == null) return { real: 0, imag: 0 };
  if (typeof v === 'object' && 'real' in (v as any) && 'imag' in (v as any)) {
    return { real: (v as any).real, imag: (v as any).imag };
  }
  if (typeof v === 'number') return { real: v, imag: 0 };
  if (typeof v === 'string') {
    // Try parsing "a+bj" style
    const n = parseFloat(v);
    return Number.isFinite(n) ? { real: n, imag: 0 } : { real: 0, imag: 0 };
  }
  return { real: 0, imag: 0 };
}

// ============================================================================
// Extraction
// ============================================================================

/**
 * Extract port quantities from every grid point in a parameter study.
 *
 * @param study   The full ParameterStudyResult from the Redux store.
 * @param antennaIndex  Which antenna to extract (default: 0 = first).
 */
export function extractPortQuantities(
  study: ParameterStudyResult,
  antennaIndex = 0,
): PortQuantityRow[] {
  const z0 = study.config.referenceImpedance;

  return study.results.map((pr, idx) => {
    const resp = pr.solverResponse as any;
    const sol = resp?.antenna_solutions?.[antennaIndex];
    const zRaw = sol?.input_impedance;
    const z = parseComplex(zRaw);

    const zMag = Math.sqrt(z.real ** 2 + z.imag ** 2);

    // Γ = (Z - Z0) / (Z + Z0)  (complex division)
    const numR = z.real - z0;
    const numI = z.imag;
    const denR = z.real + z0;
    const denI = z.imag;
    const denMag2 = denR * denR + denI * denI;

    let gammaMag: number;
    if (denMag2 < 1e-30) {
      gammaMag = 1; // total reflection if Z+Z0 ≈ 0
    } else {
      const gammaR = (numR * denR + numI * denI) / denMag2;
      const gammaI = (numI * denR - numR * denI) / denMag2;
      gammaMag = Math.sqrt(gammaR * gammaR + gammaI * gammaI);
    }

    const vswr =
      gammaMag >= 1 ? Infinity : (1 + gammaMag) / (1 - gammaMag);

    // Return loss: clamp at -80 dB for perfect match (avoid -Infinity)
    const returnLoss =
      gammaMag < 1e-10 ? -80 : -20 * Math.log10(gammaMag);

    return {
      index: idx,
      sweepValues: { ...pr.point.values },
      zReal: z.real,
      zImag: z.imag,
      zMag,
      gammaMag,
      vswr,
      returnLoss,
    };
  });
}
