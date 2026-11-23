import { describe, it, expect } from 'vitest';
import {
  arrowLayout,
  boundsOf,
  contourLevels,
  contourSegments,
  fromTriangles2D,
  probeValue,
  unshare,
  valueRange,
} from '../fieldMesh';

// Unit square split into two triangles; a linear field v = 2x + y
const NODES = [0, 0, 1, 0, 1, 1, 0, 1];
const TRIS = [0, 1, 2, 0, 2, 3];
const linear = (x: number, y: number) => 2 * x + y;
const NODE_V = [0, 2, 3, 1];

describe('fieldMesh', () => {
  it('a 2D mesh becomes points in the plane z = 0 with 3D vectors', () => {
    const m = fromTriangles2D(NODES, TRIS, { node: NODE_V, cellVectors2D: [1, 2, 3, 4] }, 'V', 'V');
    expect(Array.from(m.positions.slice(6, 9))).toEqual([1, 1, 0]);
    expect(Array.from(m.cellVectors!)).toEqual([1, 2, 0, 3, 4, 0]);
    expect(boundsOf(m)).toEqual({ min: [0, 0, 0], max: [1, 1, 0] });
  });

  it('contour lines of a linear field lie exactly on the level', () => {
    const m = fromTriangles2D(NODES, TRIS, { node: NODE_V }, 'V', 'V');
    const seg = contourSegments(m, [1.5]);
    expect(seg.length).toBe(12); // one segment in each triangle
    for (let i = 0; i < seg.length; i += 3) expect(linear(seg[i], seg[i + 1])).toBeCloseTo(1.5, 6);
    expect(contourSegments(m, [10]).length).toBe(0); // outside the range: nothing
  });

  it('contour levels are evenly spaced inside the range', () => {
    expect(contourLevels(0, 4, 3)).toEqual([1, 2, 3]);
  });

  it('the probe interpolates node values exactly for a linear field', () => {
    const m = fromTriangles2D(NODES, TRIS, { node: NODE_V }, 'V', 'V');
    expect(probeValue(m, 0, [0.7, 0.2, 0])).toBeCloseTo(linear(0.7, 0.2), 6);
    expect(probeValue(m, 1, [0.1, 0.8, 0])).toBeCloseTo(linear(0.1, 0.8), 6);
    expect(probeValue(m, 5, [0, 0, 0])).toBeNull();
  });

  it('the probe reads cell values where the field is constant per element', () => {
    const m = fromTriangles2D(NODES, TRIS, { node: NODE_V, cell: [7, 9] }, '|E|', 'V/m');
    expect(probeValue(m, 1, [0.1, 0.8, 0])).toBe(9);
  });

  it('value ranges skip non-finite values; a constant field gets a unit range', () => {
    expect(valueRange([1, NaN, 3, Infinity])).toEqual({ min: 1, max: 3 });
    expect(valueRange([2, 2])).toEqual({ min: 2, max: 3 });
    expect(valueRange([])).toEqual({ min: 0, max: 1 });
  });

  describe('arrow layout', () => {
    /** n×n squares on [-1, 1]², two triangles each, cell vector from the centre */
    function grid(n: number, field: (x: number, y: number) => [number, number]) {
      const nodes: number[] = [];
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) nodes.push(-1 + (2 * i) / n, -1 + (2 * j) / n);
      const tris: number[] = [];
      const vec: number[] = [];
      const id = (i: number, j: number) => j * (n + 1) + i;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          for (const t of [
            [id(i, j), id(i + 1, j), id(i + 1, j + 1)],
            [id(i, j), id(i + 1, j + 1), id(i, j + 1)],
          ]) {
            tris.push(...t);
            const cx = t.reduce((s, k) => s + nodes[2 * k], 0) / 3;
            const cy = t.reduce((s, k) => s + nodes[2 * k + 1], 0) / 3;
            vec.push(...field(cx, cy));
          }
        }
      return fromTriangles2D(nodes, tris, { cellVectors2D: vec }, 'E', 'V/m');
    }
    // a plate capacitor in miniature: strong field in a thin gap, a weak stray field around it
    const capacitor = (x: number, y: number): [number, number] => (Math.abs(x) < 0.5 && Math.abs(y) < 0.1 ? [0, -100] : [0, -1]);

    it('samples where the field is: the gap gets arrows, the weak surroundings none', () => {
      const arrows = arrowLayout(grid(80, capacitor));
      expect(arrows.length).toBeGreaterThan(20);
      expect(arrows.every((a) => Math.abs(a.centre[0]) < 0.5 && Math.abs(a.centre[1]) < 0.1)).toBe(true);
      // the old fixed grid (1/18 of the domain) put at most 2 rows into a gap 1/10 of the domain high
      const rows = new Set(arrows.map((a) => a.centre[1].toFixed(3)));
      expect(rows.size).toBeGreaterThanOrEqual(3);
    });

    it('arrow length is proportional to the field strength', () => {
      const m = grid(20, (x) => (x < 0 ? [1, 0] : [0.5, 0]));
      const arrows = arrowLayout(m);
      const left = arrows.find((a) => a.centre[0] < -0.2)!;
      const right = arrows.find((a) => a.centre[0] > 0.2)!;
      expect(left.length / right.length).toBeCloseTo(2, 6);
      expect(left.direction).toEqual([1, 0, 0]);
      expect(left.length).toBeLessThanOrEqual(left.spacing);
    });

    it('a singular corner does not shrink all other arrows: lengths are capped, not normalised to it', () => {
      const m = grid(20, (x, y) => (x > 0.9 && y > 0.9 ? [1e4, 0] : [1, 0]));
      const arrows = arrowLayout(m);
      const normal = arrows.find((a) => a.centre[0] < 0)!;
      const hot = arrows.reduce((a, b) => (b.length > a.length ? b : a));
      expect(normal.length).toBeCloseTo(hot.length, 6); // both at the full length
    });

    it('no vectors or a zero field: no arrows', () => {
      expect(arrowLayout(fromTriangles2D(NODES, TRIS, { node: NODE_V }, 'V', 'V'))).toEqual([]);
      expect(arrowLayout(grid(4, () => [0, 0]))).toEqual([]);
    });
  });

  it('flat shading gives every triangle its own vertices', () => {
    const m = fromTriangles2D(NODES, TRIS, { cell: [1, 2] }, 'x', '');
    const { positions, cellOfVertex } = unshare(m);
    expect(positions.length).toBe(18);
    expect(Array.from(cellOfVertex)).toEqual([0, 0, 0, 1, 1, 1]);
  });
});

