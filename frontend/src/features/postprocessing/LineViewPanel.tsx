/**
 * LineViewPanel - Displays multiple scalar plots stacked vertically
 * Shows impedance, voltage, and current plots with shared X-axis (frequency)
 */

import { Box, Typography, Divider } from '@mui/material';
import { useAppSelector } from '@/store/hooks';
import ImpedancePlot from './plots/ImpedancePlot';
import VoltagePlot from './plots/VoltagePlot';
import CurrentPlot from './plots/CurrentPlot';
import type { ViewConfiguration } from '@/types/postprocessing';

interface LineViewPanelProps {
  view: ViewConfiguration;
}

function LineViewPanel({ view }: LineViewPanelProps) {
  // Get solver results from Redux
  const results = useAppSelector((state) => state.solver.results);
  const frequencySweep = useAppSelector((state) => state.solver.frequencySweep);
  const elements = useAppSelector((state) => state.design.elements);

  // Filter visible items
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
  const renderPlot = (item: ViewConfiguration['items'][0], index: number) => {
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
