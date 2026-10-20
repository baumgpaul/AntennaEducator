import { useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Line, OrbitControls, OrthographicCamera } from '@react-three/drei';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { CenterFocusStrong } from '@mui/icons-material';
import type { ColorMapType } from '@/utils/colorMaps';
import { Colorbar } from '@/features/postprocessing/Colorbar';
import FieldSurface, { type FieldSurfaceProps } from './FieldSurface';
import { boundsOf, fitView, valueRange, type FieldMesh } from './fieldMesh';

export interface FieldViewerProps extends Omit<FieldSurfaceProps, 'range' | 'onProbe' | 'colorMap'> {
  mesh: FieldMesh;
  colorMap?: ColorMapType;
  /** Fixed colour range; default: the values' own range */
  range?: { min: number; max: number };
  /** 2D results (z = 0): top view, pan and zoom only */
  flat?: boolean;
  height?: number | string;
  /** Lines drawn over the field, e.g. where a line probe samples it */
  overlayLines?: { from: [number, number, number]; to: [number, number, number]; color?: string }[];
}

/** Camera and controls framing the mesh; remounted on "reset view" and when the geometry changes. */
function FittedView({ mesh, flat }: { mesh: FieldMesh; flat: boolean }) {
  const { width, height } = useThree((s) => s.size);
  const bounds = useMemo(() => boundsOf(mesh), [mesh]);
  // the view is fixed at mount: panning and zooming are not overridden by re-renders
  // Fixed at mount (panning and zooming are the user's); the key below remounts it
  const [view] = useState(() => fitView(bounds, flat, width, height));
  return (
    <group>
      <OrthographicCamera makeDefault position={view.position} up={view.up} zoom={view.zoom} near={-1e6} far={1e6} />
      <OrbitControls makeDefault target={view.target} enableRotate={!flat} screenSpacePanning enableDamping={false} />
    </group>
  );
}

/**
 * The shared field viewer: a field on a mesh with colour scale, contour lines,
 * arrows, and the value under the cursor. Pan with the mouse, zoom with the wheel.
 */
function FieldViewer({ mesh, colorMap = 'jet', range, flat = true, height = 460, overlayLines = [], ...surface }: FieldViewerProps) {
  const auto = useMemo(() => valueRange(mesh.cellValues ?? mesh.nodeValues ?? []), [mesh]);
  const r = range ?? auto;
  const geometryKey = useMemo(() => {
    const b = boundsOf(mesh);
    return `${b.min.join()}|${b.max.join()}`;
  }, [mesh]);
  // A reading belongs to the field it was taken on: never show it with another one
  const [reading, setReading] = useState<{ mesh: FieldMesh; value: number; point: [number, number, number] } | null>(null);
  const probe = reading?.mesh === mesh ? reading : null;
  const [version, setVersion] = useState(0);

  return (
    <Box sx={{ position: 'relative', height, borderRadius: 1, overflow: 'hidden', bgcolor: '#1e1e1e' }} data-testid="field-viewer">
      {/* linear + flat: the colour maps give final display colours, no further conversion */}
      <Canvas linear flat>
        {/* refit on "reset view" and when the geometry changes, not when only the field does */}
        <FittedView key={`${geometryKey}|${flat}|${version}`} mesh={mesh} flat={flat} />
        <FieldSurface
          mesh={mesh}
          colorMap={colorMap}
          range={r}
          onProbe={(p) => setReading(p && { ...p, mesh })}
          {...surface}
        />
        {overlayLines.map((l, i) => (
          <Line key={i} points={[l.from, l.to]} color={l.color ?? '#ff4081'} lineWidth={3} position={[0, 0, 3e-6]} />
        ))}
      </Canvas>
      <Colorbar min={r.min} max={r.max} colorMap={colorMap} label={mesh.label} unit={mesh.unit} compact />
      <Tooltip title="Reset view">
        <IconButton
          size="small"
          aria-label="Reset view"
          onClick={() => setVersion((v) => v + 1)}
          sx={{ position: 'absolute', left: 8, top: 8, color: 'white', bgcolor: 'rgba(0,0,0,0.35)' }}
        >
          <CenterFocusStrong fontSize="small" />
        </IconButton>
      </Tooltip>
      <Typography
        variant="caption"
        sx={{ position: 'absolute', left: 8, bottom: 6, color: 'white', bgcolor: 'rgba(0,0,0,0.45)', px: 1, borderRadius: 1 }}
        aria-live="polite"
      >
        {probe
          ? `${mesh.label} = ${probe.value.toPrecision(4)} ${mesh.unit} at (${(probe.point[0] * 1e3).toFixed(2)}, ${(probe.point[1] * 1e3).toFixed(2)}) mm`
          : 'Hover the field to read values · drag to pan · wheel to zoom'}
      </Typography>
    </Box>
  );
}

export default FieldViewer;
