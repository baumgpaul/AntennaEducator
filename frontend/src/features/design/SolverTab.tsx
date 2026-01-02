import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Box, Paper, Button, ButtonGroup, Typography, Divider, Chip, CircularProgress, Snackbar, Alert, IconButton } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import GridOnIcon from '@mui/icons-material/GridOn';
import CalculateIcon from '@mui/icons-material/Calculate';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StopIcon from '@mui/icons-material/Stop';
import TreeViewPanel from './TreeViewPanel';
import Scene3D from './Scene3D';
import WireGeometry from './WireGeometry';
import { FieldRegionVisualization } from './FieldRegionVisualization';
import { SolverPropertiesPanel } from './SolverPropertiesPanel';
import { FrequencyInputDialog } from './FrequencyInputDialog';
import { FrequencySweepDialog } from './FrequencySweepDialog';
import { AddFieldDialog } from './AddFieldDialog';
import DirectivitySettingsDialog from './DirectivitySettingsDialog';
import type { AntennaElement } from '@/types/models';
import type { AppDispatch, RootState } from '@/store/store';
import { 
  addFieldRegion, 
  deleteFieldRegion, 
  updateFieldRegion, 
  setDirectivityRequested,
  setDirectivitySettings,
  solveSingleFrequencyWorkflow,
  computePostprocessingWorkflow,
  runFrequencySweep,
  selectSolverStatus,
  selectSolverError,
  selectSolverProgress,
  selectCurrentFrequency,
  selectFrequencySweep,
  selectResultsStale,
  cancelPostprocessing,
} from '@/store/solverSlice';
import type { FieldDefinition } from '@/types/fieldDefinitions';
import type { FrequencySweepParams, MultiAntennaRequest } from '@/types/api';

/**
 * SolverTab - New 3-panel layout for solver workflow
 * Top: Ribbon Menu with Solve actions
 * Left: Tree View (280px) - Structure + Requested Quantities
 * Middle: 3D Visualization (flex) - Geometry + Field Regions
 * Right: Properties Panel (300px) - Field region editor
 */

interface SolverTabProps {
  elements: AntennaElement[];
  selectedElementId: string | null;
  onElementSelect: (id: string) => void;
  onElementVisibilityToggle: (elementId: string, visible: boolean) => void;
  solverStatus?: 'idle' | 'preparing' | 'running' | 'completed' | 'error' | 'postprocessing-ready';
}

