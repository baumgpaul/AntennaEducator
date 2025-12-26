import { Box, Typography, Paper, Stack } from '@mui/material';
import type { AntennaElement } from '@/types/models';
import { DEFAULT_ELEMENT_COLOR } from '@/utils/colors';

interface ColorLegendProps {
  elements?: AntennaElement[];
  visible?: boolean;
}

/**
 * ColorLegend - Displays color-coded legend for antenna elements
 * Shows all visible elements with their assigned colors
 * Positioned at bottom-left of 3D canvas
 */
function ColorLegend({ elements, visible = true }: ColorLegendProps) {
  if (!visible || !elements || elements.length === 0) {
    return null;
  }

  // Filter to only visible elements
  const visibleElements = elements.filter((el) => el.visible);

  if (visibleElements.length === 0) {
    return null;
  }

  return (
    <Paper
      sx={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        p: 1.5,
        bgcolor: 'rgba(18, 18, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        maxWidth: 280,
        zIndex: 10,
      }}
      elevation={4}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          color: 'text.secondary',
          mb: 1,
          display: 'block',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Elements
      </Typography>
      <Stack spacing={0.75}>
        {visibleElements.map((element) => (
          <Box
            key={element.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            {/* Color swatch */}
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '4px',
                bgcolor: element.color || DEFAULT_ELEMENT_COLOR,
                border: '1px solid',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                flexShrink: 0,
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}
            />
            {/* Element name and type */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  fontSize: '0.8125rem',
                  color: 'text.primary',
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {element.name}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.6875rem',
                  color: 'text.secondary',
                  lineHeight: 1,
                }}
              >
                {element.type.charAt(0).toUpperCase() + element.type.slice(1)}
              </Typography>
            </Box>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

export default ColorLegend;
