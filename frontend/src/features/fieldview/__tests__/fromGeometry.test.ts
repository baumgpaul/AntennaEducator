import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { fromGeometry, probeValue } from '../fieldMesh';
import { quantityLabel } from '@/features/design/fieldQuantity';

describe('fromGeometry (PEEC observation surfaces)', () => {
  it('takes a Three.js geometry as it is: vertices moved by the offset, its own triangles', () => {
    const g = new THREE.PlaneGeometry(2, 1, 2, 1); // 3 × 2 vertices, 4 triangles
    const pos = g.getAttribute('position');
    const values = Array.from({ length: pos.count }, (_, i) => i);
    const m = fromGeometry(pos.array, g.index!.array, values, [10, 0, 5], '|E|', 'V/m');
    expect(m.positions.length).toBe(18);
    expect(m.positions[0]).toBeCloseTo(pos.getX(0) + 10);
    expect(m.positions[2]).toBeCloseTo(pos.getZ(0) + 5);
    expect(m.triangles.length).toBe(12);
    expect(Array.from(m.nodeValues!)).toEqual(values);
    // the probe at a vertex returns that vertex's value
    const v = m.triangles[0];
    const p: [number, number, number] = [m.positions[3 * v], m.positions[3 * v + 1], m.positions[3 * v + 2]];
    expect(probeValue(m, 0, p)).toBeCloseTo(values[v]);
  });

  it('non-indexed geometry: consecutive vertex triples are the triangles', () => {
    const m = fromGeometry([0, 0, 0, 1, 0, 0, 0, 1, 0], null, [1, 2, 3], [0, 0, 0], 'x', '');
    expect(Array.from(m.triangles)).toEqual([0, 1, 2]);
  });

  it('values must match the vertices', () => {
    expect(() => fromGeometry([0, 0, 0, 1, 0, 0, 0, 1, 0], null, [1, 2], [0, 0, 0], 'x', '')).toThrow(/2 values for 3 points/);
  });
});

describe('quantityLabel', () => {
  it('names the displayed quantity and its unit', () => {
    expect(quantityLabel('E')).toEqual({ label: '|E|', unit: 'V/m' });
    expect(quantityLabel('H', 'real')).toEqual({ label: 'Re H', unit: 'A/m' });
    expect(quantityLabel('poynting', 'magnitude')).toEqual({ label: '|S|', unit: 'W/m²' });
    expect(quantityLabel('E', 'phase')).toEqual({ label: '∠E', unit: '°' });
    expect(quantityLabel('E', 'instantaneous').label).toBe('E(t)');
  });
});
