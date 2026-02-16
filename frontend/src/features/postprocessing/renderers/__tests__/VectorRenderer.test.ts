/**
 * Unit tests for VectorRenderer phase computation.
 *
 * The instantaneous field at phase φ is: Re(V · e^{jφ})
 * For each component: real·cos(φ) - imag·sin(φ)
 */
import { describe, it, expect } from 'vitest';

/**
 * Compute instantaneous vector direction and magnitude at a given phase.
 * Extracted from VectorRenderer for testability.
 */
function computeInstantVector(
  vector: { x: { real: number; imag: number }; y: { real: number; imag: number }; z: { real: number; imag: number } },
  phaseDeg: number,
): { direction: [number, number, number]; magnitude: number } {
  const phaseRad = (phaseDeg * Math.PI) / 180;
  const cosP = Math.cos(phaseRad);
  const sinP = Math.sin(phaseRad);

  const rx = vector.x.real * cosP - vector.x.imag * sinP;
  const ry = vector.y.real * cosP - vector.y.imag * sinP;
  const rz = vector.z.real * cosP - vector.z.imag * sinP;
  const magnitude = Math.sqrt(rx * rx + ry * ry + rz * rz);

  return { direction: [rx, ry, rz], magnitude };
}

describe('VectorRenderer phase computation', () => {
  it('at phase 0°, returns real part only', () => {
    const v = {
      x: { real: 3, imag: 4 },
      y: { real: 0, imag: 0 },
      z: { real: 0, imag: 0 },
    };
    const { direction, magnitude } = computeInstantVector(v, 0);
    expect(direction[0]).toBeCloseTo(3);
    expect(direction[1]).toBeCloseTo(0);
    expect(direction[2]).toBeCloseTo(0);
    expect(magnitude).toBeCloseTo(3);
  });

  it('at phase 90°, returns -imag part', () => {
    const v = {
      x: { real: 3, imag: 4 },
      y: { real: 0, imag: 0 },
      z: { real: 0, imag: 0 },
    };
    const { direction, magnitude } = computeInstantVector(v, 90);
    // cos(90)=0, sin(90)=1 → Re = 3*0 - 4*1 = -4
    expect(direction[0]).toBeCloseTo(-4);
    expect(magnitude).toBeCloseTo(4);
  });

  it('at phase 180°, returns negated real part', () => {
    const v = {
      x: { real: 3, imag: 4 },
      y: { real: 0, imag: 0 },
      z: { real: 0, imag: 0 },
    };
    const { direction } = computeInstantVector(v, 180);
    // cos(180)=-1, sin(180)=0 → Re = 3*(-1) - 4*0 = -3
    expect(direction[0]).toBeCloseTo(-3);
  });

  it('at phase 270°, returns imag part', () => {
    const v = {
      x: { real: 3, imag: 4 },
      y: { real: 0, imag: 0 },
      z: { real: 0, imag: 0 },
    };
    const { direction } = computeInstantVector(v, 270);
    // cos(270)=0, sin(270)=-1 → Re = 3*0 - 4*(-1) = 4
    expect(direction[0]).toBeCloseTo(4);
  });

  it('circularly polarized: magnitude is constant across all phases', () => {
    // E = x̂ + j·ŷ → circular polarization
    const v = {
      x: { real: 1, imag: 0 },
      y: { real: 0, imag: 1 },
      z: { real: 0, imag: 0 },
    };
    // |Re(V·e^{jφ})| = |cos(φ)x̂ - sin(φ)ŷ| = 1 for all φ
    for (let deg = 0; deg <= 360; deg += 45) {
      const { magnitude } = computeInstantVector(v, deg);
      expect(magnitude).toBeCloseTo(1, 5);
    }
  });

  it('linearly polarized: magnitude varies between peak and zero', () => {
    // E = 5·x̂ (purely real, linearly polarized)
    const v = {
      x: { real: 5, imag: 0 },
      y: { real: 0, imag: 0 },
      z: { real: 0, imag: 0 },
    };
    expect(computeInstantVector(v, 0).magnitude).toBeCloseTo(5);   // peak
    expect(computeInstantVector(v, 90).magnitude).toBeCloseTo(0);  // zero crossing
    expect(computeInstantVector(v, 180).magnitude).toBeCloseTo(5); // negative peak
  });

  it('handles 3D complex vector correctly', () => {
    const v = {
      x: { real: 1, imag: 2 },
      y: { real: 3, imag: 4 },
      z: { real: 5, imag: 6 },
    };
    const { direction } = computeInstantVector(v, 45);
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);
    expect(direction[0]).toBeCloseTo(1 * cos45 - 2 * sin45);
    expect(direction[1]).toBeCloseTo(3 * cos45 - 4 * sin45);
    expect(direction[2]).toBeCloseTo(5 * cos45 - 6 * sin45);
  });
});