export function SolverTab({ elements, selectedElementId, onElementSelect, onElementVisibilityToggle, solverStatus = 'idle' }: SolverTabProps) {
  const dispatch = useDispatch<AppDispatch>();
  
  // Redux state
  const requestedFields = useSelector((state: RootState) => state.solver.requestedFields);
  const directivityRequested = useSelector((state: RootState) => state.solver.directivityRequested);
  const directivitySettings = useSelector((state: RootState) => state.solver.directivitySettings);
  const solverWorkflowState = useSelector((state: RootState) => state.solver.solverState);
  const simulationStatus = useSelector(selectSolverStatus);
  const simulationError = useSelector(selectSolverError);
  const solverProgress = useSelector(selectSolverProgress);
  const currentFrequency = useSelector(selectCurrentFrequency);
  const frequencySweep = useSelector(selectFrequencySweep);
  const results = useSelector((state: RootState) => state.solver.results);
  const postprocessingStatus = useSelector((state: RootState) => state.solver.postprocessingStatus);
  const fieldResults = useSelector((state: RootState) => state.solver.fieldResults);
  const postprocessingProgress = useSelector((state: RootState) => state.solver.postprocessingProgress);
  const resultsStale = useSelector(selectResultsStale);
  
  // Local state
  const [frequencyDialogOpen, setFrequencyDialogOpen] = useState(false);
  const [sweepDialogOpen, setSweepDialogOpen] = useState(false);
  const [addFieldDialogOpen, setAddFieldDialogOpen] = useState(false);
  const [directivityDialogOpen, setDirectivityDialogOpen] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>(undefined);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error' | 'info'>('success');
  
  // Field region visualization state
  const [fieldRegionsVisible, setFieldRegionsVisible] = useState(true);

  // Wrapped handlers with logging
  const handleFieldRegionsVisibleChange = (visible: boolean) => {
    console.log('[SolverTab] Field regions visible changed:', visible);
    setFieldRegionsVisible(visible);
  };

  // Debug: Log state
  console.log('[SolverTab] State:', {
    elementsCount: elements.length,
    fieldsCount: requestedFields.length,
    fieldsVisible: fieldRegionsVisible,
    selectedFieldId
  });
  console.log('[SolverTab] Requested fields:', requestedFields);

  const handleSolveSingle = () => {
    setFrequencyDialogOpen(true);
  };

  const handleSweep = () => {
    setSweepDialogOpen(true);
  };

  const handleFrequencySweepSubmit = async (params: FrequencySweepParams) => {
    try {
      if (!elements || elements.length === 0) {
        setSnackbarMessage('No antenna elements in design');
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
        return;
      }

      // Build antenna requests similar to single frequency solve
      const antennaRequests = elements.map((element: AntennaElement) => {
        if (!element.mesh) {
          throw new Error(`Element ${element.name} has no mesh`);
        }

        const allSources = element.sources || [];
        const voltage_sources = allSources
          .filter((s) => s.type === 'voltage')
          .map((s) => ({
            node_start: s.node_start,
            node_end: s.node_end,
            value: typeof s.amplitude === 'number' ? s.amplitude : 
                   typeof s.amplitude === 'string' ? parseFloat(s.amplitude) : 
                   (s.amplitude as any).real || 1.0,
            R: s.series_R || 0,
            L: s.series_L || 0,
            C_inv: s.series_C_inv || 0,
          }));

        const current_sources = allSources
          .filter((s) => s.type === 'current')
          .map((s) => ({
            node_start: s.node_start,
            node_end: s.node_end,
            value: typeof s.amplitude === 'number' ? s.amplitude : 
                   typeof s.amplitude === 'string' ? parseFloat(s.amplitude) : 
                   (s.amplitude as any).real || 1.0,
          }));

        const loads = (element.lumped_elements || []).map((le) => ({
          node_start: le.node_start,
          node_end: le.node_end,
          R: le.R,
          L: le.L,
          C_inv: le.C_inv,
        }));

        return {
          antenna_id: element.id,
          nodes: element.mesh.nodes,
          edges: element.mesh.edges,
          radii: element.mesh.radii,
          voltage_sources,
          current_sources,
          loads,
        };
      });

      // Base request without frequency (will be set per sweep point)
      const baseRequest: Omit<MultiAntennaRequest, 'frequency'> = {
        antennas: antennaRequests,
      };

      // Close dialog immediately
      setSweepDialogOpen(false);

      await dispatch(runFrequencySweep({
        params,
        request: baseRequest as MultiAntennaRequest,
      })).unwrap();

      setSnackbarMessage(`Frequency sweep complete! ${params.numPoints} frequencies solved.`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error: any) {
      setSnackbarMessage(error || 'Frequency sweep failed');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const handleAddDirectivity = () => {
    console.log('[SolverTab] Add Directivity clicked, current directivityRequested:', directivityRequested);
    // Ensure state reflects directivity intent immediately for UI/tests
    if (!directivityRequested) {
      dispatch(setDirectivityRequested(true));
    }
    if (!directivitySettings) {
      dispatch(setDirectivitySettings({ theta_points: 19, phi_points: 37 }));
    }
    setDirectivityDialogOpen(true);
  };
  
  const handleDirectivityConfirm = (settings: { theta_points: number; phi_points: number }) => {
    console.log('[SolverTab] Directivity settings confirmed:', settings);
    dispatch(setDirectivitySettings(settings));
    if (!directivityRequested) {
      dispatch(setDirectivityRequested(true));
      console.log('[SolverTab] Directivity requested set to true');
    }
    setSelectedFieldId('directivity');
    setDirectivityDialogOpen(false);
  };

  const handleAddField = () => {
    setAddFieldDialogOpen(true);
  };

  const handleComputePostprocessing = async () => {
    // Allow postprocessing when solver has results (solved or postprocessing-ready)
    if (solverWorkflowState === 'solved' || solverWorkflowState === 'postprocessing-ready') {
      console.log('[SolverTab] Starting postprocessing workflow, state:', solverWorkflowState);
      try {
        await dispatch(computePostprocessingWorkflow()).unwrap();
        setSnackbarMessage('Postprocessing complete!');
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      } catch (error: any) {
        setSnackbarMessage(error || 'Postprocessing failed');
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
      }
    } else {
      console.warn('[SolverTab] Postprocessing blocked, state:', solverWorkflowState);
    }
  };

  const handleCancelPostprocessing = () => {
    dispatch(cancelPostprocessing());
    setSnackbarMessage('Postprocessing cancelled');
    setSnackbarSeverity('info');
    setSnackbarOpen(true);
  };

  const handleFrequencySolve = async (frequency: number, unit: 'MHz' | 'GHz') => {
    // Close dialog immediately
    setFrequencyDialogOpen(false);
    
    try {
      await dispatch(solveSingleFrequencyWorkflow({ frequency, unit })).unwrap();
      setSnackbarMessage(`Single frequency solve complete at ${frequency} ${unit}`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error: any) {
      setSnackbarMessage(error || 'Solve failed');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const handleFieldAdd = (fieldDefinition: FieldDefinition) => {
    // Add field to Redux store
    dispatch(addFieldRegion(fieldDefinition));
    setAddFieldDialogOpen(false);
  };

  const handleFieldVisibilityToggle = (fieldId: string, visible: boolean) => {
    dispatch(updateFieldRegion({ id: fieldId, updates: { visible } }));
  };

  const handleFieldDelete = (fieldId: string) => {
    dispatch(deleteFieldRegion(fieldId));
  };

  const handleFieldRename = (fieldId: string, newName: string) => {
    dispatch(updateFieldRegion({ id: fieldId, updates: { name: newName } }));
  };

  const handleDirectivityDelete = () => {
    dispatch(setDirectivityRequested(false));
    if (selectedFieldId === 'directivity') {
      setSelectedFieldId(undefined);
    }
  };

  const handleDirectivitySelect = () => {
    setSelectedFieldId('directivity');
  };

  // Allow postprocessing when solver has results (solved or postprocessing-ready)
  const canComputePostprocessing = solverWorkflowState === 'solved' || solverWorkflowState === 'postprocessing-ready';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      {/* SOLVER RIBBON MENU */}
      <Paper
        elevation={1}
        sx={{
          p: 1.5,
          borderRadius: 0,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          gap: 2,
          alignItems: 'flex-start',
          flexShrink: 0,
        }}
      >
        {/* Group 1: Solve Control */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Solve Control
            </Typography>
            {/* Show sweep solution if available, otherwise show single frequency */}
            {(results && frequencySweep?.isComplete) ? (
              <Chip
                icon={<CheckCircleIcon />}
                label={`Sweep: ${frequencySweep.completedCount} pts`}
                size="small"
                sx={{ height: 20, fontSize: '0.65rem', color: 'success.light', bgcolor: 'success.dark' }}
              />
            ) : (results && currentFrequency) ? (
              <Chip
                icon={<CheckCircleIcon />}
                label={`Solved @ ${currentFrequency.toFixed(1)} MHz`}
                size="small"
                sx={{ height: 20, fontSize: '0.65rem', color: 'success.light', bgcolor: 'success.dark' }}
              />
            ) : null}
            {/* Show stale warning if results exist but are outdated */}
            {resultsStale && (
              <Chip
                label="Outdated"
                size="small"
                color="warning"
                sx={{ height: 20, fontSize: '0.65rem' }}
                title="Antenna structure or settings changed. Re-run solver to update results."
              />
            )}
            {simulationStatus === 'running' && (
              <Chip
                icon={<CircularProgress size={12} />}
                label={solverProgress > 0 ? `${solverProgress}%` : 'Running...'}
                size="small"
                sx={{ height: 20, fontSize: '0.65rem', color: 'info.main' }}
              />
            )}
            {simulationStatus === 'failed' && simulationError && (
              <Chip
                label="Error"
                size="small"
                color="error"
                sx={{ height: 20, fontSize: '0.65rem' }}
                title={simulationError}
              />
            )}
          </Box>
          <ButtonGroup size="small" variant="outlined">
            <Button
              startIcon={simulationStatus === 'running' || simulationStatus === 'preparing' ? <CircularProgress size={16} /> : <PlayArrowIcon />}
              onClick={handleSolveSingle}
              disabled={simulationStatus === 'running' || simulationStatus === 'preparing' || postprocessingStatus === 'running'}
            >
              Solve Single
            </Button>
            <Button
              startIcon={<ShowChartIcon />}
              onClick={handleSweep}
              disabled={simulationStatus === 'running' || simulationStatus === 'preparing' || postprocessingStatus === 'running'}
            >
              Sweep
            </Button>
          </ButtonGroup>
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* Group 2: Field Definition */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
            Field Definition
          </Typography>
          <ButtonGroup size="small" variant="outlined">
            <Button
              startIcon={<AddCircleOutlineIcon />}
              onClick={handleAddDirectivity}
              disabled={simulationStatus === 'running' || simulationStatus === 'preparing' || postprocessingStatus === 'running'}
            >
              Add Directivity
            </Button>
            <Button
              startIcon={<GridOnIcon />}
              onClick={handleAddField}
              disabled={simulationStatus === 'running' || simulationStatus === 'preparing' || postprocessingStatus === 'running'}
            >
              Add Field
            </Button>
          </ButtonGroup>
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* Group 3: Postprocessing */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Postprocessing
            </Typography>
            {postprocessingStatus === 'completed' && fieldResults && (
              <Chip
                icon={<CheckCircleIcon />}
                label="Ready"
                size="small"
                sx={{ height: 20, fontSize: '0.65rem', color: 'success.light', bgcolor: 'success.dark' }}
              />
            )}
            {postprocessingStatus === 'running' && (
              <Chip
                icon={<CircularProgress size={12} />}
                label={postprocessingProgress ? `${postprocessingProgress.completed}/${postprocessingProgress.total} fields` : 'Computing...'}
                size="small"
                sx={{ height: 20, fontSize: '0.65rem', color: 'info.main' }}
              />
            )}
            {postprocessingStatus === 'failed' && (
              <Chip
                label="Error"
                size="small"
                color="error"
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={postprocessingStatus === 'running' ? <CircularProgress size={16} /> : <CalculateIcon />}
              onClick={handleComputePostprocessing}
              disabled={!canComputePostprocessing || simulationStatus === 'running' || simulationStatus === 'preparing' || postprocessingStatus === 'running'}
              sx={{ flex: 1 }}
            >
              Compute Postprocessing
            </Button>
            {postprocessingStatus === 'running' && (
              <IconButton
                size="small"
                color="error"
                onClick={handleCancelPostprocessing}
                sx={{ border: '1px solid', borderColor: 'divider' }}
                title="Stop postprocessing"
              >
                <StopIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        </Box>
      </Paper>

      {/* 3-PANEL LAYOUT */}
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
        }}
      >
      {/* LEFT PANEL - Tree View (280px fixed) */}
      <Box
        sx={{
          width: 280,
          height: '100%',
          borderRight: 1,
          borderColor: 'divider',
          overflow: 'auto',
          backgroundColor: 'background.paper',
        }}
      >
        <TreeViewPanel
          elements={elements}
          selectedElementId={selectedElementId}
          onElementSelect={onElementSelect}
          onElementDelete={() => {}}
          onElementDuplicate={() => {}}
          onElementRename={() => {}}
          onElementLock={() => {}}
          onElementVisibilityToggle={onElementVisibilityToggle}
          mode="solver"
          fieldRegions={requestedFields}
          onFieldSelect={setSelectedFieldId}
          selectedFieldId={selectedFieldId}
          onFieldVisibilityToggle={handleFieldVisibilityToggle}
          onFieldDelete={handleFieldDelete}
          onFieldRename={handleFieldRename}
          fieldResults={fieldResults}
          directivityRequested={directivityRequested}
          onDirectivityDelete={handleDirectivityDelete}
          onDirectivitySelect={handleDirectivitySelect}
        />
      </Box>

      {/* MIDDLE PANEL - 3D Visualization (flex, remaining space) */}
      <Box
        sx={{
          flex: 1,
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#1a1a1a',
        }}
      >
        <Scene3D elements={elements}>
          {/* Render antenna elements */}
          <WireGeometry
            elements={elements}
            selectedElementId={selectedElementId}
            onElementSelect={onElementSelect}
            showNodes={false}
          />
          
          {/* Render field regions */}
          <FieldRegionVisualization
            fieldDefinitions={requestedFields}
            selectedFieldId={selectedFieldId}
            visible={fieldRegionsVisible}
          />
        </Scene3D>
      </Box>

      {/* RIGHT PANEL - Properties Panel (300px fixed) */}
      <Box
        sx={{
          width: 300,
          height: '100%',
          borderLeft: 1,
          borderColor: 'divider',
          overflow: 'auto',
          backgroundColor: 'background.paper',
        }}
      >
        <SolverPropertiesPanel
          selectedFieldId={selectedFieldId}
          fieldRegionsVisible={fieldRegionsVisible}
          onFieldRegionsVisibleChange={handleFieldRegionsVisibleChange}
        />
      </Box>
      </Box>

      {/* DIALOGS */}
      <FrequencyInputDialog
        open={frequencyDialogOpen}
        onClose={() => setFrequencyDialogOpen(false)}
        onSolve={handleFrequencySolve}
        isLoading={simulationStatus === 'running' || simulationStatus === 'preparing'}
      />

      <FrequencySweepDialog
        open={sweepDialogOpen}
        onClose={() => setSweepDialogOpen(false)}
        onSubmit={handleFrequencySweepSubmit}
        isLoading={simulationStatus === 'running' || simulationStatus === 'preparing'}
      />
      
      <AddFieldDialog
        open={addFieldDialogOpen}
        onClose={() => setAddFieldDialogOpen(false)}
        onCreate={handleFieldAdd}
      />
      
      <DirectivitySettingsDialog
        open={directivityDialogOpen}
        onClose={() => setDirectivityDialogOpen(false)}
        onConfirm={handleDirectivityConfirm}
        initialSettings={directivitySettings}
      />

      {/* FEEDBACK SNACKBAR */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
