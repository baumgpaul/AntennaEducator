import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { Box } from '@mui/material';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviewNode {
  id: number;
  x: number;
  y: number;
  z: number;
  radius?: number;
}

export interface PreviewEdge {
  node_start: number;
  node_end: number;
  radius?: number;
}

export interface WirePreview3DProps {
  nodes: PreviewNode[];
  edges: PreviewEdge[];
  /** Set of node IDs used as source endpoints */
  sourceNodes?: Set<number>;
  /** Set of node IDs used as lumped element endpoints */
  lumpedNodes?: Set<number>;
  /** Currently selected node ID */
  selectedNodeId?: number | null;
  /** Called when a node sphere is clicked */
  onNodeSelect?: (nodeId: number) => void;
  /** Show node ID labels */
  showLabels?: boolean;
  /** Show edge index labels */
  showEdgeLabels?: boolean;
  /** Container width */
  width?: string | number;
  /** Container height */
  height?: string | number;
}

// ---------------------------------------------------------------------------
// Color constants
// ---------------------------------------------------------------------------

const NODE_COLOR_DEFAULT = '#4488ff';
const NODE_COLOR_GROUND = '#44cc44';
const NODE_COLOR_SOURCE = '#ff4444';
const NODE_COLOR_LUMPED = '#ff8800';
const NODE_COLOR_SELECTED = '#ffff00';
const EDGE_COLOR = '#88aacc';
const LABEL_COLOR = '#cccccc';

// ---------------------------------------------------------------------------
// Camera auto-fit helper (runs inside Canvas)
// ---------------------------------------------------------------------------

function CameraFit({ nodes }: { nodes: PreviewNode[] }) {
  const { camera } = useThree();
  const prevBoundsRef = useRef('');

  useEffect(() => {
    if (nodes.length === 0) return;

    const boundsKey = nodes.map((n) => `${n.x},${n.y},${n.z}`).join('|');
    if (boundsKey === prevBoundsRef.current) return;
    prevBoundsRef.current = boundsKey;

    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    for (const n of nodes) {
      min.x = Math.min(min.x, n.x);
      min.y = Math.min(min.y, n.y);
      min.z = Math.min(min.z, n.z);
      max.x = Math.max(max.x, n.x);
      max.y = Math.max(max.y, n.y);
      max.z = Math.max(max.z, n.z);
    }

    const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 0.1);
    const dist = size * 2.5;

    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.6, center.z + dist * 0.6);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [nodes, camera]);

  return null;
}

// ---------------------------------------------------------------------------
// Node spheres
// ---------------------------------------------------------------------------

interface NodeSpheresProps {
  nodes: PreviewNode[];
  sourceNodes: Set<number>;
  lumpedNodes: Set<number>;
  selectedNodeId: number | null;
  onNodeSelect?: (id: number) => void;
  showLabels: boolean;
}

