import { useMemo, useState } from 'react';
import * as THREE from 'three';
import type { Mesh, AntennaElement } from '@/types/models';
import { DEFAULT_ELEMENT_COLOR, hexToThreeColor } from '@/utils/colors';

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
  visualizationMode?: 'element-colors' | 'current-distribution';
}

/**
 * WireGeometry - Renders antenna wire mesh as 3D cylinders
 * Supports both multi-element and single mesh rendering
 * Supports element colors and current distribution visualization
 */
function WireGeometry({ 
  elements, 
  selectedElementId, 
  onElementSelect,
  mesh, 
  currentDistribution, 
  selected, 
  onSelect,
  showNodes = false,
  visualizationMode = 'element-colors'
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
      elementColor?: string;
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
        
        console.log(`WireGeometry: Element ${element.id} - nodes: ${mesh.nodes.length}, edges: ${mesh.edges.length}, radii: ${mesh.radii.length}`);
        
        const segments = mesh.edges.map((edge, idx) => {
          // Backend uses 1-based indexing, convert to 0-based for JavaScript arrays
          const [startIdx, endIdx] = edge;
          const startIdx0 = startIdx - 1;
          const endIdx0 = endIdx - 1;
          
          if (startIdx0 < 0 || endIdx0 < 0 || startIdx0 >= mesh.nodes.length || endIdx0 >= mesh.nodes.length) {
            console.error(`WireGeometry: Invalid node indices - element ${element.id}, edge ${idx}, start=${startIdx}(${startIdx0}), end=${endIdx}(${endIdx0}), nodes.length=${mesh.nodes.length}`);
            return null;
          }
          
          if (!mesh.nodes[startIdx0] || !mesh.nodes[endIdx0]) {
            console.error(`WireGeometry: Undefined nodes - element ${element.id}, edge ${idx}`);
            return null;
          }
          
          const start = mesh.nodes[startIdx0];
          const end = mesh.nodes[endIdx0];
          const radius = mesh.radii[idx];

          if (!start || !end || start.length < 3 || end.length < 3) {
            console.error(`WireGeometry: Invalid node data - element ${element.id}, edge ${idx}`);
            return null;
          }

          // Create vectors from mesh nodes
          const startVec = new THREE.Vector3(start[0], start[1], start[2]);
          const endVec = new THREE.Vector3(end[0], end[1], end[2]);

          // Apply rotation (convert degrees to radians)
          const rotationEuler = new THREE.Euler(
            THREE.MathUtils.degToRad(element.rotation[0]),
            THREE.MathUtils.degToRad(element.rotation[1]),
            THREE.MathUtils.degToRad(element.rotation[2]),
            'XYZ'
          );
          startVec.applyEuler(rotationEuler);
          endVec.applyEuler(rotationEuler);

          // Apply position offset
          const startPos = new THREE.Vector3(
            startVec.x + element.position[0], 
            startVec.y + element.position[1], 
            startVec.z + element.position[2]
          );
          const endPos = new THREE.Vector3(
            endVec.x + element.position[0], 
            endVec.y + element.position[1], 
            endVec.z + element.position[2]
          );

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
            elementColor: element.color || DEFAULT_ELEMENT_COLOR,
            segments,
          });
        }
      });
    } else if (mesh) {
      // Single mesh mode (backward compatibility)
      if (mesh.edges && mesh.nodes && mesh.radii) {
        const segments = mesh.edges.map((edge, idx) => {
          // Backend uses 1-based indexing, convert to 0-based for JavaScript arrays
          const [startIdx, endIdx] = edge;
          const startIdx0 = startIdx - 1;
          const endIdx0 = endIdx - 1;
          
          if (startIdx0 < 0 || endIdx0 < 0 || !mesh.nodes[startIdx0] || !mesh.nodes[endIdx0]) {
            console.error(`WireGeometry: Invalid node indices - edge ${idx}, start=${startIdx}(${startIdx0}), end=${endIdx}(${endIdx0})`);
            return null;
          }
          
          const start = mesh.nodes[startIdx0];
          const end = mesh.nodes[endIdx0];
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

  // Color selection based on visualization mode
  const getSegmentColor = (
    elementColor: string | undefined,
    current: number,
    mode: string
  ): THREE.Color => {
    // If in current distribution mode and we have current data
    if (mode === 'current-distribution' && current !== 0) {
      return getColorFromCurrent(current);
    }
    
    // Otherwise use element color
    if (elementColor) {
      return hexToThreeColor(elementColor);
    }
    
    // Fallback to default
    return hexToThreeColor(DEFAULT_ELEMENT_COLOR);
  };

  // Color mapping for current distribution (blue -> green -> red)
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
      {elementSegments.map(({ elementId, elementColor, segments }) => {
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

              const color = getSegmentColor(elementColor, segment.current, visualizationMode);
              
              // Make wires more visible by using a minimum render radius
              const renderRadius = Math.max(segment.radius, 0.003);
              
              // Detect if this is a gap segment (no adjacent segment at one end)
              // Check if next/previous segment connects to this one
              const hasNextSegment = idx < segments.length - 1 && 
                segment.end.distanceTo(segments[idx + 1].start) < 0.001;
              const hasPrevSegment = idx > 0 && 
                segment.start.distanceTo(segments[idx - 1].end) < 0.001;

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

                  {/* Wire caps - only render where segments connect, NOT at terminals */}
                  {/* Top cap: only if there's a next segment (not at terminal) */}
                  {hasNextSegment && (
                    <mesh position={[0, length / 2, 0]}>
                      <sphereGeometry args={[renderRadius, 12, 12]} />
                      <meshStandardMaterial
                        color={color}
                        metalness={0.7}
                        roughness={0.3}
                      />
                    </mesh>
                  )}
                  {/* Bottom cap: only if there's a previous segment (not at terminal) */}
                  {hasPrevSegment && (
                    <mesh position={[0, -length / 2, 0]}>
                      <sphereGeometry args={[renderRadius, 12, 12]} />
                      <meshStandardMaterial
                        color={color}
                        metalness={0.7}
                        roughness={0.3}
                      />
                    </mesh>
                  )}
                </group>
              );
            })}

            {/* Node markers - only show nodes with sources or loads */}
            {showNodes && elements && (() => {
              const element = elements.find(el => el.id === elementId);
              if (!element || !element.mesh) return null;
              
              // Collect important node indices (0-based)
              const importantNodes = new Set<number>();
              
              // Add source nodes (convert from 1-based to 0-based)
              if (element.sources && element.sources.length > 0) {
                element.sources.forEach(src => {
                  if (src.node_start !== undefined) {
                    const nodeIdx = src.node_start - 1;
                    if (nodeIdx >= 0) importantNodes.add(nodeIdx);
                  }
                  if (src.node_end !== undefined) {
                    const nodeIdx = src.node_end - 1;
                    if (nodeIdx >= 0) importantNodes.add(nodeIdx);
                  }
                });
              }
              
              // Add lumped element nodes (convert from 1-based to 0-based)
              if (element.lumped_elements && element.lumped_elements.length > 0) {
                element.lumped_elements.forEach(le => {
                  if (le.node_start !== undefined) {
                    const nodeIdx = le.node_start - 1;
                    if (nodeIdx >= 0) importantNodes.add(nodeIdx);
                  }
                  if (le.node_end !== undefined) {
                    const nodeIdx = le.node_end - 1;
                    if (nodeIdx >= 0) importantNodes.add(nodeIdx);
                  }
                });
              }
              
              // Only render marked nodes
              return element.mesh.nodes
                .map((node, idx) => {
                  if (!importantNodes.has(idx)) return null;
                  
                  // Calculate node sphere radius as 10% larger than wire radius
                  // Use the first segment's radius as reference
                  const wireRadius = element.mesh.radii && element.mesh.radii.length > 0 
                    ? element.mesh.radii[0] 
                    : 0.001; // fallback
                  const renderRadius = Math.max(wireRadius, 0.003); // minimum visibility
                  const nodeSphereRadius = renderRadius * 1.1;
                  
                  // Apply rotation to node position
                  const nodeVec = new THREE.Vector3(node[0], node[1], node[2]);
                  const rotationEuler = new THREE.Euler(
                    THREE.MathUtils.degToRad(element.rotation[0]),
                    THREE.MathUtils.degToRad(element.rotation[1]),
                    THREE.MathUtils.degToRad(element.rotation[2]),
                    'XYZ'
                  );
                  nodeVec.applyEuler(rotationEuler);
                  
                  // Apply position offset
                  const nodePos = new THREE.Vector3(
                    nodeVec.x + element.position[0], 
                    nodeVec.y + element.position[1], 
                    nodeVec.z + element.position[2]
                  );
                  
                  return (
                    <mesh key={`node-${elementId}-${idx}`} position={nodePos}>
                      <sphereGeometry args={[nodeSphereRadius, 12, 12]} />
                      <meshStandardMaterial 
                        color={isSelected ? 0xff0000 : 0x00ff00}
                        emissive={0x00ff00}
                        emissiveIntensity={0.5}
                      />
                    </mesh>
                  );
                })
                .filter(Boolean);
            })()}
            
            {/* Legacy single mesh node markers */}
            {/* Node markers for single mesh - show source/load nodes only */}
            {showNodes && elementId === 'single-mesh' && mesh && (() => {
              // For single mesh mode, check global sources and lumped elements
              const importantNodes = new Set<number>();
              
              // This would need access to sources from state - for now show first/last nodes
              // TODO: Pass sources prop to filter nodes properly
              if (mesh.nodes.length > 0) {
                importantNodes.add(0); // First node (often ground)
                importantNodes.add(Math.floor(mesh.nodes.length / 2)); // Middle (feed point)
              }
              
              // Calculate node sphere radius as 10% larger than wire radius
              const wireRadius = mesh.radii && mesh.radii.length > 0 
                ? mesh.radii[0] 
                : 0.001; // fallback
              const renderRadius = Math.max(wireRadius, 0.003); // minimum visibility
              const nodeSphereRadius = renderRadius * 1.1;
              
              return mesh.nodes
                .map((node, idx) => {
                  if (!importantNodes.has(idx)) return null;
                  
                  return (
                    <mesh key={`node-single-${idx}`} position={new THREE.Vector3(node[0], node[1], node[2])}>
                      <sphereGeometry args={[nodeSphereRadius, 12, 12]} />
                      <meshStandardMaterial 
                        color={selected ? 0xff0000 : 0x00ff00}
                        emissive={0x00ff00}
                        emissiveIntensity={0.5}
                      />
                    </mesh>
                  );
                })
                .filter(Boolean);
            })()}
          </group>
        );
      })}
    </group>
  );
}

export default WireGeometry;
