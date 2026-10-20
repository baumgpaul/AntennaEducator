/**
 * Common field data for the shared field viewer (antenna designer and the
 * field solver): points with triangles, a scalar per node or per cell, and
 * optional vectors. Every result — a PEEC observation plane, a FEM mesh — is
 * converted into this once, and drawn by one renderer.
 */

export interface FieldMesh {
  /** x, y, z per point [m] */
  positions: Float32Array;
  /** 3 point indices per triangle */
  triangles: Uint32Array;
  /** Scalar per point (smooth colours, contour lines) … */
  nodeValues?: Float32Array;
  /** … or per triangle (flat colours: e.g. |E| of P1 elements) */
  cellValues?: Float32Array;
  /** Vector per triangle (x, y, z) for arrows, e.g. E */
  cellVectors?: Float32Array;
  label: string;
  unit: string;
}

export const pointCount = (m: FieldMesh) => m.positions.length / 3;
export const triangleCount = (m: FieldMesh) => m.triangles.length / 3;

/** A 2D triangle mesh (FEM) in the plane z = 0. */
export function fromTriangles2D(
  nodes: ArrayLike<number>,
  triangles: ArrayLike<number>,
  values: { node?: ArrayLike<number>; cell?: ArrayLike<number>; cellVectors2D?: ArrayLike<number> },
  label: string,
  unit: string,
): FieldMesh {
  const n = nodes.length / 2;
  const positions = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    positions[3 * i] = nodes[2 * i];
    positions[3 * i + 1] = nodes[2 * i + 1];
  }
  let cellVectors: Float32Array | undefined;
  if (values.cellVectors2D) {
    const m = values.cellVectors2D.length / 2;
    cellVectors = new Float32Array(3 * m);
    for (let e = 0; e < m; e++) {
      cellVectors[3 * e] = values.cellVectors2D[2 * e];
      cellVectors[3 * e + 1] = values.cellVectors2D[2 * e + 1];
    }
  }
  return {
    positions,
    triangles: Uint32Array.from(triangles),
    nodeValues: values.node ? Float32Array.from(values.node) : undefined,
    cellValues: values.cell ? Float32Array.from(values.cell) : undefined,
    cellVectors,
    label,
    unit,
  };
}

export interface Bounds3 {
  min: [number, number, number];
  max: [number, number, number];
}

export function boundsOf(m: FieldMesh): Bounds3 {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], m.positions[i + k]);
      max[k] = Math.max(max[k], m.positions[i + k]);
    }
  }
  return { min, max };
}

/** Finite min/max of the values; a constant field gets a unit range. */
export function valueRange(values: ArrayLike<number>): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1 };
  return max > min ? { min, max } : { min, max: min + 1 };
}

/**
 * Contour lines of node values (marching triangles): with values linear on
 * each triangle, a level crosses a triangle along a straight segment.
 * Returns segment end points (x, y, z, x, y, z per segment).
 */
export function contourSegments(m: FieldMesh, levels: number[]): Float32Array {
  const v = m.nodeValues;
  if (!v) return new Float32Array();
  const out: number[] = [];
  const p = m.positions;
  const t = m.triangles;
  for (const level of levels) {
    for (let e = 0; e < t.length; e += 3) {
      const hits: number[] = [];
      for (let k = 0; k < 3; k++) {
        const a = t[e + k];
        const b = t[e + ((k + 1) % 3)];
        const da = v[a] - level;
        const db = v[b] - level;
        if (da < 0 !== db < 0) {
          const f = da / (da - db);
          hits.push(
            p[3 * a] + f * (p[3 * b] - p[3 * a]),
            p[3 * a + 1] + f * (p[3 * b + 1] - p[3 * a + 1]),
            p[3 * a + 2] + f * (p[3 * b + 2] - p[3 * a + 2]),
          );
        }
      }
      if (hits.length === 6) out.push(...hits);
    }
  }
  return Float32Array.from(out);
}

/** Evenly spaced levels strictly inside the range (n lines). */
export function contourLevels(min: number, max: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => min + ((max - min) * (i + 1)) / (n + 1));
}

/**
 * Value at a point on a triangle (the hover probe): interpolated with
 * barycentric weights from node values, or the triangle's own cell value.
 */
