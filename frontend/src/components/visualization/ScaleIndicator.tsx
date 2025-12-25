import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

interface ScaleIndicatorProps {
  size?: number;
  position?: [number, number, number];
  color?: string;
  units?: string;
}

/**
 * ScaleIndicator - Displays measurement scale in the 3D scene
 * Shows scale bars with measurements and grid references
 */
function ScaleIndicator({ 
  size = 1, 
  position = [-8, -8, 0],
  color = '#ffffff',
  units = 'm'
}: ScaleIndicatorProps) {
  
  // Generate scale markings
  const scaleMarkings = useMemo(() => {
    const markings = [];
    const steps = [0, size * 0.25, size * 0.5, size * 0.75, size];
    
    for (let i = 0; i < steps.length; i++) {
      const x = steps[i];
      const isMainMark = i === 0 || i === steps.length - 1;
      
      markings.push({
        position: [position[0] + x, position[1], position[2]] as [number, number, number],
        height: isMainMark ? 0.2 : 0.1,
        label: i === steps.length - 1 ? `${size} ${units}` : (i === 0 ? '0' : undefined)
      });
    }
    
    return markings;
  }, [size, position, units]);

  // Material for scale lines
  const scaleMaterial = useMemo(() => 
    new THREE.LineBasicMaterial({ color, linewidth: 2 }), 
    [color]
  );

  return (
    <group>
      {/* Main scale bar */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([
              position[0], position[1], position[2],
              position[0] + size, position[1], position[2]
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <primitive object={scaleMaterial} />
      </line>

      {/* Scale markings */}
      {scaleMarkings.map((mark, i) => (
        <group key={i}>
          {/* Vertical tick mark */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array([
                  mark.position[0], mark.position[1], mark.position[2],
                  mark.position[0], mark.position[1], mark.position[2] + mark.height
                ])}
                itemSize={3}
              />
            </bufferGeometry>
            <primitive object={scaleMaterial} />
          </line>

          {/* Label text */}
          {mark.label && (
            <Text
              position={[mark.position[0], mark.position[1] - 0.3, mark.position[2] + 0.1]}
              fontSize={0.3}
              color={color}
              anchorX="center"
              anchorY="top"
            >
              {mark.label}
            </Text>
          )}
        </group>
      ))}
      
      {/* Scale label */}
      <Text
        position={[position[0] + size / 2, position[1] - 0.6, position[2]]}
        fontSize={0.25}
        color={color}
        anchorX="center"
        anchorY="top"
      >
        Scale
      </Text>
    </group>
  );
}

export default ScaleIndicator;