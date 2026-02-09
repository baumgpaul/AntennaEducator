/**
 * FieldVisualization - Component for rendering electromagnetic field data in 3D
 * Displays field magnitude/vectors using color mapping and geometry
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { FieldDefinition, FieldDefinition2D, FieldDefinition3D } from '@/types/fieldDefinitions';
import type { ColorMapType } from '@/utils/colorMaps';
import { createColorArray } from '@/utils/colorMaps';

/**
 * Get normal vector from preset
 */
function getNormalFromPreset(preset: 'XY' | 'YZ' | 'XZ'): [number, number, number] {
  switch (preset) {
    case 'XY':
      return [0, 0, 1]; // Z-up
    case 'YZ':
      return [1, 0, 0]; // X-right
    case 'XZ':
      return [0, 1, 0]; // Y-forward
  }
}

interface FieldVisualizationProps {
  field: FieldDefinition;
  visualizationMode: 'magnitude' | 'vectorial' | 'component' | 'phase';
  colorMap: ColorMapType;
  opacity: number; // 0-100
  selectedComponent?: 'x' | 'y' | 'z';
  complexPart?: 'magnitude' | 'real' | 'imaginary';
  fieldData?: {
    points: Array<[number, number, number]>;
    E_mag?: number[];
    H_mag?: number[];
    E_vectors?: Array<{ x: { real: number; imag: number }; y: { real: number; imag: number }; z: { real: number; imag: number } }>;
    H_vectors?: Array<{ x: { real: number; imag: number }; y: { real: number; imag: number }; z: { real: number; imag: number } }>;
  };
}

/**
 * Render a 2D plane field region
 */
function PlaneField({ field, opacity, colorMap, fieldData }: {
  field: FieldDefinition2D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
}) {
  const { geometry, hasColors } = useMemo(() => {
    // Calculate segments from sampling (n points → n-1 segments)
    const segmentsX = (field.sampling?.x || 20) - 1;
    const segmentsY = (field.sampling?.y || 20) - 1;

    const geom = new THREE.PlaneGeometry(
      (field.dimensions?.width || 100) / 1000, // mm to meters
      (field.dimensions?.height || 100) / 1000, // mm to meters
      segmentsX,
      segmentsY
    );

    // Rotate plane to match normal vector
    const normal = field.normalPreset
      ? getNormalFromPreset(field.normalPreset)
      : field.normalVector ?? [0, 0, 1];

    const quaternion = new THREE.Quaternion();
    const targetNormal = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    quaternion.setFromUnitVectors(defaultNormal, targetNormal);
    geom.applyQuaternion(quaternion);

    // Apply vertex colors if field data is available
    let hasColors = false;
    if (fieldData && fieldData.E_mag && fieldData.E_mag.length > 0) {
      const colorArray = createColorArray(fieldData.E_mag, colorMap);
      geom.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
      hasColors = true;
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData]);

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
        color={hasColors ? "#ffffff" : "#4488ff"}
        transparent
        opacity={opacity / 100}
        side={THREE.DoubleSide}
        wireframe={!hasColors}
        vertexColors={hasColors}
      />
    </mesh>
  );
}

/**
 * Render a 2D circular field region
 */
function CircleField({ field, opacity, colorMap, fieldData }: {
  field: FieldDefinition2D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
}) {
  const { geometry, hasColors } = useMemo(() => {
    const radius = field.dimensions?.radius || 50;
    const segments = (field.sampling?.x || 32) - 1; // Radial segments

    const geom = new THREE.CircleGeometry(radius / 1000, segments); // mm to meters

    // Rotate circle to match normal vector
    const normal = field.normalPreset
      ? getNormalFromPreset(field.normalPreset)
      : field.normalVector ?? [0, 0, 1];

    const quaternion = new THREE.Quaternion();
    const targetNormal = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    quaternion.setFromUnitVectors(defaultNormal, targetNormal);
    geom.applyQuaternion(quaternion);

    // Apply vertex colors if field data is available
    let hasColors = false;
    if (fieldData && fieldData.E_mag && fieldData.E_mag.length > 0) {
      const colorArray = createColorArray(fieldData.E_mag, colorMap);
      geom.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
      hasColors = true;
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData]);

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
        color={hasColors ? "#ffffff" : "#44ff88"}
        transparent
        opacity={opacity / 100}
        side={THREE.DoubleSide}
        wireframe={!hasColors}
        vertexColors={hasColors}
      />
    </mesh>
  );
}

/**
 * Render a 3D spherical field region
 */
function SphereField({ field, opacity, colorMap, fieldData }: {
  field: FieldDefinition3D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
}) {
  const { geometry, hasColors } = useMemo(() => {
    const radius = field.sphereRadius || 50;
    const widthSegments = field.sampling?.angular || 20;
    const heightSegments = field.sampling?.radial || 10;

    const geom = new THREE.SphereGeometry(
      radius / 1000, // mm to meters
      widthSegments,
      heightSegments
    );

    // Apply vertex colors if field data is available
    let hasColors = false;
    if (fieldData && fieldData.E_mag && fieldData.E_mag.length > 0) {
      const colorArray = createColorArray(fieldData.E_mag, colorMap);
      geom.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
      hasColors = true;
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData]);

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
        color={hasColors ? "#ffffff" : "#ff8844"}
        transparent
        opacity={opacity / 100}
        wireframe={!hasColors}
        vertexColors={hasColors}
      />
    </mesh>
  );
}

/**
 * Render a 3D cubic field region
 */
function CubeField({ field, opacity, colorMap, fieldData }: {
  field: FieldDefinition3D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
}) {
  const { geometry, hasColors } = useMemo(() => {
    const dims = field.cubeDimensions || { Lx: 100, Ly: 100, Lz: 100 };
    // Use sampling to determine segments (n points → n-1 segments)
    const segmentsX = (field.sampling?.radial || 10) - 1;
    const segmentsY = (field.sampling?.angular || 10) - 1;
    const segmentsZ = (field.sampling?.angular || 10) - 1;

    const geom = new THREE.BoxGeometry(
      dims.Lx / 1000,
      dims.Ly / 1000,
      dims.Lz / 1000,
      segmentsX,
      segmentsY,
      segmentsZ
    );

    // Apply vertex colors if field data is available
    let hasColors = false;
    if (fieldData && fieldData.E_mag && fieldData.E_mag.length > 0) {
      const colorArray = createColorArray(fieldData.E_mag, colorMap);
      geom.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
      hasColors = true;
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData]);

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
        color={hasColors ? "#ffffff" : "#ff44aa"}
        transparent
        opacity={opacity / 100}
        wireframe={!hasColors}
        vertexColors={hasColors}
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
  colorMap,
  fieldData,
}: FieldVisualizationProps) {
  // Route to appropriate renderer based on field shape
  // Type narrowing happens automatically based on shape
  if (field.type === '2D') {
    if (field.shape === 'plane') {
      return <PlaneField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} />;
    } else if (field.shape === 'circle') {
      return <CircleField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} />;
    }
  } else if (field.type === '3D') {
    if (field.shape === 'sphere') {
      return <SphereField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} />;
    } else if (field.shape === 'cube') {
      return <CubeField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} />;
    }
  }

  return null;
}

export default FieldVisualization;
