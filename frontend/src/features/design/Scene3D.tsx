import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { Box } from '@mui/material';

interface Scene3DProps {
  children?: React.ReactNode;
}

/**
 * Scene3D - Main 3D canvas component using React Three Fiber
 * Provides camera controls, lighting, grid, and axes helpers
 */
function Scene3D({ children }: Scene3DProps) {
  const controlsRef = useRef<any>(null);

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative', bgcolor: '#1a1a1a' }}>
      <Canvas>
        {/* Camera setup - Z-axis up, viewing from front-right-top */}
        <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={60} up={[0, 0, 1]} />

        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 10]} intensity={0.8} castShadow />
        <directionalLight position={[-10, -10, -10]} intensity={0.3} />
        <pointLight position={[0, 10, 0]} intensity={0.5} />

        {/* Grid and axes - Grid on XY plane (Z-up) */}
        <Grid
          args={[20, 20]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#6e6e6e"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#9d9d9d"
          fadeDistance={25}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={false}
          rotation={[Math.PI / 2, 0, 0]}
        />

        {/* Axes helper */}
        <axesHelper args={[5]} />

        {/* Camera controls */}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={0.5}
          zoomSpeed={0.8}
          panSpeed={0.5}
          minDistance={1}
          maxDistance={50}
        />

        {/* Gizmo for orientation - Red=X, Green=Y, Blue=Z(up) */}
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport
            axisColors={['#ff0000', '#00ff00', '#0000ff']}
            labelColor="white"
          />
        </GizmoHelper>

        {/* User content */}
        {children}
      </Canvas>
    </Box>
  );
}

export default Scene3D;
