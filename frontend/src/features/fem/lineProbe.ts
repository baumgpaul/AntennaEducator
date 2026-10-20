/**
 * Line probe: a result sampled along a straight line, for plots of V(s) or
 * |E|(s) and comparison with the analytic solution of a template.
 */
import type { SolveResult } from './api';
import { findTriangle } from './views/meshGeometry';
import { probeValue, fromTriangles2D } from '@/features/fieldview/fieldMesh';

export type ProbeQuantity = 'potential' | 'E';

export interface LineSample {
  /** Distance from the start point [m] */
  s: number;
  x: number;
  y: number;
  /** null outside the meshed region (holes, outside) */
  value: number | null;
}

/** Sample V (interpolated per node) or |E| (constant per element) along the line. */
export function sampleLine(
  result: SolveResult,
  start: [number, number],
  end: [number, number],
  quantity: ProbeQuantity,
  samples = 200,
): LineSample[] {
  const { nodes, triangles } = result.mesh;
  const e = result.electric_field;
  const magnitude =
    quantity === 'E' ? Array.from({ length: e.length / 2 }, (_, k) => Math.hypot(e[2 * k], e[2 * k + 1])) : undefined;
  const field = fromTriangles2D(nodes, triangles, quantity === 'E' ? { cell: magnitude } : { node: result.potential }, '', '');
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const out: LineSample[] = [];
  for (let i = 0; i < samples; i++) {
    const t = samples === 1 ? 0 : i / (samples - 1);
    const x = start[0] + t * (end[0] - start[0]);
    const y = start[1] + t * (end[1] - start[1]);
    const tri = findTriangle(result.mesh, x, y);
    out.push({ s: t * length, x, y, value: tri < 0 ? null : probeValue(field, tri, [x, y, 0]) });
  }
  return out;
}
