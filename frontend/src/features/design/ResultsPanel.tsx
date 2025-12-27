import { useState } from 'react';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Typography,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Close,
  ShowChart,
  Radar,
  ElectricalServices,
  Assessment,
} from '@mui/icons-material';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{ height: '100%', overflow: 'auto', p: 2 }}
    >
      {value === index && children}
    </Box>
  );
}

interface ResultsPanelProps {
  onClose?: () => void;
  impedance?: { real: number; imag: number } | null;
  farFieldData?: any | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  currentDistribution?: number[] | null;
}

/**
 * ResultsPanel - Displays simulation results in tabbed interface
 * Shows impedance, far-field patterns, and statistics
 */
function ResultsPanel({
  onClose,
  impedance,
  // farFieldData, // TODO: Implement far-field visualization
  currentDistribution,
}: ResultsPanelProps) {
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Calculate VSWR from impedance
  const calculateVSWR = (Z: { real: number; imag: number }, Z0 = 50): number => {
    const ZL = Math.sqrt(Z.real ** 2 + Z.imag ** 2);
    const gamma = Math.abs((ZL - Z0) / (ZL + Z0));
    return (1 + gamma) / (1 - gamma);
  };

  const vswr = impedance ? calculateVSWR(impedance) : null;

  return (
    <Paper
      elevation={3}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
          Simulation Results
        </Typography>
        {onClose && (
          <Tooltip title="Close results panel">
            <IconButton size="small" onClick={onClose}>
              <Close fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 48 }}
      >
        <Tab
          icon={<ElectricalServices fontSize="small" />}
          label="Impedance"
          iconPosition="start"
          sx={{ minHeight: 48 }}
        />
        <Tab
          icon={<ShowChart fontSize="small" />}
          label="Current"
          iconPosition="start"
          sx={{ minHeight: 48 }}
        />
        <Tab
          icon={<Radar fontSize="small" />}
          label="Far-Field"
          iconPosition="start"
          sx={{ minHeight: 48 }}
        />
        <Tab
          icon={<Assessment fontSize="small" />}
          label="Statistics"
          iconPosition="start"
          sx={{ minHeight: 48 }}
        />
      </Tabs>

      {/* Tab Panels */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {/* Impedance Tab */}
        <TabPanel value={activeTab} index={0}>
          {impedance ? (
            <Box>
              <Typography variant="h6" gutterBottom>
                Input Impedance
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2 }}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Resistance (R)
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 0.5 }}>
                    {impedance.real.toFixed(2)} Ω
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Reactance (X)
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 0.5 }}>
                    {impedance.imag >= 0 ? '+' : ''}
                    {impedance.imag.toFixed(2)} Ω
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Magnitude |Z|
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 0.5 }}>
                    {Math.sqrt(impedance.real ** 2 + impedance.imag ** 2).toFixed(2)} Ω
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    VSWR (50Ω)
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      mt: 0.5,
                      color: vswr && vswr < 2 ? 'success.main' : vswr && vswr < 3 ? 'warning.main' : 'error.main',
                    }}
                  >
                    {vswr ? vswr.toFixed(2) : 'N/A'}
                  </Typography>
                </Paper>
              </Box>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" color="text.secondary">
                <strong>Complex notation:</strong> Z = {impedance.real.toFixed(2)} {impedance.imag >= 0 ? '+' : ''}
                {impedance.imag.toFixed(2)}j Ω
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                <strong>Interpretation:</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                • {impedance.imag > 0 && 'Inductive reactance (antenna too long)'}
                {impedance.imag < 0 && 'Capacitive reactance (antenna too short)'}
                {impedance.imag === 0 && 'Resonant (ideal)'}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div">
                • {vswr && vswr < 1.5 && 'Excellent match'}
                {vswr && vswr >= 1.5 && vswr < 2 && 'Good match'}
                {vswr && vswr >= 2 && vswr < 3 && 'Acceptable match'}
                {vswr && vswr >= 3 && 'Poor match (consider matching network)'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <ElectricalServices sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
              <Typography variant="body2" color="text.secondary">
                No impedance data available
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Run a simulation to see input impedance
              </Typography>
            </Box>
          )}
        </TabPanel>

        {/* Current Distribution Tab */}
        <TabPanel value={activeTab} index={1}>
          {currentDistribution && currentDistribution.length > 0 ? (
            <Box>
              <Typography variant="h6" gutterBottom>
                Current Distribution
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Branch currents displayed on antenna geometry. Toggle visualization mode to see current distribution.
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, mt: 2 }}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Total Edges
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 0.5 }}>
                    {currentDistribution.length}
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Max Current
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 0.5 }}>
                    {Math.max(...currentDistribution).toExponential(2)} A
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Min Current
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 0.5 }}>
                    {Math.min(...currentDistribution).toExponential(2)} A
                  </Typography>
                </Paper>
              </Box>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" color="text.secondary">
                <strong>Color mapping:</strong> Blue (low) → Green (medium) → Red (high)
              </Typography>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <ShowChart sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
              <Typography variant="body2" color="text.secondary">
                No current distribution data
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Run a simulation to see current distribution
              </Typography>
            </Box>
          )}
        </TabPanel>

        {/* Far-Field Tab */}
        <TabPanel value={activeTab} index={2}>
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Radar sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Far-field visualization coming soon
            </Typography>
            <Typography variant="caption" color="text.secondary">
              2D polar plots and 3D radiation patterns
            </Typography>
          </Box>
        </TabPanel>

        {/* Statistics Tab */}
        <TabPanel value={activeTab} index={3}>
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Assessment sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Statistics panel coming soon
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Solver convergence, timing, and analysis metrics
            </Typography>
          </Box>
        </TabPanel>
      </Box>
    </Paper>
  );
}

export default ResultsPanel;
