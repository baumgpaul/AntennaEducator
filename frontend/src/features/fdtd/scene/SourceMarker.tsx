/**
 * SourceMarker — Renders an FDTD source as a visual marker in the 3D scene.
 * Arrow icon at source position, color-coded by type.
 */

interface SourceMarkerProps {
  source: {
    id: string;
    name: string;
    type: string;
    position: [number, number, number];
    polarization: string;
  };
  selected?: boolean;
  onClick?: () => void;
  scale?: number;
}

const SOURCE_COLORS: Record<string, string> = {
  gaussian_pulse: '#ffeb3b',
  sinusoidal: '#ff9800',
  modulated_gaussian: '#ff5722',
  plane_wave: '#2196f3',
  waveguide_port: '#9c27b0',
};

function SourceMarker({ source, selected = false, onClick, scale = 1 }: SourceMarkerProps) {
  const color = SOURCE_COLORS[source.type] ?? '#ffeb3b';
  const markerSize = 0.015 * scale;

  return (
    <group position={source.position} onClick={onClick}>
      {/* Cone pointing in polarization direction */}
      <mesh rotation={source.polarization === 'z' ? [0, 0, 0] : source.polarization === 'x' ? [0, 0, -Math.PI / 2] : [Math.PI / 2, 0, 0]}>
        <coneGeometry args={[markerSize, markerSize * 3, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.5 : 0.2} />
      </mesh>
      {/* Base sphere */}
      <mesh>
        <sphereGeometry args={[markerSize * 0.6, 16, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>
      {selected && (
        <mesh>
          <sphereGeometry args={[markerSize * 2, 16, 8]} />
          <meshBasicMaterial color="#00e5ff" wireframe transparent opacity={0.4} />
        </mesh>
      )}
    </group>
  );
}

export default SourceMarker;
