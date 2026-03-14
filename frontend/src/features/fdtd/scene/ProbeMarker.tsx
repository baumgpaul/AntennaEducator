/**
 * ProbeMarker — Renders an FDTD probe as a visual marker in the 3D scene.
 * Point probe: small sphere. Line probe: line with endpoints. Plane probe: translucent quad.
 */

interface ProbeMarkerProps {
  probe: {
    id: string;
    name: string;
    type: string;
    position: [number, number, number];
    direction?: [number, number, number];
    extent?: [number, number];
    fields: string[];
  };
  selected?: boolean;
  onClick?: () => void;
  scale?: number;
}

const PROBE_COLOR = '#00e676';

function ProbeMarker({ probe, selected = false, onClick, scale = 1 }: ProbeMarkerProps) {
  const markerSize = 0.01 * scale;

  if (probe.type === 'point') {
    return (
      <group position={probe.position} onClick={onClick}>
        <mesh>
          <sphereGeometry args={[markerSize, 16, 8]} />
          <meshStandardMaterial
            color={PROBE_COLOR}
            emissive={PROBE_COLOR}
            emissiveIntensity={selected ? 0.6 : 0.3}
          />
        </mesh>
        {/* Cross-hair lines for visibility */}
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[markerSize * 4, markerSize * 0.2, markerSize * 0.2]} />
          <meshBasicMaterial color={PROBE_COLOR} />
        </mesh>
        <mesh rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[markerSize * 4, markerSize * 0.2, markerSize * 0.2]} />
          <meshBasicMaterial color={PROBE_COLOR} />
        </mesh>
        {selected && (
          <mesh>
            <sphereGeometry args={[markerSize * 2.5, 16, 8]} />
            <meshBasicMaterial color="#00e5ff" wireframe transparent opacity={0.4} />
          </mesh>
        )}
      </group>
    );
  }

  if (probe.type === 'line') {
    const dir = probe.direction ?? [1, 0, 0];
    const ext = probe.extent ? probe.extent[0] : 0.1;
    const halfLen = ext / 2;
    return (
      <group position={probe.position} onClick={onClick}>
        <mesh rotation={[0, 0, 0]}>
          <boxGeometry args={[halfLen * 2 * Math.abs(dir[0] || 0.01), markerSize * 0.3, markerSize * 0.3]} />
          <meshStandardMaterial
            color={PROBE_COLOR}
            emissive={PROBE_COLOR}
            emissiveIntensity={selected ? 0.6 : 0.3}
          />
        </mesh>
      </group>
    );
  }

  // Plane probe: translucent quad
  return (
    <group position={probe.position} onClick={onClick}>
      <mesh>
        <planeGeometry args={[probe.extent?.[0] ?? 0.1, probe.extent?.[1] ?? 0.1]} />
        <meshStandardMaterial
          color={PROBE_COLOR}
          transparent
          opacity={selected ? 0.4 : 0.2}
          side={2}
        />
      </mesh>
    </group>
  );
}

export default ProbeMarker;
