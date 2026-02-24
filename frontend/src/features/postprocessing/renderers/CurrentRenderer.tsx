import React, { useMemo } from 'react';
import { ViewItem } from '../../../types/postprocessing';
import type { DisplayQuantity } from '../../../types/postprocessing';
import { useAppSelector } from '../../../store/hooks';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { createColorArray, arrayMin, arrayMax } from '../../../utils/colorMaps';

interface CurrentRendererProps {
  item: ViewItem;
  frequencyHz?: number;
  /** Current animation phase in radians [0, 2π) for instantaneous display */
  animationPhase?: number;
}

// Safe toFixed helper: returns formatted string for numbers or numeric strings, otherwise 'N/A'
function safeToFixed(value: any, digits: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(digits);
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value).toFixed(digits);
  return 'N/A';
}

/**
 * Renders current distribution as color-mapped wire edges.
 * Uses current magnitudes from solver results to color each edge.
 */
export const CurrentRenderer: React.FC<CurrentRendererProps> = ({
  item,
  frequencyHz,
  animationPhase,
}) => {
  const results = useAppSelector((state) => state.solver.results);
  const elements = useAppSelector((state) => state.design.elements);

  // Get current distribution data
  const currentData = useMemo(() => {
    console.log('[CurrentRenderer] === CURRENT DATA EXTRACTION ===');
    console.log('[CurrentRenderer] results:', results);
    console.log('[CurrentRenderer] frequencyHz:', frequencyHz);

    if (!results?.branch_currents || !frequencyHz) {
      console.log('[CurrentRenderer] ❌ No results or frequency, returning null');
      return null;
    }

    console.log('[CurrentRenderer] ✅ branch_currents found:', results.branch_currents.length, 'currents');
    console.log('[CurrentRenderer] First 3 currents:', results.branch_currents.slice(0, 3));

    // Use branch currents from results
    // TODO: implement frequency-specific lookup for sweeps
    return results.branch_currents;
  }, [results, frequencyHz]);

  if (!currentData || !elements || elements.length === 0) {
    console.log('[CurrentRenderer] ❌ Early exit - currentData:', !!currentData, 'elements:', elements?.length);
  }

  // Extract edge geometry from elements
  const edges = useMemo(() => {
    if (!elements || elements.length === 0) return [];
    console.log('[CurrentRenderer] === EDGE EXTRACTION ===');
    console.log('[CurrentRenderer] Total antenna elements:', elements.length);

    const allEdges: Array<{ start: [number, number, number]; end: [number, number, number]; length: number }> = [];

    // Small offset to avoid z-fighting with wire geometry (0.0001mm = 0.1 microns)
    const offsetMagnitude = 0.0001;

    // Get edges from antenna element meshes
    elements.forEach((element, elemIdx) => {
      console.log(`[CurrentRenderer] Element ${elemIdx}:`, {
        id: element.id,
        name: element.name,
        type: element.type,
        hasMesh: !!element.mesh,
        nodeCount: element.mesh?.nodes?.length,
        edgeCount: element.mesh?.edges?.length
      });

      if (element.mesh && element.mesh.nodes && element.mesh.edges) {
        const nodes = element.mesh.nodes;
        element.mesh.edges.forEach((edge, edgeIdx) => {
          const [startIdx1Based, endIdx1Based] = edge;
          // Convert from 1-based (PEEC format) to 0-based (JavaScript arrays)
          const startIdx = startIdx1Based - 1;
          const endIdx = endIdx1Based - 1;
          console.log(`[CurrentRenderer]   Edge ${edgeIdx}: indices [${startIdx1Based}, ${endIdx1Based}] (1-based) -> [${startIdx}, ${endIdx}] (0-based)`);

          if (startIdx >= 0 && startIdx < nodes.length && endIdx >= 0 && endIdx < nodes.length) {
            const start = nodes[startIdx]; // Vector3D tuple [x, y, z]
            const end = nodes[endIdx];

            // Calculate edge direction and length
            const dx = end[0] - start[0];
            const dy = end[1] - start[1];
            const dz = end[2] - start[2];
            const length = Math.sqrt(dx*dx + dy*dy + dz*dz);

            // Calculate offset perpendicular to edge (to avoid z-fighting)
            // Use cross product with a reference vector to get perpendicular direction
            let offsetX = 0;
            const offsetY = 0;
            let offsetZ = 0;
            if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
              // Vertical wire - offset in X direction
              offsetX = offsetMagnitude;
            } else {
              // Horizontal or angled wire - offset in Z direction or perpendicular
              offsetZ = offsetMagnitude;
            }

            console.log(`[CurrentRenderer]     Start: [${safeToFixed(start[0], 3)}, ${safeToFixed(start[1], 3)}, ${safeToFixed(start[2], 3)}]`);
            console.log(`[CurrentRenderer]     End:   [${safeToFixed(end[0], 3)}, ${safeToFixed(end[1], 3)}, ${safeToFixed(end[2], 3)}]`);
            console.log(`[CurrentRenderer]     Length: ${safeToFixed(length, 3)} mm, Offset: [${offsetX}, ${offsetY}, ${offsetZ}]`);

            allEdges.push({
              start: [start[0] + offsetX, start[1] + offsetY, start[2] + offsetZ],
              end: [end[0] + offsetX, end[1] + offsetY, end[2] + offsetZ],
              length: length
            });
          } else {
            console.log(`[CurrentRenderer]   ❌ Edge ${edgeIdx} has invalid indices (1-based: [${startIdx1Based}, ${endIdx1Based}], 0-based: [${startIdx}, ${endIdx}], max node index: ${nodes.length - 1})`);
          }
        });
      } else {
        console.log(`[CurrentRenderer]   ⚠️ Element ${elemIdx} has no valid mesh data`);
      }
    });

    console.log('[CurrentRenderer] === EDGE EXTRACTION COMPLETE ===');
    console.log('[CurrentRenderer] Total edges extracted:', allEdges.length);
    console.log('[CurrentRenderer] Edge lengths (mm):', allEdges.map(e => safeToFixed(e.length, 4)));
    console.log('[CurrentRenderer] Total wire length:', safeToFixed(allEdges.reduce((sum, e) => sum + e.length, 0), 4), 'mm');

    return allEdges;
  }, [elements]);

  // Calculate current display values based on displayQuantity
  const displayQuantity: DisplayQuantity = item.displayQuantity ?? 'magnitude';
  const magnitudes = useMemo(() => {
    if (!currentData) return [];
    console.log('[CurrentRenderer] === MAGNITUDE CALCULATION ===');
    console.log('[CurrentRenderer] Display quantity:', displayQuantity);
    const mags = currentData.map((current, idx) => {
      const real = current.real || 0;
      const imag = current.imag || 0;

      let val: number;
      switch (displayQuantity) {
        case 'real':
          val = real;
          break;
        case 'imaginary':
          val = imag;
          break;
        case 'phase':
          val = Math.atan2(imag, real) * (180 / Math.PI); // degrees [-180, 180]
          break;
        case 'instantaneous': {
          const phase = animationPhase ?? 0;
          val = real * Math.cos(phase) - imag * Math.sin(phase);
          break;
        }
        case 'magnitude':
        default:
          val = Math.sqrt(real * real + imag * imag);
      }

      if (idx < 5 || idx >= currentData.length - 2) {
        console.log(`[CurrentRenderer] Current ${idx}: real=${safeToFixed(real, 6)}, imag=${safeToFixed(imag, 6)}, value=${safeToFixed(val, 6)} A`);
      }

      return val;
    });

    console.log('[CurrentRenderer] Total magnitudes:', mags.length);
    console.log(`[CurrentRenderer] Magnitude range: [${safeToFixed(arrayMin(mags), 6)}, ${safeToFixed(arrayMax(mags), 6)}] A`);
    return mags;
  }, [currentData, displayQuantity, animationPhase]);

  // Get color map and value range
  const colorMap = item.colorMap || 'jet';
  const valueRangeMode = item.valueRangeMode || 'auto';
  const min = valueRangeMode === 'manual' ? (item.valueRangeMin ?? 0) : Math.min(...magnitudes);
  const max = valueRangeMode === 'manual' ? (item.valueRangeMax ?? 1) : Math.max(...magnitudes);

  console.log('[CurrentRenderer] === COLOR MAPPING ===');
  console.log('[CurrentRenderer] Color map:', colorMap);
  console.log('[CurrentRenderer] Value range mode:', valueRangeMode);
  console.log('[CurrentRenderer] Min value:', min);
  console.log('[CurrentRenderer] Max value:', max);

  // Create colors for each edge
  const colors = useMemo(() => {
    const cols = createColorArray(magnitudes, colorMap as any, min, max);
    console.log('[CurrentRenderer] Generated colors for', magnitudes.length, 'edges');
    console.log('[CurrentRenderer] Colors array length:', cols.length, '(should be', magnitudes.length * 3, ')');
    console.log('[CurrentRenderer] First 3 colors (RGB):');
    for (let i = 0; i < Math.min(3, magnitudes.length); i++) {
      const r = cols[i * 3];
      const g = cols[i * 3 + 1];
      const b = cols[i * 3 + 2];
      const color = new THREE.Color(r, g, b);
      console.log(`  Edge ${i}: RGB(${safeToFixed(r, 3)}, ${safeToFixed(g, 3)}, ${safeToFixed(b, 3)}) = #${color.getHexString()} | magnitude: ${safeToFixed(magnitudes[i], 6)}`);
    }
    console.log('[CurrentRenderer] Last color (RGB):');
    const lastIdx = magnitudes.length - 1;
    const r = cols[lastIdx * 3];
    const g = cols[lastIdx * 3 + 1];
    const b = cols[lastIdx * 3 + 2];
    const color = new THREE.Color(r, g, b);
    console.log(`  Edge ${lastIdx}: RGB(${safeToFixed(r, 3)}, ${safeToFixed(g, 3)}, ${safeToFixed(b, 3)}) = #${color.getHexString()} | magnitude: ${safeToFixed(magnitudes[lastIdx], 6)}`);
    return cols;
  }, [magnitudes, colorMap, min, max]);

  if (!currentData || !elements || elements.length === 0) {
    return null;
  }

  // Get edge size and opacity
  const edgeSize = item.edgeSize || 8.0; // Increased for better visibility over wire geometry
  const opacity = item.opacity !== undefined ? item.opacity : 1.0;

  console.log('[CurrentRenderer] === RENDER SETTINGS ===');
  console.log('[CurrentRenderer] Edge size:', edgeSize);
  console.log('[CurrentRenderer] Opacity:', opacity);
  console.log('[CurrentRenderer] Number of edges to render:', edges.length);
  console.log('[CurrentRenderer] Number of colors available:', colors.length / 3);
  console.log('[CurrentRenderer] Match:', edges.length === magnitudes.length ? '✅' : '❌ MISMATCH!');

  return (
    <group>
      {edges.map((edge, index) => {
        if (index >= colors.length / 3) {
          console.log(`[CurrentRenderer] ❌ Edge ${index} skipped - no color available (colors.length=${colors.length}, need index ${index * 3 + 2})`);
          return null;
        }

        const r = colors[index * 3];
        const g = colors[index * 3 + 1];
        const b = colors[index * 3 + 2];

        // Check for invalid color values
        if (isNaN(r) || isNaN(g) || isNaN(b) || r < 0 || r > 1 || g < 0 || g > 1 || b < 0 || b > 1) {
          console.log(`[CurrentRenderer] ⚠️ Edge ${index} has invalid color values: RGB(${r}, ${g}, ${b})`);
        }

        const color = new THREE.Color(r, g, b);

        if (index < 3 || index === edges.length - 1) {
          console.log(`[CurrentRenderer] Rendering edge ${index}:`, {
            start: edge.start.map(v => safeToFixed(v, 4)),
            end: edge.end.map(v => safeToFixed(v, 4)),
            length: safeToFixed(edge.length, 4) + ' mm',
            rgbInput: `RGB(${safeToFixed(r, 3)}, ${safeToFixed(g, 3)}, ${safeToFixed(b, 3)})`,
            colorHex: '#' + color.getHexString(),
            magnitude: safeToFixed(magnitudes[index], 6) + ' A',
            lineWidth: edgeSize
          });
        }

        return (
          <Line
            key={index}
            points={[edge.start, edge.end]}
            color={color}
            lineWidth={edgeSize}
            transparent={opacity < 1.0}
            opacity={opacity}
            depthTest={true}
            renderOrder={1}
          />
        );
      })}
    </group>
  );
};
