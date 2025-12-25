import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Mesh } from '@/types/models';

interface WireGeometryProps {
  mesh: Mesh;
  currentDistribution?: number[]; // Current magnitude at each segment
  selected?: boolean;
  onSelect?: () => void;
}

/**
 * WireGeometry - Renders antenna wire mesh as 3D cylinders
 * Supports color mapping for current distribution visualization
 */
function WireGeometry({ mesh, currentDistribution, selected, onSelect }: WireGeometryProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  // Convert mesh edges to line segments
  const segments = useMemo(() => {
    // Safety check: ensure mesh data is valid
    if (!mesh || !mesh.edges || !mesh.nodes || !mesh.radii) {
      console.log('WireGeometry: Invalid mesh data', { mesh });
      return [];
    }
    
    // Validate arrays have proper length
    if (mesh.edges.length === 0 || mesh.nodes.length === 0 || mesh.radii.length === 0) {
      console.log('WireGeometry: Empty mesh arrays', { 
        edgesLength: mesh.edges.length, 
        nodesLength: mesh.nodes.length, 
        radiiLength: mesh.radii.length 
      });
      return [];
    }
    
    return mesh.edges.map((edge, idx) => {
      const [startIdx, endIdx] = edge;
      
      // Validate indices
      if (!mesh.nodes[startIdx] || !mesh.nodes[endIdx]) {
        console.error(`WireGeometry: Invalid node indices - edge ${idx}: [${startIdx}, ${endIdx}], nodes length: ${mesh.nodes.length}`);
        return null;
      }
      
      const start = mesh.nodes[startIdx];
      const end = mesh.nodes[endIdx];
      const radius = mesh.radii[idx];

      // Validate node data
      if (!start || !end || start.length < 3 || end.length < 3) {
        console.error(`WireGeometry: Invalid node data at indices ${startIdx}, ${endIdx}`);
        return null;
      }

      // Get current magnitude for color mapping (normalized 0-1)
      const current = currentDistribution?.[idx] ?? 0;

      return {
        start: new THREE.Vector3(start[0], start[1], start[2]),
        end: new THREE.Vector3(end[0], end[1], end[2]),
        radius,
        current,
      };
    }).filter(seg => seg !== null);
  }, [mesh, currentDistribution]);

  // Color mapping for current distribution (blue -> cyan -> green -> yellow -> red)
  const getColorFromCurrent = (current: number): THREE.Color => {
    if (current === 0) return new THREE.Color(0x888888); // Gray for no current

    // Normalize current to 0-1 range
    const t = Math.min(Math.max(current, 0), 1);

    // Color gradient: blue (0) -> green (0.5) -> red (1)
    if (t < 0.5) {
      // Blue to green
      const ratio = t * 2;
      return new THREE.Color().lerpColors(
        new THREE.Color(0x0000ff),
        new THREE.Color(0x00ff00),
        ratio
      );
    } else {
      // Green to red
      const ratio = (t - 0.5) * 2;
      return new THREE.Color().lerpColors(
        new THREE.Color(0x00ff00),
        new THREE.Color(0xff0000),
        ratio
      );
    }
  };

  // Animation for selected/hovered state
  useFrame((state) => {
    if (groupRef.current && (selected || hovered)) {
      groupRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 3) * 0.05);
    } else if (groupRef.current) {
      groupRef.current.scale.setScalar(1);
    }
  });

  return (
    <group ref={groupRef}>
      {segments.map((segment, idx) => {
        const direction = new THREE.Vector3().subVectors(segment.end, segment.start);
        const length = direction.length();
        const midpoint = new THREE.Vector3().addVectors(segment.start, segment.end).multiplyScalar(0.5);

        // Create rotation quaternion to align cylinder with wire direction
        const orientation = new THREE.Quaternion();
        orientation.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.clone().normalize()
        );

        const color = getColorFromCurrent(segment.current);

        return (
          <group key={idx} position={midpoint} quaternion={orientation}>
            {/* Wire cylinder */}
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.();
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHovered(true);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                setHovered(false);
                document.body.style.cursor = 'default';
              }}
            >
              <cylinderGeometry args={[segment.radius, segment.radius, length, 8]} />
              <meshStandardMaterial
                color={color}
                emissive={selected || hovered ? color : new THREE.Color(0x000000)}
                emissiveIntensity={selected || hovered ? 0.3 : 0}
                metalness={0.6}
                roughness={0.4}
              />
            </mesh>

            {/* Wire caps */}
            <mesh position={[0, length / 2, 0]}>
              <sphereGeometry args={[segment.radius, 8, 8]} />
              <meshStandardMaterial
                color={color}
                metalness={0.6}
                roughness={0.4}
              />
            </mesh>
            <mesh position={[0, -length / 2, 0]}>
              <sphereGeometry args={[segment.radius, 8, 8]} />
              <meshStandardMaterial
                color={color}
                metalness={0.6}
                roughness={0.4}
              />
            </mesh>
          </group>
        );
      })}

      {/* Node markers (for debugging/visualization) */}
      {mesh.nodes.map((node, idx) => (
        <mesh key={`node-${idx}`} position={new THREE.Vector3(node[0], node[1], node[2])}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshBasicMaterial color={selected ? 0xff0000 : 0xffff00} />
        </mesh>
      ))}
    </group>
  );
}

export default WireGeometry;
