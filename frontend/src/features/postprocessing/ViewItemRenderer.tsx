import React from 'react';
import { ViewItem } from '../../types/postprocessing';
import {
  AntennaRenderer,
  CurrentRenderer,
  VoltageRenderer,
  FieldRenderer,
  DirectivityRenderer,
  VectorRenderer,
} from './renderers';

interface ViewItemRendererProps {
  item: ViewItem;
  frequencyHz?: number;
  /** Current animation phase in radians, passed through to renderers that support animation */
  animationPhase?: number;
}

/**
 * Main renderer component that delegates to specific renderers based on item type.
 * Handles all 10 ViewItem types:
 * - antenna-system, single-antenna
 * - current, voltage
 * - field-magnitude, field-magnitude-component
 * - directivity
 * - field-vector, field-vector-component
 * - scalar-plot (Line view only, not rendered in 3D)
 */
export const ViewItemRenderer: React.FC<ViewItemRendererProps> = ({
  item,
  frequencyHz,
  animationPhase,
}) => {
  // Don't render if item is not visible
  if (!item.visible) {
    return null;
  }

  // Render based on item type
  switch (item.type) {
    case 'antenna-system':
    case 'single-antenna':
      return <AntennaRenderer item={item} />;

    case 'current':
      return <CurrentRenderer item={item} frequencyHz={frequencyHz} animationPhase={animationPhase} />;

    case 'voltage':
      return <VoltageRenderer item={item} frequencyHz={frequencyHz} animationPhase={animationPhase} />;

    case 'field-magnitude':
    case 'field-magnitude-component':
      return <FieldRenderer item={item} frequencyHz={frequencyHz} animationPhase={animationPhase} />;

    case 'directivity':
      return <DirectivityRenderer item={item} frequencyHz={frequencyHz} />;

    case 'field-vector':
    case 'field-vector-component':
      return <VectorRenderer item={item} frequencyHz={frequencyHz} animationPhase={animationPhase} />;

    case 'scalar-plot':
      // Scalar plots are only for Line views, not rendered in 3D
      return null;

    default:
      console.warn(`Unknown item type: ${(item as ViewItem).type}`);
      return null;
  }
};
