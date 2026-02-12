import { useState } from 'react';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  ButtonGroup,
  Button,
  Divider,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  CableOutlined,
  RadioButtonChecked,
  Loop,
  Widgets,
  PlayArrow,
  Assessment,
  Settings,
  ExpandMore,
  ColorLens,
  TrendingUp,
  CheckCircle,
  Error as ErrorIcon,
  HourglassEmpty,
  Add,
  ViewInAr,
  Sensors,
  ShowChart,
  PictureAsPdf,
  SaveAlt,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector, useAppStore } from '@/store/hooks';
import { toggleVisualizationMode } from '@/store/uiSlice';
import {
  setAddViewDialogOpen,
  setAddAntennaDialogOpen,
  setAddFieldDialogOpen,
  setAddScalarPlotDialogOpen,
  setScalarPlotPreselect,
  setExportPDFDialogOpen,
  setExportType,
  addItemToView,
  selectViewConfigurations,
  selectSelectedViewId,
} from '@/store/postprocessingSlice';
import { exportToVTU, canExportToVTU } from '@/utils/ParaViewExporter';
import type { RootState } from '@/store';

interface RibbonMenuProps {
  currentTab?: 'designer' | 'solver' | 'postprocessing';
  onAntennaTypeSelect?: (type: string) => void;
  onAnalysisAction?: (action: string) => void;
  onViewOption?: (option: string) => void;
  solverStatus?: 'idle' | 'preparing' | 'running' | 'completed' | 'failed' | 'cancelled';
  solverProgress?: number;
}

/**
 * RibbonMenu - Top toolbar with context-aware actions for each tab
 * - Designer: Antenna types and elements
 * - Solver: (future implementation)
 * - Postprocessing: View management, item addition, export
 */
