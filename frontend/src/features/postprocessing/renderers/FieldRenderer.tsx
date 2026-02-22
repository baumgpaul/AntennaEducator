import React from 'react';
import { ViewItem } from '../../../types/postprocessing';
import type { FieldDefinition } from '@/types/fieldDefinitions';
import { useAppSelector } from '../../../store/hooks';
import FieldVisualization from '../../design/FieldVisualization';

interface FieldRendererProps {
  item: ViewItem;
  frequencyHz?: number;
}

/**
 * Renders field-magnitude and field-magnitude-component items.
 * Uses existing FieldVisualization component with color mapping.
 */
export const FieldRenderer: React.FC<FieldRendererProps> = ({
  item,
  frequencyHz,
}) => {
  const fieldData = useAppSelector((state) => state.solver.fieldData);
  const requestedFields = useAppSelector((state) => state.solver.requestedFields) as FieldDefinition[];

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

  // Get visualization properties
  const colorMap = item.colorMap || 'jet';
  const opacity = item.opacity !== undefined ? item.opacity : 0.7;
  const valueRangeMode = item.valueRangeMode || 'auto';
  const valueRangeMin = item.valueRangeMin;
  const valueRangeMax = item.valueRangeMax;
  const smoothShading = item.smoothShading ?? false;
  const interpolationLevel = item.interpolationLevel ?? 2;

  // Prepare field data object for FieldVisualization
  const visualizationData = {
    points: dataForFrequency.points,
    E_mag: dataForFrequency.E_mag,
    H_mag: dataForFrequency.H_mag,
    E_vectors: dataForFrequency.E_vectors,
    H_vectors: dataForFrequency.H_vectors,
  };

  return (
    <FieldVisualization
      field={field}
      visualizationMode="magnitude"
      colorMap={colorMap as any}
      opacity={opacity * 100} // Convert to 0-100 range
      selectedComponent="x"
      complexPart="magnitude"
      fieldData={visualizationData}
      valueRangeMode={valueRangeMode}
      valueRangeMin={valueRangeMin}
      valueRangeMax={valueRangeMax}
      smoothShading={smoothShading}
      interpolationLevel={interpolationLevel}
    />
  );
};
