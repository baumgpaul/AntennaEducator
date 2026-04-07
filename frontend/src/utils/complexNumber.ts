/**
 * Canonical complex number parsing and formatting utilities.
 *
 * Consolidates duplicated implementations from solverSlice.ts,
 * solverHelpers.ts, plotDataExtractors.ts, and parameterStudyExtract.ts.
 */

export interface ComplexNumber {
  real: number;
  imag: number;
}

/**
 * Parse a complex value from any backend format into { real, imag }.
 *
 * Supported inputs:
 * - `null` / `undefined` → `{ real: 0, imag: 0 }`
 * - `number` → `{ real: n, imag: 0 }`
 * - `{ real, imag }` object
 * - `[real, imag]` array (Python tuple serialization)
 * - Python complex strings: `"1+2j"`, `"1.5-0.3j"`, `"(50+20j)"`, `"3j"`
 */
export function parseComplex(val: unknown): ComplexNumber {
  if (val == null) return { real: 0, imag: 0 };
  if (typeof val === 'number') return { real: val, imag: 0 };
  if (typeof val === 'object' && val !== null && 'real' in val && 'imag' in val) {
    return { real: (val as ComplexNumber).real, imag: (val as ComplexNumber).imag };
  }
  if (Array.isArray(val) && val.length >= 2) {
    return { real: val[0], imag: val[1] };
  }
  if (typeof val === 'string') {
    // Strip optional parentheses: "(50+20j)" → "50+20j"
    const s = val.replace(/[()]/g, '').trim();
    // Full complex: "a+bj" or "a-bj" (with optional scientific notation)
    const match = s.match(/^([+-]?[\d.eE+-]+)\s*([+-]\s*[\d.eE+-]+)[jJ]$/);
    if (match) {
      const real = parseFloat(match[1]);
      const imag = parseFloat(match[2].replace(/\s/g, ''));
      if (Number.isFinite(real) && Number.isFinite(imag)) return { real, imag };
    }
    // Pure imaginary: "20j", "-3.5j"
    const pureImag = s.match(/^([+-]?[\d.eE+-]+)[jJ]$/);
    if (pureImag) {
      const imag = parseFloat(pureImag[1]);
      if (Number.isFinite(imag)) return { real: 0, imag };
    }
    // Plain number string
    const n = parseFloat(s);
    if (Number.isFinite(n)) return { real: n, imag: 0 };
    return { real: 0, imag: 0 };
  }
  return { real: 0, imag: 0 };
}

/** Parse an array of complex values. */
export function parseComplexArray(arr: unknown[]): ComplexNumber[] {
  return arr.map(parseComplex);
}

/** Magnitude |z|. */
export function complexMagnitude(z: ComplexNumber): number {
  return Math.sqrt(z.real * z.real + z.imag * z.imag);
}

/** Phase in degrees. */
export function complexPhaseDeg(z: ComplexNumber): number {
  return (Math.atan2(z.imag, z.real) * 180) / Math.PI;
}

/** Format as "a+bj" string. */
export function formatComplex(z: ComplexNumber, decimals = 2): string {
  const real = z.real.toFixed(decimals);
  const imag = Math.abs(z.imag).toFixed(decimals);
  const sign = z.imag >= 0 ? '+' : '-';
  return `${real}${sign}${imag}j`;
}
