import { useMemo } from 'react';
import FieldViewer from '@/features/fieldview/FieldViewer';
import { boundsOf, fromTriangles2D } from '@/features/fieldview/fieldMesh';
import type { SolveResult } from '../api';
import type { FemView } from '../model';

type FieldView = Extract<FemView, { type: 'field' }>;

/** A field on the mesh in the shared viewer, filling the canvas; probe lines of the model are drawn on top. */
function FieldResultView({
  view,
  result,
  probeLines,
}: {
  view: FieldView;
  result: SolveResult;
  probeLines: { start: [number, number]; end: [number, number] }[];
}) {
  const mesh = useMemo(() => {
    const { nodes, triangles } = result.mesh;
    if (view.quantity === 'potential') {
      return fromTriangles2D(nodes, triangles, { node: result.potential, cellVectors2D: result.electric_field }, 'V', 'V');
    }
    const v = view.quantity === 'E' ? result.electric_field : result.flux_density;
    const magnitude = Array.from({ length: v.length / 2 }, (_, e) => Math.hypot(v[2 * e], v[2 * e + 1]));
    // colours: the magnitude per element (constant on each P1 triangle); lines: equipotentials
    return fromTriangles2D(
      nodes,
      triangles,
      { node: result.potential, cell: magnitude, cellVectors2D: result.electric_field },
      view.quantity === 'E' ? '|E|' : '|D|',
      view.quantity === 'E' ? 'V/m' : 'C/m²',
    );
  }, [result, view.quantity]);
  const arrowSpacing = useMemo(() => {
    const b = boundsOf(mesh);
    return Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 18;
  }, [mesh]);

  return (
    <FieldViewer
      mesh={mesh}
      colorMap={view.colorMap}
      contours={view.contours ? 12 : 0}
      arrowSpacing={view.arrows ? arrowSpacing : 0}
      overlayLines={probeLines.map((l) => ({ from: [l.start[0], l.start[1], 0], to: [l.end[0], l.end[1], 0] }))}
      height="100%"
      flat
    />
  );
}

export default FieldResultView;
