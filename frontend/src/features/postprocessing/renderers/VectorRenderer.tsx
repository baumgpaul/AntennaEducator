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

  if (!field || !fieldData || !frequencyHz) {
    return null;
  }

  // Get field data for this frequency
  const dataForFrequency = fieldData[field.id]?.[frequencyHz];

  if (!dataForFrequency) {
    return null;
  }

  // Determine which vectors to use (E or H field)
  const vectors = field.fieldType === 'E' ? dataForFrequency.E_vectors : dataForFrequency.H_vectors;
  const magnitudes = field.fieldType === 'E' ? dataForFrequency.E_mag : dataForFrequency.H_mag;

  if (!vectors || !magnitudes) {
    return null;
  }

  // Get visualization properties
  const colorMap = item.colorMap || 'jet';
  const opacity = item.opacity !== undefined ? item.opacity : 0.9;
  const arrowSize = item.arrowSize || 1.0;
  const valueRangeMode = item.valueRangeMode || 'auto';

  // Calculate value range
  const min = valueRangeMode === 'manual' 
    ? item.valueRangeMin || 0 
    : Math.min(...magnitudes);
  const max = valueRangeMode === 'manual' 
    ? item.valueRangeMax || 1 
    : Math.max(...magnitudes);

  // Create colors for each vector
  const colors = useMemo(() => {
    return createColorArray(magnitudes, colorMap as any, min, max);
  }, [magnitudes, colorMap, min, max]);

  // Create arrow helpers
  const arrows = useMemo(() => {
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
  }, [dataForFrequency.points, vectors, magnitudes, colors, arrowSize, min, max]);

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
