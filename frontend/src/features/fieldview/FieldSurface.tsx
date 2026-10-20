import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
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
  /** Shaded by the scene's lights (depth cue for spheres, boxes) instead of flat colours */
  lit?: boolean;
  /** Show the value under the cursor next to it (3D scenes without a readout bar) */
  probeLabel?: boolean;
  onProbe?: (probe: { value: number; point: [number, number, number] } | null) => void;
}

/** A field on triangles: coloured surface, contour lines, arrows, hover probe. */
function FieldSurface({
  mesh,
  colorMap,
  range,
  opacity = 1,
  contours = 0,
  arrowSpacing = 0,
  showEdges,
  lit,
  probeLabel,
  onProbe,
}: FieldSurfaceProps) {
  // The colour maps give display (sRGB) colours: a renderer that converts to
  // sRGB on output needs them linear, or they come out washed out
  const srgbOutput = useThree((s) => s.gl.outputColorSpace === THREE.SRGBColorSpace);
  const [hover, setHover] = useState<{ value: number; point: [number, number, number] } | null>(null);
  // Smooth (per node) or flat (per cell: every triangle gets its own vertices)
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    if (mesh.cellValues) {
      const { positions, cellOfVertex } = unshare(mesh);
      const values = Array.from(cellOfVertex, (c) => mesh.cellValues![c]);
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setAttribute('color', new THREE.BufferAttribute(toOutput(createColorArray(values, colorMap, range.min, range.max), srgbOutput), 3));
    } else {
      g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
      g.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
      const values = mesh.nodeValues ? Array.from(mesh.nodeValues) : new Array(mesh.positions.length / 3).fill(0);
      g.setAttribute('color', new THREE.BufferAttribute(toOutput(createColorArray(values, colorMap, range.min, range.max), srgbOutput), 3));
    }
    if (lit) g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [mesh, colorMap, range.min, range.max, srgbOutput, lit]);

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
    if ((!onProbe && !probeLabel) || e.faceIndex == null) return;
    const p: [number, number, number] = [e.point.x, e.point.y, e.point.z];
    const value = probeValue(mesh, e.faceIndex, p);
    const reading = value == null ? null : { value, point: p };
    onProbe?.(reading);
    if (probeLabel) setHover(reading);
  };
  const leave = () => {
    onProbe?.(null);
    setHover(null);
  };

  return (
    <group>
      <mesh geometry={geometry} onPointerMove={handleMove} onPointerOut={leave}>
        {lit ? (
          <meshLambertMaterial vertexColors emissive="#444444" side={THREE.DoubleSide} transparent={opacity < 1} opacity={opacity} />
        ) : (
          <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent={opacity < 1} opacity={opacity} toneMapped={false} />
        )}
      </mesh>
      {probeLabel && hover && (
        <Html position={hover.point} style={{ pointerEvents: 'none' }}>
          <div
            style={{ background: 'rgba(0,0,0,0.75)', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap', transform: 'translate(10px, -50%)' }}
          >
            {mesh.label} = {hover.value.toPrecision(4)} {mesh.unit}
          </div>
        </Html>
      )}
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

/** Display colours to what the renderer expects (linear when it converts to sRGB). */
function toOutput(colors: Float32Array, srgbOutput: boolean): Float32Array {
  if (!srgbOutput) return colors;
  const c = new THREE.Color();
  for (let i = 0; i < colors.length; i += 3) {
    c.setRGB(colors[i], colors[i + 1], colors[i + 2], THREE.SRGBColorSpace);
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  return colors;
}

export default FieldSurface;
