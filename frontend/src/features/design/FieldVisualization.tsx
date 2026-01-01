/**
 * FieldVisualization - Component for rendering electromagnetic field data in 3D
 * Displays field magnitude/vectors using color mapping and geometry
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { FieldDefinition, FieldDefinition2D, FieldDefinition3D } from '@/types/fieldDefinitions';
import type { ColorMapType } from '@/utils/colorMaps';

interface FieldVisualizationProps {
  field: FieldDefinition;
  visualizationMode: 'magnitude' | 'vectorial' | 'component' | 'phase';
  colorMap: ColorMapType;
  opacity: number; // 0-100
  selectedComponent?: 'x' | 'y' | 'z';
  complexPart?: 'magnitude' | 'real' | 'imaginary';
}

/**
 * Render a 2D plane field region
 */
function PlaneField({ field, opacity }: {
  field: FieldDefinition2D;
  opacity: number;
}) {
  const geometry = useMemo(() => {
    // For now, render as a simple quad with wireframe
    // Will be replaced with actual field data rendering
    const geom = new THREE.PlaneGeometry(
      field.dimensions?.width || 100,
      field.dimensions?.height || 100,
      10, // segments X
      10  // segments Y
    );
    return geom;
  }, [field]);

  const position = useMemo(() => {
    return new THREE.Vector3(
      field.centerPoint[0] / 1000, // mm to meters
      field.centerPoint[1] / 1000,
      field.centerPoint[2] / 1000
    );
  }, [field.centerPoint]);

  return (
    <mesh geometry={geometry} position={position}>
      <meshBasicMaterial
        color="#4488ff"
        transparent
        opacity={opacity / 100}
        side={THREE.DoubleSide}
        wireframe
      />
    </mesh>
  );
}

/**
 * Render a 2D circular field region
 */
function CircleField({ field, opacity }: {
  field: FieldDefinition2D;
  opacity: number;
}) {
  const geometry = useMemo(() => {
    const radius = field.dimensions?.radius || 50;
    return new THREE.CircleGeometry(radius / 1000, 32); // mm to meters
  }, [field]);

  const position = useMemo(() => {
    return new THREE.Vector3(
      field.centerPoint[0] / 1000,
      field.centerPoint[1] / 1000,
      field.centerPoint[2] / 1000
    );
  }, [field.centerPoint]);

  return (
    <mesh geometry={geometry} position={position}>
      <meshBasicMaterial
        color="#44ff88"
        transparent
        opacity={opacity / 100}
        side={THREE.DoubleSide}
        wireframe
      />
    </mesh>
  );
}

/**
 * Render a 3D spherical field region
 */
function SphereField({ field, opacity }: {
  field: FieldDefinition3D;
  opacity: number;
}) {
  const geometry = useMemo(() => {
    const radius = field.sphereRadius || 50;
    return new THREE.SphereGeometry(radius / 1000, 16, 12); // mm to meters
  }, [field]);

  const position = useMemo(() => {
    return new THREE.Vector3(
      field.centerPoint[0] / 1000,
      field.centerPoint[1] / 1000,
      field.centerPoint[2] / 1000
    );
  }, [field.centerPoint]);

  return (
    <mesh geometry={geometry} position={position}>
      <meshBasicMaterial
        color="#ff8844"
        transparent
        opacity={opacity / 100}
        wireframe
      />
    </mesh>
  );
}

/**
 * Render a 3D cubic field region
 */
function CubeField({ field, opacity }: {
  field: FieldDefinition3D;
  opacity: number;
}) {
  const geometry = useMemo(() => {
    const dims = field.cubeDimensions || { Lx: 100, Ly: 100, Lz: 100 };
    return new THREE.BoxGeometry(
      dims.Lx / 1000,
      dims.Ly / 1000,
      dims.Lz / 1000
    );
  }, [field]);

  const position = useMemo(() => {
    return new THREE.Vector3(
      field.centerPoint[0] / 1000,
      field.centerPoint[1] / 1000,
      field.centerPoint[2] / 1000
    );
  }, [field.centerPoint]);

  return (
    <mesh geometry={geometry} position={position}>
      <meshBasicMaterial
        color="#ff44aa"
        transparent
        opacity={opacity / 100}
        wireframe
      />
    </mesh>
  );
}

/**
 * Main FieldVisualization component
 * Routes to the appropriate shape renderer based on field definition
 */
function FieldVisualization({
  field,
  opacity,
}: FieldVisualizationProps) {
  // Route to appropriate renderer based on field shape
  // Type narrowing happens automatically based on shape
  if (field.type === '2D') {
    if (field.shape === 'plane') {
      return <PlaneField field={field} opacity={opacity} />;
    } else if (field.shape === 'circle') {
      return <CircleField field={field} opacity={opacity} />;
    }
  } else if (field.type === '3D') {
    if (field.shape === 'sphere') {
      return <SphereField field={field} opacity={opacity} />;
    } else if (field.shape === 'cube') {
      return <CubeField field={field} opacity={opacity} />;
    }
  }
  
  return null;
}

export default FieldVisualization;
