import { Box, Paper, IconButton, Tooltip, Divider } from '@mui/material';
import {
  ZoomIn,
  ZoomOut,
  ZoomOutMap,
  Fullscreen,
  FullscreenExit,
  GridOn,
  GridOff,
  ThreeDRotation,
  ViewInAr,
} from '@mui/icons-material';
import type { ViewPreset } from './Scene3D';

const PRESETS: ReadonlyArray<[ViewPreset, string, string]> = [
  ['front', 'F', 'Front view (XZ plane)'],
  ['side', 'S', 'Side view (YZ plane)'],
  ['top', 'T', 'Top view (XY plane)'],
];

interface ViewControlsProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onToggleGrid?: () => void;
  onToggleFullscreen?: () => void;
  onToggleCameraMode?: () => void;
  onViewPreset?: (preset: ViewPreset) => void;
  cameraMode?: 'perspective' | 'orthographic';
  gridVisible?: boolean;
  isFullscreen?: boolean;
}

/**
 * ViewControls - 3D viewport control toolbar
 * Floating toolbar for camera and display controls
 */
function ViewControls({
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleGrid,
  onToggleFullscreen,
  onToggleCameraMode,
  onViewPreset,
  cameraMode = 'perspective',
  gridVisible = true,
  isFullscreen = false,
}: ViewControlsProps) {
  return (
    <Paper
      elevation={3}
      sx={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 10,
        p: 0.5,
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Zoom Controls */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Tooltip title="Zoom In" placement="left">
          <IconButton size="small" onClick={onZoomIn}>
            <ZoomIn fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom Out" placement="left">
          <IconButton size="small" onClick={onZoomOut}>
            <ZoomOut fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset View" placement="left">
          <IconButton size="small" onClick={onResetView}>
            <ZoomOutMap fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {onViewPreset && (
        <>
          <Divider />
          {/* Axis views (Z up) */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {PRESETS.map(([preset, letter, title]) => (
              <Tooltip key={preset} title={title} placement="left">
                <IconButton size="small" onClick={() => onViewPreset(preset)} aria-label={title}>
                  <Box component="span" sx={{ fontSize: '0.8rem', fontWeight: 700, width: 20 }}>
                    {letter}
                  </Box>
                </IconButton>
              </Tooltip>
            ))}
          </Box>
        </>
      )}

      <Divider />

      {/* Display Controls */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Tooltip title={gridVisible ? 'Hide Grid' : 'Show Grid'} placement="left">
          <IconButton size="small" onClick={onToggleGrid} color={gridVisible ? 'primary' : 'default'}>
            {gridVisible ? <GridOn fontSize="small" /> : <GridOff fontSize="small" />}
          </IconButton>
        </Tooltip>
        {onToggleCameraMode && (
          <Tooltip
            title={cameraMode === 'perspective' ? 'Orthographic camera (no perspective)' : 'Perspective camera'}
            placement="left"
          >
            <IconButton size="small" onClick={onToggleCameraMode} aria-label="Toggle camera projection">
              {cameraMode === 'perspective' ? <ViewInAr fontSize="small" /> : <ThreeDRotation fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} placement="left">
          <IconButton size="small" onClick={onToggleFullscreen}>
            {isFullscreen ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      </Box>
    </Paper>
  );
}

export default ViewControls;
