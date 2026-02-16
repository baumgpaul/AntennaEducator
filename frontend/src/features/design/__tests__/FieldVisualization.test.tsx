import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for FieldVisualization field type selection logic.
 *
 * Issue: FieldVisualization always used E_mag regardless of fieldType.
 * Fix: It should select the correct magnitude array based on field.fieldType.
 * Poynting vector |S| = |0.5 Re(E × H*)| is computed from complex vectors.
 */

import { selectFieldMagnitudes, computePoyntingMagnitudes } from '../FieldVisualization';

const makeComplexVec = (xr: number, xi: number, yr: number, yi: number, zr: number, zi: number) => ({
  x: { real: xr, imag: xi },
  y: { real: yr, imag: yi },
  z: { real: zr, imag: zi },
});

describe('FieldVisualization - selectFieldMagnitudes', () => {
  const mockFieldData = {
    points: [[0, 0, 0], [1, 0, 0]] as Array<[number, number, number]>,
    E_mag: [1.5, 2.5],
    H_mag: [0.01, 0.02],
    E_vectors: [
      makeComplexVec(1, 0, 0, 0, 0, 0),
      makeComplexVec(2, 0, 0, 0, 0, 0),
    ],
    H_vectors: [
      makeComplexVec(0, 0, 1, 0, 0, 0),
      makeComplexVec(0, 0, 2, 0, 0, 0),
    ],
  };

  it('should return E_mag when fieldType is E', () => {
    const result = selectFieldMagnitudes(mockFieldData, 'E');
    expect(result).toEqual([1.5, 2.5]);
  });

  it('should return H_mag when fieldType is H', () => {
    const result = selectFieldMagnitudes(mockFieldData, 'H');
    expect(result).toEqual([0.01, 0.02]);
  });

  it('should compute Poynting magnitudes for poynting fieldType', () => {
    const result = selectFieldMagnitudes(mockFieldData, 'poynting');
    expect(result).toBeDefined();
    expect(result!.length).toBe(2);
    // S = 0.5 Re(E × H*) for E=[1,0,0] H=[0,1,0]: S = 0.5 * [0,0,1] → |S| = 0.5
    expect(result![0]).toBeCloseTo(0.5, 5);
    // E=[2,0,0] H=[0,2,0]: S = 0.5 * [0,0,4] → |S| = 2.0
    expect(result![1]).toBeCloseTo(2.0, 5);
  });

  it('should return undefined when field data is missing', () => {
    const result = selectFieldMagnitudes(undefined, 'E');
    expect(result).toBeUndefined();
  });

  it('should return undefined when E_mag is missing for E field', () => {
    const data = { ...mockFieldData, E_mag: undefined };
    const result = selectFieldMagnitudes(data, 'E');
    expect(result).toBeUndefined();
  });

  it('should return undefined when H_mag is missing for H field', () => {
    const data = { ...mockFieldData, H_mag: undefined };
    const result = selectFieldMagnitudes(data, 'H');
    expect(result).toBeUndefined();
  });

  it('should return undefined for poynting when vectors are missing', () => {
    const data = { ...mockFieldData, E_vectors: undefined, H_vectors: undefined };
    const result = selectFieldMagnitudes(data, 'poynting');
    expect(result).toBeUndefined();
  });
});

describe('computePoyntingMagnitudes', () => {
  it('should compute |S| = |0.5 Re(E × H*)| correctly', () => {
    // E = [1,0,0], H = [0, 1/η₀, 0] (plane wave: S = z-directed)
    const E = [makeComplexVec(1, 0, 0, 0, 0, 0)];
    const H = [makeComplexVec(0, 0, 1, 0, 0, 0)];
    const result = computePoyntingMagnitudes(E, H);
    // S = 0.5 * Re([0,0,1*1 - 0*0]) = 0.5 * [0, 0, 1] → |S| = 0.5
    expect(result[0]).toBeCloseTo(0.5, 10);
  });

  it('should handle complex phasors correctly (90° phase shift)', () => {
    // E = [j, 0, 0] (purely imaginary), H = [0, 1, 0] (purely real)
    // E × H* = [j,0,0] × [0,1,0] = [0,0,j]
    // Re([0,0,j]) = [0,0,0] → |S| = 0  (reactive power, no real power flow)
    const E = [makeComplexVec(0, 1, 0, 0, 0, 0)];
    const H = [makeComplexVec(0, 0, 1, 0, 0, 0)];
    const result = computePoyntingMagnitudes(E, H);
    expect(result[0]).toBeCloseTo(0, 10);
  });

  it('should handle circularly polarized wave', () => {
    // E = [1, j, 0], H = [-j, 1, 0] (right-hand circular polarization, η=1)
    // E × H*: with H* = [j, 1, 0]
    // Sz = 0.5*(Re(Ex*Hy*) - Re(Ey*Hx*)) = 0.5*(1*1+0*0 - (0*0+1*(-1))) = 0.5*(1+1) = 1
    // |S| = 1
    const E = [makeComplexVec(1, 0, 0, 1, 0, 0)];
    const H = [makeComplexVec(0, -1, 1, 0, 0, 0)];
    const result = computePoyntingMagnitudes(E, H);
    expect(result[0]).toBeCloseTo(1.0, 10);
  });
});
