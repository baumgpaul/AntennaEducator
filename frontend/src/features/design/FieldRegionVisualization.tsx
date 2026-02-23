import { useMemo } from 'react';
import * as THREE from 'three';
import type { FieldDefinition } from '@/types/fieldDefinitions';

/**
 * FieldRegionVisualization - Renders 3D field regions in the scene
 *
 * Supports:
 * - 2D Plane: Wireframe rectangle with semi-transparent fill
 * - 2D Ellipse: Wireframe ellipse with semi-transparent disk
 * - 3D Sphere: Wireframe sphere with semi-transparent surface
 * - 3D Cuboid: Wireframe box with semi-transparent faces
 *
 * Features:
 * - Color-coded by field index (5-color palette cycling)
 * - Adjustable opacity
 * - Selection highlighting (brighter, glow effect)
 */

// 5-color palette for field regions
const FIELD_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#FFE66D', // Yellow
  '#95E1D3', // Mint
  '#A8E6CF', // Light Green
];

interface FieldRegionVisualizationProps {
  fieldDefinitions: FieldDefinition[];
  selectedFieldId?: string;
  visible?: boolean;
}

/**
 * Get color for a field based on its index
 */
function getFieldColor(index: number): string {
  return FIELD_COLORS[index % FIELD_COLORS.length];
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

/**
 * Component for rendering a single 2D plane field region
 */
function PlaneRegion({
  field,
  color,
  opacity,
  isSelected,
}: {
  field: FieldDefinition;
  color: string;
  opacity: number;
  isSelected: boolean;
}) {
  console.log('[PlaneRegion] Rendering with field:', {
    type: field.type,
    shape: field.shape,
    centerPoint: field.centerPoint,
    dimensions: field.type === '2D' ? field.dimensions : undefined,
    normalPreset: field.type === '2D' ? field.normalPreset : undefined,
    normalVector: field.type === '2D' ? field.normalVector : undefined,
    fullField: field
  });

  // Convert dimensions from mm to meters (safe defaults for non-2D types)
  const width = field.type === '2D' ? ((field.dimensions?.width ?? 100) / 1000) : 0.1;
  const height = field.type === '2D' ? ((field.dimensions?.height ?? 100) / 1000) : 0.1;
  // Convert center point from mm to meters
  const [cx, cy, cz] = [field.centerPoint[0] / 1000, field.centerPoint[1] / 1000, field.centerPoint[2] / 1000];

  // Get normal vector
  const normal: [number, number, number] = field.type === '2D'
    ? (field.normalPreset && field.normalPreset !== 'Custom'
      ? getNormalFromPreset(field.normalPreset)
      : (field.normalVector ?? [0, 0, 1]) as [number, number, number])
    : [0, 0, 1];

  // Create plane geometry
  const planeGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(width, height);

    // Rotate plane to match normal vector
    const quaternion = new THREE.Quaternion();
    const targetNormal = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    quaternion.setFromUnitVectors(defaultNormal, targetNormal);
    geometry.applyQuaternion(quaternion);

    return geometry;
  }, [width, height, normal]);

  // Create edges for wireframe
  const edgesGeometry = useMemo(() => {
    return new THREE.EdgesGeometry(planeGeometry);
  }, [planeGeometry]);

  if (field.type !== '2D' || field.shape !== 'plane') {
    console.log('[PlaneRegion] Type or shape mismatch, returning null');
    return null;
  }

  console.log('[PlaneRegion] Calculated values:', { width, height, cx, cy, cz });
  console.log('[PlaneRegion] Normal vector:', normal);

  const finalOpacity = isSelected ? Math.min(opacity * 1.5, 1) : opacity;
  const lineColor = isSelected ? '#FFFFFF' : color;

  return (
    <group position={[cx, cy, cz]}>
      {/* Wireframe outline */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={lineColor} linewidth={isSelected ? 3 : 2} />
      </lineSegments>

      {/* Semi-transparent fill */}
      <mesh geometry={planeGeometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={finalOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Selection glow effect */}
      {isSelected && (
        <mesh geometry={planeGeometry}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.2}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * Component for rendering a single 2D ellipse field region
 */
function EllipseRegion({
  field,
  color,
  opacity,
  isSelected,
}: {
  field: FieldDefinition;
  color: string;
  opacity: number;
  isSelected: boolean;
}) {
  if (field.type !== '2D' || field.shape !== 'ellipse') return null;

  // Convert radii from mm to meters
  const radiusA = (field.radiusA ?? 50) / 1000;
  const radiusB = (field.radiusB ?? 50) / 1000;
  // Convert center point from mm to meters
  const [cx, cy, cz] = [field.centerPoint[0] / 1000, field.centerPoint[1] / 1000, field.centerPoint[2] / 1000];

  // Get axis directions
  const axis1: [number, number, number] = (field.axis1 ?? [1, 0, 0]) as [number, number, number];
  const axis2: [number, number, number] = (field.axis2 ?? [0, 1, 0]) as [number, number, number];

  // Create ellipse geometry using a custom shape
  const ellipseGeometry = useMemo(() => {
    // Create a circle geometry with radius 1 and scale to ellipse
    const segments = 48;
    const geometry = new THREE.BufferGeometry();
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

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [radiusA, radiusB, axis1, axis2]);

  // Create edge ring for wireframe
  const edgesGeometry = useMemo(() => {
    const segments = 48;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const x = radiusA * Math.cos(theta);
      const y = radiusB * Math.sin(theta);
      points.push(
        new THREE.Vector3(
          x * axis1[0] + y * axis2[0],
          x * axis1[1] + y * axis2[1],
          x * axis1[2] + y * axis2[2],
        ),
      );
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [radiusA, radiusB, axis1, axis2]);

  const finalOpacity = isSelected ? Math.min(opacity * 1.5, 1) : opacity;
  const lineColor = isSelected ? '#FFFFFF' : color;

  return (
    <group position={[cx, cy, cz]}>
      {/* Wireframe outline */}
      <lineLoop geometry={edgesGeometry}>
        <lineBasicMaterial color={lineColor} linewidth={isSelected ? 3 : 2} />
      </lineLoop>

      {/* Semi-transparent fill */}
      <mesh geometry={ellipseGeometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={finalOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Selection glow effect */}
      {isSelected && (
        <mesh geometry={ellipseGeometry}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.2}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * Component for rendering a 1D line field region
 */
function LineRegion({
  field,
  color,
  opacity,
  isSelected,
}: {
  field: FieldDefinition;
  color: string;
  opacity: number;
  isSelected: boolean;
}) {
  if (field.type !== '1D' || field.shape !== 'line') return null;

  // Convert start/end points from mm to meters
  const startPt = field.startPoint ?? [0, 0, 0];
  const endPt = field.endPoint ?? [100, 0, 0];
  const start: [number, number, number] = [startPt[0] / 1000, startPt[1] / 1000, startPt[2] / 1000];
  const end: [number, number, number] = [endPt[0] / 1000, endPt[1] / 1000, endPt[2] / 1000];

  const lineColor = isSelected ? '#FFFFFF' : color;

  // Create line object (using THREE.Line with primitive to avoid SVG conflicts)
  const lineObject = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([...start, ...end]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({ color: lineColor });
    return new THREE.Line(geometry, material);
  }, [start, end, lineColor]);

  // Create spheres at endpoints
  const sphereGeometry = useMemo(() => {
    // Sphere radius proportional to line length
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return new THREE.SphereGeometry(length * 0.02, 8, 8);
  }, [start, end]);

  const finalOpacity = isSelected ? Math.min(opacity * 1.5, 1) : opacity;

  return (
    <group>
      {/* Line segment */}
      <primitive object={lineObject} />

      {/* Start point sphere */}
      <mesh position={start} geometry={sphereGeometry}>
        <meshBasicMaterial color={color} transparent opacity={finalOpacity} />
      </mesh>

      {/* End point sphere */}
      <mesh position={end} geometry={sphereGeometry}>
        <meshBasicMaterial color={color} transparent opacity={finalOpacity} />
      </mesh>

      {/* Selection glow */}
      {isSelected && (
        <>
          <mesh position={start} geometry={sphereGeometry}>
            <meshBasicMaterial color={color} transparent opacity={0.3} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh position={end} geometry={sphereGeometry}>
            <meshBasicMaterial color={color} transparent opacity={0.3} blending={THREE.AdditiveBlending} />
          </mesh>
        </>
      )}
    </group>
  );
}

/**
 * Component for rendering a 1D elliptical arc field region
 */
function ArcRegion({
  field,
  color,
  opacity,
  isSelected,
}: {
  field: FieldDefinition;
  color: string;
  opacity: number;
  isSelected: boolean;
}) {
  if (field.type !== '1D' || field.shape !== 'arc') return null;

  // Convert center point from mm to meters
  const centerPt = field.centerPoint ?? [0, 0, 0];
  const center: [number, number, number] = [centerPt[0] / 1000, centerPt[1] / 1000, centerPt[2] / 1000];

  // Convert radii from mm to meters
  const radiusA = (field.radiusA ?? 100) / 1000;
  const radiusB = (field.radiusB ?? 100) / 1000;

  // Get axis directions
  const axis1: [number, number, number] = (field.axis1 ?? [1, 0, 0]) as [number, number, number];
  const axis2: [number, number, number] = (field.axis2 ?? [0, 1, 0]) as [number, number, number];

  // Convert angles from degrees to radians
  const startAngle = ((field.startAngle ?? 0) * Math.PI) / 180;
  const endAngle = ((field.endAngle ?? 360) * Math.PI) / 180;

  const lineColor = isSelected ? '#FFFFFF' : color;

  // Create arc line object (using THREE.Line with primitive to avoid SVG conflicts)
  const arcLineObject = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const segments = 64;
    const vertices: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const theta = startAngle + t * (endAngle - startAngle);
      const x = radiusA * Math.cos(theta) * axis1[0] + radiusB * Math.sin(theta) * axis2[0];
      const y = radiusA * Math.cos(theta) * axis1[1] + radiusB * Math.sin(theta) * axis2[1];
      const z = radiusA * Math.cos(theta) * axis1[2] + radiusB * Math.sin(theta) * axis2[2];
      vertices.push(x, y, z);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    const material = new THREE.LineBasicMaterial({ color: lineColor });
    return new THREE.Line(geometry, material);
  }, [radiusA, radiusB, axis1, axis2, startAngle, endAngle, lineColor]);

  // Create spheres at endpoints
  const sphereGeometry = useMemo(() => {
    // Sphere radius proportional to arc size
    return new THREE.SphereGeometry(Math.max(radiusA, radiusB) * 0.03, 8, 8);
  }, [radiusA, radiusB]);

  // Calculate endpoint positions
  const startPos: [number, number, number] = useMemo(() => {
    const x = radiusA * Math.cos(startAngle) * axis1[0] + radiusB * Math.sin(startAngle) * axis2[0];
    const y = radiusA * Math.cos(startAngle) * axis1[1] + radiusB * Math.sin(startAngle) * axis2[1];
    const z = radiusA * Math.cos(startAngle) * axis1[2] + radiusB * Math.sin(startAngle) * axis2[2];
    return [x, y, z];
  }, [radiusA, radiusB, axis1, axis2, startAngle]);

  const endPos: [number, number, number] = useMemo(() => {
    const x = radiusA * Math.cos(endAngle) * axis1[0] + radiusB * Math.sin(endAngle) * axis2[0];
    const y = radiusA * Math.cos(endAngle) * axis1[1] + radiusB * Math.sin(endAngle) * axis2[1];
    const z = radiusA * Math.cos(endAngle) * axis1[2] + radiusB * Math.sin(endAngle) * axis2[2];
    return [x, y, z];
  }, [radiusA, radiusB, axis1, axis2, endAngle]);

  const finalOpacity = isSelected ? Math.min(opacity * 1.5, 1) : opacity;

  return (
    <group position={center}>
      {/* Arc line */}
      <primitive object={arcLineObject} />

      {/* Start point sphere */}
      <mesh position={startPos} geometry={sphereGeometry}>
        <meshBasicMaterial color={color} transparent opacity={finalOpacity} />
      </mesh>

      {/* End point sphere */}
      <mesh position={endPos} geometry={sphereGeometry}>
        <meshBasicMaterial color={color} transparent opacity={finalOpacity} />
      </mesh>

      {/* Selection glow */}
      {isSelected && (
        <>
          <mesh position={startPos} geometry={sphereGeometry}>
            <meshBasicMaterial color={color} transparent opacity={0.3} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh position={endPos} geometry={sphereGeometry}>
            <meshBasicMaterial color={color} transparent opacity={0.3} blending={THREE.AdditiveBlending} />
          </mesh>
        </>
      )}
    </group>
  );
}

/**
 * Component for rendering a single 3D sphere field region
 */
function SphereRegion({
  field,
  color,
  opacity,
  isSelected,
}: {
  field: FieldDefinition;
  color: string;
  opacity: number;
  isSelected: boolean;
}) {
  // Convert radius from mm to meters (safe default for non-3D types)
  const radius = field.type === '3D' ? ((field.sphereRadius ?? 50) / 1000) : 0.05;
  // Convert center point from mm to meters
  const [cx, cy, cz] = [field.centerPoint[0] / 1000, field.centerPoint[1] / 1000, field.centerPoint[2] / 1000];

  // Create sphere geometry with wireframe segments
  const sphereGeometry = useMemo(() => {
    return new THREE.SphereGeometry(radius, 16, 16);
  }, [radius]);

  const wireframeGeometry = useMemo(() => {
    return new THREE.WireframeGeometry(sphereGeometry);
  }, [sphereGeometry]);

  if (field.type !== '3D' || field.shape !== 'sphere') return null;

  const finalOpacity = isSelected ? Math.min(opacity * 1.5, 1) : opacity;
  const lineColor = isSelected ? '#FFFFFF' : color;

  return (
    <group position={[cx, cy, cz]}>
      {/* Wireframe */}
      <lineSegments geometry={wireframeGeometry}>
        <lineBasicMaterial color={lineColor} linewidth={isSelected ? 2 : 1} />
      </lineSegments>

      {/* Semi-transparent surface */}
      <mesh geometry={sphereGeometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={finalOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Selection glow effect */}
      {isSelected && (
        <mesh geometry={sphereGeometry}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.2}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * Component for rendering a single 3D cuboid field region
 */
function CuboidRegion({
  field,
  color,
  opacity,
  isSelected,
}: {
  field: FieldDefinition;
  color: string;
  opacity: number;
  isSelected: boolean;
}) {
  // Convert dimensions from mm to meters (safe defaults for non-3D types)
  const Lx = field.type === '3D' ? ((field.cuboidDimensions?.Lx ?? 100) / 1000) : 0.1;
  const Ly = field.type === '3D' ? ((field.cuboidDimensions?.Ly ?? 100) / 1000) : 0.1;
  const Lz = field.type === '3D' ? ((field.cuboidDimensions?.Lz ?? 100) / 1000) : 0.1;
  // Convert center point from mm to meters
  const [cx, cy, cz] = [field.centerPoint[0] / 1000, field.centerPoint[1] / 1000, field.centerPoint[2] / 1000];

  // Create box geometry
  const boxGeometry = useMemo(() => {
    return new THREE.BoxGeometry(Lx, Ly, Lz);
  }, [Lx, Ly, Lz]);

  const wireframeGeometry = useMemo(() => {
    return new THREE.WireframeGeometry(boxGeometry);
  }, [boxGeometry]);

  if (field.type !== '3D' || field.shape !== 'cuboid') return null;

  const finalOpacity = isSelected ? Math.min(opacity * 1.5, 1) : opacity;
  const lineColor = isSelected ? '#FFFFFF' : color;

  return (
    <group position={[cx, cy, cz]}>
      {/* Wireframe */}
      <lineSegments geometry={wireframeGeometry}>
        <lineBasicMaterial color={lineColor} linewidth={isSelected ? 2 : 1} />
      </lineSegments>

      {/* Semi-transparent box */}
      <mesh geometry={boxGeometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={finalOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Selection glow effect */}
      {isSelected && (
        <mesh geometry={boxGeometry}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.2}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * Main FieldRegionVisualization component
 * Renders all field definitions in the scene
 */
export function FieldRegionVisualization({
  fieldDefinitions,
  selectedFieldId,
  visible = true,
}: FieldRegionVisualizationProps) {
  console.log('[FieldRegionVisualization] Rendering with:', {
    fieldCount: fieldDefinitions.length,
    visible,
    selectedFieldId,
    fields: fieldDefinitions
  });

  if (!visible || fieldDefinitions.length === 0) {
    console.log('[FieldRegionVisualization] Not rendering - visible:', visible, 'count:', fieldDefinitions.length);
    return null;
  }

  return (
    <group name="field-regions">
      {fieldDefinitions.map((field, index) => {
        // Skip rendering if this specific field is hidden
        if (field.visible === false) {
          console.log('[FieldRegionVisualization] Skipping hidden field:', field.id);
          return null;
        }

        const color = getFieldColor(index);
        const isSelected = field.id === selectedFieldId;
        const regionOpacity = field.opacity ?? 0.3;

        console.log('[FieldRegionVisualization] Rendering field:', {
          index,
          id: field.id,
          type: field.type,
          shape: field.shape,
          color,
          isSelected,
          visible: field.visible
        });

        // Render based on field type and shape
        if (field.type === '2D') {
          if (field.shape === 'plane') {
            return (
              <PlaneRegion
                key={field.id}
                field={field}
                color={color}
                opacity={regionOpacity}
                isSelected={isSelected}
              />
            );
          } else if (field.shape === 'ellipse') {
            return (
              <EllipseRegion
                key={field.id}
                field={field}
                color={color}
                opacity={regionOpacity}
                isSelected={isSelected}
              />
            );
          }
        } else if (field.type === '3D') {
          if (field.shape === 'sphere') {
            return (
              <SphereRegion
                key={field.id}
                field={field}
                color={color}
                opacity={regionOpacity}
                isSelected={isSelected}
              />
            );
          } else if (field.shape === 'cuboid') {
            return (
              <CuboidRegion
                key={field.id}
                field={field}
                color={color}
                opacity={regionOpacity}
                isSelected={isSelected}
              />
            );
          }
        } else if (field.type === '1D') {
          if (field.shape === 'line') {
            return (
              <LineRegion
                key={field.id}
                field={field}
                color={color}
                opacity={regionOpacity}
                isSelected={isSelected}
              />
            );
          } else if (field.shape === 'arc') {
            return (
              <ArcRegion
                key={field.id}
                field={field}
                color={color}
                opacity={regionOpacity}
                isSelected={isSelected}
              />
            );
          }
        }

        return null;
      })}
    </group>
  );
}
