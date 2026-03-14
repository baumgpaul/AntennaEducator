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
} from '@mui/material';
import {
  Add as AddIcon,
  PlayArrow as RunIcon,
  ViewInAr as StructureIcon,
  FlashOn as SourceIcon,
  GpsFixed as ProbeIcon,
  BorderAll as BoundaryIcon,
  Palette as MaterialIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { useAppSelector } from '@/store/hooks';

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
  const solver = useAppSelector((s) => s.fdtdSolver);
  const design = useAppSelector((s) => s.fdtdDesign);

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
                  solver.status === 'running' ? <CircularProgress size={16} /> : <RunIcon />
                }
                disabled={solver.status === 'running' || design.sources.length === 0}
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

  // Postprocessing — minimal for now
  return (
    <Paper elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ p: 1, px: 1.5, minHeight: 64, display: 'flex', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Post-processing views will be added in Phase 9.
        </Typography>
      </Box>
    </Paper>
  );
}

export default FdtdRibbonMenu;
