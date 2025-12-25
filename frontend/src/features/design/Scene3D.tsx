import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { Box } from '@mui/material';
import { ScaleIndicator, AxisLabels } from '@/components/visualization';
import type { AntennaElement, Mesh } from '@/types/models';
import * as THREE from 'three';

interface Scene3DProps {
  children?: React.ReactNode;
  showScale?: boolean;
  showAxisLabels?: boolean;
  elements?: AntennaElement[];
  mesh?: Mesh;
}

/**
 * Calculate bounding box from antenna elements
 */
function calculateBounds(elements?: AntennaElement[], mesh?: Mesh) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  let hasGeometry = false;

  // Check elements
  if (elements && elements.length > 0) {
    elements.forEach(element => {
      if (!element.visible || !element.mesh?.nodes) return;
      
      element.mesh.nodes.forEach(node => {
        const x = node[0] + element.position[0];
        const y = node[1] + element.position[1];
        const z = node[2] + element.position[2];
        
        min.x = Math.min(min.x, x);
        min.y = Math.min(min.y, y);
        min.z = Math.min(min.z, z);
        max.x = Math.max(max.x, x);
        max.y = Math.max(max.y, y);
        max.z = Math.max(max.z, z);
        hasGeometry = true;
      });
    });
  }
  
  // Check legacy mesh
  if (mesh?.nodes) {
    mesh.nodes.forEach(node => {
      min.x = Math.min(min.x, node[0]);
      min.y = Math.min(min.y, node[1]);
      min.z = Math.min(min.z, node[2]);
      max.x = Math.max(max.x, node[0]);
      max.y = Math.max(max.y, node[1]);
      max.z = Math.max(max.z, node[2]);
      hasGeometry = true;
    });
  }

  if (!hasGeometry) {
    // Default bounds if no geometry
    return { min: new THREE.Vector3(-1, -1, -1), max: new THREE.Vector3(1, 1, 1), size: 2, center: new THREE.Vector3(0, 0, 0) };
  }

  const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  const center = new THREE.Vector3(
    (min.x + max.x) / 2,
    (min.y + max.y) / 2,
    (min.z + max.z) / 2
  );

  return { min, max, size, center };
}

/**
 * Auto-adjust camera to fit antenna
 */
function CameraController({ bounds }: { bounds: ReturnType<typeof calculateBounds> }) {
  const { camera, controls } = useThree();
  
  useEffect(() => {
    if (controls && 'target' in controls) {
      // Center camera on antenna
      const target = bounds.center;
      (controls as any).target.copy(target);
      
      // Position camera to see the whole antenna
      const distance = bounds.size * 2.5; // 2.5x the antenna size for good framing
      const cameraPos = new THREE.Vector3(
        target.x + distance * 0.6,
        target.y + distance * 0.6,
        target.z + distance * 0.6
      );
      
      camera.position.copy(cameraPos);
      camera.lookAt(target);
      (controls as any).update();
      
      console.log('Camera auto-adjusted:', { 
        bounds: { min: bounds.min, max: bounds.max, size: bounds.size },
        center: target,
        cameraPosition: cameraPos,
        distance
      });
    }
  }, [bounds.size, bounds.center.x, bounds.center.y, bounds.center.z, camera, controls]);
  
  return null;
}

/**
 * Scene3D - Main 3D canvas component using React Three Fiber
 * Provides camera controls, lighting, grid, and axes helpers
 * Automatically scales to fit antenna geometry
 */
function Scene3D({ children, showScale = true, showAxisLabels = true, elements, mesh }: Scene3DProps) {
  const controlsRef = useRef<any>(null);
  
  // Calculate scene bounds based on antenna geometry
  const bounds = useMemo(() => {
    const result = calculateBounds(elements, mesh);
    console.log('Scene3D bounds calculated:', result);
    return result;
  }, [elements, mesh]);
  
  // Auto-scale grid and helpers based on antenna size
  const gridSize = Math.max(bounds.size * 2, 2); // At least 2x antenna size, minimum 2m
  // const gridDivisions = Math.ceil(gridSize / 0.5) * 2; // Divisions every 0.5m (unused)
  const axesSize = bounds.size * 1.5;
  const scaleIndicatorSize = Math.max(bounds.size * 0.3, 0.5); // 30% of antenna size, min 0.5m

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative', bgcolor: '#1a1a1a' }}>
      <Canvas>
        {/* Camera setup - Z-axis up, viewing from front-right-top */}
        <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={60} up={[0, 0, 1]} />
        
        {/* Auto-adjust camera when antenna loads */}
        <CameraController bounds={bounds} />

        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 10]} intensity={0.8} castShadow />
        <directionalLight position={[-10, -10, -10]} intensity={0.3} />
        <pointLight position={[0, 10, 0]} intensity={0.5} />

        {/* Grid and axes - Grid on XY plane (Z-up), auto-scaled */}
        <Grid
          args={[gridSize, gridSize]}
          cellSize={Math.max(gridSize / 20, 0.1)}
          cellThickness={0.5}
          cellColor="#6e6e6e"
          sectionSize={Math.max(gridSize / 10, 0.5)}
          sectionThickness={1}
          sectionColor="#9d9d9d"
          fadeDistance={gridSize * 1.5}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={false}
          rotation={[Math.PI / 2, 0, 0]}
        />

        {/* Axes helper - auto-scaled */}
        <axesHelper args={[axesSize]} />

        {/* Camera controls */}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={0.5}
          zoomSpeed={0.8}
          panSpeed={0.5}
          minDistance={bounds.size * 0.5}
          maxDistance={bounds.size * 10}
        />

        {/* Gizmo for orientation - Red=X, Green=Y, Blue=Z(up) */}
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport
            axisColors={['#ff0000', '#00ff00', '#0000ff']}
            labelColor="white"
          />
        </GizmoHelper>

        {/* Scale indicator - auto-sized */}
        {showScale && (
          <ScaleIndicator 
            size={scaleIndicatorSize} 
            position={[bounds.min.x - gridSize * 0.1, bounds.min.y - gridSize * 0.1, 0]} 
          />
        )}
        
        {/* Axis labels with dimensions - auto-scaled */}
        {showAxisLabels && <AxisLabels size={axesSize} />}

        {/* User content */}
        {children}
      </Canvas>
    </Box>
  );
}

export default Scene3D;
