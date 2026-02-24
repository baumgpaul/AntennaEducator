/**
 * FieldVisualization - Component for rendering electromagnetic field data in 3D
 * Displays field magnitude/vectors using color mapping and geometry
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { FieldDefinition, FieldDefinition1D, FieldDefinition2D, FieldDefinition3D, FieldType } from '@/types/fieldDefinitions';
import { getEllipseAxesFromPreset } from '@/types/fieldDefinitions';
import type { ColorMapType } from '@/utils/colorMaps';
import { createColorArray, arrayMin, arrayMax } from '@/utils/colorMaps';
import type { DisplayQuantity } from '@/types/postprocessing';

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
 * Select the vectors for a given field type.
 */
function selectFieldVectors(
  fieldData: FieldDataInput | undefined,
  fieldType: FieldType,
): ComplexVector3D[] | undefined {
  if (!fieldData) return undefined;
  if (fieldType === 'H') return fieldData.H_vectors;
  if (fieldType === 'poynting') return undefined; // Poynting uses both E and H
  return fieldData.E_vectors;
}

/**
 * Compute display values for a scalar field surface based on displayQuantity.
 * For vector fields, this computes a scalar from the vector at each point.
 *
 * @param fieldData The field data with magnitudes and complex vectors
 * @param fieldType 'E' | 'H' | 'poynting'
 * @param displayQuantity How to compute the scalar value
 * @param animationPhase Phase angle in radians (only used when displayQuantity === 'instantaneous')
 * @returns Array of scalar values for color mapping
 */
export function selectFieldDisplayValues(
  fieldData: FieldDataInput | undefined,
  fieldType: FieldType,
  displayQuantity: DisplayQuantity = 'magnitude',
  animationPhase: number = 0,
): number[] | undefined {
  if (!fieldData) return undefined;

  // Poynting is always time-averaged magnitude
  if (fieldType === 'poynting') {
    return selectFieldMagnitudes(fieldData, fieldType);
  }

  const vectors = selectFieldVectors(fieldData, fieldType);

  switch (displayQuantity) {
    case 'magnitude':
      return selectFieldMagnitudes(fieldData, fieldType);

    case 'real':
      if (!vectors) return selectFieldMagnitudes(fieldData, fieldType);
      return vectors.map((v) =>
        Math.sqrt(v.x.real * v.x.real + v.y.real * v.y.real + v.z.real * v.z.real)
      );

    case 'imaginary':
      if (!vectors) return selectFieldMagnitudes(fieldData, fieldType);
      return vectors.map((v) =>
        Math.sqrt(v.x.imag * v.x.imag + v.y.imag * v.y.imag + v.z.imag * v.z.imag)
      );

    case 'phase':
      // Phase is not well-defined for total vector fields; fall back to magnitude
      return selectFieldMagnitudes(fieldData, fieldType);

    case 'instantaneous': {
      if (!vectors) return selectFieldMagnitudes(fieldData, fieldType);
      const cosP = Math.cos(animationPhase);
      const sinP = Math.sin(animationPhase);
      return vectors.map((v) => {
        const x = v.x.real * cosP - v.x.imag * sinP;
        const y = v.y.real * cosP - v.y.imag * sinP;
        const z = v.z.real * cosP - v.z.imag * sinP;
        return Math.sqrt(x * x + y * y + z * z);
      });
    }

    default:
      return selectFieldMagnitudes(fieldData, fieldType);
  }
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
  // Optional manual color range
  valueRangeMode?: 'auto' | 'manual';
  valueRangeMin?: number;
  valueRangeMax?: number;
  // Smoothing options
  smoothShading?: boolean;
  interpolationLevel?: 1 | 2 | 4 | 8;
  // 1D field line width (tube radius in mm, default 5)
  lineWidth?: number;
  // Display quantity for complex field data
  displayQuantity?: DisplayQuantity;
  // Animation phase in radians [0, 2π) for instantaneous display
  animationPhase?: number;
}

