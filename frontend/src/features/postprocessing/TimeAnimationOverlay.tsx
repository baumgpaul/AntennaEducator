import React from 'react';
import {
  Box,
  IconButton,
  Slider,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Paper,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';

interface TimeAnimationOverlayProps {
  /** Current phase in radians [0, 2π) */
  phase: number;
  /** Current phase in degrees [0, 360) */
  phaseDeg: number;
  /** Whether animation is currently playing */
  isPlaying: boolean;
  /** Animation speed in cycles/second */
  speed: number;
  /** Callback to set phase (radians) */
  onPhaseChange: (phase: number) => void;
  /** Callback to toggle play/pause */
  onPlayPauseToggle: () => void;
  /** Callback to change speed */
  onSpeedChange: (speed: number) => void;
}

const PHASE_STEP_DEG = 15;

/**
 * Floating overlay control for time animation of harmonic field visualization.
 *
 * Appears on top of the 3D canvas when animation is enabled for any vector field item.
 * Provides play/pause, phase scrubbing, step forward/backward, and speed control.
 */
const TimeAnimationOverlay: React.FC<TimeAnimationOverlayProps> = ({
  phase: _phase,
  phaseDeg,
  isPlaying,
  speed,
  onPhaseChange,
  onPlayPauseToggle,
  onSpeedChange,
}) => {
  const handleSliderChange = (_: Event, value: number | number[]) => {
    const deg = value as number;
    onPhaseChange((deg * Math.PI) / 180);
  };

  const handleStepForward = () => {
    const newDeg = phaseDeg + PHASE_STEP_DEG;
    onPhaseChange((newDeg * Math.PI) / 180);
  };

  const handleStepBackward = () => {
    const newDeg = phaseDeg - PHASE_STEP_DEG;
    onPhaseChange((newDeg * Math.PI) / 180);
  };

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        px: 2,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        borderRadius: 2,
        bgcolor: 'rgba(30, 30, 30, 0.92)',
        backdropFilter: 'blur(8px)',
        minWidth: 420,
        maxWidth: 560,
        userSelect: 'none',
      }}
    >
      {/* Step backward */}
      <Tooltip title={`Step −${PHASE_STEP_DEG}°`}>
        <IconButton size="small" onClick={handleStepBackward} sx={{ color: 'grey.300' }}>
          <SkipPreviousIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Play/Pause */}
      <Tooltip title={isPlaying ? 'Pause' : 'Play'}>
        <IconButton size="small" onClick={onPlayPauseToggle} sx={{ color: 'primary.main' }}>
          {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
      </Tooltip>

      {/* Step forward */}
      <Tooltip title={`Step +${PHASE_STEP_DEG}°`}>
        <IconButton size="small" onClick={handleStepForward} sx={{ color: 'grey.300' }}>
          <SkipNextIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Phase slider */}
      <Box sx={{ flex: 1, mx: 1 }}>
        <Slider
          value={Math.round(phaseDeg) % 360}
          onChange={handleSliderChange}
          min={0}
          max={360}
          step={1}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}°`}
          size="small"
          sx={{
            color: 'primary.main',
            '& .MuiSlider-thumb': { width: 14, height: 14 },
            '& .MuiSlider-track': { height: 3 },
            '& .MuiSlider-rail': { height: 3, color: 'grey.600' },
          }}
        />
      </Box>

      {/* Phase readout */}
      <Typography
        variant="caption"
        sx={{ color: 'grey.400', minWidth: 36, textAlign: 'right', fontFamily: 'monospace' }}
      >
        {Math.round(phaseDeg) % 360}°
      </Typography>

      {/* Speed selector */}
      <ToggleButtonGroup
        value={speed}
        exclusive
        onChange={(_, value) => value != null && onSpeedChange(value)}
        size="small"
        sx={{
          '& .MuiToggleButton-root': {
            px: 0.8,
            py: 0.2,
            fontSize: '0.7rem',
            color: 'grey.400',
            borderColor: 'grey.700',
            '&.Mui-selected': {
              color: 'primary.main',
              bgcolor: 'rgba(144, 202, 249, 0.12)',
            },
          },
        }}
      >
        <ToggleButton value={0.5}>0.5×</ToggleButton>
        <ToggleButton value={1}>1×</ToggleButton>
        <ToggleButton value={2}>2×</ToggleButton>
        <ToggleButton value={3}>3×</ToggleButton>
      </ToggleButtonGroup>
    </Paper>
  );
};

export default TimeAnimationOverlay;
