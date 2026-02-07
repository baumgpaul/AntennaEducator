import React, { useMemo } from 'react';
import { ViewItem } from '../../../types/postprocessing';
import { useAppSelector } from '../../../store/hooks';
import { ArrowHelper } from 'three';
import { createColorArray } from '../../../utils/colorMaps';
import * as THREE from 'three';

interface VectorRendererProps {
  item: ViewItem;
  frequencyHz?: number;
}

/**
 * Renders field-vector and field-vector-component items as arrow helpers.
 * Uses color mapping for vector magnitudes and arrow size control.
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

  // Get field data for this frequency (safe access before early return)
  const dataForFrequency = (field && fieldData && frequencyHz)
    ? fieldData[field.id]?.[frequencyHz]
    : undefined;

  // Determine which vectors to use (E or H field)
  const vectors = dataForFrequency
    ? (field?.fieldType === 'E' ? dataForFrequency.E_vectors : dataForFrequency.H_vectors)
    : undefined;
  const magnitudes = dataForFrequency
    ? (field?.fieldType === 'E' ? dataForFrequency.E_mag : dataForFrequency.H_mag)
    : undefined;

  // Get visualization properties
  const colorMap = item.colorMap || 'jet';
  const opacity = item.opacity !== undefined ? item.opacity : 0.9;
  const arrowSize = item.arrowSize || 1.0;
  const valueRangeMode = item.valueRangeMode || 'auto';

  // Calculate value range
  const min = (magnitudes && magnitudes.length > 0)
    ? (valueRangeMode === 'manual' ? item.valueRangeMin || 0 : Math.min(...magnitudes))
    : 0;
  const max = (magnitudes && magnitudes.length > 0)
    ? (valueRangeMode === 'manual' ? item.valueRangeMax || 1 : Math.max(...magnitudes))
    : 1;

  // Create colors for each vector
  const colors = useMemo(() => {
    if (!magnitudes) return new Float32Array(0);
    return createColorArray(magnitudes, colorMap as any, min, max);
  }, [magnitudes, colorMap, min, max]);

  // Create arrow helpers
  const arrows = useMemo(() => {
    if (!dataForFrequency || !vectors || !magnitudes) return [];
    return dataForFrequency.points.map((point, index) => {
      if (index >= vectors.length) return null;

      const vector = vectors[index];
      const magnitude = magnitudes[index];

      // Convert complex vector to real direction (use real part)
      const direction = new THREE.Vector3(
        vector.x.real,
        vector.y.real,
        vector.z.real
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
  }, [dataForFrequency?.points, vectors, magnitudes, colors, arrowSize, min, max]);

  if (!field || !fieldData || !frequencyHz || !dataForFrequency || !vectors || !magnitudes) {
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
