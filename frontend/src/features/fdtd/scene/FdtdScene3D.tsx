/**
 * FdtdScene3D — Main 3D viewport for the FDTD design workspace.
 *
 * Renders the computational domain, structures, sources, probes,
 * and boundary overlays using React Three Fiber.
 *
 * For 1D: top-down orthographic view (x-axis line).
 * For 2D: top-down view of XY plane with orbit controls.
 */
import { Box } from '@mui/material';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Grid, PerspectiveCamera } from '@react-three/drei';
import { useAppSelector } from '@/store/hooks';
import DomainWireframe from './DomainWireframe';
import StructureMesh from './StructureMesh';
import SourceMarker from './SourceMarker';
import ProbeMarker from './ProbeMarker';
import BoundaryFaceOverlay from './BoundaryFaceOverlay';

interface FdtdScene3DProps {
  selectedId?: string | null;
  onSelectStructure?: (id: string) => void;
  onSelectSource?: (id: string) => void;
  onSelectProbe?: (id: string) => void;
}

function FdtdScene3D({
  selectedId,
  onSelectStructure,
  onSelectSource,
  onSelectProbe,
}: FdtdScene3DProps) {
  const { domainSize, dimensionality, structures, sources, probes } = useAppSelector(
    (s) => s.fdtdDesign,
  );

  const [lx, ly] = domainSize;
  const maxDim = Math.max(lx, ly || lx * 0.1);
  const markerScale = maxDim / 0.5; // Scale markers relative to domain size

  // Camera positioned above center, looking down at XY plane
  const camDist = maxDim * 2;
  const center: [number, number, number] =
    dimensionality === '1d' ? [lx / 2, 0, 0] : [lx / 2, ly / 2, 0];

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        bgcolor: '#1a1a2e',
        position: 'relative',
      }}
    >
      <Canvas>
        <PerspectiveCamera
          makeDefault
          position={[center[0], center[1], camDist]}
          fov={50}
          near={maxDim * 0.001}
          far={maxDim * 100}
          up={[0, 1, 0]}
        />

        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 10]} intensity={0.8} />
        <directionalLight position={[-3, -3, 5]} intensity={0.3} />

        {/* Grid on XY plane */}
        <Grid
          args={[maxDim * 4, maxDim * 4]}
          cellSize={maxDim * 0.1}
          sectionSize={maxDim * 0.5}
          cellColor="#2a2a4a"
          sectionColor="#3a3a6a"
          fadeDistance={maxDim * 5}
          position={[center[0], center[1], -0.001]}
        />

        {/* Domain wireframe */}
        <DomainWireframe />

        {/* Boundary face overlays */}
        <BoundaryFaceOverlay />

        {/* Structures */}
        {structures.map((s) => (
          <StructureMesh
            key={s.id}
            structure={s}
            selected={selectedId === s.id}
            onClick={() => onSelectStructure?.(s.id)}
          />
        ))}

        {/* Sources */}
        {sources.map((src) => (
          <SourceMarker
            key={src.id}
            source={src}
            selected={selectedId === src.id}
            onClick={() => onSelectSource?.(src.id)}
            scale={markerScale}
          />
        ))}

        {/* Probes */}
        {probes.map((p) => (
          <ProbeMarker
            key={p.id}
            probe={p}
            selected={selectedId === p.id}
            onClick={() => onSelectProbe?.(p.id)}
            scale={markerScale}
          />
        ))}

        {/* Axes helper */}
        <axesHelper args={[maxDim * 0.3]} position={[0, 0, 0]} />

        {/* Controls */}
        <OrbitControls
          enableDamping
          dampingFactor={0.15}
          target={center}
          maxDistance={maxDim * 10}
          minDistance={maxDim * 0.2}
        />

        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport
            axisColors={['#f44336', '#4caf50', '#2196f3']}
            labelColor="white"
          />
        </GizmoHelper>
      </Canvas>
    </Box>
  );
}

export default FdtdScene3D;
