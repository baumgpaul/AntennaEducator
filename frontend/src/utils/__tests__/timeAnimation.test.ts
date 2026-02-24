import { describe, it, expect } from 'vitest';
import {
  computeInstantaneousVector,
  computeInstantaneousVectors,
  computeInstantaneousMagnitudes,
} from '../timeAnimation';

/**
 * Tests for time animation utility functions.
 *
 * Harmonic field animation computes the instantaneous field at phase φ:
 *   F(r, φ) = Re[F(r)] · cos(φ) − Im[F(r)] · sin(φ)
 *
 * This allows sweeping φ from 0 to 2π to visualize one complete cycle
 * of a monochromatic (single-frequency) electromagnetic field.
 */

const makeComplexVec = (
  xr: number, xi: number,
  yr: number, yi: number,
  zr: number, zi: number
) => ({
  x: { real: xr, imag: xi },
  y: { real: yr, imag: yi },
  z: { real: zr, imag: zi },
});

describe('computeInstantaneousVector', () => {
  describe('Basic phase formula: F(φ) = Re[F]·cos(φ) − Im[F]·sin(φ)', () => {
    it('at φ=0, should return the real part', () => {
      const vec = makeComplexVec(3, 4, 0, 0, 0, 0);
      const result = computeInstantaneousVector(vec, 0);

      expect(result.x).toBeCloseTo(3, 10);
      expect(result.y).toBeCloseTo(0, 10);
      expect(result.z).toBeCloseTo(0, 10);
      expect(result.magnitude).toBeCloseTo(3, 10);
    });

    it('at φ=π/2, should return the negative imaginary part', () => {
      const vec = makeComplexVec(3, 4, 0, 0, 0, 0);
      const result = computeInstantaneousVector(vec, Math.PI / 2);

      // cos(π/2) ≈ 0, sin(π/2) = 1 → F = -Im[F]
      expect(result.x).toBeCloseTo(-4, 10);
      expect(result.y).toBeCloseTo(0, 10);
      expect(result.z).toBeCloseTo(0, 10);
      expect(result.magnitude).toBeCloseTo(4, 10);
    });

    it('at φ=π, should return the negative real part', () => {
      const vec = makeComplexVec(3, 4, 0, 0, 0, 0);
      const result = computeInstantaneousVector(vec, Math.PI);

      // cos(π) = -1, sin(π) ≈ 0 → F = -Re[F]
      expect(result.x).toBeCloseTo(-3, 10);
      expect(result.y).toBeCloseTo(0, 10);
      expect(result.z).toBeCloseTo(0, 10);
      expect(result.magnitude).toBeCloseTo(3, 10);
    });

    it('at φ=3π/2, should return the imaginary part', () => {
      const vec = makeComplexVec(3, 4, 0, 0, 0, 0);
      const result = computeInstantaneousVector(vec, 3 * Math.PI / 2);

      // cos(3π/2) ≈ 0, sin(3π/2) = -1 → F = Im[F]
      expect(result.x).toBeCloseTo(4, 10);
      expect(result.y).toBeCloseTo(0, 10);
      expect(result.z).toBeCloseTo(0, 10);
      expect(result.magnitude).toBeCloseTo(4, 10);
    });
  });

  describe('3D vector fields', () => {
    it('should handle all three components independently', () => {
      // F = (1+2j, 3+4j, 5+6j), at φ=0 → (1, 3, 5)
      const vec = makeComplexVec(1, 2, 3, 4, 5, 6);
      const result = computeInstantaneousVector(vec, 0);

      expect(result.x).toBeCloseTo(1, 10);
      expect(result.y).toBeCloseTo(3, 10);
      expect(result.z).toBeCloseTo(5, 10);
      expect(result.magnitude).toBeCloseTo(Math.sqrt(1 + 9 + 25), 10);
    });

    it('should compute at arbitrary phase φ=π/4', () => {
      // F = (1+0j, 0+1j, 0+0j), at φ=π/4
      // Fx = 1·cos(π/4) - 0·sin(π/4) = √2/2
      // Fy = 0·cos(π/4) - 1·sin(π/4) = -√2/2
      // Fz = 0
      const vec = makeComplexVec(1, 0, 0, 1, 0, 0);
      const result = computeInstantaneousVector(vec, Math.PI / 4);

      const sqrt2over2 = Math.SQRT2 / 2;
      expect(result.x).toBeCloseTo(sqrt2over2, 10);
      expect(result.y).toBeCloseTo(-sqrt2over2, 10);
      expect(result.z).toBeCloseTo(0, 10);
      expect(result.magnitude).toBeCloseTo(1, 10);
    });
  });

  describe('Physical cases', () => {
    it('linearly polarized wave: magnitude oscillates between ±peak', () => {
      // E = (E0, 0, 0) purely real → linearly polarized along x
      const E0 = 5;
      const vec = makeComplexVec(E0, 0, 0, 0, 0, 0);

      // At φ=0: |F| = E0
      expect(computeInstantaneousVector(vec, 0).magnitude).toBeCloseTo(E0, 10);

      // At φ=π/2: |F| = 0 (zero crossing)
      expect(computeInstantaneousVector(vec, Math.PI / 2).magnitude).toBeCloseTo(0, 10);

      // At φ=π: |F| = E0 (reversed direction)
      expect(computeInstantaneousVector(vec, Math.PI).magnitude).toBeCloseTo(E0, 10);
    });

    it('circularly polarized wave: constant magnitude at all phases', () => {
      // E = (E0, jE0, 0) → right-hand circular polarization
      // E(φ) = (E0·cos(φ), -E0·sin(φ), 0)
      // |E(φ)| = E0 for all φ
      const E0 = 3;
      const vec = makeComplexVec(E0, 0, 0, E0, 0, 0);

      for (let phi = 0; phi < 2 * Math.PI; phi += Math.PI / 8) {
        const result = computeInstantaneousVector(vec, phi);
        expect(result.magnitude).toBeCloseTo(E0, 8);
      }
    });

    it('elliptically polarized wave: magnitude bounded by semi-axes', () => {
      // E = (a, 0, 0) + j(0, b, 0) with a≠b → elliptical polarization
      const a = 4, b = 2;
      const vec = makeComplexVec(a, 0, 0, b, 0, 0);

      let minMag = Infinity, maxMag = -Infinity;
      for (let phi = 0; phi < 2 * Math.PI; phi += Math.PI / 100) {
        const mag = computeInstantaneousVector(vec, phi).magnitude;
        minMag = Math.min(minMag, mag);
        maxMag = Math.max(maxMag, mag);
      }

      // Semi-major axis = a, semi-minor axis = b
      expect(maxMag).toBeCloseTo(a, 3);
      expect(minMag).toBeCloseTo(b, 3);
    });

    it('zero vector should remain zero at all phases', () => {
      const vec = makeComplexVec(0, 0, 0, 0, 0, 0);

      for (let phi = 0; phi < 2 * Math.PI; phi += Math.PI / 4) {
        const result = computeInstantaneousVector(vec, phi);
        expect(result.x).toBeCloseTo(0, 10);
        expect(result.y).toBeCloseTo(0, 10);
        expect(result.z).toBeCloseTo(0, 10);
        expect(result.magnitude).toBeCloseTo(0, 10);
      }
    });
  });
});

