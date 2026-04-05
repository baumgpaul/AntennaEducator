import React, { useMemo } from 'react';
import { ViewItem, DisplayQuantity } from '../../../types/postprocessing';
import { useAppSelector } from '../../../store/hooks';
import * as THREE from 'three';
import { createColorArray, arrayMin, arrayMax } from '../../../utils/colorMaps';
import { parseComplex } from '../../../api/solverHelpers';

interface VoltageRendererProps {
  item: ViewItem;
  frequencyHz?: number;
  animationPhase?: number;
}

/**
 * Renders voltage distribution as color-mapped nodes (spheres).
 * Uses voltage magnitudes from solver results to color each node.
 */
export const VoltageRenderer: React.FC<VoltageRendererProps> = ({
  item,
  frequencyHz,
  animationPhase,
}) => {
  const results = useAppSelector((state) => state.solver.results);
  const frequencySweep = useAppSelector((state) => state.solver.frequencySweep);
  const parameterStudy = useAppSelector((state) => state.solver.parameterStudy);
  const elements = useAppSelector((state) => state.design.elements);

  // Get voltage distribution data — supports single-freq, frequency sweep, and parameter study modes
  const voltageData = useMemo(() => {
    if (frequencyHz == null) return null;

    // Parameter study mode: frequencyHz is a sweep point INDEX (0, 1, 2, ...)
    if (parameterStudy?.results?.length) {
      const pointIdx = Math.round(frequencyHz);
      const pointResult = parameterStudy.results[pointIdx];
      if (pointResult) {
        const resp = pointResult.solverResponse as any;
        if (resp?.antenna_solutions?.length) {
          return resp.antenna_solutions.flatMap(
            (sol: any) => sol.node_voltages || []
          );
        }
      }
    }

    // Frequency sweep mode: look up node_voltages for this specific frequency (Hz)
    if (frequencySweep?.frequencies && frequencySweep.results) {
      const freqIdx = frequencySweep.frequencies.findIndex(
        (f) => Math.abs(f - frequencyHz) < 1 // 1 Hz tolerance
      );
      if (freqIdx >= 0 && frequencySweep.results[freqIdx]) {
        const sweepResult = frequencySweep.results[freqIdx];
        if (sweepResult.antenna_solutions?.length) {
          return sweepResult.antenna_solutions.flatMap(
            (sol: any) => sol.node_voltages || []
          );
        }
      }
    }

    // Single-frequency mode
    if (results?.node_voltages) {
      return results.node_voltages;
    }

    // Multi-antenna single freq
    const multiResults = (results as any)?.antenna_solutions;
    if (multiResults?.length) {
      return multiResults.flatMap((sol: any) => sol.node_voltages || []);
    }

    return null;
  }, [results, frequencySweep, parameterStudy, frequencyHz]);

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

  // Calculate display values based on displayQuantity
  const displayQuantity: DisplayQuantity = item.displayQuantity || 'magnitude';
  const displayValues = useMemo(() => {
    if (!voltageData) return [];
    const phase = animationPhase ?? 0;
    return voltageData.map((voltage) => {
      const parsed = parseComplex(voltage);
      const re = parsed.real;
      const im = parsed.imag;
      switch (displayQuantity) {
        case 'real':
          return re;
        case 'imaginary':
          return im;
        case 'phase':
          return Math.atan2(im, re) * (180 / Math.PI);
        case 'instantaneous':
          return re * Math.cos(phase) - im * Math.sin(phase);
        case 'magnitude':
        default:
          return Math.sqrt(re * re + im * im);
      }
    });
  }, [voltageData, displayQuantity, animationPhase]);

  // Get color map and value range
  const colorMap = item.colorMap || 'jet';
  const valueRangeMode = item.valueRangeMode || 'auto';
  const min = displayValues.length > 0
    ? (valueRangeMode === 'manual' ? (item.valueRangeMin ?? 0) : arrayMin(displayValues))
    : 0;
  const max = displayValues.length > 0
    ? (valueRangeMode === 'manual' ? (item.valueRangeMax ?? 1) : arrayMax(displayValues))
    : 1;

  // Create colors for each node
  const colors = useMemo(() => {
    if (displayValues.length === 0) return new Float32Array(0);
    return createColorArray(displayValues, colorMap as any, min, max);
  }, [displayValues, colorMap, min, max]);

  // Get node size and opacity - default smaller for antenna scale
  const nodeSize = item.nodeSize ?? 0.002;
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
