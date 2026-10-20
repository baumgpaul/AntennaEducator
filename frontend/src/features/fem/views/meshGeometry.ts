import type { MeshData } from '../api';

/** Index of the triangle containing (x, y), or -1 (barycentric test). */
export function findTriangle(mesh: MeshData, x: number, y: number): number {
  const p = mesh.nodes, t = mesh.triangles;
  for (let e = 0; e < t.length / 3; e++) {
    const [a, b, c] = [t[3 * e], t[3 * e + 1], t[3 * e + 2]];
    const x1 = p[2 * a], y1 = p[2 * a + 1], x2 = p[2 * b], y2 = p[2 * b + 1], x3 = p[2 * c], y3 = p[2 * c + 1];
    const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    const l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / d;
    const l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / d;
    if (l1 >= -1e-9 && l2 >= -1e-9 && 1 - l1 - l2 >= -1e-9) return e;
  }
  return -1;
}
