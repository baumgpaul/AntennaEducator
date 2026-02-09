import { Suspense } from 'react';
import {
  Box,
  Paper,
  ToggleButtonGroup,
  ToggleButton,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  ViewInAr as View3DIcon,
  ShowChart as ChartsIcon,
  Radar as PatternIcon,
} from '@mui/icons-material';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import type { SolverResult, Mesh } from '@/types/models';
import WireGeometry from '../design/WireGeometry';
import RadiationPatternPanel from '../design/RadiationPatternPanel';

interface ResultsVisualizationPanelProps {
  results: SolverResult | null;
  currentDistribution: number[] | null;
  radiationPattern: {
    frequency: number;
    theta_angles: number[];
    phi_angles: number[];
    E_theta_mag: number[];
    E_phi_mag: number[];
    E_total_mag: number[];
    pattern_db: number[];
    directivity: number;
    gain: number;
    efficiency: number;
    beamwidth_theta?: number;
    beamwidth_phi?: number;
    max_direction: [number, number];
  } | null;
  mesh: Mesh | null;
  selectedFrequency: number;
  viewMode: '3d' | 'charts' | 'pattern';
  onViewModeChange: (mode: '3d' | 'charts' | 'pattern') => void;
}

/**
 * ResultsVisualizationPanel - Main visualization area
 *
 * View modes:
 * - 3D: Geometry with field overlay (color-mapped currents)
 * - Charts: Interactive plots (current vs segment/frequency)
 * - Pattern: Radiation patterns (2D polar + 3D)
 */
function ResultsVisualizationPanel({
  results,
  currentDistribution,
  radiationPattern,
  mesh,
  selectedFrequency: _selectedFrequency,
  viewMode,
  onViewModeChange,
}: ResultsVisualizationPanelProps) {
  // Handle view mode change
  const handleViewModeChange = (
    _event: React.MouseEvent<HTMLElement>,
    newMode: '3d' | 'charts' | 'pattern' | null,
  ) => {
    if (newMode !== null) {
      onViewModeChange(newMode);
    }
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {/* View mode selector */}
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={handleViewModeChange}
          size="small"
        >
          <ToggleButton value="3d">
            <View3DIcon sx={{ mr: 1 }} />
            3D View
          </ToggleButton>
          <ToggleButton value="charts">
            <ChartsIcon sx={{ mr: 1 }} />
            Charts
          </ToggleButton>
          <ToggleButton value="pattern">
            <PatternIcon sx={{ mr: 1 }} />
            Pattern
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Visualization controls */}
        {viewMode === '3d' && (
          <>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Field Type</InputLabel>
              <Select defaultValue="current" label="Field Type">
                <MenuItem value="current">Current |I|</MenuItem>
                <MenuItem value="efield">E-field |E|</MenuItem>
                <MenuItem value="hfield">H-field |H|</MenuItem>
                <MenuItem value="poynting">Poynting |S|</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Color Map</InputLabel>
              <Select defaultValue="jet" label="Color Map">
                <MenuItem value="jet">Jet</MenuItem>
                <MenuItem value="viridis">Viridis</MenuItem>
                <MenuItem value="cool">Cool</MenuItem>
                <MenuItem value="hot">Hot</MenuItem>
              </Select>
            </FormControl>
          </>
        )}
      </Paper>

      {/* Main visualization area */}
      <Box sx={{ flex: 1, position: 'relative', bgcolor: 'background.default' }}>
        {viewMode === '3d' && (
          <View3D mesh={mesh} currentDistribution={currentDistribution} />
        )}

        {viewMode === 'charts' && (
          <ChartsView results={results} currentDistribution={currentDistribution} />
        )}

        {viewMode === 'pattern' && (
          <PatternView radiationPattern={radiationPattern} />
        )}
      </Box>
    </Box>
  );
}

// 3D View Component
function View3D({ mesh, currentDistribution }: { mesh: Mesh | null; currentDistribution: number[] | null }) {
  if (!mesh) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Typography color="text.secondary">No geometry available</Typography>
      </Box>
    );
  }

  return (
    <Canvas style={{ width: '100%', height: '100%' }}>
      <Suspense fallback={null}>
        {/* Camera */}
        <PerspectiveCamera makeDefault position={[5, 5, 5]} up={[0, 0, 1]} />
        <OrbitControls enableDamping dampingFactor={0.05} />

        {/* Lighting */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 10]} intensity={0.8} castShadow />
        <directionalLight position={[-10, -10, -10]} intensity={0.3} />

        {/* Grid (XY plane, Z-up) */}
        <Grid
          args={[20, 20]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#6e6e6e"
          sectionSize={2}
          sectionThickness={1}
          sectionColor="#9d9d9d"
          fadeDistance={25}
          fadeStrength={1}
          followCamera={false}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
        />

        {/* Antenna geometry with current visualization */}
        <WireGeometry
          mesh={mesh}
          currentDistribution={currentDistribution}
        />

        {/* Axes helper */}
        <axesHelper args={[2]} />
      </Suspense>
    </Canvas>
  );
}

// Charts View Component (Placeholder)
function ChartsView({ currentDistribution }: { results: SolverResult | null; currentDistribution: number[] | null }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        gap: 2,
        p: 4,
      }}
    >
      <ChartsIcon sx={{ fontSize: 64, color: 'text.secondary' }} />
      <Typography variant="h6" color="text.secondary">
        Interactive Charts
      </Typography>
      <Typography variant="body2" color="text.secondary" align="center">
        Current distribution charts coming soon
        <br />
        Will show: Current vs Segment, Current vs Frequency
      </Typography>
      {currentDistribution && (
        <Typography variant="caption" color="text.secondary">
          {currentDistribution.length} current samples available
        </Typography>
      )}
    </Box>
  );
}

// Pattern View Component
function PatternView({ radiationPattern }: { radiationPattern: any }) {
  if (!radiationPattern) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          gap: 2,
        }}
      >
        <PatternIcon sx={{ fontSize: 64, color: 'text.secondary' }} />
        <Typography variant="body1" color="text.secondary">
          No radiation pattern data available
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Select "Directivity" in the left panel and click "Run Postprocess"
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
      <RadiationPatternPanel {...radiationPattern} />
    </Box>
  );
}

export default ResultsVisualizationPanel;
