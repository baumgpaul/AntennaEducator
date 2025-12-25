import { Text } from '@react-three/drei';

interface AxisLabelsProps {
  size?: number;
  fontSize?: number;
  color?: string;
}

/**
 * AxisLabels - Displays X, Y, Z axis labels with dimension values
 */
function AxisLabels({ 
  size = 5, 
  fontSize = 0.4,
  color = '#ffffff'
}: AxisLabelsProps) {
  
  return (
    <group>
      {/* X-axis label */}
      <Text
        position={[size + 0.5, 0, 0]}
        fontSize={fontSize}
        color="#ff0000"
        anchorX="left"
        anchorY="middle"
      >
        X
      </Text>
      
      {/* Y-axis label */}
      <Text
        position={[0, size + 0.5, 0]}
        fontSize={fontSize}
        color="#00ff00"
        anchorX="center"
        anchorY="bottom"
      >
        Y
      </Text>
      
      {/* Z-axis label */}
      <Text
        position={[0, 0, size + 0.5]}
        fontSize={fontSize}
        color="#0000ff"
        anchorX="center"
        anchorY="bottom"
      >
        Z (up)
      </Text>

      {/* Dimension markers on axes */}
      {[1, 2, 3, 4].map((i) => (
        <group key={i}>
          {/* X-axis markers */}
          <Text
            position={[i, 0, -0.3]}
            fontSize={fontSize * 0.6}
            color={color}
            anchorX="center"
            anchorY="top"
          >
            {i}m
          </Text>
          
          {/* Y-axis markers */}
          <Text
            position={[0, i, -0.3]}
            fontSize={fontSize * 0.6}
            color={color}
            anchorX="center"
            anchorY="top"
          >
            {i}m
          </Text>
          
          {/* Z-axis markers */}
          <Text
            position={[-0.5, 0, i]}
            fontSize={fontSize * 0.6}
            color={color}
            anchorX="right"
            anchorY="middle"
          >
            {i}m
          </Text>
        </group>
      ))}
    </group>
  );
}

export default AxisLabels;