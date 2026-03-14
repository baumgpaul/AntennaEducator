/**
 * FdtdRibbonMenu — Context-aware toolbar for the FDTD workspace.
 *
 * Changes content based on active tab:
 * - Designer: Add Structure, Add Source, Add Probe, Boundaries, Materials
 * - Solver: Run Simulation, Mode, Stability Check
 * - Post-processing: (placeholder)
 */
import {
  Box,
  Paper,
  Button,
  ButtonGroup,
  Divider,
  Typography,
  Menu,
  MenuItem,
  CircularProgress,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Add as AddIcon,
  PlayArrow as RunIcon,
  ViewInAr as StructureIcon,
  FlashOn as SourceIcon,
  GpsFixed as ProbeIcon,
  BorderAll as BoundaryIcon,
  Palette as MaterialIcon,
  Map as HeatmapIcon,
  Timeline as TimelineIcon,
  Radar as RadarIcon,
  ShowChart as ChartIcon,
  Whatshot as SarIcon,
  Air as EnergyIcon,
  TrackChanges as RcsIcon,
  Waves as FreqIcon,
  Sensors as ProbeTsIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  createView,
  addItemToView,
  selectFdtdSelectedViewId,
} from '@/store/fdtdPostprocessingSlice';
import type { FdtdViewItemType } from '@/types/fdtd';

type FdtdTab = 'designer' | 'solver' | 'postprocessing';

interface FdtdRibbonMenuProps {
  activeTab: FdtdTab;
  onAddStructure: (type: 'custom' | 'patch' | 'waveguide' | 'microstrip' | 'dipole' | 'cavity') => void;
  onAddSource: () => void;
  onAddProbe: () => void;
  onOpenBoundaries: () => void;
  onOpenMaterialLibrary: () => void;
  onRunSimulation?: () => void;
  onValidate?: () => void;
}

