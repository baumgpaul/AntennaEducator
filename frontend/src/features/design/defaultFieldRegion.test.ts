import { describe, expect, it } from 'vitest';
import type { AntennaElement } from '@/types/models';
import { defaultFieldRegion, FALLBACK_FIELD_DEFAULTS, niceCeil } from './defaultFieldRegion';

function element(nodes: [number, number, number][], extra: Partial<AntennaElement> = {}): AntennaElement {
  return {
    id: 'e1',
    type: 'dipole',
    name: 'Dipole',
    config: {} as AntennaElement['config'],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    mesh: { nodes, edges: [], radii: [] },
    visible: true,
    locked: false,
    ...extra,
  };
}

/** z-directed wire of length L (m) centred at the origin */
const zWire = (L: number) => element([[0, 0, -L / 2], [0, 0, L / 2]]);

describe('niceCeil', () => {
  it('rounds up to 1 / 2 / 2.5 / 5 × 10^k', () => {
    expect(niceCeil(999.3)).toBe(1000);
    expect(niceCeil(1000)).toBe(1000);
    expect(niceCeil(1001)).toBe(2000);
    expect(niceCeil(2.2)).toBe(2.5);
    expect(niceCeil(3)).toBe(5);
    expect(niceCeil(0)).toBe(0);
  });
});

describe('defaultFieldRegion', () => {
  it('half-wave dipole at 300 MHz: 1 m XZ plane (λ) through the antenna', () => {
    // λ = 999.3 mm, dipole 0.5 m → size = λ, rounded to 1000 mm
    const d = defaultFieldRegion([zWire(0.5)], 300);
    expect(d.preset).toBe('XZ');
    expect(d.size).toBe(1000);
    expect(d.center).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('the old 100 mm default would have shown 1/10 of a 300 MHz dipole', () => {
    expect(defaultFieldRegion([zWire(0.5)], 300).size).toBeGreaterThanOrEqual(10 * FALLBACK_FIELD_DEFAULTS.size);
  });

  it('electrically small loop: 10 × diameter, not a plane many wavelengths wide', () => {
    // 0.1 m loop at 10 MHz (λ = 30 m)
    const loop = element([[0.05, 0, 0], [0, 0.05, 0], [-0.05, 0, 0], [0, -0.05, 0]], { type: 'loop' });
    expect(defaultFieldRegion([loop], 10).size).toBe(1000);
  });

  it('long antenna (several λ): at least twice its length', () => {
    // 3 m wire at 300 MHz (λ ≈ 1 m) → 2 × 3 m = 6 m, rounded up to 10 m
    expect(defaultFieldRegion([zWire(3)], 300).size).toBe(10000);
  });

  it('centres on the antennas and respects position offsets', () => {
    const shifted = element([[0, 0, -0.25], [0, 0, 0.25]], { position: [0.2, 0, 0.1] });
    expect(defaultFieldRegion([shifted], 300).center).toEqual({ x: 200, y: 0, z: 100 });
  });

  it('applies rotation like the 3D view: a dipole rotated onto y gets a YZ plane', () => {
    const rotated = element([[0, 0, -0.25], [0, 0, 0.25]], { rotation: [90, 0, 0] });
    expect(defaultFieldRegion([rotated], 300).preset).toBe('YZ');
  });

  it('ignores hidden elements', () => {
    const hidden = element([[5, 5, 5], [6, 6, 6]], { id: 'h', visible: false });
    expect(defaultFieldRegion([zWire(0.5), hidden], 300).center).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('falls back to the old default with neither geometry nor frequency', () => {
    expect(defaultFieldRegion([], null)).toEqual(FALLBACK_FIELD_DEFAULTS);
  });

  it('uses λ without geometry', () => {
    expect(defaultFieldRegion([], 300)).toMatchObject({ size: 1000, preset: 'XZ' });
  });
});
