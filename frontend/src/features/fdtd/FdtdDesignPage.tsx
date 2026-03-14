import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  Divider,
  IconButton,
  Tooltip,
  Dialog,
} from '@mui/material';
import {
  GridOn as FdtdIcon,
  PlayArrow as RunIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  CloudDone as SavedIcon,
  CloudUpload as SavingIcon,
  CloudOff as SaveErrorIcon,
  ChevronLeft,
  ChevronRight,
} from '@mui/icons-material';
import { useState, useEffect, useRef } from 'react';
import { debounce } from 'lodash';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { parseApiError } from '@/utils/errors';
import {
  setDimensionality,
  setDomainSize,
  setCellSize,
  setBoundaries,
  setConfig,
  loadFdtdDesign,
  validateFdtdSetup,
  markClean,
} from '@/store/fdtdDesignSlice';
import {
  runFdtdSimulation,
  extractFdtdField,
  clearResults,
  loadFdtdSolverState,
} from '@/store/fdtdSolverSlice';
import { fetchProject, updateProject } from '@/store/projectsSlice';
import type { FdtdSolveRequest, FdtdDimensionality, BoundaryType } from '@/types/fdtd';
import FdtdScene3D from './scene/FdtdScene3D';
import FdtdTreeView, { type FdtdTreeCategory } from './FdtdTreeView';
import FdtdPropertiesPanel from './FdtdPropertiesPanel';
import FdtdRibbonMenu from './FdtdRibbonMenu';
import BoundaryPanel from './BoundaryPanel';
import CustomStructureDialog from './dialogs/CustomStructureDialog';
import PatchAntennaDialog from './dialogs/PatchAntennaDialog';
import WaveguideDialog from './dialogs/WaveguideDialog';
import MicrostripDialog from './dialogs/MicrostripDialog';
import DipoleFdtdDialog from './dialogs/DipoleFdtdDialog';
import CavityDialog from './dialogs/CavityDialog';
import SourcePickerDialog from './dialogs/SourcePickerDialog';
import ProbePickerDialog from './dialogs/ProbePickerDialog';
import MaterialLibrary from './MaterialLibrary';

/**
 * FdtdDesignPage — Full FDTD workspace with Design / Solver / Post-processing tabs.
 */
type FdtdTab = 'designer' | 'solver' | 'postprocessing';

function FdtdDesignPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState<FdtdTab>('designer');
  const dispatch = useAppDispatch();

  const design = useAppSelector((s) => s.fdtdDesign);
  const solver = useAppSelector((s) => s.fdtdSolver);
  const currentProject = useAppSelector((s) => s.projects.currentProject);

  // Panel state
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FdtdTreeCategory | null>(null);

  // Dialog state
  const [customStructureOpen, setCustomStructureOpen] = useState(false);
  const [patchAntennaOpen, setPatchAntennaOpen] = useState(false);
  const [waveguideOpen, setWaveguideOpen] = useState(false);
  const [microstripOpen, setMicrostripOpen] = useState(false);
  const [dipoleOpen, setDipoleOpen] = useState(false);
  const [cavityOpen, setCavityOpen] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [probePickerOpen, setProbePickerOpen] = useState(false);
  const [materialLibraryOpen, setMaterialLibraryOpen] = useState(false);
  const [boundaryDialogOpen, setBoundaryDialogOpen] = useState(false);

  // Save status UI
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  // Track if project is being loaded to skip auto-saves during load
  const projectLoadingRef = useRef<boolean>(true);

  // Auto-open right panel when element is selected
  useEffect(() => {
    if (selectedId) setRightPanelOpen(true);
  }, [selectedId]);

  // ---------- Helper: build persistable blobs ----------
  const buildDesignState = () => ({
    dimensionality: design.dimensionality,
    domainSize: design.domainSize,
    cellSize: design.cellSize,
    structures: design.structures,
    sources: design.sources,
    boundaries: design.boundaries,
    probes: design.probes,
    version: 1,
  });

  const buildSimulationConfig = () => ({
    method: 'fdtd',
    config: design.config,
    mode: solver.mode,
  });

  const buildSimulationResults = () => ({
    results: solver.results,
    fieldSnapshot: solver.fieldSnapshot,
    poynting: solver.poynting,
    mode: solver.mode,
    status: solver.status,
  });

  // ---------- Fetch project on mount ----------
  useEffect(() => {
    if (projectId) {
      projectLoadingRef.current = true;
      dispatch(fetchProject(projectId));
    }
  }, [projectId, dispatch]);

  // ---------- Restore state from project ----------
  useEffect(() => {
    if (!currentProject) return;

    const ds = currentProject.design_state;
    if (ds && Object.keys(ds).length > 0) {
      dispatch(
        loadFdtdDesign({
          dimensionality: ds.dimensionality,
          domainSize: ds.domainSize,
          cellSize: ds.cellSize,
          structures: ds.structures,
          sources: ds.sources,
          boundaries: ds.boundaries,
          probes: ds.probes,
          config: currentProject.simulation_config?.config,
        }),
      );
    }

    // Restore solver results
    const sr = currentProject.simulation_results;
    if (sr && Object.keys(sr).length > 0) {
      dispatch(
        loadFdtdSolverState({
          results: sr.results ?? null,
          fieldSnapshot: sr.fieldSnapshot ?? null,
          poynting: sr.poynting ?? null,
          mode: sr.mode,
          status: sr.status,
        }),
      );
    } else {
      dispatch(clearResults());
    }

    // Allow auto-save after state settles
    setTimeout(() => {
      projectLoadingRef.current = false;
    }, 500);
  }, [currentProject?.id, dispatch]);

  // Reset loading flag when switching projects
  useEffect(() => {
    projectLoadingRef.current = true;
  }, [projectId]);

  // ---------- Debounced auto-save ----------
  const saveProjectDebounced = useRef(
    debounce(async (designState: any, simConfig: any, simResults: any, retryCount = 0) => {
      if (!projectId) return;

      const MAX_RETRIES = 3;
      const RETRY_DELAYS = [1000, 2000, 4000];

      try {
        setSaveStatus('saving');
        setSaveError(null);

        await dispatch(
          updateProject({
            id: projectId,
            data: {
              design_state: designState,
              simulation_config: simConfig,
              simulation_results: simResults,
            },
          }),
        ).unwrap();

        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (error) {
        const parsedError = parseApiError(error);

        if (parsedError.retryable && retryCount < MAX_RETRIES) {
          const delay = RETRY_DELAYS[retryCount];
          setSaveError(`Retrying in ${delay / 1000}s...`);
          setTimeout(() => {
            saveProjectDebounced(designState, simConfig, simResults, retryCount + 1);
          }, delay);
        } else {
          setSaveStatus('error');
          setSaveError(parsedError.message || 'Failed to save');
          setTimeout(() => {
            setSaveStatus('idle');
            setSaveError(null);
          }, 5000);
        }
      }
    }, 1500),
  ).current;

  // Cleanup debounce on unmount
  useEffect(() => () => saveProjectDebounced.cancel(), [saveProjectDebounced]);

  // Auto-save when design changes
  useEffect(() => {
    if (projectLoadingRef.current) return;
    if (!projectId) return;
    saveProjectDebounced(buildDesignState(), buildSimulationConfig(), buildSimulationResults());
  }, [
    design.dimensionality,
    design.domainSize,
    design.cellSize,
    design.structures,
    design.sources,
    design.boundaries,
    design.probes,
    design.config,
    solver.mode,
  ]);

  // Auto-save when solver completes
  useEffect(() => {
    if (projectLoadingRef.current) return;
    if (!projectId || !solver.results) return;
    saveProjectDebounced(buildDesignState(), buildSimulationConfig(), buildSimulationResults());
  }, [solver.results, solver.fieldSnapshot, solver.poynting]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  const handleRunSimulation = async () => {
    const request: FdtdSolveRequest = {
      dimensionality: design.dimensionality,
      domain_size: design.domainSize,
      cell_size: design.cellSize,
      structures: design.structures,
      sources: design.sources,
      boundaries: design.boundaries,
      probes: design.probes,
      config: design.config,
      mode: solver.mode,
    };
    const result = await dispatch(runFdtdSimulation(request)).unwrap();
    dispatch(markClean());

    // Auto-extract primary field snapshot
    const primaryField = design.dimensionality === '1d' ? 'Ez' : 'Ez';
    if (result.fields_final[primaryField]) {
      dispatch(
        extractFdtdField({
          fieldComponent: primaryField,
          dx: design.cellSize[0],
          dy: design.dimensionality === '2d' ? design.cellSize[1] : undefined,
        }),
      );
    }
  };

  const handleSetAllBoundaries = (type: BoundaryType) => {
    const bc = { type };
    dispatch(
      setBoundaries({
        x_min: bc,
        x_max: bc,
        y_min: bc,
        y_max: bc,
        z_min: bc,
        z_max: bc,
      }),
    );
  };

  // Tree view selection handler
  const handleTreeSelect = (id: string, category: FdtdTreeCategory) => {
    setSelectedId(id);
    setSelectedCategory(category);
  };

  // Ribbon menu handlers
  const handleAddStructure = (type: 'custom' | 'patch' | 'waveguide' | 'microstrip' | 'dipole' | 'cavity') => {
    if (type === 'custom') setCustomStructureOpen(true);
    else if (type === 'patch') setPatchAntennaOpen(true);
    else if (type === 'waveguide') setWaveguideOpen(true);
    else if (type === 'microstrip') setMicrostripOpen(true);
    else if (type === 'dipole') setDipoleOpen(true);
    else if (type === 'cavity') setCavityOpen(true);
  };

  const tabIndex = activeTab === 'designer' ? 0 : activeTab === 'solver' ? 1 : 2;
  const handleTabChange = (_: unknown, v: number) => {
    setActiveTab(v === 0 ? 'designer' : v === 1 ? 'solver' : 'postprocessing');
  };

  // ------------------------------------------------------------------
  // Design Tab — now rendered as 3-panel layout (tree + scene + properties)
  // Domain settings are shown in properties panel or as a collapsible section
  // ------------------------------------------------------------------
  const renderDesignTab = () => (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left panel — Tree View */}
      {leftPanelOpen && (
        <Box
          sx={{
            width: 260,
            minWidth: 260,
            borderRight: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Domain settings compact */}
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <FormControl size="small" fullWidth sx={{ mb: 1 }}>
              <InputLabel>Dimensionality</InputLabel>
              <Select
                value={design.dimensionality}
                label="Dimensionality"
                onChange={(e) => dispatch(setDimensionality(e.target.value as FdtdDimensionality))}
              >
                <MenuItem value="1d">1-D</MenuItem>
                <MenuItem value="2d">2-D</MenuItem>
              </Select>
            </FormControl>
            <Stack direction="row" spacing={0.5}>
              <TextField
                label="Lx"
                type="number"
                size="small"
                value={design.domainSize[0]}
                onChange={(e) =>
                  dispatch(setDomainSize([+e.target.value, design.domainSize[1], design.domainSize[2]]))
                }
                inputProps={{ step: 0.01 }}
                sx={{ flex: 1 }}
              />
              {design.dimensionality === '2d' && (
                <TextField
                  label="Ly"
                  type="number"
                  size="small"
                  value={design.domainSize[1]}
                  onChange={(e) =>
                    dispatch(
                      setDomainSize([design.domainSize[0], +e.target.value, design.domainSize[2]]),
                    )
                  }
                  inputProps={{ step: 0.01 }}
                  sx={{ flex: 1 }}
                />
              )}
            </Stack>
          </Box>

          {/* Tree */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <FdtdTreeView onSelect={handleTreeSelect} selectedId={selectedId} />
          </Box>
        </Box>
      )}

      {/* Left panel toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Tooltip title={leftPanelOpen ? 'Hide tree' : 'Show tree'}>
          <IconButton size="small" onClick={() => setLeftPanelOpen((p) => !p)}>
            {leftPanelOpen ? <ChevronLeft /> : <ChevronRight />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Center — 3D Scene */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <FdtdScene3D
          selectedId={selectedId}
          onSelectStructure={(id) => handleTreeSelect(id, 'structure')}
          onSelectSource={(id) => handleTreeSelect(id, 'source')}
          onSelectProbe={(id) => handleTreeSelect(id, 'probe')}
        />
      </Box>

      {/* Right panel toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Tooltip title={rightPanelOpen ? 'Hide properties' : 'Show properties'}>
          <IconButton size="small" onClick={() => setRightPanelOpen((p) => !p)}>
            {rightPanelOpen ? <ChevronRight /> : <ChevronLeft />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Right panel — Properties */}
      {rightPanelOpen && (
        <Box
          sx={{
            width: 300,
            minWidth: 300,
            borderLeft: 1,
            borderColor: 'divider',
            overflow: 'auto',
          }}
        >
          <FdtdPropertiesPanel selectedId={selectedId} selectedCategory={selectedCategory} />
        </Box>
      )}
    </Box>
  );

  // ------------------------------------------------------------------
  // Solver Tab
  // ------------------------------------------------------------------
  const renderSolverTab = () => (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Config */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Solver Configuration
        </Typography>
        <Stack direction="row" spacing={2}>
          <TextField
            label="Time Steps"
            type="number"
            size="small"
            value={design.config.num_time_steps}
            onChange={(e) => dispatch(setConfig({ num_time_steps: +e.target.value }))}
          />
          <TextField
            label="Courant Number"
            type="number"
            size="small"
            value={design.config.courant_number}
            onChange={(e) => dispatch(setConfig({ courant_number: +e.target.value }))}
            inputProps={{ step: 0.01, min: 0.01, max: 1.0 }}
          />
        </Stack>
        {design.dimensionality === '2d' && (
          <FormControl size="small" sx={{ mt: 2, minWidth: 120 }}>
            <InputLabel>Mode</InputLabel>
            <Select
              value={solver.mode}
              label="Mode"
              onChange={(e) =>
                dispatch({ type: 'fdtdSolver/setMode', payload: e.target.value })
              }
            >
              <MenuItem value="tm">TM (Ez, Hx, Hy)</MenuItem>
              <MenuItem value="te">TE (Hz, Ex, Ey)</MenuItem>
            </Select>
          </FormControl>
        )}
      </Paper>

      <Divider />

      {/* Run button */}
      <Button
        variant="contained"
        color="primary"
        size="large"
        startIcon={solver.status === 'running' ? <CircularProgress size={20} /> : <RunIcon />}
        disabled={solver.status === 'running' || design.sources.length === 0}
        onClick={handleRunSimulation}
      >
        {solver.status === 'running' ? 'Simulating…' : 'Run FDTD Simulation'}
      </Button>

      {solver.error && <Alert severity="error">{solver.error}</Alert>}

      {solver.status === 'completed' && solver.results && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Results Summary
          </Typography>
          <Typography variant="body2">
            Dimensionality: {solver.results.dimensionality}
            {solver.results.mode !== 'tm' ? ` (${solver.results.mode.toUpperCase()})` : ''}
          </Typography>
          <Typography variant="body2">
            Time steps: {solver.results.total_time_steps}
          </Typography>
          <Typography variant="body2">
            dt: {solver.results.dt.toExponential(3)} s
          </Typography>
          <Typography variant="body2">
            Solve time: {solver.results.solve_time_s.toFixed(3)} s
          </Typography>
          <Typography variant="body2">
            Probes recorded: {solver.results.probe_data.length}
          </Typography>
          {solver.results.probe_data.map((p) => (
            <Typography key={p.name} variant="body2" sx={{ ml: 2 }}>
              • {p.name} ({p.field_component}): {p.values.length} samples,
              peak = {Math.max(...p.values.map(Math.abs)).toExponential(3)}
            </Typography>
          ))}
        </Paper>
      )}
    </Box>
  );

  // ------------------------------------------------------------------
  // Post-processing Tab
  // ------------------------------------------------------------------
  const renderPostprocessingTab = () => (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {solver.status !== 'completed' ? (
        <Alert severity="info">Run a simulation first to view post-processing results.</Alert>
      ) : (
        <>
          {/* Field snapshot */}
          {solver.fieldSnapshot && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Field Snapshot — {solver.fieldSnapshot.field_component}
              </Typography>
              <Typography variant="body2">
                Points: {solver.fieldSnapshot.x_coords.length}
                {solver.fieldSnapshot.y_coords.length > 0 &&
                  ` × ${solver.fieldSnapshot.y_coords.length}`}
              </Typography>
              <Typography variant="body2">
                Range: [{solver.fieldSnapshot.min_value.toExponential(3)},{' '}
                {solver.fieldSnapshot.max_value.toExponential(3)}]
              </Typography>
            </Paper>
          )}

          {/* Probe time series summary */}
          {solver.results?.probe_data.map((p) => (
            <Paper key={p.name} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2">
                Probe: {p.name} ({p.field_component})
              </Typography>
              <Typography variant="body2">
                Samples: {p.values.length} | Peak:{' '}
                {Math.max(...p.values.map(Math.abs)).toExponential(3)}
              </Typography>
            </Paper>
          ))}

          <Typography variant="caption" color="text.secondary">
            Visualization plots will be added in a future phase.
          </Typography>
        </>
      )}
    </Box>
  );

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Header */}
      <Paper
        elevation={1}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1,
          borderRadius: 0,
        }}
      >
        <FdtdIcon color="secondary" />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          FDTD Workspace
        </Typography>
        {saveStatus === 'saving' && (
          <Chip icon={<SavingIcon />} label="Saving…" size="small" color="info" variant="outlined" />
        )}
        {saveStatus === 'saved' && (
          <Chip icon={<SavedIcon />} label="Saved" size="small" color="success" variant="outlined" />
        )}
        {saveStatus === 'error' && (
          <Chip
            icon={<SaveErrorIcon />}
            label={saveError || 'Save failed'}
            size="small"
            color="error"
            variant="outlined"
          />
        )}
        {saveStatus === 'idle' && design.isDirty && (
          <Chip label="Unsaved" size="small" color="warning" variant="outlined" />
        )}
        <Typography variant="caption" color="text.secondary">
          Project {projectId}
        </Typography>
      </Paper>

      {/* Tab bar */}
      <Paper elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabIndex} onChange={handleTabChange}>
          <Tab label="Design" />
          <Tab label="Solver" />
          <Tab label="Post-processing" />
        </Tabs>
      </Paper>

      {/* Ribbon menu (context-sensitive) */}
      <FdtdRibbonMenu
        activeTab={activeTab}
        onAddStructure={handleAddStructure}
        onAddSource={() => setSourcePickerOpen(true)}
        onAddProbe={() => setProbePickerOpen(true)}
        onOpenBoundaries={() => setBoundaryDialogOpen(true)}
        onOpenMaterialLibrary={() => setMaterialLibraryOpen(true)}
        onRunSimulation={handleRunSimulation}
        onValidate={() => dispatch(validateFdtdSetup())}
      />

      {/* Tab content */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {activeTab === 'designer' && renderDesignTab()}

        {activeTab === 'solver' && (
          <Box sx={{ flex: 1, overflow: 'auto' }}>{renderSolverTab()}</Box>
        )}

        {activeTab === 'postprocessing' && (
          <Box sx={{ flex: 1, overflow: 'auto' }}>{renderPostprocessingTab()}</Box>
        )}
      </Box>

      {/* ---- Dialogs ---- */}
      <CustomStructureDialog
        open={customStructureOpen}
        onClose={() => setCustomStructureOpen(false)}
      />
      <PatchAntennaDialog
        open={patchAntennaOpen}
        onClose={() => setPatchAntennaOpen(false)}
      />
      <WaveguideDialog
        open={waveguideOpen}
        onClose={() => setWaveguideOpen(false)}
      />
      <MicrostripDialog
        open={microstripOpen}
        onClose={() => setMicrostripOpen(false)}
      />
      <DipoleFdtdDialog
        open={dipoleOpen}
        onClose={() => setDipoleOpen(false)}
      />
      <CavityDialog
        open={cavityOpen}
        onClose={() => setCavityOpen(false)}
      />
      <SourcePickerDialog
        open={sourcePickerOpen}
        onClose={() => setSourcePickerOpen(false)}
      />
      <ProbePickerDialog
        open={probePickerOpen}
        onClose={() => setProbePickerOpen(false)}
      />
      <MaterialLibrary
        open={materialLibraryOpen}
        onClose={() => setMaterialLibraryOpen(false)}
      />
      <Dialog
        open={boundaryDialogOpen}
        onClose={() => setBoundaryDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <BoundaryPanel />
      </Dialog>
    </Box>
  );
}

export default FdtdDesignPage;
