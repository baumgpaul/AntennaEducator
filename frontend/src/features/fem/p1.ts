/**
 * One P1 triangle, as in femsolver/src/fem_solver/p1.py: shape function
 * gradients ∇φᵢ = (y_j − y_k, x_k − x_j)/(2A) and the element matrix
 * K_e = ε·depth·A·∇φᵢ·∇φⱼ. Shown on the Solve tab for a clicked triangle.
 */
import type { MeshData } from './api';

export interface ElementInfo {
  index: number;
  nodes: [number, number, number]; // global node numbers (0-based)
  coordinates: [number, number][];
  area: number;
  gradients: [number, number][];
  coefficient: number; // ε·depth
  matrix: number[][]; // 3×3
  domain: string;
}

export function elementInfo(mesh: MeshData, e: number, permittivity: Record<string, number>, depth: number): ElementInfo {
  const ids = [mesh.triangles[3 * e], mesh.triangles[3 * e + 1], mesh.triangles[3 * e + 2]] as [number, number, number];
  const p = ids.map((i) => [mesh.nodes[2 * i], mesh.nodes[2 * i + 1]] as [number, number]);
  const [[x0, y0], [x1, y1], [x2, y2]] = p;
  const twoA = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  const gradients: [number, number][] = [
    [(y1 - y2) / twoA, (x2 - x1) / twoA],
    [(y2 - y0) / twoA, (x0 - x2) / twoA],
    [(y0 - y1) / twoA, (x1 - x0) / twoA],
  ];
  const domain = mesh.domain_names[mesh.triangle_domain[e]];
  const coefficient = (permittivity[domain] ?? 0) * depth;
  const area = twoA / 2;
  const matrix = gradients.map((gi) => gradients.map((gj) => coefficient * area * (gi[0] * gj[0] + gi[1] * gj[1])));
  return { index: e, nodes: ids, coordinates: p, area, gradients, coefficient, matrix, domain };
}
