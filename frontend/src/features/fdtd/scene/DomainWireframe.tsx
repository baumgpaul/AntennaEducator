/**
 * DomainWireframe — Renders the FDTD computational domain as a wireframe box.
 * For 1D: renders a line along x-axis.
 * For 2D: renders a rectangle in the XY plane.
 */
import * as THREE from 'three';
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { useAppSelector } from '@/store/hooks';

function DomainWireframe() {
  const { domainSize, dimensionality } = useAppSelector((s) => s.fdtdDesign);

  const [lx, ly] = domainSize;

  const edges = useMemo(() => {
    if (dimensionality === '1d') {
      // 1D: line along x-axis with small y-extent for visibility
      const h = lx * 0.02; // thin visual height
      return [
        // Bottom line
        [[0, -h, 0], [lx, -h, 0]],
        // Top line
        [[0, h, 0], [lx, h, 0]],
        // Left cap
        [[0, -h, 0], [0, h, 0]],
        // Right cap
        [[lx, -h, 0], [lx, h, 0]],
      ] as [number[], number[]][];
    }

    // 2D: rectangle in XY plane
    return [
      [[0, 0, 0], [lx, 0, 0]],
      [[lx, 0, 0], [lx, ly, 0]],
      [[lx, ly, 0], [0, ly, 0]],
      [[0, ly, 0], [0, 0, 0]],
    ] as [number[], number[]][];
  }, [dimensionality, lx, ly]);

  return (
    <group>
      {edges.map((pair, i) => (
        <Line
          key={i}
          points={pair.map((p) => new THREE.Vector3(...p))}
          color="#4fc3f7"
          lineWidth={1.5}
          dashed
          dashSize={lx * 0.02}
          gapSize={lx * 0.01}
        />
      ))}
    </group>
  );
}

export default DomainWireframe;