/**
 * Bilinear interpolation of a 2D grid of values.
 * Takes a grid of (rows × cols) values and returns a (newRows × newCols) upsampled grid.
 */
function bilinearInterpolate(values: number[], cols: number, rows: number, factor: number): {
  interpolated: number[];
  newCols: number;
  newRows: number;
} {
  if (factor <= 1 || values.length === 0) {
    return { interpolated: values, newCols: cols, newRows: rows };
  }

  const newCols = (cols - 1) * factor + 1;
  const newRows = (rows - 1) * factor + 1;
  const result = new Array(newCols * newRows);

  for (let j = 0; j < newRows; j++) {
    for (let i = 0; i < newCols; i++) {
      // Fractional position in original grid
      const srcX = i / factor;
      const srcY = j / factor;

      // Integer indices of surrounding cells
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, cols - 1);
      const y1 = Math.min(y0 + 1, rows - 1);

      // Fractional part
      const fx = srcX - x0;
      const fy = srcY - y0;

      // Bilinear interpolation
      const v00 = values[y0 * cols + x0] ?? 0;
      const v10 = values[y0 * cols + x1] ?? 0;
      const v01 = values[y1 * cols + x0] ?? 0;
      const v11 = values[y1 * cols + x1] ?? 0;

      result[j * newCols + i] =
        v00 * (1 - fx) * (1 - fy) +
        v10 * fx * (1 - fy) +
        v01 * (1 - fx) * fy +
        v11 * fx * fy;
    }
  }

  return { interpolated: result, newCols, newRows };
}

/**
 * Render a 2D plane field region
 */