describe('fitView', () => {
  const box = (w: number, h: number) => ({ min: [0, 0, 0] as [number, number, number], max: [w, h, 0] as [number, number, number] });

  it('a 2D field is seen from straight above, beside the colour scale', async () => {
    const { fitView } = await import('../fieldMesh');
    const v = fitView(box(2, 1), true, 640, 480);
    expect(v.up).toEqual([0, 1, 0]);
    expect(v.position[2]).toBeGreaterThan(0);
    expect([v.position[0], v.position[1]]).toEqual([v.target[0], v.target[1]]);
    // wide mesh: limited by the 544 px left of the 96 px colour scale
    expect(v.zoom).toBeCloseTo((0.9 * 544) / 2);
    // shifted so the mesh is centred in the free part, not under the scale
    expect(v.target[0]).toBeGreaterThan(1);
  });

  it('a tall mesh is limited by the height', async () => {
    const { fitView } = await import('../fieldMesh');
    expect(fitView(box(1, 4), true, 640, 480).zoom).toBeCloseTo((0.9 * 480) / 4);
  });

  it('3D: looks from an oblique corner with z up', async () => {
    const { fitView } = await import('../fieldMesh');
    const v = fitView({ min: [0, 0, 0], max: [1, 1, 1] }, false, 640, 480);
    expect(v.up).toEqual([0, 0, 1]);
    expect(v.position[0]).toBeGreaterThan(v.target[0]);
    expect(v.position[2]).toBeGreaterThan(v.target[2]);
  });
});