function FdtdRibbonMenu({
  activeTab,
  onAddStructure,
  onAddSource,
  onAddProbe,
  onOpenBoundaries,
  onOpenMaterialLibrary,
  onRunSimulation,
  onValidate,
}: FdtdRibbonMenuProps) {
  const [structureMenuAnchor, setStructureMenuAnchor] = useState<null | HTMLElement>(null);
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null);
  const dispatch = useAppDispatch();
  const solver = useAppSelector((s) => s.fdtdSolver);
  const design = useAppSelector((s) => s.fdtdDesign);
  const selectedViewId = useAppSelector(selectFdtdSelectedViewId);

  const ADD_ITEMS: { type: FdtdViewItemType; label: string; icon: React.ReactNode }[] = [
    { type: 'field_heatmap', label: 'Field Heatmap', icon: <HeatmapIcon fontSize="small" /> },
    { type: 'time_animation', label: 'Time Animation', icon: <TimelineIcon fontSize="small" /> },
    { type: 'radiation_pattern', label: 'Radiation Pattern', icon: <RadarIcon fontSize="small" /> },
    { type: 's_parameters', label: 'S-Parameters', icon: <ChartIcon fontSize="small" /> },
    { type: 'sar_map', label: 'SAR Map', icon: <SarIcon fontSize="small" /> },
    { type: 'energy_flow', label: 'Energy Flow', icon: <EnergyIcon fontSize="small" /> },
    { type: 'rcs_plot', label: 'RCS', icon: <RcsIcon fontSize="small" /> },
    { type: 'frequency_field', label: 'Frequency Field', icon: <FreqIcon fontSize="small" /> },
    { type: 'probe_time_series', label: 'Probe Time Series', icon: <ProbeTsIcon fontSize="small" /> },
  ];

  const handleAddViz = (type: FdtdViewItemType) => {
    let viewId = selectedViewId;
    if (!viewId) {
      dispatch(createView({}));
    }
    viewId = selectedViewId;
    if (viewId) {
      dispatch(addItemToView({ viewId, type }));
    }
    setAddMenuAnchor(null);
  };

  if (activeTab === 'designer') {
    return (
      <Paper elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ p: 1, px: 1.5, minHeight: 64, display: 'flex', alignItems: 'center', gap: 3 }}>
          {/* Add Structure section */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Structures
            </Typography>
            <ButtonGroup variant="outlined" size="small">
              <Button
                startIcon={<StructureIcon />}
                onClick={(e) => setStructureMenuAnchor(e.currentTarget)}
              >
                Add Structure
              </Button>
            </ButtonGroup>
            <Menu
              anchorEl={structureMenuAnchor}
              open={Boolean(structureMenuAnchor)}
              onClose={() => setStructureMenuAnchor(null)}
            >
              <MenuItem
                onClick={() => {
                  onAddStructure('custom');
                  setStructureMenuAnchor(null);
                }}
              >
                Custom (Box / Cylinder / Sphere)
              </MenuItem>
              <MenuItem
                onClick={() => {
                  onAddStructure('patch');
                  setStructureMenuAnchor(null);
                }}
              >
                Patch Antenna
              </MenuItem>
              <Divider />
              <MenuItem
                onClick={() => {
                  onAddStructure('waveguide');
                  setStructureMenuAnchor(null);
                }}
              >
                Waveguide
              </MenuItem>
              <MenuItem
                onClick={() => {
                  onAddStructure('microstrip');
                  setStructureMenuAnchor(null);
                }}
              >
                Microstrip Line
              </MenuItem>
              <MenuItem
                onClick={() => {
                  onAddStructure('dipole');
                  setStructureMenuAnchor(null);
                }}
              >
                Dipole Antenna
              </MenuItem>
              <MenuItem
                onClick={() => {
                  onAddStructure('cavity');
                  setStructureMenuAnchor(null);
                }}
              >
                Resonant Cavity
              </MenuItem>
            </Menu>
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Sources */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Excitation
            </Typography>
            <ButtonGroup variant="outlined" size="small">
              <Button startIcon={<SourceIcon />} onClick={onAddSource}>
                Add Source
              </Button>
            </ButtonGroup>
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Probes */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Measurement
            </Typography>
            <ButtonGroup variant="outlined" size="small">
              <Button startIcon={<ProbeIcon />} onClick={onAddProbe}>
                Add Probe
              </Button>
            </ButtonGroup>
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Boundaries & Materials */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Domain
            </Typography>
            <ButtonGroup variant="outlined" size="small">
              <Button startIcon={<BoundaryIcon />} onClick={onOpenBoundaries}>
                Boundaries
              </Button>
              <Button startIcon={<MaterialIcon />} onClick={onOpenMaterialLibrary}>
                Materials
              </Button>
            </ButtonGroup>
          </Box>
        </Box>
      </Paper>
    );
  }

  if (activeTab === 'solver') {
    return (
      <Paper elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ p: 1, px: 1.5, minHeight: 64, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Simulation
            </Typography>
            <ButtonGroup variant="outlined" size="small">
              <Button
                variant="contained"
                startIcon={
                  solver.status === 'solving' || solver.status === 'postprocessing'
                    ? <CircularProgress size={16} />
                    : <RunIcon />
                }
                disabled={
                  solver.status === 'solving' ||
                  solver.status === 'postprocessing' ||
                  design.sources.length === 0
                }
                onClick={onRunSimulation}
              >
                Run Simulation
              </Button>
              <Button onClick={onValidate}>Validate</Button>
            </ButtonGroup>
          </Box>
        </Box>
      </Paper>
    );
  }

  // Postprocessing — add views & visualization items
  return (
    <Paper elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ p: 1, px: 1.5, minHeight: 64, display: 'flex', alignItems: 'center', gap: 3 }}>
        {/* New view */}
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Views
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => dispatch(createView({}))}
          >
            New View
          </Button>
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* Add visualization */}
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Add Visualization
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            disabled={!selectedViewId}
            onClick={(e) => setAddMenuAnchor(e.currentTarget)}
          >
            Add Plot
          </Button>
          <Menu
            anchorEl={addMenuAnchor}
            open={Boolean(addMenuAnchor)}
            onClose={() => setAddMenuAnchor(null)}
          >
            {ADD_ITEMS.map((item) => (
              <MenuItem key={item.type} onClick={() => handleAddViz(item.type)}>
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText>{item.label}</ListItemText>
              </MenuItem>
            ))}
          </Menu>
        </Box>
      </Box>
    </Paper>
  );
}

export default FdtdRibbonMenu;
