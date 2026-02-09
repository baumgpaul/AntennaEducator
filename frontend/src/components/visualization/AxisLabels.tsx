import { Text } from '@react-three/drei';

interface AxisLabelsProps {
  size?: number;
  fontSize?: number;
  color?: string;
}

/**
 * Calculate smart label positions based on scene size
 * Returns positions and formatted labels with appropriate units
 */
function calculateLabelPositions(size: number) {
  // Determine appropriate step size and unit
  let step: number;
  let unit = 'm';
  let formatDecimals = 0;

  if (size < 0.01) {
    // Very small (< 10mm) - use mm with 1mm steps
    step = 0.001;
    unit = 'mm';
    formatDecimals = 0;
  } else if (size < 0.1) {
    // Small (< 100mm) - use cm with 1cm steps
    step = 0.01;
    unit = 'cm';
    formatDecimals = 0;
  } else if (size < 1) {
    // Medium (< 1m) - use 10cm steps
    step = 0.1;
    unit = 'm';
    formatDecimals = 1;
  } else if (size < 10) {
    // Large (< 10m) - use 1m steps
    step = 1;
    unit = 'm';
    formatDecimals = 0;
  } else {
    // Very large - use 10m steps
    step = 10;
    unit = 'm';
    formatDecimals = 0;
  }

  // Generate label positions - only show the first one
  const positions = [];
  const valueInDisplayUnit = unit === 'mm' ? step * 1000 :
                              unit === 'cm' ? step * 100 :
                              step;
  positions.push({
    position: step,
    label: formatDecimals > 0 ? valueInDisplayUnit.toFixed(formatDecimals) : Math.round(valueInDisplayUnit).toString()
  });

  return { positions, unit };
}

/**
 * AxisLabels - Displays X, Y, Z axis labels at smart grid positions
 * Automatically adapts scale to match antenna size
 */
function AxisLabels({
  size = 5,
  fontSize = 0.105,
  color = '#999999'
}: AxisLabelsProps) {

  const { positions, unit } = calculateLabelPositions(size);

  return (
    <group>
      {/* X-axis labels at calculated positions */}
      {positions.map((item, i) => (
        <Text
          key={`x-${i}`}
          position={[item.position, -0.15 * size, 0]}
          fontSize={fontSize * 0.5}
          color={color}
          anchorX="center"
          anchorY="top"
        >
          {item.label}
        </Text>
      ))}

      {/* Y-axis labels at calculated positions */}
      {positions.map((item, i) => (
        <Text
          key={`y-${i}`}
          position={[-0.15 * size, item.position, 0]}
          fontSize={fontSize * 0.5}
          color={color}
          anchorX="right"
          anchorY="middle"
        >
          {item.label}
        </Text>
      ))}

      {/* Z-axis labels at calculated positions - vertical */}
      {positions.map((item, i) => (
        <Text
          key={`z-${i}`}
          position={[-0.15 * size, 0, item.position]}
          fontSize={fontSize * 0.5}
          color={color}
          anchorX="center"
          anchorY="middle"
          rotation={[0, Math.PI / 2, 0]}
        >
          {item.label}
        </Text>
      ))}

      {/* Axis name labels with units */}
      <Text
        position={[size * 1.15, -0.15 * size, 0]}
        fontSize={fontSize * 0.7}
        color="#ff6666"
        anchorX="left"
        anchorY="middle"
      >
        X [{unit}]
      </Text>

      <Text
        position={[-0.15 * size, size * 1.15, 0]}
        fontSize={fontSize * 0.7}
        color="#66ff66"
        anchorX="center"
        anchorY="bottom"
      >
        Y [{unit}]
      </Text>

      <Text
        position={[-0.15 * size, 0, size * 1.15]}
        fontSize={fontSize * 0.7}
        color="#6666ff"
        anchorX="center"
        anchorY="bottom"
      >
        Z [{unit}]
      </Text>
    </group>
  );
}

export default AxisLabels;
