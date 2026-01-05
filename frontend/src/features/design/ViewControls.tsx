import { Box, Paper, IconButton, Tooltip, Divider } from '@mui/material';
import {
  ZoomIn,
  ZoomOut,
  ZoomOutMap,
  Fullscreen,
  FullscreenExit,
  GridOn,
  GridOff,
} from '@mui/icons-material';

interface ViewControlsProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onToggleGrid?: () => void;
  onToggleFullscreen?: () => void;
  onToggleCameraMode?: (mode: 'perspective' | 'orthographic') => void;
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
  gridVisible = true,
  isFullscreen = false,
}: ViewControlsProps) {
  const handleViewModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: string | null) => {
    if (newMode !== null && onToggleCameraMode) {
      onToggleCameraMode(newMode as 'perspective' | 'orthographic');
    }
  };

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

      <Divider />

      {/* Display Controls */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Tooltip title={gridVisible ? 'Hide Grid' : 'Show Grid'} placement="left">
          <IconButton size="small" onClick={onToggleGrid} color={gridVisible ? 'primary' : 'default'}>
            {gridVisible ? <GridOn fontSize="small" /> : <GridOff fontSize="small" />}
          </IconButton>
        </Tooltip>
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

