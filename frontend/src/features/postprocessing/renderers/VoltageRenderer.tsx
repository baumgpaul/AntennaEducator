import React, { useMemo } from 'react';
import { ViewItem } from '../../../types/postprocessing';
import { useAppSelector } from '../../../store/hooks';
import * as THREE from 'three';
import { createColorArray } from '../../../utils/colorMaps';

interface VoltageRendererProps {
  item: ViewItem;
  frequencyHz?: number;
}

/**
 * Renders voltage distribution as color-mapped nodes (spheres).
 * Uses voltage magnitudes from solver results to color each node.
 */
export const VoltageRenderer: React.FC<VoltageRendererProps> = ({
  item,
  frequencyHz,
}) => {
  const results = useAppSelector((state) => state.solver.results);
  const elements = useAppSelector((state) => state.design.elements);

  // Get voltage distribution data
  const voltageData = useMemo(() => {
    if (!results?.node_voltages || !frequencyHz) {
      return null;
    }

    // Use node voltages from results
    // TODO: implement frequency-specific lookup for sweeps
    return results.node_voltages;
  }, [results, frequencyHz]);

  // Extract node positions from elements
  const nodes = useMemo(() => {
    if (!elements || elements.length === 0) return [];
    const allNodes: Array<[number, number, number]> = [];

    // Get nodes from antenna element meshes
    elements.forEach((element) => {
      if (element.mesh && element.mesh.nodes) {
        element.mesh.nodes.forEach((node) => {
          // node is already a Vector3D tuple [x, y, z]
          allNodes.push([node[0], node[1], node[2]]);
        });
      }
    });

    return allNodes;
  }, [elements]);

  // Calculate voltage magnitudes
  const magnitudes = useMemo(() => {
    if (!voltageData) return [];
    return voltageData.map((voltage) => {
      const real = voltage.real || 0;
      const imag = voltage.imag || 0;
      return Math.sqrt(real * real + imag * imag);
    });
  }, [voltageData]);

  // Get color map and value range
  const colorMap = item.colorMap || 'jet';
  const valueRangeMode = item.valueRangeMode || 'auto';
  const min = magnitudes.length > 0
    ? (valueRangeMode === 'manual' ? item.valueRangeMin || 0 : Math.min(...magnitudes))
    : 0;
  const max = magnitudes.length > 0
    ? (valueRangeMode === 'manual' ? item.valueRangeMax || 1 : Math.max(...magnitudes))
    : 1;

  // Create colors for each node
  const colors = useMemo(() => {
    if (magnitudes.length === 0) return new Float32Array(0);
    return createColorArray(magnitudes, colorMap as any, min, max);
  }, [magnitudes, colorMap, min, max]);

  // Get node size and opacity
  const nodeSize = item.nodeSize || 1.0;
  const opacity = item.opacity !== undefined ? item.opacity : 1.0;

  // Create sphere geometry and material (shared for performance)
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(0.5 * nodeSize, 16, 16), [nodeSize]);

  if (!voltageData || !elements || elements.length === 0) {
    return null;
  }

  return (
    <group>
      {nodes.map((position, index) => {
        if (index >= colors.length) return null;

        const color = new THREE.Color(
          colors[index * 3],
          colors[index * 3 + 1],
          colors[index * 3 + 2]
        );

        return (
          <mesh key={index} position={position} geometry={sphereGeometry}>
            <meshBasicMaterial
              color={color}
              transparent={opacity < 1.0}
              opacity={opacity}
            />
          </mesh>
        );
      })}
    </group>
  );
};