describe('computeInstantaneousVectors', () => {
  it('should compute instantaneous values for all vectors in an array', () => {
    const vectors = [
      makeComplexVec(1, 0, 0, 0, 0, 0), // purely real x
      makeComplexVec(0, 1, 0, 0, 0, 0), // purely imaginary x
    ];

    const results = computeInstantaneousVectors(vectors, 0);
    expect(results).toHaveLength(2);
    // At φ=0: first vector is (1,0,0), second is (0,0,0)
    expect(results[0].x).toBeCloseTo(1, 10);
    expect(results[1].x).toBeCloseTo(0, 10);
  });

  it('should handle empty array', () => {
    const results = computeInstantaneousVectors([], 0);
    expect(results).toHaveLength(0);
  });

  it('should produce same results as individual computations', () => {
    const vectors = [
      makeComplexVec(3, 1, 2, 4, 5, 0),
      makeComplexVec(0, 2, 1, 0, 3, 3),
      makeComplexVec(7, 0, 0, 7, 1, 1),
    ];
    const phase = 1.23;

    const batchResults = computeInstantaneousVectors(vectors, phase);
    vectors.forEach((vec, i) => {
      const single = computeInstantaneousVector(vec, phase);
      expect(batchResults[i].x).toBeCloseTo(single.x, 10);
      expect(batchResults[i].y).toBeCloseTo(single.y, 10);
      expect(batchResults[i].z).toBeCloseTo(single.z, 10);
      expect(batchResults[i].magnitude).toBeCloseTo(single.magnitude, 10);
    });
  });
});

describe('computeInstantaneousMagnitudes', () => {
  it('should return only magnitudes for all vectors', () => {
    const vectors = [
      makeComplexVec(3, 0, 4, 0, 0, 0), // |(3,4,0)| = 5
      makeComplexVec(0, 0, 0, 0, 1, 0), // |(0,0,1)| = 1
    ];

    const mags = computeInstantaneousMagnitudes(vectors, 0);
    expect(mags).toHaveLength(2);
    expect(mags[0]).toBeCloseTo(5, 10);
    expect(mags[1]).toBeCloseTo(1, 10);
  });

  it('at φ=π/2 should use negative imaginary parts', () => {
    // vec = (0+3j, 0+4j, 0+0j) → at φ=π/2: (-3, -4, 0), |F| = 5
    const vectors = [makeComplexVec(0, 3, 0, 4, 0, 0)];
    const mags = computeInstantaneousMagnitudes(vectors, Math.PI / 2);

    expect(mags[0]).toBeCloseTo(5, 10);
  });

  it('should handle empty array', () => {
    const mags = computeInstantaneousMagnitudes([], 0);
    expect(mags).toHaveLength(0);
  });
});

describe('Phase periodicity', () => {
  it('should produce same result at φ and φ+2π', () => {
    const vec = makeComplexVec(3, 4, 1, 2, 5, 6);
    const phase = 0.7;

    const r1 = computeInstantaneousVector(vec, phase);
    const r2 = computeInstantaneousVector(vec, phase + 2 * Math.PI);

    expect(r1.x).toBeCloseTo(r2.x, 10);
    expect(r1.y).toBeCloseTo(r2.y, 10);
    expect(r1.z).toBeCloseTo(r2.z, 10);
    expect(r1.magnitude).toBeCloseTo(r2.magnitude, 10);
  });

  it('should produce opposite direction at φ and φ+π', () => {
    const vec = makeComplexVec(3, 0, 4, 0, 0, 0); // purely real → linear polarization
    const phase = 0.5;

    const r1 = computeInstantaneousVector(vec, phase);
    const r2 = computeInstantaneousVector(vec, phase + Math.PI);

    // For purely real vector, F(φ+π) = -F(φ)
    expect(r2.x).toBeCloseTo(-r1.x, 10);
    expect(r2.y).toBeCloseTo(-r1.y, 10);
    expect(r2.z).toBeCloseTo(-r1.z, 10);
    // Same magnitude
    expect(r2.magnitude).toBeCloseTo(r1.magnitude, 10);
  });
});