export function probeValue(m: FieldMesh, triangle: number, point: [number, number, number]): number | null {
  if (triangle < 0 || triangle >= triangleCount(m)) return null;
  if (m.cellValues) return m.cellValues[triangle];
  if (!m.nodeValues) return null;
  const [a, b, c] = [m.triangles[3 * triangle], m.triangles[3 * triangle + 1], m.triangles[3 * triangle + 2]];
  const w = barycentric(m, a, b, c, point);
  return w[0] * m.nodeValues[a] + w[1] * m.nodeValues[b] + w[2] * m.nodeValues[c];
}

function barycentric(m: FieldMesh, a: number, b: number, c: number, q: [number, number, number]): [number, number, number] {
  const P = (i: number) => [m.positions[3 * i], m.positions[3 * i + 1], m.positions[3 * i + 2]];
  const [pa, pb, pc] = [P(a), P(b), P(c)];
  const v0 = pb.map((x, k) => x - pa[k]);
  const v1 = pc.map((x, k) => x - pa[k]);
  const v2 = q.map((x, k) => x - pa[k]);
  const dot = (u: number[], w: number[]) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
  const d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1);
  const den = d00 * d11 - d01 * d01 || 1;
  const wb = (d11 * d20 - d01 * d21) / den;
  const wc = (d00 * d21 - d01 * d20) / den;
  return [1 - wb - wc, wb, wc];
}

/** Arrows on a coarse sample of triangles: one per grid cell of the given size. */
export function arrowSample(m: FieldMesh, cell: number): { centre: [number, number, number]; vector: [number, number, number] }[] {
  const vec = m.cellVectors;
  if (!vec) return [];
  const taken = new Set<string>();
  const out: { centre: [number, number, number]; vector: [number, number, number] }[] = [];
  const t = m.triangles;
  const p = m.positions;
  for (let e = 0; e < t.length / 3; e++) {
    const centre: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < 3; k++) for (let d = 0; d < 3; d++) centre[d] += p[3 * t[3 * e + k] + d] / 3;
    const key = centre.map((x) => Math.floor(x / cell)).join(',');
    if (taken.has(key)) continue;
    taken.add(key);
    out.push({ centre, vector: [vec[3 * e], vec[3 * e + 1], vec[3 * e + 2]] });
  }
  return out;
}

/** Flat-shaded triangles need their own vertices: positions and per-vertex colour index per triangle. */
export function unshare(m: FieldMesh): { positions: Float32Array; cellOfVertex: Uint32Array } {
  const n = m.triangles.length;
  const positions = new Float32Array(3 * n);
  const cellOfVertex = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const v = m.triangles[i];
    positions[3 * i] = m.positions[3 * v];
    positions[3 * i + 1] = m.positions[3 * v + 1];
    positions[3 * i + 2] = m.positions[3 * v + 2];
    cellOfVertex[i] = Math.floor(i / 3);
  }
  return { positions, cellOfVertex };
}

const COLORBAR_WIDTH = 140; // px taken by the colour scale overlay

/** Camera framing a mesh in a canvas, leaving room for the colour scale on the right. */
export function fitView(b: Bounds3, flat: boolean, width: number, height: number) {
  const centre = b.min.map((m, k) => (m + b.max[k]) / 2) as [number, number, number];
  const w = Math.max(b.max[0] - b.min[0], 1e-9);
  const h = Math.max(b.max[1] - b.min[1], 1e-9);
  const extent = Math.max(w, h, b.max[2] - b.min[2]);
  const free = Math.max(width - COLORBAR_WIDTH, width / 2);
  const zoom = 0.9 * Math.min(free / w, height / h);
  const shift = (width - free) / 2 / zoom; // the field sits in the free part
  const target: [number, number, number] = [centre[0] + shift, centre[1], centre[2]];
  const position: [number, number, number] = flat
    ? [target[0], target[1], centre[2] + 10 * extent]
    : [target[0] + 2 * extent, target[1] - 2 * extent, centre[2] + 2 * extent];
  const up: [number, number, number] = flat ? [0, 1, 0] : [0, 0, 1];
  return { position, zoom, target, up };
}
