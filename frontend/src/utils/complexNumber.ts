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
    const z = parseComplexString(val);
    if (z) return z;
    // Plain number string
    const n = parseFloat(val.replace(/[()]/g, '').trim());
    if (Number.isFinite(n)) return { real: n, imag: 0 };
    return { real: 0, imag: 0 };
  }
  return { real: 0, imag: 0 };
}

/** One unsigned decimal number, optionally in scientific notation: 12, 1.5, .5, 3e-05, 2.5E+20 */
const UNSIGNED = String.raw`(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
const FULL_COMPLEX = new RegExp(`^([+-]?${UNSIGNED})\\s*([+-])\\s*(${UNSIGNED})[jJ]$`);
const PURE_IMAGINARY = new RegExp(`^([+-]?${UNSIGNED})[jJ]$`);

/**
 * Parse a complex string ("a+bj", "(a-bj)", "bj"), including Python's
 * scientific notation ("0.0123-3.4e-05j"); null if it is not one.
 *
 * The real part is a complete number, so the split can never fall inside an
 * exponent (the old greedy pattern read "0.0123-3.4e-05j" as imag = -5).
 */
export function parseComplexString(val: string): ComplexNumber | null {
  const s = val.trim().replace(/^\((.*)\)$/, '$1').trim();
  const full = s.match(FULL_COMPLEX);
  if (full) {
    const real = parseFloat(full[1]);
    const imag = parseFloat(full[3]) * (full[2] === '-' ? -1 : 1);
    return Number.isFinite(real) && Number.isFinite(imag) ? { real, imag } : null;
  }
  const pure = s.match(PURE_IMAGINARY);
  if (pure) {
    const imag = parseFloat(pure[1]);
    return Number.isFinite(imag) ? { real: 0, imag } : null;
  }
  return null;
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
