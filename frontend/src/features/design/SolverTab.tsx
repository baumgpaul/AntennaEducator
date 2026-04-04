import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Box, Paper, Button, ButtonGroup, Typography, Divider, Chip, CircularProgress, LinearProgress, Snackbar, Alert, IconButton, Tooltip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TuneIcon from '@mui/icons-material/Tune';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import GridOnIcon from '@mui/icons-material/GridOn';
import CalculateIcon from '@mui/icons-material/Calculate';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StopIcon from '@mui/icons-material/Stop';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import TreeViewPanel from './TreeViewPanel';
import Scene3D from './Scene3D';
import WireGeometry from './WireGeometry';
import { FieldRegionVisualization } from './FieldRegionVisualization';
import { SolverPropertiesPanel } from './SolverPropertiesPanel';
import { FrequencyInputDialog } from './FrequencyInputDialog';
import { ParameterStudyDialog } from './ParameterStudyDialog';
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
  selectSolverStatus,
  selectSolverError,
  selectSolverProgress,
  selectCurrentFrequency,
  selectFrequencySweep,
  selectSweepInProgress,
  selectSweepProgress,
  selectResultsStale,
  cancelPostprocessing,
} from '@/store/solverSlice';
import { markAsSolved, selectIsSolved } from '@/store/designSlice';
import type { FieldDefinition } from '@/types/fieldDefinitions';
import type { ParameterStudyConfig } from '@/types/parameterStudy';
import { runParameterStudy } from '@/store/parameterStudyThunks';
import { selectParameterStudy, selectParameterStudyConfig, selectSolveMode } from '@/store/solverSlice';

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