function RibbonMenu({
  currentTab = 'designer',
  onAntennaTypeSelect,
  onAnalysisAction,
  onViewOption,
  solverStatus = 'idle',
  solverProgress = 0
}: RibbonMenuProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const visualizationMode = useAppSelector((state) => state.ui.visualization.mode);
  const selectedViewId = useAppSelector((state) => state.postprocessing.selectedViewId);
  const viewConfigurations = useAppSelector((state) => state.postprocessing.viewConfigurations);
  const currentFrequency = useAppSelector((state) => state.solver.currentFrequency);
  const selectedViewData = useAppSelector((state) =>
    state.postprocessing.viewConfigurations.find(v => v.id === selectedViewId)
  );

  const [antennaMenuAnchor, setAntennaMenuAnchor] = useState<null | HTMLElement>(null);
  const [showSnackbar, setShowSnackbar] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  const isSimulationRunning = solverStatus === 'preparing' || solverStatus === 'running';

  const handleAntennaMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAntennaMenuAnchor(event.currentTarget);
  };

  const handleAntennaMenuClose = () => {
    setAntennaMenuAnchor(null);
  };

  const handleAntennaSelect = (type: string) => {
    onAntennaTypeSelect?.(type);
    handleAntennaMenuClose();
  };

  const handleToggleVisualizationMode = () => {
    dispatch(toggleVisualizationMode());
  };

  // Postprocessing action handlers
  const handleAddView = () => {
    dispatch(setAddViewDialogOpen(true));
  };

  const handleAddAntennaSystem = () => {
    if (!selectedViewId) return;

    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'antenna-system',
        visible: true,
        label: 'Antenna System',
      },
    }));
  };

  const handleAddAntennaElement = () => {
    dispatch(setAddAntennaDialogOpen(true));
  };

  const handleAddCurrentDistribution = () => {
    if (!selectedViewId) return;

    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'current',
        visible: true,
        label: 'Currents',
        colorMap: 'jet',
        opacity: 0.8,
      },
    }));
  };

  const handleAddVoltageDistribution = () => {
    if (!selectedViewId) return;

    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'voltage',
        visible: true,
        label: 'Voltages',
        colorMap: 'jet',
        opacity: 0.8,
      },
    }));
  };

  const handleAddField = () => {
    dispatch(setAddFieldDialogOpen(true));
  };

  const handleAddDirectivity = () => {
    if (!selectedViewId) return;

    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'directivity',
        visible: true,
        label: 'Directivity',
        colorMap: 'jet',
        opacity: 0.8,
        scale: 'logarithmic',
      },
    }));
  };

  const handleAddImpedancePlot = () => {
    dispatch(setScalarPlotPreselect('impedance'));
    dispatch(setAddScalarPlotDialogOpen(true));
  };

  const handleAddVoltagePlot = () => {
    dispatch(setScalarPlotPreselect('voltage'));
    dispatch(setAddScalarPlotDialogOpen(true));
  };

  const handleAddCurrentPlot = () => {
    dispatch(setScalarPlotPreselect('current'));
    dispatch(setAddScalarPlotDialogOpen(true));
  };

  const handleExportPDF = () => {
    dispatch(setExportType('pdf'));
    dispatch(setExportPDFDialogOpen(true));
  };

  const handleExportParaView = async () => {
    dispatch(setExportType('paraview'));

    // Find first field item in current view
    const currentView = selectedViewId
      ? viewConfigurations.find(v => v.id === selectedViewId)
      : null;

    if (!currentView) {
      setSnackbarMessage('No view selected for export');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      return;
    }

    // Find first field-magnitude item
    const fieldItem = currentView.items.find(item =>
      item.type === 'field-magnitude' || item.type === 'field-vector'
    );

    if (!fieldItem || !('fieldId' in fieldItem)) {
      setSnackbarMessage('No field data in this view. Add a field visualization first.');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      return;
    }

    const frequencyHz = currentFrequency ? currentFrequency * 1e6 : null;

    if (!frequencyHz) {
      setSnackbarMessage('No frequency data available');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      return;
    }

    // Check if we can export
    if (!canExportToVTU(fieldItem.fieldId, frequencyHz, store.getState() as unknown as RootState)) {
      setSnackbarMessage('Field data not computed yet. Run postprocessing first.');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      return;
    }

    // Generate filename
    const frequencyMHz = (frequencyHz / 1e6).toFixed(2);
    const filename = `${currentView.name.replace(/[^a-zA-Z0-9]/g, '_')}_${frequencyMHz}MHz`;

    try {
      await exportToVTU({
        fieldId: fieldItem.fieldId,
        frequencyHz,
        filename,
      }, store.getState() as unknown as RootState);

      setSnackbarMessage(`VTU file exported: ${filename}.vtu`);
      setSnackbarSeverity('success');
      setShowSnackbar(true);
    } catch (error) {
      console.error('VTU export failed:', error);
      setSnackbarMessage(error instanceof Error ? error.message : 'VTU export failed');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
    }
  };

  return (
    <Paper elevation={0} sx={{ borderRadius: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ p: 1.5, minHeight: 80, bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>

          {/* DESIGNER TAB RIBBON */}
          {currentTab === 'designer' && (
            <>
              {/* Antenna Types Section */}
              <Box>
                <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                  Antenna Types
                </Box>
                <ButtonGroup variant="outlined" size="small">
                  <Tooltip title="Create dipole antenna">
                    <Button
                      startIcon={<CableOutlined />}
                      onClick={() => onAntennaTypeSelect?.('dipole')}
                    >
                      Dipole
                    </Button>
                  </Tooltip>
                  <Tooltip title="Create loop antenna">
                    <Button
                      startIcon={<Loop />}
                      onClick={() => onAntennaTypeSelect?.('loop')}
                    >
                      Loop
                    </Button>
                  </Tooltip>
                  <Tooltip title="Create helix antenna">
                    <Button
                      startIcon={<Widgets />}
                      onClick={() => onAntennaTypeSelect?.('helix')}
                    >
                      Helix
                    </Button>
                  </Tooltip>
                  <Tooltip title="More antenna types">
                    <Button
                      onClick={handleAntennaMenuOpen}
                      endIcon={<ExpandMore />}
                    >
                      More
                    </Button>
                  </Tooltip>
                </ButtonGroup>

                <Menu
                  anchorEl={antennaMenuAnchor}
                  open={Boolean(antennaMenuAnchor)}
                  onClose={handleAntennaMenuClose}
                >
                  <MenuItem onClick={() => handleAntennaSelect('rod')}>
                    <ListItemIcon>
                      <CableOutlined fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Rod/Wire</ListItemText>
                  </MenuItem>
                  <MenuItem onClick={() => handleAntennaSelect('custom')}>
                    <ListItemIcon>
                      <Widgets fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Custom Structure</ListItemText>
                  </MenuItem>
                </Menu>
              </Box>

              <Divider orientation="vertical" flexItem />

              {/* Elements Section */}
              <Box>
                <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                  Add Elements
                </Box>
                <ButtonGroup variant="outlined" size="small">
                  <Tooltip title="Add voltage source">
                    <Button
                      startIcon={<RadioButtonChecked />}
                      onClick={() => onAntennaTypeSelect?.('voltage-source')}
                    >
                      Source
                    </Button>
                  </Tooltip>
                  <Tooltip title="Add lumped element (R/L/C)">
                    <Button
                      startIcon={<Widgets />}
                      onClick={() => onAntennaTypeSelect?.('lumped-element')}
                    >
                      R/L/C
                    </Button>
                  </Tooltip>
                </ButtonGroup>
              </Box>
            </>
          )}

          {/* POSTPROCESSING TAB RIBBON */}
          {currentTab === 'postprocessing' && (
            <>
              {/* View Configuration Section */}
              <Box>
                <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                  View Configuration
                </Box>
                <ButtonGroup variant="outlined" size="small">
                  <Tooltip title="Create new result view (3D or Line)">
                    <Button
                      startIcon={<Add />}
                      onClick={handleAddView}
                    >
                      Add View
                    </Button>
                  </Tooltip>
                </ButtonGroup>
              </Box>

              <Divider orientation="vertical" flexItem />

              {/* Antenna Section (3D only) */}
              {selectedViewData?.viewType === '3D' && (
                <>
                  <Box>
                    <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                      Antenna
                    </Box>
                    <ButtonGroup variant="outlined" size="small">
                      <Tooltip title="Add all antennas as single tree item">
                        <Button
                          startIcon={<ViewInAr />}
                          onClick={handleAddAntennaSystem}
                          disabled={!selectedViewId}
                        >
                          Add System
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add individual antenna element">
                        <Button
                          startIcon={<Widgets />}
                          onClick={handleAddAntennaElement}
                          disabled={!selectedViewId}
                        >
                          Add Element
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add current distribution visualization">
                        <Button
                          startIcon={<TrendingUp />}
                          onClick={handleAddCurrentDistribution}
                          disabled={!selectedViewId}
                        >
                          Currents
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add voltage distribution visualization">
                        <Button
                          startIcon={<RadioButtonChecked />}
                          onClick={handleAddVoltageDistribution}
                          disabled={!selectedViewId}
                        >
                          Voltages
                        </Button>
                      </Tooltip>
                    </ButtonGroup>
                  </Box>

                  <Divider orientation="vertical" flexItem />

                  {/* Field Result Section (3D only) */}
                  <Box>
                    <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                      Field Result
                    </Box>
                    <ButtonGroup variant="outlined" size="small">
                      <Tooltip title="Add field visualization (magnitude or vector)">
                        <Button
                          startIcon={<Sensors />}
                          onClick={handleAddField}
                          disabled={!selectedViewId}
                        >
                          Add Field
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add directivity pattern">
                        <Button
                          startIcon={<RadioButtonChecked />}
                          onClick={handleAddDirectivity}
                          disabled={!selectedViewId}
                        >
                          Directivity
                        </Button>
                      </Tooltip>
                    </ButtonGroup>
                  </Box>

                  <Divider orientation="vertical" flexItem />
                </>
              )}

              {/* Scalar Results Section (Line view only) */}
              {selectedViewData?.viewType === 'Line' && (
                <>
                  <Box>
                    <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                      Scalar Results
                    </Box>
                    <ButtonGroup variant="outlined" size="small">
                      <Tooltip title="Add impedance vs frequency plot">
                        <Button
                          startIcon={<ShowChart />}
                          onClick={handleAddImpedancePlot}
                          disabled={!selectedViewId}
                        >
                          Impedance
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add voltage vs frequency plot">
                        <Button
                          startIcon={<ShowChart />}
                          onClick={handleAddVoltagePlot}
                          disabled={!selectedViewId}
                        >
                          Voltage
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add current vs frequency plot">
                        <Button
                          startIcon={<ShowChart />}
                          onClick={handleAddCurrentPlot}
                          disabled={!selectedViewId}
                        >
                          Current
                        </Button>
                      </Tooltip>
                    </ButtonGroup>
                  </Box>

                  <Divider orientation="vertical" flexItem />
                </>
              )}

              {/* Export Section */}
              <Box>
                <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                  Export
                </Box>
                <ButtonGroup variant="outlined" size="small">
                  <Tooltip title="Export view to PDF report">
                    <Button
                      startIcon={<PictureAsPdf />}
                      onClick={handleExportPDF}
                      disabled={!selectedViewId}
                    >
                      PDF
                    </Button>
                  </Tooltip>
                  <Tooltip title="Export field data to ParaView (VTU format)">
                    <Button
                      startIcon={<SaveAlt />}
                      onClick={handleExportParaView}
                      disabled={!selectedViewId}
                    >
                      ParaView
                    </Button>
                  </Tooltip>
                </ButtonGroup>
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* SNACKBAR FOR NOTIFICATIONS */}
      <Snackbar
        open={showSnackbar}
        autoHideDuration={4000}
        onClose={() => setShowSnackbar(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowSnackbar(false)}
          severity={snackbarSeverity}
          variant="filled"
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Paper>
  );
}

export default RibbonMenu;
