import React, { useMemo } from 'react';
import { ViewItem } from '../../../types/postprocessing';
import { useAppSelector } from '../../../store/hooks';
import { ArrowHelper } from 'three';
import { createColorArray } from '../../../utils/colorMaps';
import * as THREE from 'three';

interface ComplexComponent {
  real: number;
  imag: number;
}

interface ComplexVector3D {
  x: ComplexComponent;
  y: ComplexComponent;
  z: ComplexComponent;
}

/**
 * Compute time-averaged Poynting vectors S = 0.5 * Re(E × H*).
 * Returns real-valued [Sx, Sy, Sz] for each point.
 */
export function computePoyntingVectors(
  E_vectors: ComplexVector3D[],
  H_vectors: ComplexVector3D[],
): Array<{ x: number; y: number; z: number; mag: number }> {
  const n = Math.min(E_vectors.length, H_vectors.length);
  const result = new Array<{ x: number; y: number; z: number; mag: number }>(n);
  for (let i = 0; i < n; i++) {
    const E = E_vectors[i];
    const H = H_vectors[i];
    // Cross product E × H* (complex): S = 0.5 * Re(E × H*)
    // Re(E × H*)_x = Re(Ey * Hz*) - Re(Ez * Hy*)
    // Re(A * B*) = A.real * B.real + A.imag * B.imag
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
    result[i] = { x: Sx, y: Sy, z: Sz, mag: Math.sqrt(Sx * Sx + Sy * Sy + Sz * Sz) };
  }
  return result;
}

interface VectorRendererProps {
  item: ViewItem;
  frequencyHz?: number;
}

/**
 * Renders field-vector and field-vector-component items as arrow helpers.
 * Uses color mapping for vector magnitudes and arrow size control.
 * Supports E-field, H-field (with phase animation) and Poynting vector (time-averaged).
 */
