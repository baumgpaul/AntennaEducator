/**
 * Time Animation Utilities for Harmonic Electromagnetic Fields
 *
 * Computes instantaneous field values from complex phasor data at a given
 * phase angle φ. For a monochromatic field with time dependence e^{jωt}:
 *
 *   F(r, φ) = Re[F(r)] · cos(φ) − Im[F(r)] · sin(φ)
 *
 * Sweeping φ from 0 to 2π visualizes one complete period of oscillation.
 *
 * Used by VectorRenderer to animate arrow fields showing the time-varying
 * behavior of E-field, H-field, and other complex-valued quantities.
 */

interface ComplexComponent {
  real: number;
  imag: number;
}

interface ComplexVector3D {
  x: ComplexComponent;
  y: ComplexComponent;
  z: ComplexComponent;
}

interface InstantaneousVector {
  x: number;
  y: number;
  z: number;
  magnitude: number;
}

/**
 * Compute the instantaneous value of a single complex vector at phase φ.
 *
 * @param vector Complex phasor vector {x: {real, imag}, y: ..., z: ...}
 * @param phase Phase angle φ in radians [0, 2π)
 * @returns Real-valued instantaneous vector with magnitude
 */
export function computeInstantaneousVector(
  vector: ComplexVector3D,
  phase: number,
): InstantaneousVector {
  const cosP = Math.cos(phase);
  const sinP = Math.sin(phase);

  const x = vector.x.real * cosP - vector.x.imag * sinP;
  const y = vector.y.real * cosP - vector.y.imag * sinP;
  const z = vector.z.real * cosP - vector.z.imag * sinP;
  const magnitude = Math.sqrt(x * x + y * y + z * z);

  return { x, y, z, magnitude };
}

/**
 * Compute instantaneous values for an array of complex vectors at phase φ.
 * Batch version of computeInstantaneousVector for performance.
 *
 * @param vectors Array of complex phasor vectors
 * @param phase Phase angle φ in radians [0, 2π)
 * @returns Array of real-valued instantaneous vectors with magnitudes
 */
export function computeInstantaneousVectors(
  vectors: ComplexVector3D[],
  phase: number,
): InstantaneousVector[] {
  const cosP = Math.cos(phase);
  const sinP = Math.sin(phase);
  const n = vectors.length;
  const results = new Array<InstantaneousVector>(n);

  for (let i = 0; i < n; i++) {
    const v = vectors[i];
    const x = v.x.real * cosP - v.x.imag * sinP;
    const y = v.y.real * cosP - v.y.imag * sinP;
    const z = v.z.real * cosP - v.z.imag * sinP;
    results[i] = { x, y, z, magnitude: Math.sqrt(x * x + y * y + z * z) };
  }

  return results;
}

/**
 * Compute only the instantaneous magnitudes (without direction vectors).
 * Useful when only scalar color-mapping is needed.
 *
 * @param vectors Array of complex phasor vectors
 * @param phase Phase angle φ in radians [0, 2π)
 * @returns Array of instantaneous magnitudes
 */
export function computeInstantaneousMagnitudes(
  vectors: ComplexVector3D[],
  phase: number,
): number[] {
  const cosP = Math.cos(phase);
  const sinP = Math.sin(phase);
  const n = vectors.length;
  const magnitudes = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const v = vectors[i];
    const x = v.x.real * cosP - v.x.imag * sinP;
    const y = v.y.real * cosP - v.y.imag * sinP;
    const z = v.z.real * cosP - v.z.imag * sinP;
    magnitudes[i] = Math.sqrt(x * x + y * y + z * z);
  }

  return magnitudes;
}