function PlaneField({ field, opacity, colorMap, fieldData, fieldType, valueRangeMode, valueRangeMin, valueRangeMax, smoothShading, interpolationLevel, displayQuantity, animationPhase }: {
  field: FieldDefinition2D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
  fieldType: FieldType;
  valueRangeMode?: 'auto' | 'manual';
  valueRangeMin?: number;
  valueRangeMax?: number;
  smoothShading?: boolean;
  interpolationLevel?: 1 | 2 | 4 | 8;
  displayQuantity?: DisplayQuantity;
  animationPhase?: number;
}) {
  const { geometry, hasColors } = useMemo(() => {
    // Calculate segments from sampling (n points → n-1 segments)
    const samplingX = field.sampling?.x || 20;
    const samplingY = field.sampling?.y || 20;
    const factor = interpolationLevel ?? 1;

    // If interpolating, increase geometry resolution
    const effectiveSegX = factor > 1 ? (samplingX - 1) * factor : samplingX - 1;
    const effectiveSegY = factor > 1 ? (samplingY - 1) * factor : samplingY - 1;

    const geom = new THREE.PlaneGeometry(
      (field.dimensions?.width || 100) / 1000, // mm to meters
      (field.dimensions?.height || 100) / 1000, // mm to meters
      effectiveSegX,
      effectiveSegY
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
    let magnitudes = selectFieldDisplayValues(fieldData, fieldType, displayQuantity, animationPhase);
    if (magnitudes && magnitudes.length > 0) {
      // Apply bilinear interpolation if requested
      if (factor > 1) {
        const { interpolated } = bilinearInterpolate(magnitudes, samplingX, samplingY, factor);
        magnitudes = interpolated;
      }

      // Use manual range if specified, otherwise auto
      const minVal = valueRangeMode === 'manual' ? valueRangeMin : undefined;
      const maxVal = valueRangeMode === 'manual' ? valueRangeMax : undefined;
      const colorArray = createColorArray(magnitudes, colorMap, minVal, maxVal);
      geom.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
      hasColors = true;

      // Compute smooth normals if smooth shading is enabled
      if (smoothShading) {
        geom.computeVertexNormals();
      }
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData, fieldType, valueRangeMode, valueRangeMin, valueRangeMax, smoothShading, interpolationLevel, displayQuantity, animationPhase]);

  const position = useMemo(() => {
    return new THREE.Vector3(
      field.centerPoint[0] / 1000, // mm to meters
      field.centerPoint[1] / 1000,
      field.centerPoint[2] / 1000
    );
  }, [field.centerPoint]);

  return (
    <mesh geometry={geometry} position={position}>
      {smoothShading && hasColors ? (
        <meshLambertMaterial
          color="#ffffff"
          emissive="#444444"
          transparent
          opacity={opacity / 100}
          side={THREE.DoubleSide}
          vertexColors
        />
      ) : (
        <meshBasicMaterial
          color={hasColors ? "#ffffff" : "#4488ff"}
          transparent
          opacity={opacity / 100}
          side={THREE.DoubleSide}
          wireframe={!hasColors}
          vertexColors={hasColors}
        />
      )}
    </mesh>
  );
}

/**
 * Render a 2D elliptical field region
 */
function EllipseField({ field, opacity, colorMap, fieldData, fieldType, valueRangeMode, valueRangeMin, valueRangeMax, smoothShading, displayQuantity, animationPhase }: {
  field: FieldDefinition2D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
  fieldType: FieldType;
  valueRangeMode?: 'auto' | 'manual';
  valueRangeMin?: number;
  valueRangeMax?: number;
  smoothShading?: boolean;
  displayQuantity?: DisplayQuantity;
  animationPhase?: number;
}) {
  const { geometry, hasColors } = useMemo(() => {
    const radiusA = (field.radiusA || 50) / 1000; // mm to meters
    const radiusB = (field.radiusB || 50) / 1000;
    const segments = (field.sampling?.x || 32) - 1;

    // Get axis directions
    const axis1 = field.axis1 ?? [1, 0, 0];
    const axis2 = field.axis2 ?? [0, 1, 0];

    // Build ellipse geometry manually
    const geom = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];

    // Center vertex
    vertices.push(0, 0, 0);

    // Perimeter vertices
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const x = radiusA * Math.cos(theta);
      const y = radiusB * Math.sin(theta);
      vertices.push(
        x * axis1[0] + y * axis2[0],
        x * axis1[1] + y * axis2[1],
        x * axis1[2] + y * axis2[2],
      );
    }

    // Triangle fan from center
    for (let i = 1; i <= segments; i++) {
      indices.push(0, i, i + 1);
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    // Apply vertex colors if field data is available
    let hasColors = false;
    const magnitudes = selectFieldDisplayValues(fieldData, fieldType, displayQuantity, animationPhase);
    if (magnitudes && magnitudes.length > 0) {
      const minVal = valueRangeMode === 'manual' ? valueRangeMin : undefined;
      const maxVal = valueRangeMode === 'manual' ? valueRangeMax : undefined;
      const colorArray = createColorArray(magnitudes, colorMap, minVal, maxVal);
      geom.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
      hasColors = true;
      if (smoothShading) geom.computeVertexNormals();
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData, fieldType, valueRangeMode, valueRangeMin, valueRangeMax, smoothShading, displayQuantity, animationPhase]);

  const position = useMemo(() => {
    return new THREE.Vector3(
      field.centerPoint[0] / 1000,
      field.centerPoint[1] / 1000,
      field.centerPoint[2] / 1000
    );
  }, [field.centerPoint]);

  return (
    <mesh geometry={geometry} position={position}>
      {smoothShading && hasColors ? (
        <meshLambertMaterial
          color="#ffffff"
          emissive="#444444"
          transparent
          opacity={opacity / 100}
          side={THREE.DoubleSide}
          vertexColors
        />
      ) : (
        <meshBasicMaterial
          color={hasColors ? "#ffffff" : "#44ff88"}
          transparent
          opacity={opacity / 100}
          side={THREE.DoubleSide}
          wireframe={!hasColors}
          vertexColors={hasColors}
        />
      )}
    </mesh>
  );
}

/**
 * Render a 3D spherical field region
 */
function SphereField({ field, opacity, colorMap, fieldData, fieldType, valueRangeMode, valueRangeMin, valueRangeMax, smoothShading, displayQuantity, animationPhase }: {
  field: FieldDefinition3D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
  fieldType: FieldType;
  valueRangeMode?: 'auto' | 'manual';
  valueRangeMin?: number;
  valueRangeMax?: number;
  smoothShading?: boolean;
  displayQuantity?: DisplayQuantity;
  animationPhase?: number;
}) {
  const { geometry, hasColors } = useMemo(() => {
    const radius = field.sphereRadius || 50;
    const sampling = field.sampling as { theta?: number; phi?: number; radial?: number };
    const widthSegments = sampling.phi || 20;
    const heightSegments = sampling.theta || 10;

    const geom = new THREE.SphereGeometry(
      radius / 1000, // mm to meters
      widthSegments,
      heightSegments
    );

    // Apply vertex colors if field data is available
    let hasColors = false;
    const magnitudes = selectFieldDisplayValues(fieldData, fieldType, displayQuantity, animationPhase);
    if (magnitudes && magnitudes.length > 0) {
      // Use manual range if specified, otherwise auto
      const minVal = valueRangeMode === 'manual' ? valueRangeMin : undefined;
      const maxVal = valueRangeMode === 'manual' ? valueRangeMax : undefined;
      const colorArray = createColorArray(magnitudes, colorMap, minVal, maxVal);
      geom.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
      hasColors = true;
      if (smoothShading) geom.computeVertexNormals();
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData, fieldType, valueRangeMode, valueRangeMin, valueRangeMax, smoothShading, displayQuantity, animationPhase]);

  const position = useMemo(() => {
    return new THREE.Vector3(
      field.centerPoint[0] / 1000,
      field.centerPoint[1] / 1000,
      field.centerPoint[2] / 1000
    );
  }, [field.centerPoint]);

  return (
    <mesh geometry={geometry} position={position}>
      {smoothShading && hasColors ? (
        <meshLambertMaterial
          color="#ffffff"
          emissive="#444444"
          transparent
          opacity={opacity / 100}
          vertexColors
        />
      ) : (
        <meshBasicMaterial
          color={hasColors ? "#ffffff" : "#ff8844"}
          transparent
          opacity={opacity / 100}
          wireframe={!hasColors}
          vertexColors={hasColors}
        />
      )}
    </mesh>
  );
}

/**
 * Render a 3D cuboid field region
 */
function CuboidField({ field, opacity, colorMap, fieldData, fieldType, valueRangeMode, valueRangeMin, valueRangeMax, smoothShading, displayQuantity, animationPhase }: {
  field: FieldDefinition3D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
  fieldType: FieldType;
  valueRangeMode?: 'auto' | 'manual';
  valueRangeMin?: number;
  valueRangeMax?: number;
  smoothShading?: boolean;
  displayQuantity?: DisplayQuantity;
  animationPhase?: number;
}) {
  const { geometry, hasColors } = useMemo(() => {
    const dims = field.cuboidDimensions || { Lx: 100, Ly: 100, Lz: 100 };
    // Use sampling to determine segments (n points → n-1 segments)
    const sampling = field.sampling as { Nx?: number; Ny?: number; Nz?: number };
    const segmentsX = (sampling.Nx || 10) - 1;
    const segmentsY = (sampling.Ny || 10) - 1;
    const segmentsZ = (sampling.Nz || 10) - 1;

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
    const magnitudes = selectFieldDisplayValues(fieldData, fieldType, displayQuantity, animationPhase);
    if (magnitudes && magnitudes.length > 0) {
      // Use manual range if specified, otherwise auto
      const minVal = valueRangeMode === 'manual' ? valueRangeMin : undefined;
      const maxVal = valueRangeMode === 'manual' ? valueRangeMax : undefined;
      const colorArray = createColorArray(magnitudes, colorMap, minVal, maxVal);
      geom.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
      hasColors = true;
      if (smoothShading) geom.computeVertexNormals();
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData, fieldType, valueRangeMode, valueRangeMin, valueRangeMax, smoothShading, displayQuantity, animationPhase]);

  const position = useMemo(() => {
    return new THREE.Vector3(
      field.centerPoint[0] / 1000,
      field.centerPoint[1] / 1000,
      field.centerPoint[2] / 1000
    );
  }, [field.centerPoint]);

  return (
    <mesh geometry={geometry} position={position}>
      {smoothShading && hasColors ? (
        <meshLambertMaterial
          color="#ffffff"
          emissive="#444444"
          transparent
          opacity={opacity / 100}
          vertexColors
        />
      ) : (
        <meshBasicMaterial
          color={hasColors ? "#ffffff" : "#ff44aa"}
          transparent
          opacity={opacity / 100}
          wireframe={!hasColors}
          vertexColors={hasColors}
        />
      )}
    </mesh>
  );
}

/**
 * Render a 1D line field region as a colored tube
 */
function LineField({ field, opacity, colorMap, fieldData, fieldType, valueRangeMode, valueRangeMin, valueRangeMax, lineWidth, displayQuantity, animationPhase }: {
  field: FieldDefinition1D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
  fieldType: FieldType;
  valueRangeMode?: 'auto' | 'manual';
  valueRangeMin?: number;
  valueRangeMax?: number;
  lineWidth?: number;
  displayQuantity?: DisplayQuantity;
  animationPhase?: number;
}) {
  const { geometry, hasColors } = useMemo(() => {
    // Get start and end points (in mm, convert to meters)
    const startPt = field.startPoint ?? [0, 0, 0];
    const endPt = field.endPoint ?? [100, 0, 0];
    const start = new THREE.Vector3(startPt[0] / 1000, startPt[1] / 1000, startPt[2] / 1000);
    const end = new THREE.Vector3(endPt[0] / 1000, endPt[1] / 1000, endPt[2] / 1000);

    // Create a path from start to end
    const path = new THREE.LineCurve3(start, end);

    // Tube radius in meters (lineWidth is in mm, default 5mm)
    const radius = (lineWidth ?? 5) / 1000;

    // Number of segments along the tube matches the field points
    const numPoints = field.numPoints ?? 10;
    const tubularSegments = Math.max(numPoints - 1, 1);
    const radialSegments = 8;

    const geom = new THREE.TubeGeometry(path, tubularSegments, radius, radialSegments, false);

    // Apply vertex colors if field data is available
    let hasColors = false;
    const magnitudes = selectFieldDisplayValues(fieldData, fieldType, displayQuantity, animationPhase);
    if (magnitudes && magnitudes.length > 0) {
      const minVal = valueRangeMode === 'manual' ? valueRangeMin : undefined;
      const maxVal = valueRangeMode === 'manual' ? valueRangeMax : undefined;

      // Map magnitudes to tube vertices
      // TubeGeometry has (tubularSegments + 1) rings × (radialSegments + 1) vertices per ring
      const posAttr = geom.getAttribute('position');
      const numVertices = posAttr.count;
      const colors = new Float32Array(numVertices * 3);

      // Create color lookup from magnitudes
      const minMag = minVal ?? arrayMin(magnitudes);
      const maxMag = maxVal ?? arrayMax(magnitudes);
      const range = maxMag - minMag || 1;

      // Get color map function
      const colorArray = createColorArray(magnitudes, colorMap, minVal, maxVal);

      // Each ring of vertices corresponds to a point along the tube
      const verticesPerRing = radialSegments + 1;
      for (let i = 0; i <= tubularSegments; i++) {
        // Map tube segment index to magnitude index
        const magIdx = Math.min(i, magnitudes.length - 1);
        const r = colorArray[magIdx * 3];
        const g = colorArray[magIdx * 3 + 1];
        const b = colorArray[magIdx * 3 + 2];

        // Apply same color to all vertices in this ring
        for (let j = 0; j < verticesPerRing; j++) {
          const vertIdx = i * verticesPerRing + j;
          if (vertIdx < numVertices) {
            colors[vertIdx * 3] = r;
            colors[vertIdx * 3 + 1] = g;
            colors[vertIdx * 3 + 2] = b;
          }
        }
      }

      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      hasColors = true;
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData, fieldType, valueRangeMode, valueRangeMin, valueRangeMax, lineWidth, displayQuantity, animationPhase]);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color={hasColors ? "#ffffff" : "#44aaff"}
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
 * Render a 1D arc field region as a colored tube
 */
function ArcField({ field, opacity, colorMap, fieldData, fieldType, valueRangeMode, valueRangeMin, valueRangeMax, lineWidth, displayQuantity, animationPhase }: {
  field: FieldDefinition1D;
  opacity: number;
  colorMap: ColorMapType;
  fieldData?: FieldVisualizationProps['fieldData'];
  fieldType: FieldType;
  valueRangeMode?: 'auto' | 'manual';
  valueRangeMin?: number;
  valueRangeMax?: number;
  lineWidth?: number;
  displayQuantity?: DisplayQuantity;
  animationPhase?: number;
}) {
  const { geometry, hasColors } = useMemo(() => {
    // Get center point (in mm, convert to meters)
    const centerPt = field.centerPoint ?? [0, 0, 0];
    const center = new THREE.Vector3(centerPt[0] / 1000, centerPt[1] / 1000, centerPt[2] / 1000);

    // Get radii (in mm, convert to meters)
    const radiusA = (field.radiusA ?? 100) / 1000;
    const radiusB = (field.radiusB ?? 100) / 1000;

    // Get axis directions (use preset or custom)
    let axis1: [number, number, number];
    let axis2: [number, number, number];
    if (field.normalPreset && field.normalPreset !== 'Custom') {
      const axes = getEllipseAxesFromPreset(field.normalPreset);
      axis1 = axes.axis1;
      axis2 = axes.axis2;
    } else {
      axis1 = (field.axis1 ?? [1, 0, 0]) as [number, number, number];
      axis2 = (field.axis2 ?? [0, 1, 0]) as [number, number, number];
    }

    // Convert angles from degrees to radians
    const startAngle = ((field.startAngle ?? 0) * Math.PI) / 180;
    const endAngle = ((field.endAngle ?? 360) * Math.PI) / 180;

    // Number of segments along the arc
    const numPoints = field.numPoints ?? 20;

    // Create arc path as a CatmullRomCurve3 through calculated points
    const curvePoints: THREE.Vector3[] = [];
    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      const theta = startAngle + t * (endAngle - startAngle);
      const x = radiusA * Math.cos(theta) * axis1[0] + radiusB * Math.sin(theta) * axis2[0];
      const y = radiusA * Math.cos(theta) * axis1[1] + radiusB * Math.sin(theta) * axis2[1];
      const z = radiusA * Math.cos(theta) * axis1[2] + radiusB * Math.sin(theta) * axis2[2];
      curvePoints.push(new THREE.Vector3(x + center.x, y + center.y, z + center.z));
    }

    const path = new THREE.CatmullRomCurve3(curvePoints, false);

    // Tube radius in meters (lineWidth is in mm, default 5mm)
    const tubeRadius = (lineWidth ?? 5) / 1000;
    const tubularSegments = Math.max(numPoints - 1, 1);
    const radialSegments = 8;

    const geom = new THREE.TubeGeometry(path, tubularSegments, tubeRadius, radialSegments, false);

    // Apply vertex colors if field data is available
    let hasColors = false;
    const magnitudes = selectFieldDisplayValues(fieldData, fieldType, displayQuantity, animationPhase);
    if (magnitudes && magnitudes.length > 0) {
      const minVal = valueRangeMode === 'manual' ? valueRangeMin : undefined;
      const maxVal = valueRangeMode === 'manual' ? valueRangeMax : undefined;

      // Map magnitudes to tube vertices
      const posAttr = geom.getAttribute('position');
      const numVertices = posAttr.count;
      const colors = new Float32Array(numVertices * 3);

      // Create color lookup from magnitudes
      const colorArray = createColorArray(magnitudes, colorMap, minVal, maxVal);

      // Each ring of vertices corresponds to a point along the tube
      const verticesPerRing = radialSegments + 1;
      for (let i = 0; i <= tubularSegments; i++) {
        // Map tube segment index to magnitude index
        const magIdx = Math.min(i, magnitudes.length - 1);
        const r = colorArray[magIdx * 3];
        const g = colorArray[magIdx * 3 + 1];
        const b = colorArray[magIdx * 3 + 2];

        // Apply same color to all vertices in this ring
        for (let j = 0; j < verticesPerRing; j++) {
          const vertIdx = i * verticesPerRing + j;
          if (vertIdx < numVertices) {
            colors[vertIdx * 3] = r;
            colors[vertIdx * 3 + 1] = g;
            colors[vertIdx * 3 + 2] = b;
          }
        }
      }

      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      hasColors = true;
    }

    return { geometry: geom, hasColors };
  }, [field, colorMap, fieldData, fieldType, valueRangeMode, valueRangeMin, valueRangeMax, lineWidth, displayQuantity, animationPhase]);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color={hasColors ? "#ffffff" : "#44aaff"}
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
 * Main FieldVisualization component
 * Routes to the appropriate shape renderer based on field definition
 */
function FieldVisualization({
  field,
  opacity,
  colorMap,
  fieldData,
  valueRangeMode,
  valueRangeMin,
  valueRangeMax,
  smoothShading,
  interpolationLevel,
  lineWidth,
  displayQuantity,
  animationPhase,
}: FieldVisualizationProps) {
  const fieldType = field.fieldType;
  const smooth = smoothShading ?? false;
  const interp = interpolationLevel ?? 2;
  const dq = displayQuantity ?? 'magnitude';
  const ap = animationPhase ?? 0;
  // Route to appropriate renderer based on field shape
  // Type narrowing happens automatically based on shape
  if (field.type === '1D') {
    if (field.shape === 'line') {
      return <LineField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} fieldType={fieldType} valueRangeMode={valueRangeMode} valueRangeMin={valueRangeMin} valueRangeMax={valueRangeMax} lineWidth={lineWidth} displayQuantity={dq} animationPhase={ap} />;
    } else if (field.shape === 'arc') {
      return <ArcField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} fieldType={fieldType} valueRangeMode={valueRangeMode} valueRangeMin={valueRangeMin} valueRangeMax={valueRangeMax} lineWidth={lineWidth} displayQuantity={dq} animationPhase={ap} />;
    }
  } else if (field.type === '2D') {
    if (field.shape === 'plane') {
      return <PlaneField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} fieldType={fieldType} valueRangeMode={valueRangeMode} valueRangeMin={valueRangeMin} valueRangeMax={valueRangeMax} smoothShading={smooth} interpolationLevel={interp} displayQuantity={dq} animationPhase={ap} />;
    } else if (field.shape === 'ellipse') {
      return <EllipseField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} fieldType={fieldType} valueRangeMode={valueRangeMode} valueRangeMin={valueRangeMin} valueRangeMax={valueRangeMax} smoothShading={smooth} displayQuantity={dq} animationPhase={ap} />;
    }
  } else if (field.type === '3D') {
    if (field.shape === 'sphere') {
      return <SphereField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} fieldType={fieldType} valueRangeMode={valueRangeMode} valueRangeMin={valueRangeMin} valueRangeMax={valueRangeMax} smoothShading={smooth} displayQuantity={dq} animationPhase={ap} />;
    } else if (field.shape === 'cuboid') {
      return <CuboidField field={field} opacity={opacity} colorMap={colorMap} fieldData={fieldData} fieldType={fieldType} valueRangeMode={valueRangeMode} valueRangeMin={valueRangeMin} valueRangeMax={valueRangeMax} smoothShading={smooth} displayQuantity={dq} animationPhase={ap} />;
    }
  }

  return null;
}

export default FieldVisualization;
