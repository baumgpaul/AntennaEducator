/**
 * Helper functions for solver API
 * Converts between legacy single-antenna and new multi-antenna formats
 */

// NOTE: convertToMultiAntennaRequest is deprecated - see comments below

/**
 * Parse complex number from various formats
 * Backend may return: number, string "1+2j", or object {real: 1, imag: 2}
 */
export function parseComplex(
  value: number | string | { real: number; imag: number }
): { real: number; imag: number } {
  if (typeof value === 'number') {
    return { real: value, imag: 0 }
  } else if (typeof value === 'string') {
    // Parse "1.0+2.0j" or "1.0-2.0j" format
    const match = value.match(/^([+-]?[\d.]+)([+-][\d.]+)j$/)
    if (match) {
      return {
        real: parseFloat(match[1]),
        imag: parseFloat(match[2]),
      }
    }
    // Parse just real "1.0"
    const realOnly = parseFloat(value)
    if (!isNaN(realOnly)) {
      return { real: realOnly, imag: 0 }
    }
    throw new Error(`Cannot parse complex number: ${value}`)
  } else {
    return value
  }
}

/**
 * Get magnitude of complex number
 */
export function complexMagnitude(z: { real: number; imag: number }): number {
  return Math.sqrt(z.real * z.real + z.imag * z.imag)
}

/**
 * Get phase of complex number in degrees
 */
export function complexPhase(z: { real: number; imag: number }): number {
  return (Math.atan2(z.imag, z.real) * 180) / Math.PI
}

/**
 * Format complex number for display
 */
export function formatComplex(
  z: { real: number; imag: number },
  decimals: number = 2
): string {
  const real = z.real.toFixed(decimals)
  const imag = Math.abs(z.imag).toFixed(decimals)
  const sign = z.imag >= 0 ? '+' : '-'
  return `${real}${sign}${imag}j`
}