function NodeSpheres({
  nodes,
  sourceNodes,
  lumpedNodes,
  selectedNodeId,
  onNodeSelect,
  showLabels,
}: NodeSpheresProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const nodeSize = useMemo(() => {
    if (nodes.length < 2) return 0.02;
    let maxDist = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dz = nodes[i].z - nodes[j].z;
        maxDist = Math.max(maxDist, Math.sqrt(dx * dx + dy * dy + dz * dz));
      }
    }
    return Math.max(maxDist * 0.03, 0.005);
  }, [nodes]);

  const labelSize = nodeSize * 3;

  return (
    <group>
      {nodes.map((node) => {
        let color = NODE_COLOR_DEFAULT;
        if (node.id === 0) color = NODE_COLOR_GROUND;
        if (sourceNodes.has(node.id)) color = NODE_COLOR_SOURCE;
        if (lumpedNodes.has(node.id)) color = NODE_COLOR_LUMPED;
        if (node.id === selectedNodeId) color = NODE_COLOR_SELECTED;

        const isHovered = hoveredId === node.id;

        return (
          <group key={node.id}>
            <mesh
              position={[node.x, node.y, node.z]}
              onClick={(e) => {
                e.stopPropagation();
                onNodeSelect?.(node.id);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredId(node.id);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                setHoveredId(null);
                document.body.style.cursor = 'default';
              }}
            >
              <sphereGeometry args={[isHovered ? nodeSize * 1.3 : nodeSize, 16, 16]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isHovered ? 0.5 : 0.2}
              />
            </mesh>

            {showLabels && (
              <Text
                position={[node.x, node.y, node.z + nodeSize * 2.5]}
                fontSize={labelSize}
                color={LABEL_COLOR}
                anchorX="center"
                anchorY="bottom"
              >
                {String(node.id)}
              </Text>
            )}
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Edge cylinders
// ---------------------------------------------------------------------------

interface EdgeCylindersProps {
  nodes: PreviewNode[];
  edges: PreviewEdge[];
  showEdgeLabels: boolean;
}

function EdgeCylinders({ nodes, edges, showEdgeLabels }: EdgeCylindersProps) {
  const nodeMap = useMemo(() => {
    const map = new Map<number, PreviewNode>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  const segments = useMemo(() => {
    return edges
      .map((edge, idx) => {
        const a = nodeMap.get(edge.node_start);
        const b = nodeMap.get(edge.node_end);
        if (!a || !b) return null;

        const start = new THREE.Vector3(a.x, a.y, a.z);
        const end = new THREE.Vector3(b.x, b.y, b.z);
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(end, start);
        const length = dir.length();
        if (length < 1e-12) return null;

        // Align cylinder (default Y-axis) to direction
        const quat = new THREE.Quaternion();
        quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

        const radius = Math.max(edge.radius ?? a.radius ?? 0.001, 0.002);

        return { idx, mid, length, quat, radius };
      })
      .filter(Boolean) as Array<{
      idx: number;
      mid: THREE.Vector3;
      length: number;
      quat: THREE.Quaternion;
      radius: number;
    }>;
  }, [edges, nodeMap]);

  // Label font size based on geometry scale
  const labelSize = useMemo(() => {
    if (segments.length === 0) return 0.02;
    const avgLen = segments.reduce((s, seg) => s + seg.length, 0) / segments.length;
    return Math.max(avgLen * 0.15, 0.005);
  }, [segments]);

  return (
    <group>
      {segments.map((seg) => (
        <group key={seg.idx}>
          <mesh position={seg.mid.toArray()} quaternion={seg.quat}>
            <cylinderGeometry args={[seg.radius, seg.radius, seg.length, 8]} />
            <meshStandardMaterial
              color={EDGE_COLOR}
              metalness={0.6}
              roughness={0.4}
              transparent
              opacity={0.85}
            />
          </mesh>

          {showEdgeLabels && (
            <Text
              position={[seg.mid.x, seg.mid.y + labelSize * 1.5, seg.mid.z]}
              fontSize={labelSize}
              color="#aaaaaa"
              anchorX="center"
              anchorY="bottom"
            >
              {`E${seg.idx + 1}`}
            </Text>
          )}
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const WirePreview3D: React.FC<WirePreview3DProps> = ({
  nodes,
  edges,
  sourceNodes = new Set(),
  lumpedNodes = new Set(),
  selectedNodeId = null,
  onNodeSelect,
  showLabels = true,
  showEdgeLabels = false,
  width = '100%',
  height = 300,
}) => {
  if (nodes.length === 0) {
    return (
      <Box
        sx={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#1a1a2e',
          borderRadius: 1,
          color: '#666',
        }}
      >
        No geometry to preview
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width,
        height,
        borderRadius: 1,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Canvas
        camera={{ fov: 50, near: 0.001, far: 1000 }}
        style={{ background: '#1a1a2e' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 10]} intensity={0.7} />
        <directionalLight position={[-5, -5, -5]} intensity={0.3} />

        <CameraFit nodes={nodes} />
        <OrbitControls enableDamping dampingFactor={0.05} />

        <NodeSpheres
          nodes={nodes}
          sourceNodes={sourceNodes}
          lumpedNodes={lumpedNodes}
          selectedNodeId={selectedNodeId}
          onNodeSelect={onNodeSelect}
          showLabels={showLabels}
        />

        <EdgeCylinders
          nodes={nodes}
          edges={edges}
          showEdgeLabels={showEdgeLabels}
        />

        {/* Simple ground grid */}
        <gridHelper args={[2, 20, '#333344', '#222233']} rotation={[Math.PI / 2, 0, 0]} />
      </Canvas>
    </Box>
  );
};

export default WirePreview3D;
