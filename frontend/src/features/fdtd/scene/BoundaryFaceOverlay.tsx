/**
 * BoundaryFaceOverlay — Per-face color overlay showing boundary condition type.
 * Green = ABC (absorbing), Red = PEC, Blue = PMC, Yellow = Periodic.
 */
import * as THREE from 'three';
import { useAppSelector } from '@/store/hooks';

const BC_COLORS: Record<string, string> = {
  mur_abc: '#4caf50',
  pec: '#f44336',
  pmc: '#2196f3',
  periodic: '#ffeb3b',
};

function BoundaryFaceOverlay() {
  const { domainSize, boundaries, dimensionality } = useAppSelector((s) => s.fdtdDesign);
  const [lx, ly] = domainSize;

  if (dimensionality === '1d') {
    const h = lx * 0.02;
    // Just show left/right face indicators
    return (
      <group>
        {/* x_min face */}
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[0.001, h * 2]} />
          <meshBasicMaterial
            color={BC_COLORS[boundaries.x_min.type]}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* x_max face */}
        <mesh position={[lx, 0, 0]}>
          <planeGeometry args={[0.001, h * 2]} />
          <meshBasicMaterial
            color={BC_COLORS[boundaries.x_max.type]}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    );
  }

  // 2D: four edges as thin quads
  const thickness = Math.max(lx, ly) * 0.008;
  const faces = [
    { key: 'x_min', bc: boundaries.x_min, pos: [0, ly / 2, 0] as const, size: [thickness, ly] },
    { key: 'x_max', bc: boundaries.x_max, pos: [lx, ly / 2, 0] as const, size: [thickness, ly] },
    { key: 'y_min', bc: boundaries.y_min, pos: [lx / 2, 0, 0] as const, size: [lx, thickness] },
    { key: 'y_max', bc: boundaries.y_max, pos: [lx / 2, ly, 0] as const, size: [lx, thickness] },
  ];

  return (
    <group>
      {faces.map((f) => (
        <mesh key={f.key} position={[f.pos[0], f.pos[1], f.pos[2]]}>
          <planeGeometry args={[f.size[0], f.size[1]]} />
          <meshBasicMaterial
            color={BC_COLORS[f.bc.type]}
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

export default BoundaryFaceOverlay;