export function SolverTab({ elements, selectedElementId, onElementSelect, onElementVisibilityToggle, solverStatus: _solverStatus = 'idle' }: SolverTabProps) {
  const dispatch = useDispatch<AppDispatch>();

  // Redux state
  const requestedFields = useSelector((state: RootState) => state.solver.requestedFields) as FieldDefinition[];
  const directivityRequested = useSelector((state: RootState) => state.solver.directivityRequested);
  const directivitySettings = useSelector((state: RootState) => state.solver.directivitySettings);
  const solverWorkflowState = useSelector((state: RootState) => state.solver.solverState);
  const simulationStatus = useSelector(selectSolverStatus);
  const simulationError = useSelector(selectSolverError);
  const solverProgress = useSelector(selectSolverProgress);
  const currentFrequency = useSelector(selectCurrentFrequency);
  const frequencySweep = useSelector(selectFrequencySweep);
  const sweepInProgress = useSelector(selectSweepInProgress);
  const sweepProgress = useSelector(selectSweepProgress);
  const results = useSelector((state: RootState) => state.solver.results);
  const postprocessingStatus = useSelector((state: RootState) => state.solver.postprocessingStatus);
  const fieldResults = useSelector((state: RootState) => state.solver.fieldResults);
  const postprocessingProgress = useSelector((state: RootState) => state.solver.postprocessingProgress);
  const resultsStale = useSelector(selectResultsStale);
  const isSolved = useSelector(selectIsSolved);
  const parameterStudy = useSelector(selectParameterStudy);
  const parameterStudyConfig = useSelector(selectParameterStudyConfig);
  const solveMode = useSelector(selectSolveMode);

  // Local state
  const [frequencyDialogOpen, setFrequencyDialogOpen] = useState(false);
  const [addFieldDialogOpen, setAddFieldDialogOpen] = useState(false);
  const [directivityDialogOpen, setDirectivityDialogOpen] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>(undefined);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [parameterStudyDialogOpen, setParameterStudyDialogOpen] = useState(false);

  // Auto-open properties panel when a field is selected
  useEffect(() => {
    if (selectedFieldId) {
      setRightPanelOpen(true);
    }
  }, [selectedFieldId]);
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

  const handleParameterStudy = () => {
    setParameterStudyDialogOpen(true);
  };

  const handleParameterStudySubmit = async (config: ParameterStudyConfig) => {
    setParameterStudyDialogOpen(false);
    try {
      await dispatch(runParameterStudy(config)).unwrap();
      dispatch(markAsSolved());
      const totalPts = config.sweepVariables.reduce((acc, v) => acc * v.numPoints, 1);
      setSnackbarMessage(`Parameter study complete! ${totalPts} points solved.`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error: any) {
      setSnackbarMessage(error || 'Parameter study failed');
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
      console.log('[SolverTab] Requested fields:', requestedFields.map(f => ({
        id: f.id, name: f.name, type: f.type, shape: f.shape,
        sampling: 'sampling' in f ? f.sampling : undefined,
      })));
      try {
        const result = await dispatch(computePostprocessingWorkflow()).unwrap();
        console.log('[SolverTab] Postprocessing completed:', result.message);

        setSnackbarMessage('Postprocessing complete!');
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      } catch (error: any) {
        const msg = typeof error === 'string' ? error : error?.message || 'Postprocessing failed';
        const is502 = msg.includes('502') || msg.includes('Bad Gateway');
        const displayMsg = is502
          ? 'Postprocessing timed out (502). Reduce observation points or mesh density.'
          : msg;
        console.error('[SolverTab] Postprocessing error:', error);
        setSnackbarMessage(displayMsg);
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
      dispatch(markAsSolved());
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
            {/* Determine display state for Solve Control */}
            {(() => {
              const hasResults = !!(results || (solveMode === 'sweep' && parameterStudy));
              const isSolving = simulationStatus === 'running' || sweepInProgress;
              const isError = simulationStatus === 'failed';
              // In sweep mode, the nominal-restore remesh briefly sets isSolved=false;
              // only use resultsStale (explicit design changes) to determine outdated.
              const isOutdated = solveMode === 'sweep'
                ? resultsStale
                : resultsStale || (!isSolved && hasResults);

              // Solving: show 'Unsolved' label with loading animation
              if (isSolving) {
                return (
                  <>
                    <Chip
                      icon={<CircularProgress size={12} variant={solverProgress > 0 ? 'determinate' : 'indeterminate'} value={solverProgress} />}
                      label="Unsolved"
                      size="small"
                      sx={{ height: 20, fontSize: '0.65rem', color: 'info.main' }}
                    />
                    <Chip
                      label={sweepProgress ? `Solving point ${sweepProgress.current}/${sweepProgress.total}` : `Solving ${solverProgress}%`}
                      size="small"
                      sx={{ height: 20, fontSize: '0.65rem' }}
                    />
                  </>
                );
              }

              // Error
              if (isError && simulationError) {
                return (
                  <Chip
                    label="Error"
                    size="small"
                    color="error"
                    sx={{ height: 20, fontSize: '0.65rem' }}
                    title={simulationError}
                  />
                );
              }

              // Solved
              if (hasResults && (solverWorkflowState === 'solved' || solverWorkflowState === 'postprocessing-ready')) {
                const label = solveMode === 'sweep'
                  ? `Solved (Sweep) — ${parameterStudy?.results?.length ?? 0} points`
                  : `Solved @ ${(typeof currentFrequency === 'number' && currentFrequency > 0 ? currentFrequency : 0).toFixed(1)} MHz`;
                return (
                  <>
                    <Chip
                      icon={<CheckCircleIcon />}
                      label={label}
                      size="small"
                      sx={{ height: 20, fontSize: '0.65rem', color: 'success.light', bgcolor: 'success.dark' }}
                    />
                    {isOutdated && (
                      <Chip
                        label="Solution Outdated"
                        size="small"
                        color="warning"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                        title="Design changed after solving. Re-run solver to update results."
                      />
                    )}
                  </>
                );
              }

              // Default: no solution
              return (
                <Chip
                  label="Unsolved"
                  size="small"
                  color="info"
                  sx={{ height: 20, fontSize: '0.65rem' }}
                  title="No solver results available. Run the solver to compute results."
                />
              );
            })()}

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
              startIcon={<TuneIcon />}
              onClick={handleParameterStudy}
              disabled={simulationStatus === 'running' || simulationStatus === 'preparing' || postprocessingStatus === 'running'}
            >
              Parameter Sweep
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
            {postprocessingStatus === 'completed' && fieldResults && (() => {
              const anyFieldOutdated = Object.values(fieldResults).some(r => r && !r.computed);
              const isOutdated = !isSolved || anyFieldOutdated;
              return (
                <>
                  {isOutdated ? (
                    <Chip
                      label="Outdated"
                      size="small"
                      color="warning"
                      sx={{ height: 20, fontSize: '0.65rem' }}
                      title={anyFieldOutdated && isSolved
                        ? 'Field definitions changed after postprocessing. Re-run postprocessing to update.'
                        : 'Design changed after postprocessing. Re-run solver and postprocessing.'}
                    />
                  ) : (
                    <Chip
                      icon={<CheckCircleIcon />}
                      label="Ready"
                      size="small"
                      sx={{ height: 20, fontSize: '0.65rem', color: 'success.light', bgcolor: 'success.dark' }}
                    />
                  )}
                </>
              );
            })()}
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
              disabled={!canComputePostprocessing || !isSolved || simulationStatus === 'running' || simulationStatus === 'preparing' || postprocessingStatus === 'running'}
              title={!isSolved ? 'Run solver first before computing postprocessing' : undefined}
            >
              Compute Fields
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

      {/* Parameter sweep progress */}
      {sweepInProgress && sweepProgress && (
        <LinearProgress
          variant="determinate"
          value={Math.round((sweepProgress.current / sweepProgress.total) * 100)}
          sx={{ flexShrink: 0, height: 4 }}
        />
      )}

      {/* Postprocessing (field computation) progress */}
      {postprocessingStatus === 'running' && postprocessingProgress && postprocessingProgress.total > 0 && (
        <LinearProgress
          variant="determinate"
          value={Math.round((postprocessingProgress.completed / postprocessingProgress.total) * 100)}
          color="info"
          sx={{ flexShrink: 0, height: 4 }}
        />
      )}

      {/* 3-PANEL LAYOUT */}
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
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
          isSolved={isSolved}
        />
      </Box>

      {/* MIDDLE PANEL - 3D Visualization (flex, remaining space) */}
      <Box
        sx={{
          flex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            flex: '1 1 100%',
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: '#1a1a1a',
            minHeight: 200,
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
      </Box>

      {/* RIGHT PANEL - Properties Panel (300px, collapsible) */}
      {rightPanelOpen && (
        <Box
          sx={{
            width: 300,
            height: '100%',
            borderLeft: 1,
            borderColor: 'divider',
            overflow: 'auto',
            backgroundColor: 'background.paper',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <SolverPropertiesPanel
            selectedFieldId={selectedFieldId}
            fieldRegionsVisible={fieldRegionsVisible}
            onFieldRegionsVisibleChange={handleFieldRegionsVisibleChange}
          />
          {/* Close toggle */}
          <div style={{
            position: 'absolute',
            left: '-20px',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 20,
          }}>
            <Tooltip title="Hide Properties" placement="left">
              <IconButton
                size="medium"
                onClick={() => setRightPanelOpen(false)}
                sx={{
                  bgcolor: 'background.paper',
                  boxShadow: 2,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <ChevronRight fontSize="large" />
              </IconButton>
            </Tooltip>
          </div>
        </Box>
      )}

      {/* Open toggle when panel is closed */}
      {!rightPanelOpen && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 20,
        }}>
          <Tooltip title="Show Properties" placement="left">
            <IconButton
              size="medium"
              onClick={() => setRightPanelOpen(true)}
              sx={{
                bgcolor: 'background.paper',
                boxShadow: 2,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <ChevronLeft fontSize="large" />
            </IconButton>
          </Tooltip>
        </div>
      )}
      </Box>

      {/* DIALOGS */}
      <FrequencyInputDialog
        open={frequencyDialogOpen}
        onClose={() => setFrequencyDialogOpen(false)}
        onSolve={handleFrequencySolve}
        isLoading={simulationStatus === 'running' || simulationStatus === 'preparing'}
        initialFrequency={currentFrequency ?? undefined}
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

      <ParameterStudyDialog
        open={parameterStudyDialogOpen}
        onClose={() => setParameterStudyDialogOpen(false)}
        onSubmit={handleParameterStudySubmit}
        isLoading={simulationStatus === 'running' || simulationStatus === 'preparing'}
        initialConfig={parameterStudyConfig}
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
