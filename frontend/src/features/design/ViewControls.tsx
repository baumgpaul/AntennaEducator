import { Box, IconButton, Tooltip, Divider, ToggleButtonGroup, ToggleButton } from '@mui/material';
import {
  ZoomIn,
  ZoomOut,
  ZoomOutMap,
  ThreeDRotation,
  Fullscreen,
  FullscreenExit,
  GridOn,
  GridOff,
} from '@mui/icons-material';
import { useState } from 'react';

interface ViewControlsProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onToggleGrid?: () => void;
  onToggleFullscreen?: () => void;
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
  gridVisible = true,
  isFullscreen = false,
}: ViewControlsProps) {
  const [viewMode, setViewMode] = useState<string>('perspective');

  const handleViewModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: string | null) => {
    if (newMode !== null) {
      setViewMode(newMode);
    }
  };

  const containerStyles = {
    position: 'absolute' as const,
    bottom: 16,
    right: 16,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 1,
    backgroundColor: 'white',
    borderRadius: 1,
    boxShadow: 3,
    p: 0.5,
  };

  return (
    <Box sx={containerStyles}>
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

      <Divider />

      {/* View Mode Toggle */}
      <Box sx={{ px: 0.5 }}>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={handleViewModeChange}
          orientation="vertical"
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              px: 1,
              py: 0.5,
              minWidth: 0,
              fontSize: '0.7rem',
            },
          }}
        >
          <ToggleButton value="perspective">
            <Tooltip title="Perspective View" placement="left">
              <ThreeDRotation fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="orthographic">
            <Tooltip title="Orthographic View" placement="left">
              <Box sx={{ fontSize: '0.7rem', fontWeight: 600 }}>O</Box>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Box>
  );
}

export default ViewControls;
