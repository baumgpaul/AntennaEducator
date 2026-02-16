/**
 * FieldVisualization - Component for rendering electromagnetic field data in 3D
 * Displays field magnitude/vectors using color mapping and geometry
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { FieldDefinition, FieldDefinition2D, FieldDefinition3D, FieldType } from '@/types/fieldDefinitions';
import type { ColorMapType } from '@/utils/colorMaps';
import { createColorArray } from '@/utils/colorMaps';

interface ComplexComponent {
  real: number;
  imag: number;
}

interface ComplexVector3D {
  x: ComplexComponent;
  y: ComplexComponent;
  z: ComplexComponent;
}

export interface FieldDataInput {
  E_mag?: number[];
  H_mag?: number[];
  E_vectors?: ComplexVector3D[];
  H_vectors?: ComplexVector3D[];
  [key: string]: unknown;
}

/**
 * Compute time-averaged Poynting vector magnitudes from E and H vectors.
 * S = 0.5 * Re(E × H*), returns |S| at each point in W/m².
 */
export function computePoyntingMagnitudes(
  E_vectors: ComplexVector3D[],
  H_vectors: ComplexVector3D[],
): number[] {
  const n = Math.min(E_vectors.length, H_vectors.length);
  const mags = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const E = E_vectors[i];
    const H = H_vectors[i];
    // Cross product E × H* (complex): (E × H*)_x = Ey*Hz* - Ez*Hy*, etc.
    // S = 0.5 * Re(E × H*)
    const Sx = 0.5 * (
      (E.y.real * H.z.real + E.y.imag * H.z.imag) -
      (E.z.real * H.y.real + E.z.imag * H.y.imag)
    );
    const Sy = 0.5 * (
      (E.z.real * H.x.real + E.z.imag * H.x.imag) -
      (E.x.real * H.z.real + E.x.imag * H.z.imag)
    );
    const Sz = 0.5 * (
      (E.x.real * H.y.real + E.x.imag * H.y.imag) -
      (E.y.real * H.x.real + E.y.imag * H.x.imag)
    );
    mags[i] = Math.sqrt(Sx * Sx + Sy * Sy + Sz * Sz);
  }
  return mags;
}

/**
 * Select the correct magnitude array based on fieldType.
 * E-fields use E_mag, H-fields use H_mag, poynting computes |S| from vectors.
 */
export function selectFieldMagnitudes(
  fieldData: FieldDataInput | undefined,
  fieldType: FieldType,
): number[] | undefined {
  if (!fieldData) return undefined;
  if (fieldType === 'H') return fieldData.H_mag;
  if (fieldType === 'poynting') {
    if (fieldData.E_vectors && fieldData.H_vectors &&
        fieldData.E_vectors.length > 0 && fieldData.H_vectors.length > 0) {
      return computePoyntingMagnitudes(fieldData.E_vectors, fieldData.H_vectors);
    }
    return undefined;
  }
  return fieldData.E_mag; // E-field
}

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
function PlaneField({ field, opacity, colorMap, fieldData, fieldType }: {
  field: FieldDefinition2D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
  fieldType: FieldType;
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
    const normal = field.normalPreset && field.normalPreset !== 'Custom'
      ? getNormalFromPreset(field.normalPreset)
      : field.normalVector ?? [0, 0, 1];

    const quaternion = new THREE.Quaternion();
    const targetNormal = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    quaternion.setFromUnitVectors(defaultNormal, targetNormal);
    geom.applyQuaternion(quaternion);

    // Apply vertex colors if field data is available
    let hasColors = false;
    const magnitudes = selectFieldMagnitudes(fieldData, fieldType);
    if (magnitudes && magnitudes.length > 0) {
      const colorArray = createColorArray(magnitudes, colorMap);
      geom.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
      hasColors = true;
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData, fieldType]);

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
function CircleField({ field, opacity, colorMap, fieldData, fieldType }: {
  field: FieldDefinition2D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
  fieldType: FieldType;
}) {
  const { geometry, hasColors } = useMemo(() => {
    const radius = field.dimensions?.radius || 50;
    const segments = (field.sampling?.x || 32) - 1; // Radial segments

    const geom = new THREE.CircleGeometry(radius / 1000, segments); // mm to meters

    // Rotate circle to match normal vector
    const normal = field.normalPreset && field.normalPreset !== 'Custom'
      ? getNormalFromPreset(field.normalPreset)
      : field.normalVector ?? [0, 0, 1];

    const quaternion = new THREE.Quaternion();
    const targetNormal = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    quaternion.setFromUnitVectors(defaultNormal, targetNormal);
    geom.applyQuaternion(quaternion);

    // Apply vertex colors if field data is available
    let hasColors = false;
    const magnitudes = selectFieldMagnitudes(fieldData, fieldType);
    if (magnitudes && magnitudes.length > 0) {
      const colorArray = createColorArray(magnitudes, colorMap);
      geom.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
      hasColors = true;
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData, fieldType]);

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
function SphereField({ field, opacity, colorMap, fieldData, fieldType }: {
  field: FieldDefinition3D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
  fieldType: FieldType;
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
    const magnitudes = selectFieldMagnitudes(fieldData, fieldType);
    if (magnitudes && magnitudes.length > 0) {
      const colorArray = createColorArray(magnitudes, colorMap);
      geom.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
      hasColors = true;
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData, fieldType]);

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
function CubeField({ field, opacity, colorMap, fieldData, fieldType }: {
  field: FieldDefinition3D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
  fieldType: FieldType;
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
    const magnitudes = selectFieldMagnitudes(fieldData, fieldType);
    if (magnitudes && magnitudes.length > 0) {
      const colorArray = createColorArray(magnitudes, colorMap);
      geom.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
      hasColors = true;
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData, fieldType]);

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
  const fieldType = field.fieldType;
  // Route to appropriate renderer based on field shape
  // Type narrowing happens automatically based on shape
  if (field.type === '2D') {
    if (field.shape === 'plane') {
      return <PlaneField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} fieldType={fieldType} />;
    } else if (field.shape === 'circle') {
      return <CircleField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} fieldType={fieldType} />;
    }
  } else if (field.type === '3D') {
    if (field.shape === 'sphere') {
      return <SphereField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} fieldType={fieldType} />;
    } else if (field.shape === 'cube') {
      return <CubeField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} fieldType={fieldType} />;
    }
  }

  return null;
}

export default FieldVisualization;
