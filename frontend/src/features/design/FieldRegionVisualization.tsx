import { useMemo } from 'react';
import * as THREE from 'three';
import type { FieldDefinition } from '@/types/fieldDefinitions';

/**
 * FieldRegionVisualization - Renders 3D field regions in the scene
 * 
 * Supports:
 * - 2D Plane: Wireframe rectangle with semi-transparent fill
 * - 2D Circle: Wireframe circle with semi-transparent disk
 * - 3D Sphere: Wireframe sphere with semi-transparent surface
 * - 3D Cube: Wireframe box with semi-transparent faces
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
  opacity: number; // 0-1
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
    dimensions: field.dimensions,
    normalPreset: field.normalPreset,
    normalVector: field.normalVector,
    fullField: field
  });
  
  if (field.type !== '2D' || field.shape !== 'plane') {
    console.log('[PlaneRegion] Type or shape mismatch, returning null');
    return null;
  }

  const width = field.dimensions?.width ?? 100;
  const height = field.dimensions?.height ?? 100;
  const [cx, cy, cz] = field.centerPoint;
  
  console.log('[PlaneRegion] Calculated values:', { width, height, cx, cy, cz });

  // Get normal vector
  const normal = field.normalPreset
    ? getNormalFromPreset(field.normalPreset)
    : field.normalVector ?? [0, 0, 1];
    
  console.log('[PlaneRegion] Normal vector:', normal);

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
 * Component for rendering a single 2D circle field region
 */
function CircleRegion({
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
  if (field.type !== '2D' || field.shape !== 'circle') return null;

  const radius = field.dimensions?.radius ?? 50;
  const [cx, cy, cz] = field.centerPoint;

  // Get normal vector
  const normal = field.normalPreset
    ? getNormalFromPreset(field.normalPreset)
    : field.normalVector ?? [0, 0, 1];

  // Create circle geometry
  const circleGeometry = useMemo(() => {
    const geometry = new THREE.CircleGeometry(radius, 32);
    
    // Rotate to match normal vector
    const quaternion = new THREE.Quaternion();
    const targetNormal = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    quaternion.setFromUnitVectors(defaultNormal, targetNormal);
    geometry.applyQuaternion(quaternion);
    
    return geometry;
  }, [radius, normal]);

  // Create edges for wireframe
  const edgesGeometry = useMemo(() => {
    return new THREE.EdgesGeometry(circleGeometry);
  }, [circleGeometry]);

  const finalOpacity = isSelected ? Math.min(opacity * 1.5, 1) : opacity;
  const lineColor = isSelected ? '#FFFFFF' : color;

  return (
    <group position={[cx, cy, cz]}>
      {/* Wireframe outline */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={lineColor} linewidth={isSelected ? 3 : 2} />
      </lineSegments>
      
      {/* Semi-transparent fill */}
      <mesh geometry={circleGeometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={finalOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Selection glow effect */}
      {isSelected && (
        <mesh geometry={circleGeometry}>
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
  if (field.type !== '3D' || field.shape !== 'sphere') return null;

  const radius = field.sphereRadius ?? 50;
  const [cx, cy, cz] = field.centerPoint;

  // Create sphere geometry with wireframe segments
  const sphereGeometry = useMemo(() => {
    return new THREE.SphereGeometry(radius, 16, 16);
  }, [radius]);

  const wireframeGeometry = useMemo(() => {
    return new THREE.WireframeGeometry(sphereGeometry);
  }, [sphereGeometry]);

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
 * Component for rendering a single 3D cube field region
 */
function CubeRegion({
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
  if (field.type !== '3D' || field.shape !== 'cube') return null;

  const Lx = field.cubeDimensions?.Lx ?? 100;
  const Ly = field.cubeDimensions?.Ly ?? 100;
  const Lz = field.cubeDimensions?.Lz ?? 100;
  const [cx, cy, cz] = field.centerPoint;

  // Create box geometry
  const boxGeometry = useMemo(() => {
    return new THREE.BoxGeometry(Lx, Ly, Lz);
  }, [Lx, Ly, Lz]);

  const wireframeGeometry = useMemo(() => {
    return new THREE.WireframeGeometry(boxGeometry);
  }, [boxGeometry]);

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
  opacity,
  visible = true,
}: FieldRegionVisualizationProps) {
  console.log('[FieldRegionVisualization] Rendering with:', {
    fieldCount: fieldDefinitions.length,
    visible,
    opacity,
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
                opacity={opacity}
                isSelected={isSelected}
              />
            );
          } else if (field.shape === 'circle') {
            return (
              <CircleRegion
                key={field.id}
                field={field}
                color={color}
                opacity={opacity}
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
                opacity={opacity}
                isSelected={isSelected}
              />
            );
          } else if (field.shape === 'cube') {
            return (
              <CubeRegion
                key={field.id}
                field={field}
                color={color}
                opacity={opacity}
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
