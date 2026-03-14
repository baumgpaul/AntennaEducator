/**
 * StructureMesh — Renders FdtdStructure as Three.js geometry.
 * Box, cylinder, sphere colored by material.
 */
import * as THREE from 'three';
import { useMemo } from 'react';

interface StructureMeshProps {
  structure: {
    id: string;
    name: string;
    type: string;
    position: [number, number, number];
    dimensions: Record<string, number>;
    material: string;
    custom_material?: { color: string } | null;
  };
  selected?: boolean;
  onClick?: () => void;
}

// Material colors (matches backend MATERIAL_LIBRARY)
const MATERIAL_COLORS: Record<string, string> = {
  vacuum: '#FFFFFF',
  air: '#E8F4FD',
  copper: '#B87333',
  aluminum: '#A8A9AD',
  silver: '#C0C0C0',
  gold: '#FFD700',
  pec: '#333333',
  fr4: '#2E7D32',
  rogers_4003c: '#1B5E20',
  glass: '#ADD8E6',
  teflon: '#F5F5DC',
  water: '#4169E1',
  dry_soil: '#8B7355',
  wet_soil: '#5C4033',
  skin: '#FFDAB9',
  bone: '#FFFDD0',
  brain: '#FFB6C1',
  muscle: '#CD5C5C',
  fat: '#FFF8DC',
};

function StructureMesh({ structure, selected = false, onClick }: StructureMeshProps) {
  const { type, position, dimensions, material, custom_material } = structure;

  const color = useMemo(() => {
    if (custom_material?.color) return custom_material.color;
    return MATERIAL_COLORS[material] ?? '#808080';
  }, [material, custom_material]);

  const geometry = useMemo(() => {
    switch (type) {
      case 'box':
      case 'substrate':
      case 'trace': {
        const w = dimensions.width ?? 0.1;
        const h = dimensions.height ?? 0.1;
        const d = dimensions.depth ?? 0.01;
        return <boxGeometry args={[w, h, d]} />;
      }
      case 'cylinder': {
        const r = dimensions.radius ?? 0.05;
        const cH = dimensions.height ?? 0.1;
        return <cylinderGeometry args={[r, r, cH, 32]} />;
      }
      case 'sphere': {
        const r = dimensions.radius ?? 0.05;
        return <sphereGeometry args={[r, 32, 16]} />;
      }
      default:
        return <boxGeometry args={[0.1, 0.1, 0.01]} />;
    }
  }, [type, dimensions]);

  return (
    <mesh position={position} onClick={onClick}>
      {geometry}
      <meshStandardMaterial
        color={color}
        transparent
        opacity={selected ? 0.9 : 0.6}
        side={THREE.DoubleSide}
      />
      {selected && (
        <mesh position={[0, 0, 0]}>
          {/* Wireframe overlay for selection highlight */}
          {geometry}
          <meshBasicMaterial color="#00e5ff" wireframe />
        </mesh>
      )}
    </mesh>
  );
}

export default StructureMesh;
export { MATERIAL_COLORS };
