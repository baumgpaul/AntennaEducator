import { Box, Paper, Typography } from '@mui/material';

interface ColorScaleLegendProps {
  min?: number;
  max?: number;
  unit?: string;
  title?: string;
}

/**
 * ColorScaleLegend - Displays color mapping for current distribution visualization
 * Shows gradient from blue (low) to green (medium) to red (high)
 */
function ColorScaleLegend({
  min = 0,
  max = 1,
  unit = 'A',
  title = 'Current Magnitude'
}: ColorScaleLegendProps) {
  return (
    <Paper
      elevation={3}
      sx={{
        position: 'absolute',
        bottom: 80,
        right: 16,
        p: 2,
        minWidth: 200,
        zIndex: 1000,
        bgcolor: 'rgba(255, 255, 255, 0.95)',
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        {title}
      </Typography>

      {/* Gradient bar */}
      <Box
        sx={{
          height: 20,
          background: 'linear-gradient(to right, #0000ff, #00ff00, #ff0000)',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 0.5,
          mb: 0.5,
        }}
      />

      {/* Value labels */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {min.toExponential(2)} {unit}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {max.toExponential(2)} {unit}
        </Typography>
      </Box>

      {/* Color indicators */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 16,
              height: 16,
              bgcolor: '#0000ff',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 0.5,
            }}
          />
          <Typography variant="caption" color="text.secondary">
            Low
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 16,
              height: 16,
              bgcolor: '#00ff00',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 0.5,
            }}
          />
          <Typography variant="caption" color="text.secondary">
            Medium
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 16,
              height: 16,
              bgcolor: '#ff0000',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 0.5,
            }}
          />
          <Typography variant="caption" color="text.secondary">
            High
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

export default ColorScaleLegend;
