import { useMemo, useState } from 'react';
import * as THREE from 'three';
import type { Mesh, AntennaElement } from '@/types/models';

interface WireGeometryProps {
  // Multi-element support (preferred)
  elements?: AntennaElement[];
  selectedElementId?: string | null;
  onElementSelect?: (elementId: string) => void;
  
  // Single mesh support (backward compatibility)
  mesh?: Mesh;
  currentDistribution?: number[]; // Current magnitude at each segment
  selected?: boolean;
  onSelect?: () => void;
  
  // Visualization options
  showNodes?: boolean;
}

/**
 * WireGeometry - Renders antenna wire mesh as 3D cylinders
 * Supports both multi-element and single mesh rendering
 * Supports color mapping for current distribution visualization
 */
function WireGeometry({ 
  elements, 
  selectedElementId, 
  onElementSelect,
  mesh, 
  currentDistribution, 
  selected, 
  onSelect,
  showNodes = false
}: WireGeometryProps) {
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  
  console.log('WireGeometry render:', { 
    elementsCount: elements?.length, 
    hasLegacyMesh: !!mesh,
    selectedElementId,
    elements: elements?.map(e => ({ 
      id: e.id, 
      name: e.name, 
      visible: e.visible, 
      hasMesh: !!e.mesh,
      nodeCount: e.mesh?.nodes?.length,
      edgeCount: e.mesh?.edges?.length
    }))
  });

  // Convert elements or single mesh to renderable segments
  const elementSegments = useMemo(() => {
    console.log('WireGeometry: Computing segments', { 
      elementCount: elements?.length, 
      hasLegacyMesh: !!mesh,
      elements: elements?.map(e => ({ id: e.id, visible: e.visible, meshDefined: !!e.mesh }))
    });
    
    const result: Array<{
      elementId: string;
      segments: Array<{
        start: THREE.Vector3;
        end: THREE.Vector3;
        radius: number;
        current: number;
      }>;
    }> = [];

    if (elements && elements.length > 0) {
      // Multi-element mode
      elements.forEach(element => {
        if (!element.visible || !element.mesh) return;
        
        const mesh = element.mesh;
        if (!mesh.edges || !mesh.nodes || !mesh.radii) return;
        
        const segments = mesh.edges.map((edge, idx) => {
          const [startIdx, endIdx] = edge;
          
          if (!mesh.nodes[startIdx] || !mesh.nodes[endIdx]) {
            console.error(`WireGeometry: Invalid node indices - element ${element.id}, edge ${idx}`);
            return null;
          }
          
          const start = mesh.nodes[startIdx];
          const end = mesh.nodes[endIdx];
          const radius = mesh.radii[idx];

          if (!start || !end || start.length < 3 || end.length < 3) {
            console.error(`WireGeometry: Invalid node data - element ${element.id}, edge ${idx}`);
            return null;
          }

          // Apply element position offset
          const startPos = new THREE.Vector3(
            start[0] + element.position[0], 
            start[1] + element.position[1], 
            start[2] + element.position[2]
          );
          const endPos = new THREE.Vector3(
            end[0] + element.position[0], 
            end[1] + element.position[1], 
            end[2] + element.position[2]
          );

          // TODO: Apply rotation (element.rotation) using THREE.Euler/Quaternion

          return {
            start: startPos,
            end: endPos,
            radius,
            current: 0, // Current distribution per element will be added later
          };
        }).filter(seg => seg !== null);

        if (segments.length > 0) {
          result.push({
            elementId: element.id,
            segments,
          });
        }
      });
    } else if (mesh) {
      // Single mesh mode (backward compatibility)
      if (mesh.edges && mesh.nodes && mesh.radii) {
        const segments = mesh.edges.map((edge, idx) => {
          const [startIdx, endIdx] = edge;
          
          if (!mesh.nodes[startIdx] || !mesh.nodes[endIdx]) {
            console.error(`WireGeometry: Invalid node indices - edge ${idx}`);
            return null;
          }
          
          const start = mesh.nodes[startIdx];
          const end = mesh.nodes[endIdx];
          const radius = mesh.radii[idx];

          if (!start || !end || start.length < 3 || end.length < 3) {
            console.error(`WireGeometry: Invalid node data at edge ${idx}`);
            return null;
          }

          const current = currentDistribution?.[idx] ?? 0;

          return {
            start: new THREE.Vector3(start[0], start[1], start[2]),
            end: new THREE.Vector3(end[0], end[1], end[2]),
            radius,
            current,
          };
        }).filter(seg => seg !== null);

        if (segments.length > 0) {
          result.push({
            elementId: 'single-mesh',
            segments,
          });
        }
      }
    }

    console.log('WireGeometry: Computed segments', { 
      totalElements: result.length,
      totalSegments: result.reduce((sum, el) => sum + el.segments.length, 0)
    });

    return result;
  }, [elements, mesh, currentDistribution]);

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

  // Removed pulsation animation - caused unwanted visual effects
  // Selected/hovered state is now indicated by emissive glow only

  return (
    <group>
      {elementSegments.map(({ elementId, segments }) => {
        const isSelected = elementId === selectedElementId || (elementId === 'single-mesh' && selected);
        const isHovered = elementId === hoveredElement;

        return (
          <group key={elementId}>
            {/* Render segments for this element */}
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
              
              // Make wires more visible by using a minimum render radius
              const renderRadius = Math.max(segment.radius, 0.003);

              return (
                <group key={`${elementId}-${idx}`} position={midpoint} quaternion={orientation}>
                  {/* Wire cylinder */}
                  <mesh
                    onClick={(e) => {
                      e.stopPropagation();
                      if (elementId !== 'single-mesh') {
                        onElementSelect?.(elementId);
                      } else {
                        onSelect?.();
                      }
                    }}
                    onPointerOver={(e) => {
                      e.stopPropagation();
                      setHoveredElement(elementId);
                      document.body.style.cursor = 'pointer';
                    }}
                    onPointerOut={() => {
                      setHoveredElement(null);
                      document.body.style.cursor = 'default';
                    }}
                  >
                    <cylinderGeometry args={[renderRadius, renderRadius, length, 16]} />
                    <meshStandardMaterial
                      color={color}
                      emissive={isSelected || isHovered ? color : new THREE.Color(0x000000)}
                      emissiveIntensity={isSelected || isHovered ? 0.5 : 0}
                      metalness={0.7}
                      roughness={0.3}
                    />
                  </mesh>

                  {/* Wire caps */}
                  <mesh position={[0, length / 2, 0]}>
                    <sphereGeometry args={[renderRadius, 12, 12]} />
                    <meshStandardMaterial
                      color={color}
                      metalness={0.7}
                      roughness={0.3}
                    />
                  </mesh>
                  <mesh position={[0, -length / 2, 0]}>
                    <sphereGeometry args={[renderRadius, 12, 12]} />
                    <meshStandardMaterial
                      color={color}
                      metalness={0.7}
                      roughness={0.3}
                    />
                  </mesh>
                </group>
              );
            })}

            {/* Node markers (optional, for debugging) */}
            {showNodes && elements && elements.find(el => el.id === elementId)?.mesh?.nodes?.map((node, idx) => {
              const element = elements.find(el => el.id === elementId)!;
              return (
                <mesh key={`node-${elementId}-${idx}`} position={new THREE.Vector3(
                  node[0] + element.position[0], 
                  node[1] + element.position[1], 
                  node[2] + element.position[2]
                )}>
                  <sphereGeometry args={[0.02, 8, 8]} />
                  <meshBasicMaterial color={isSelected ? 0xff0000 : 0xffff00} />
                </mesh>
              );
            })}
            
            {/* Legacy single mesh node markers */}
            {showNodes && elementId === 'single-mesh' && mesh?.nodes?.map((node, idx) => (
              <mesh key={`node-${idx}`} position={new THREE.Vector3(node[0], node[1], node[2])}>
                <sphereGeometry args={[0.02, 8, 8]} />
                <meshBasicMaterial color={selected ? 0xff0000 : 0xffff00} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

export default WireGeometry;
