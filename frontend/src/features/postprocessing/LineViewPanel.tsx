/**
 * LineViewPanel - Displays multiple scalar plots stacked vertically
 * Shows impedance, voltage, and current plots with shared X-axis (frequency)
 */

import { Box, Typography, Divider } from '@mui/material';
import type { ViewConfiguration } from '@/types/postprocessing';

interface LineViewPanelProps {
  view: ViewConfiguration;
}

function LineViewPanel({ view }: LineViewPanelProps) {
  // Render each plot type
  const visibleItems = view.items.filter((item) => item.visible);

  if (visibleItems.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          p: 4
        }}
      >
        <Typography variant="body1" color="text.secondary">
          No plots added to this view. Use the ribbon menu to add impedance, voltage, or current plots.
        </Typography>
      </Box>
    );
  }

  // Render each plot type
  const renderPlot = (item: ViewConfiguration['items'][0], _index: number) => {
    // Note: impedance/voltage/current plots are deprecated and need implementation
    // They require restructuring FrequencySweepResult to include these data
    return (
      <Box key={item.id} sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Plot type not yet implemented. Use field visualization or radiation patterns instead.
        </Typography>
      </Box>
    );
  };

  return (
    <Box sx={{ width: '100%', height: '100%', overflow: 'auto', bgcolor: 'background.default' }}>
      {visibleItems.map((item, index) => (
        <Box key={item.id}>
          {renderPlot(item, index)}
          {index < visibleItems.length - 1 && <Divider />}
        </Box>
      ))}
    </Box>
  );
}

export default LineViewPanel;
