import React, { useMemo } from 'react';
import { ViewItem } from '../../../types/postprocessing';
import { useAppSelector } from '../../../store/hooks';
import * as THREE from 'three';
import { createColorArray } from '../../../utils/colorMaps';

interface DirectivityRendererProps {
  item: ViewItem;
  frequencyHz?: number;
}

/**
 * Renders directivity patterns as 3D color-mapped spheres.
 * Supports both linear and logarithmic (dBi) scales.
 */
export const DirectivityRenderer: React.FC<DirectivityRendererProps> = ({
  item,
  frequencyHz,
}) => {
  // Use per-frequency pattern if available, falling back to the single radiationPattern
  const radiationPatterns = useAppSelector((state) => state.solver.radiationPatterns);
  const fallbackPattern = useAppSelector((state) => state.solver.radiationPattern);
  const radiationPattern = (frequencyHz != null && radiationPatterns?.[frequencyHz]) || fallbackPattern;

  // Extract directivity data (may be undefined before early return check)
  const theta_angles = radiationPattern?.theta_angles;
  const phi_angles = radiationPattern?.phi_angles;
  const pattern_db = radiationPattern?.pattern_db;
  // Get actual directivity value in dBi (e.g., 1.76 for half-wave dipole)
  const directivity_dbi = radiationPattern?.directivity || 0;

  // Get scale and value range properties
  const scaleMode = item.scale || 'logarithmic';
  const valueRangeMode = item.valueRangeMode || 'auto';
  const colorMap = item.colorMap || 'jet';
  const sizeFactor = item.sizeFactor || 0.5; // Default changed to 0.5
  const opacity = item.opacity !== undefined ? item.opacity : 0.8;

  // Convert normalized pattern_db to actual dBi values, or to linear directivity
  const processedDirectivity = useMemo(() => {
    if (!pattern_db) return [];
    if (scaleMode === 'linear') {
      // Convert to actual linear directivity: D = 10^((pattern_db + directivity_dbi)/10)
      return pattern_db.map((db) => Math.pow(10, (db + directivity_dbi) / 10));
    }
    // For logarithmic scale: add directivity offset to get actual dBi values
    return pattern_db.map((db) => db + directivity_dbi);
  }, [pattern_db, scaleMode, directivity_dbi]);

  // Calculate value range with reasonable defaults for logarithmic scale
  const autoMin = processedDirectivity.length > 0 ? Math.min(...processedDirectivity) : 0;
  const autoMax = processedDirectivity.length > 0 ? Math.max(...processedDirectivity) : 1;

  // For logarithmic scale, clamp min to max - 30 dB for reasonable color range
  const clampedAutoMin = scaleMode === 'logarithmic'
    ? Math.max(autoMin, autoMax - 30)
    : autoMin;

  const min = valueRangeMode === 'manual'
    ? (item.valueRangeMin ?? 0)
    : clampedAutoMin;
  const max = valueRangeMode === 'manual'
    ? (item.valueRangeMax ?? 1)
    : autoMax;

  // Create colors for each point
  const colors = useMemo(() => {
    if (processedDirectivity.length === 0) return new Float32Array(0);
    return createColorArray(processedDirectivity, colorMap as any, min, max);
  }, [processedDirectivity, colorMap, min, max]);

  // Create sphere geometry with vertices matching theta/phi sampling
  const geometry = useMemo(() => {
    if (!theta_angles || !phi_angles || processedDirectivity.length === 0) return null;
    console.log('[DirectivityRenderer] Creating geometry:', {
      totalPoints: theta_angles.length * phi_angles.length,
      thetaAngles: theta_angles.length,
      phiAngles: phi_angles.length,
      directivityData: processedDirectivity.length
    });

    // Use actual theta and phi dimensions from the data
    const thetaCount = theta_angles.length; // Number of theta samples (e.g., 43)
    const phiCount = phi_angles.length;     // Number of phi samples (e.g., 64)

    console.log('[DirectivityRenderer] Sphere segments:', {
      thetaSegments: thetaCount - 1,
      phiSegments: phiCount - 1
    });

    const sphereGeometry = new THREE.SphereGeometry(
      0.5 * sizeFactor, // Base radius 0.5mm
      phiCount - 1,     // widthSegments (phi direction)
      thetaCount - 1    // heightSegments (theta direction)
    );

    const numVertices = sphereGeometry.attributes.position.count;
    console.log('[DirectivityRenderer] Sphere vertices:', numVertices, 'vs directivity points:', processedDirectivity.length);

    // Apply vertex colors
    const colorAttribute = new Float32Array(colors);
    sphereGeometry.setAttribute('color', new THREE.BufferAttribute(colorAttribute, 3));

    // Displace vertices by directivity magnitude (radial scaling)
    const positions = sphereGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const vertexIndex = i / 3;
      if (vertexIndex < processedDirectivity.length) {
        const directivityValue = processedDirectivity[vertexIndex];
        let radiusScale: number;

        if (scaleMode === 'logarithmic') {
          // In dB scale: convert to linear for radius visualization
          // This maintains the same pattern shape as linear mode
          radiusScale = Math.pow(10, directivityValue / 10);
        } else {
          // In linear scale: use directivity value directly as radius
          radiusScale = directivityValue;
        }

        positions[i] *= radiusScale;
        positions[i + 1] *= radiusScale;
        positions[i + 2] *= radiusScale;
      } else {
        console.warn(`[DirectivityRenderer] Vertex ${vertexIndex} out of range (max: ${processedDirectivity.length})`);
      }
    }

    sphereGeometry.attributes.position.needsUpdate = true;
    sphereGeometry.computeVertexNormals();

    // Rotate geometry 90 degrees around X axis to align with antenna coordinate system
    // (Three.js sphere has poles on Y axis, PEEC uses Z axis)
    sphereGeometry.rotateX(Math.PI / 2);

    return sphereGeometry;
  }, [theta_angles, phi_angles, processedDirectivity, colors, sizeFactor, min, max, scaleMode]);

  if (!radiationPattern || frequencyHz == null || !theta_angles || !phi_angles || !pattern_db || !geometry) {
    return null;
  }

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        vertexColors
        transparent={opacity < 1.0}
        opacity={opacity}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};
