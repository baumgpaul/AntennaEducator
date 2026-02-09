import React from 'react';
import { ViewItem } from '../../../types/postprocessing';
import { useAppSelector } from '../../../store/hooks';
import WireGeometry from '../../design/WireGeometry';
import { AntennaElement } from '../../../types/models';

interface AntennaRendererProps {
  item: ViewItem;
}

/**
 * Renders antenna-system (all antennas) or single-antenna items.
 * Uses existing WireGeometry component with custom color and opacity.
 */
export const AntennaRenderer: React.FC<AntennaRendererProps> = ({ item }) => {
  const elements = useAppSelector((state) => state.design.elements);

  if (!elements || elements.length === 0) {
    return null;
  }

  // Determine which antennas to render
  let antennasToRender: AntennaElement[] = [];

  if (item.type === 'antenna-system') {
    // Render all antennas (TODO: filter by antenna type)
    antennasToRender = elements;
  } else if (item.type === 'single-antenna') {
    // Render specific antenna by antennaId
    const antennaId = item.antennaId;
    if (antennaId) {
      antennasToRender = elements.filter((el) => el.id === antennaId);
    } else {
      // Fallback: render first antenna
      antennasToRender = elements.slice(0, 1);
    }
  }

  if (antennasToRender.length === 0) {
    return null;
  }

  // Extract custom color and opacity from item properties
  const customColor = item.color;
  const customOpacity = item.opacity !== undefined ? item.opacity : 1.0;

  return (
    <>
      {antennasToRender.map((element) => (
        <WireGeometry
          key={element.id}
          elements={[element]}
          selectedElementId={null}
          customColor={customColor}
          customOpacity={customOpacity}
        />
      ))}
    </>
  );
};
