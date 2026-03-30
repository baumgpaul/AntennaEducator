import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Slider,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  PlayArrow as PlayIcon,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { computePostprocessingWorkflow } from '@/store/solverSlice';
import type { SolverResult, Mesh } from '@/types/models';

interface SolutionDataPanelProps {
  results: SolverResult | null;
  currentDistribution: number[] | null;
  radiationPattern: {
    frequency: number;
    directivity: number;
    gain: number;
    efficiency: number;
  } | null;
  mesh: Mesh | null;
  selectedFrequency: number;
  onFrequencyChange: (frequency: number) => void;
}

/**
 * SolutionDataPanel - Left sidebar showing solution data
 *
 * Sections:
 * - Currents (magnitude, phase, real/imag)
 * - Voltages (node values)
 * - Requested Fields (checkboxes for postprocessing)
 * - Frequency selector
 */
function SolutionDataPanel({
  results,
  currentDistribution,
  radiationPattern: _radiationPattern,
  mesh,
  selectedFrequency,
  onFrequencyChange,
}: SolutionDataPanelProps) {
  const dispatch = useAppDispatch();
  const solverState = useAppSelector((state) => state.solver.solverState);
  const postprocessingStatus = useAppSelector((state) => state.solver.postprocessingStatus);
  const postprocessingProgress = useAppSelector((state) => state.solver.postprocessingProgress);

  // Field selection state
  const [selectedFields, setSelectedFields] = useState({
    directivity: true,
    poynting: false,
    efield: false,
    hfield: false,
  });

  // Handle field checkbox changes
  const handleFieldChange = (field: keyof typeof selectedFields) => {
    setSelectedFields((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  // Handle postprocess button — dispatch the real workflow
  const handleRunPostprocess = () => {
    dispatch(computePostprocessingWorkflow());
  };

  const isProcessing = postprocessingStatus === 'running';
  const canRunPostprocess =
    (solverState === 'solved' || solverState === 'postprocessing-ready') &&
    !isProcessing &&
    Object.values(selectedFields).some((v) => v);

  // Get current data for selected frequency
  const currentMagnitudes = currentDistribution || [];
  const maxCurrent = currentMagnitudes.length > 0 ? Math.max(...currentMagnitudes) : 0;
  const avgCurrent = currentMagnitudes.length > 0 ?
    currentMagnitudes.reduce((a, b) => a + b, 0) / currentMagnitudes.length : 0;

  return (
    <Paper
      elevation={2}
      sx={{
        width: 280,
        minWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRight: 1,
        borderColor: 'divider',
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6">Solution Data</Typography>
      </Box>

      {/* Scrollable content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {/* Currents Section */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" fontWeight="medium">
              Currents
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Statistics (Amperes)
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Max
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {maxCurrent.toExponential(2)} A
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Avg
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {avgCurrent.toExponential(2)} A
                  </Typography>
                </Box>
              </Box>
            </Box>

            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Segments: {currentMagnitudes.length}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip label="Magnitude" size="small" color="primary" />
              <Chip label="Phase" size="small" />
              <Chip label="Real/Imag" size="small" />
            </Box>
          </AccordionDetails>
        </Accordion>

        {/* Voltages Section */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" fontWeight="medium">
              Voltages
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Node voltages (complex)
            </Typography>
            <TableContainer sx={{ maxHeight: 200 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Node</TableCell>
                    <TableCell align="right">|V| (V)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results?.node_voltages?.slice(0, 5).map((v, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell align="right">
                        {Math.sqrt(v.real * v.real + v.imag * v.imag).toExponential(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(results?.node_voltages?.length || 0) > 5 && (
                    <TableRow>
                      <TableCell colSpan={2} align="center">
                        <Typography variant="caption" color="text.secondary">
                          ... {(results?.node_voltages?.length || 0) - 5} more
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {!results?.node_voltages && (
                    <TableRow>
                      <TableCell colSpan={2} align="center">
                        <Typography variant="caption" color="text.secondary">
                          No voltage data available
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>

        {/* Requested Fields Section */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" fontWeight="medium">
              Requested Fields
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedFields.directivity}
                    onChange={() => handleFieldChange('directivity')}
                  />
                }
                label="Directivity"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedFields.poynting}
                    onChange={() => handleFieldChange('poynting')}
                  />
                }
                label="Poynting (S)"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedFields.efield}
                    onChange={() => handleFieldChange('efield')}
                  />
                }
                label="E-field"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedFields.hfield}
                    onChange={() => handleFieldChange('hfield')}
                  />
                }
                label="H-field"
              />
            </FormGroup>

            <Button
              fullWidth
              variant="contained"
              startIcon={<PlayIcon />}
              onClick={handleRunPostprocess}
              disabled={!canRunPostprocess}
              sx={{ mt: 2 }}
            >
              {isProcessing ? 'Processing...' : 'Run Postprocess'}
            </Button>
            {isProcessing && (
              <LinearProgress
                variant={postprocessingProgress ? 'determinate' : 'indeterminate'}
                value={postprocessingProgress ? (postprocessingProgress.completed / postprocessingProgress.total) * 100 : undefined}
                sx={{ mt: 1 }}
              />
            )}
          </AccordionDetails>
        </Accordion>

        {/* Frequency Selector */}
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2" gutterBottom>
            Frequency
          </Typography>
          <Typography variant="h6" color="primary">
            {results?.frequency ? `${results.frequency / 1e6} MHz` : '100 MHz'}
          </Typography>

          {/* TODO: Add frequency slider for sweep results */}
          {currentMagnitudes.length > 1 && (
            <Box sx={{ mt: 2 }}>
              <Slider
                value={selectedFrequency}
                onChange={(_, value) => onFrequencyChange(value as number)}
                min={0}
                max={1}
                step={1}
                marks
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `Point ${value + 1}`}
              />
              <Typography variant="caption" color="text.secondary">
                Sweep: multiple points
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

export default SolutionDataPanel;
