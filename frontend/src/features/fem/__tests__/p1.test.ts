import { describe, it, expect } from 'vitest';
import type { MeshData } from '../api';
import { elementInfo } from '../p1';

const mesh = (nodes: number[]) =>
  ({ nodes, triangles: [0, 1, 2], triangle_domain: [0], domain_names: ['d'] }) as unknown as MeshData;

describe('P1 element matrix (as the backend computes it)', () => {
  it('reference triangle: K_e = ε·depth·½·[[2,−1,−1],[−1,1,0],[−1,0,1]]', () => {
    const info = elementInfo(mesh([0, 0, 1, 0, 0, 1]), 0, { d: 2 }, 3);
    expect(info.area).toBeCloseTo(0.5);
    const expected = [
      [2, -1, -1],
      [-1, 1, 0],
      [-1, 0, 1],
    ].map((r) => r.map((v) => 6 * 0.5 * v));
    info.matrix.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(expected[i][j], 12)));
  });

  it('rows sum to zero, the matrix is symmetric, gradients reproduce x', () => {
    const info = elementInfo(mesh([0.1, 0.2, 1.3, 0.4, 0.5, 1.7]), 0, { d: 1 }, 1);
    info.matrix.forEach((row, i) => {
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
      row.forEach((v, j) => expect(v).toBeCloseTo(info.matrix[j][i], 12));
    });
    const gx = info.coordinates.reduce(
      (s, [x], i) => [s[0] + x * info.gradients[i][0], s[1] + x * info.gradients[i][1]],
      [0, 0],
    );
    expect(gx[0]).toBeCloseTo(1, 12);
    expect(gx[1]).toBeCloseTo(0, 12);
  });
});