export const VectorRenderer: React.FC<VectorRendererProps> = ({
  item,
  frequencyHz,
}) => {
  const fieldData = useAppSelector((state) => state.solver.fieldData);
  const requestedFields = useAppSelector((state) => state.solver.requestedFields);

  // Find the field definition for this item
  const fieldId = item.fieldId;
  const field = fieldId ? requestedFields?.find((f) => f.id === fieldId) : requestedFields?.[0];
  const fieldType = field?.fieldType;

  // Get field data for this frequency (safe access before early return)
  const dataForFrequency = (field && fieldData && frequencyHz)
    ? fieldData[field.id]?.[frequencyHz]
    : undefined;

  // For Poynting, compute real-valued vectors; for E/H, use complex vectors
  const isPoynting = fieldType === 'poynting';
  
  // Compute Poynting vectors if needed
  const poyntingVectors = useMemo(() => {
    if (!isPoynting || !dataForFrequency?.E_vectors || !dataForFrequency?.H_vectors) return null;
    return computePoyntingVectors(dataForFrequency.E_vectors, dataForFrequency.H_vectors);
  }, [isPoynting, dataForFrequency?.E_vectors, dataForFrequency?.H_vectors]);

  // Determine which vectors to use (E, H, or computed Poynting)
  const complexVectors = dataForFrequency
    ? (fieldType === 'H' ? dataForFrequency.H_vectors : dataForFrequency.E_vectors)
    : undefined;
  const magnitudes = dataForFrequency
    ? (fieldType === 'H' ? dataForFrequency.H_mag : dataForFrequency.E_mag)
    : undefined;

  // Get visualization properties
  const colorMap = item.colorMap || 'jet';
  const opacity = item.opacity !== undefined ? item.opacity : 0.9;
  const arrowSize = item.arrowSize || 1.0;
  const arrowDensity = Math.max(1, Math.round(item.arrowDensity || 1)); // Show every Nth arrow
  const valueRangeMode = item.valueRangeMode || 'auto';
  const phaseDeg = item.phase ?? 0;
  const phaseRad = (phaseDeg * Math.PI) / 180;

  // Compute magnitudes: For Poynting use pre-computed, for E/H use phase-dependent
  const vectorMagnitudes = useMemo(() => {
    if (isPoynting && poyntingVectors) {
      // Poynting: use pre-computed magnitudes (time-averaged, no phase dependency)
      return poyntingVectors.map(v => v.mag);
    }
    if (!complexVectors) return magnitudes;
    // E/H fields: compute instantaneous magnitude |Re(V * e^{jφ})|
    const cosP = Math.cos(phaseRad);
    const sinP = Math.sin(phaseRad);
    return complexVectors.map((v) => {
      const rx = v.x.real * cosP - v.x.imag * sinP;
      const ry = v.y.real * cosP - v.y.imag * sinP;
      const rz = v.z.real * cosP - v.z.imag * sinP;
      return Math.sqrt(rx * rx + ry * ry + rz * rz);
    });
  }, [isPoynting, poyntingVectors, complexVectors, phaseRad, magnitudes]);

  // Calculate value range
  const min = (vectorMagnitudes && vectorMagnitudes.length > 0)
    ? (valueRangeMode === 'manual' ? item.valueRangeMin || 0 : Math.min(...vectorMagnitudes))
    : 0;
  const max = (vectorMagnitudes && vectorMagnitudes.length > 0)
    ? (valueRangeMode === 'manual' ? item.valueRangeMax || 1 : Math.max(...vectorMagnitudes))
    : 1;

  // Create colors for each vector
  const colors = useMemo(() => {
    if (!vectorMagnitudes) return new Float32Array(0);
    return createColorArray(vectorMagnitudes, colorMap as any, min, max);
  }, [vectorMagnitudes, colorMap, min, max]);

  // Create arrow helpers
  const arrows = useMemo(() => {
    if (!dataForFrequency || !vectorMagnitudes) return [];
    
    // For Poynting: use pre-computed real vectors
    if (isPoynting && poyntingVectors) {
      return dataForFrequency.points.map((point, index) => {
        // Skip arrows based on density setting
        if (index % arrowDensity !== 0) return null;
        if (index >= poyntingVectors.length) return null;

        const S = poyntingVectors[index];
        const magnitude = S.mag;

        // Poynting direction is the real-valued S vector
        const direction = new THREE.Vector3(S.x, S.y, S.z);
        const length = direction.length();
        if (length === 0) return null;
        direction.normalize();

        // Get color for this arrow
        const color = new THREE.Color(
          colors[index * 3],
          colors[index * 3 + 1],
          colors[index * 3 + 2]
        );

        // Scale arrow length by magnitude and size factor
        const normalizedMagnitude = max > min ? (magnitude - min) / (max - min) : 0.5;
        const arrowLength = 5 * arrowSize * (0.2 + 0.8 * normalizedMagnitude); // 5mm base length

        return {
          origin: new THREE.Vector3(point[0], point[1], point[2]),
          direction,
          length: arrowLength,
          color,
        };
      }).filter(Boolean);
    }

    // For E/H fields: use complex vectors with phase
    if (!complexVectors) return [];
    const cosP = Math.cos(phaseRad);
    const sinP = Math.sin(phaseRad);
    return dataForFrequency.points.map((point, index) => {
      // Skip arrows based on density setting
      if (index % arrowDensity !== 0) return null;
      if (index >= complexVectors.length) return null;

      const vector = complexVectors[index];
      const magnitude = vectorMagnitudes[index];

      // Compute instantaneous direction: Re(V * e^{jφ})
      const direction = new THREE.Vector3(
        vector.x.real * cosP - vector.x.imag * sinP,
        vector.y.real * cosP - vector.y.imag * sinP,
        vector.z.real * cosP - vector.z.imag * sinP,
      );

      // Normalize direction
      const length = direction.length();
      if (length === 0) return null;
      direction.normalize();

      // Get color for this arrow
      const color = new THREE.Color(
        colors[index * 3],
        colors[index * 3 + 1],
        colors[index * 3 + 2]
      );

      // Scale arrow length by magnitude and size factor
      const normalizedMagnitude = (magnitude - min) / (max - min);
      const arrowLength = 5 * arrowSize * (0.5 + normalizedMagnitude); // 5mm base length

      return {
        origin: new THREE.Vector3(point[0], point[1], point[2]),
        direction,
        length: arrowLength,
        color,
      };
    }).filter(Boolean);
  }, [dataForFrequency?.points, complexVectors, vectorMagnitudes, poyntingVectors, colors, arrowSize, arrowDensity, min, max, phaseRad, isPoynting]);

  // Check if we have valid data to render
  const hasData = isPoynting 
    ? (poyntingVectors && poyntingVectors.length > 0)
    : (complexVectors && vectorMagnitudes && vectorMagnitudes.length > 0);

  if (!field || !fieldData || !frequencyHz || !dataForFrequency || !hasData) {
    return null;
  }

  return (
    <group>
      {arrows.map((arrow, index) => {
        if (!arrow) return null;

        return (
          <primitive
            key={index}
            object={new ArrowHelper(
              arrow.direction,
              arrow.origin,
              arrow.length,
              arrow.color,
              arrow.length * 0.2, // Head length (20% of total)
              arrow.length * 0.1  // Head width (10% of total)
            )}
            // Set opacity through material properties
            onUpdate={(self: any) => {
              if (self.cone && self.cone.material) {
                self.cone.material.transparent = opacity < 1.0;
                self.cone.material.opacity = opacity;
              }
              if (self.line && self.line.material) {
                self.line.material.transparent = opacity < 1.0;
                self.line.material.opacity = opacity;
              }
            }}
          />
        );
      })}
    </group>
  );
};
