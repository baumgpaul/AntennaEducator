import { Box, Typography } from '@mui/material';
import type { SolverWorkflowState } from '@/store/solverSlice';

interface PostprocessingTabProps {
  solverState: SolverWorkflowState;
}

function PostprocessingTab({ solverState }: PostprocessingTabProps) {
  const statusMessage =
    solverState === 'postprocessing-ready'
      ? 'Postprocessing results ready. Visualization coming soon.'
      : 'Solver results available (voltages/currents). Visualization coming soon.';

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <Box
        sx={{
          width: 280,
          borderRight: 1,
          borderColor: 'divider',
          p: 2,
          overflowY: 'auto',
        }}
      >
        <Typography variant="h6" gutterBottom>
          Structure
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Postprocessing tree will appear here. Current state: {solverState}.
        </Typography>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <Typography variant="h6" color="text.secondary" textAlign="center">
          {statusMessage}
        </Typography>
      </Box>

      <Box
        sx={{
          width: 300,
          borderLeft: 1,
          borderColor: 'divider',
          p: 2,
          overflowY: 'auto',
        }}
      >
        <Typography variant="h6" gutterBottom>
          Visualization Settings
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Controls for modes, color maps, and export will be added in Day 5 tasks.
        </Typography>
      </Box>
    </Box>
  );
}

export default PostprocessingTab;
