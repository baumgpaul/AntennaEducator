import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Checkbox,
  FormControlLabel,
  Slider,
  IconButton,
  Collapse,
} from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';

/**
 * FieldRegionControls - Overlay controls for field region visualization
 * 
 * Features:
 * - Toggle field region visibility
 * - Adjust opacity (0-100%)
 * - Collapsible panel
 * 
 * Positioned absolutely over the 3D canvas (top-left)
 */

interface FieldRegionControlsProps {
  visible: boolean;
  opacity: number; // 0-1
  onVisibleChange: (visible: boolean) => void;
  onOpacityChange: (opacity: number) => void;
}

export function FieldRegionControls({
  visible,
  opacity,
  onVisibleChange,
  onOpacityChange,
}: FieldRegionControlsProps) {
  const [expanded, setExpanded] = useState(true);

  const handleOpacityChange = (_event: Event, value: number | number[]) => {
    onOpacityChange((value as number) / 100); // Convert 0-100 to 0-1
  };

  return (
    <Paper
      elevation={3}
      sx={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 10,
        minWidth: 220,
        maxWidth: 280,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(4px)',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          pb: expanded ? 1 : 1.5,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          Field Regions
        </Typography>
        <IconButton size="small" sx={{ ml: 1 }}>
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </IconButton>
      </Box>

      {/* Controls */}
      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2 }}>
          {/* Visibility toggle */}
          <FormControlLabel
            control={
              <Checkbox
                checked={visible}
                onChange={(e) => onVisibleChange(e.target.checked)}
                size="small"
              />
            }
            label={
              <Typography variant="body2">
                Show Regions
              </Typography>
            }
            sx={{ mb: 1 }}
          />

          {/* Opacity slider */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom>
              Opacity: {Math.round(opacity * 100)}%
            </Typography>
            <Slider
              value={opacity * 100}
              onChange={handleOpacityChange}
              min={0}
              max={100}
              step={5}
              disabled={!visible}
              size="small"
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value}%`}
              sx={{ mt: 1 }}
            />
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}
