import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { createColorArray, type ColorMapType } from '@/utils/colorMaps';
import { arrowSample, contourLevels, contourSegments, probeValue, unshare, type FieldMesh } from './fieldMesh';

export interface FieldSurfaceProps {
  mesh: FieldMesh;
  colorMap: ColorMapType;
  range: { min: number; max: number };
  opacity?: number;
  /** Number of contour lines of the node values (0: none) */
  contours?: number;
  /** Arrows of the cell vectors, one per square of this size [m] (0: none) */
  arrowSpacing?: number;
  showEdges?: boolean;
  onProbe?: (probe: { value: number; point: [number, number, number] } | null) => void;
}

/** A field on triangles: coloured surface, contour lines, arrows, hover probe. */
function FieldSurface({ mesh, colorMap, range, opacity = 1, contours = 0, arrowSpacing = 0, showEdges, onProbe }: FieldSurfaceProps) {
  // Smooth (per node) or flat (per cell: every triangle gets its own vertices)
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    if (mesh.cellValues) {
      const { positions, cellOfVertex } = unshare(mesh);
      const values = Array.from(cellOfVertex, (c) => mesh.cellValues![c]);
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setAttribute('color', new THREE.BufferAttribute(createColorArray(values, colorMap, range.min, range.max), 3));
    } else {
      g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
      g.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
      const values = mesh.nodeValues ? Array.from(mesh.nodeValues) : new Array(mesh.positions.length / 3).fill(0);
      g.setAttribute('color', new THREE.BufferAttribute(createColorArray(values, colorMap, range.min, range.max), 3));
    }
    g.computeBoundingSphere();
    return g;
  }, [mesh, colorMap, range.min, range.max]);

  const edges = useMemo(() => (showEdges ? new THREE.WireframeGeometry(geometry) : null), [geometry, showEdges]);

  const contourGeometry = useMemo(() => {
    if (!contours || !mesh.nodeValues) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(contourSegments(mesh, contourLevels(range.min, range.max, contours)), 3));
    return g;
  }, [mesh, contours, range.min, range.max]);

  const arrows = useMemo(() => (arrowSpacing > 0 ? arrowSample(mesh, arrowSpacing) : []), [mesh, arrowSpacing]);
  const maxArrow = useMemo(() => Math.max(1e-300, ...arrows.map((a) => Math.hypot(...a.vector))), [arrows]);

  // Triangle index of a hit: flat geometry has 3 vertices per triangle in order
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    if (!onProbe || e.faceIndex == null) return;
    const p: [number, number, number] = [e.point.x, e.point.y, e.point.z];
    const value = probeValue(mesh, e.faceIndex, p);
    onProbe(value == null ? null : { value, point: p });
  };

  return (
    <group>
      <mesh geometry={geometry} onPointerMove={handleMove} onPointerOut={() => onProbe?.(null)}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      {edges && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color="#000000" transparent opacity={0.15} />
        </lineSegments>
      )}
      {contourGeometry && (
        <lineSegments geometry={contourGeometry} position={[0, 0, 1e-6]}>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.85} />
        </lineSegments>
      )}
      {arrows.map((a, i) => {
        const len = Math.hypot(...a.vector);
        if (len < 1e-3 * maxArrow) return null;
        const dir = new THREE.Vector3(...a.vector).normalize();
        // length ~ log of magnitude, so weak fields stay visible
        const size = arrowSpacing * 0.8 * (0.35 + (0.65 * Math.log1p((9 * len) / maxArrow)) / Math.log(10));
        return (
          <arrowHelper
            key={i}
            args={[dir, new THREE.Vector3(a.centre[0] - (dir.x * size) / 2, a.centre[1] - (dir.y * size) / 2, a.centre[2] + 2e-6), size, 0xffffff, size * 0.35, size * 0.22]}
          />
        );
      })}
    </group>
  );
}

export default FieldSurface;
